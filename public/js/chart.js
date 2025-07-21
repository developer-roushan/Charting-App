let ohlcData = [];
let earliestDateLoaded = null;
let isLoadingMore = false;
let chart, chartContainer, candlestickSeries, series, volumeSeries;
let baseUrl = '/api/chart/';


document.addEventListener("DOMContentLoaded", init);
chartContainer = document.getElementById("chartDiv"); 

async function init() { 
  setupChart();
  setupTicker();
  chartExpandSrink();
  newsExpandSrink();  
}

function setupChart() {
  if (window.chart) {
    window.chart.remove();
  }

  chart = LightweightCharts.createChart(chartContainer, {
    layout: {
      textColor: "black",
      background: { type: "solid", color: "white" }
    },
    width: chartContainer.clientWidth,
    height: chartContainer.clientHeight
  });

  // volumeSeries = chart.addHistogramSeries({
  //   color: "#a4b0be",
  //   priceFormat: {
  //     type: "volume"
  //   },
  //   priceScaleId: "",
  //   scaleMargins: {
  //     top: 0.75,
  //     bottom: 0
  //   }
  // });

  window.addEventListener("resize", function resizeChartHandler() {
    if (chart && chartContainer) {
      chart.applyOptions({
        width: chartContainer.clientWidth,
        height: chartContainer.clientHeight
      });
    }
  }, { passive: true });

}

function setupTicker() {
  const tickerInput = document.getElementById("ticker");
  const tickerList = document.getElementById("ticker-list");
  const tickerCodeInput = document.getElementById("ticker-code");
  let stockList = [];

  tickerInput.value = "AAPL";
  tickerCodeInput.value = "AAPL.US"; 

  fetch("/api/chart/ticker")
    .then(res => res.json())
    .then(data => {
      stockList = data.map(stock => ({
        code: stock.Code || stock.code,
        name: stock.Name || stock.name,
      }));
    });

  tickerInput.addEventListener("input", function () {
    const val = this.value.trim().toUpperCase();
    if (val.length === 0) {
      tickerList.style.display = "none";
      return;
    }
    const filtered = stockList
      .filter(
        s =>
          s.code.toUpperCase().includes(val) ||
          (s.name && s.name.toUpperCase().includes(val))
      )
      .slice(0, 20);

    if (filtered.length === 0) {
      tickerList.style.display = "none";
      return;
    }

    tickerList.innerHTML = filtered
      .map(
        s =>
          `<li data-code="${s.code}" data-name="${s.name}">${s.code} — ${s.name}</li>`
      )
      .join("");
    tickerList.style.display = "block";
  });

  tickerList.addEventListener("click", function (e) {
    if (e.target.tagName === "LI") {
      tickerInput.value = e.target.getAttribute("data-code");
      tickerCodeInput.value = e.target.getAttribute("data-code");
      tickerList.style.display = "none";
    }
  });

  document.addEventListener("click", function (e) {
    if (!tickerInput.contains(e.target) && !tickerList.contains(e.target)) {
      tickerList.style.display = "none";
    }
  });
}

function newsExpandSrink() {
  const newsCard = document.getElementById("newsCard");
  const expandNewsBtn = document.getElementById("expandNewsBtn");
  const newsExpandIcon = document.getElementById("newsExpandIcon");

  expandNewsBtn.addEventListener("click", function () {
    newsCard.classList.toggle("news-expanded");
    if (newsCard.classList.contains("news-expanded")) {
      newsExpandIcon.textContent = "fullscreen_exit";
    } else {
      newsExpandIcon.textContent = "fullscreen";
    }
  });
}

function chartExpandSrink() {
  const originalChartHeight = 440;
  let originalChartWidth = null;

  document
    .getElementById("expandChartBtn")
    .addEventListener("click", function () {
      const chartCard = document.querySelector(".chart-area.card");
      const icon = document.getElementById("expandIcon");
      const chartContainer = document.getElementById("chartDiv");

      if (!chartCard.classList.contains("chart-expanded")) {
        originalChartWidth = chartContainer.clientWidth;
        chartCard.classList.add("chart-expanded");
        icon.textContent = "fullscreen_exit";
        chart.resize(chartContainer.clientWidth, chartContainer.clientHeight);
        chart.timeScale().fitContent();
      } else {
        chartCard.classList.remove("chart-expanded");
        icon.textContent = "fullscreen";
        chart.resize(originalChartWidth, originalChartHeight);
        chart.timeScale().fitContent();
      }
    });
}

async function fetchAndRenderChartData(options = {}) {
  const {
    symbol,
    from: fromStr,
    to:   toStr,
    interval,
    chartType = 'Candlestick',
  } = options;
  const isStatic = interval === 'static';

  // 1) Parse & adjust dates
  let startDate = new Date(fromStr);
  let endDate   = new Date(toStr);
  if (isStatic) {
    startDate.setHours(0,   0,  0,   0);
    endDate.setHours(23, 59, 59, 999);
  }

  // 2) Build URL
  const url = new URL('ohlc', window.location.origin + baseUrl);
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('from',   startDate.toISOString());
  url.searchParams.set('to',     endDate.toISOString());
  if (!isStatic) {
    url.searchParams.set('interval', interval);
  }

  // 3) Fetch & normalize
  let ohlcData = [];
  try {
    const resp = await fetch(url.toString());
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const payload = await resp.json();
    const rows = Array.isArray(payload) ? payload : payload.data || [];
    ohlcData = rows
      .map(d => {
        const ts = Date.parse(d.datetime);
        return {
          time:   Math.floor(ts / 1000),
          open:   parseFloat(d.open),
          high:   parseFloat(d.high),
          low:    parseFloat(d.low),
          close:  parseFloat(d.close),
          volume: parseInt(d.volume, 10),
        };
      })
      .filter(d =>
        !isNaN(d.time) &&
        !isNaN(d.open) &&
        !isNaN(d.high) &&
        !isNaN(d.low) &&
        !isNaN(d.close) &&
        !isNaN(d.volume)
      )
      .sort((a, b) => a.time - b.time);
  } catch (e) {
    console.error('Failed to load OHLC:', e);
    return;
  }

  // 4) Static‐interval sampling
  let finalData = ohlcData;
  if (isStatic) {
    const msPerDay = 24 * 60 * 60 * 1000;
    const spanDays = (endDate - startDate) / msPerDay;
    const slots    = getStaticSlots(spanDays);
    const allowed  = new Set();

    for (let d = new Date(startDate); d <= endDate; d = new Date(d.getTime() + msPerDay)) {
      const wd = d.getDay();
      // only Mon–Fri
      if (wd < 1 || wd > 5) continue;
      // for 365–1825 days, only Mondays (1) & Fridays (5)
      if (spanDays > 365 && spanDays <= 1825 && wd !== 1 && wd !== 5) continue;

      slots.forEach(({ h, m }) => {
        const dt = new Date(d);
        dt.setHours(h, m, 0, 0);
        allowed.add(Math.floor(dt.getTime() / 1000));
      });
    }

    finalData = ohlcData.filter(d => allowed.has(d.time));
  }

  switchChartType(chartType);

  if (ohlcData.length > 0) {
    if (series) series.setData(finalData);

    // if (volumeSeries) {
    //   const volumeData = ohlcData.map((d) => ({
    //     time: d.time,
    //     value: d.volume || 0,
    //     color: d.close > d.open ? "#26a69a" : "#ef5350",
    //   }));
    //   volumeSeries.setData(volumeData);
    // }
    applyAxisConfig(finalData);    
    chart.timeScale().fitContent();
    earliestDateLoaded = finalData[0].time;
  }
}

// Helpers

function isTradingDay(d) {
  const wd = d.getDay();
  return wd >= 1 && wd <= 5;
}

function getStaticSlots(spanDays) {
  if (spanDays <= 5) {
    return [
      {h:4, m:0}, {h:5, m:0}, {h:6, m:0}, {h:7, m:0},
      {h:8, m:0}, {h:9, m:0}, {h:10, m:0},{h:12, m:0},
      {h:14, m:0},{h:16, m:0},{h:16, m:30},{h:17, m:0},
      {h:19, m:0},
    ];
  } else if (spanDays <= 15) {
    return [
      {h:4, m:0}, {h:7, m:0}, {h:8, m:30},{h:9, m:30},
      {h:11, m:0},{h:13, m:30},{h:16, m:30},{h:17, m:30},
      {h:19, m:0},
    ];
  } else if (spanDays <= 60) {
    return [
      {h:4,  m:0}, {h:9,  m:30}, {h:12, m:0},
      {h:16, m:30},{h:19, m:0},
    ];
  } else if (spanDays <= 120) {
    return [
      {h:4,  m:0}, {h:9,  m:30},
      {h:16, m:30},{h:19, m:0},
    ];
  } else if (spanDays <= 210) {
    return [
      {h:4,  m:0}, {h:19, m:0},
    ];
  } else if (spanDays <= 365) {
    return [
      {h:19, m:0},
    ];
  } else {
    // 365–1825 days: only 7pm slots (Mon & Fri filtered above)
    return [
      {h:19, m:0},
    ];
  }
}


function switchChartType(type) {
  // 1) Remove existing series (main + comparisons)
  if (series) {
    chart.removeSeries(series);
    series = null;
  }
  // Comparison series might be stored in an array
  // if (comparisonSeries && comparisonSeries.length) {
  //   comparisonSeries.forEach(s => chart.removeSeries(s));
  // }
  // comparisonSeries = [];

  // // 2) Disable or enable comparison inputs
  // const compIds = ['ticker2','ticker3'];
  // const allowComparisons = (type === 'Area' || type === 'Line');
  // compIds.forEach(id => {
  //   const inp = document.getElementById(id);
  //   inp.disabled = !allowComparisons;
  //   inp.classList.toggle('disabled', !allowComparisons);
  //   if (!allowComparisons) inp.value = '';
  // });

  // 3) Prepare the main data
  const candleData = ohlcData; 
  const lineData   = ohlcData.map(d => ({ time: d.time, value: d.close }));
  console.log('candleData:', type);
  // 4) Create the right series & set main data
  switch (type) {
    case 'area':
      series = chart.addAreaSeries({
        topColor:   '#7bb5ff88',
        bottomColor:'#ffffff00',
        lineColor:  '#2196f3',
        lineWidth:  2,
      });
      series.setData(lineData);
      break;

    case 'line':
      series = chart.addLineSeries({
        color:     '#2196f3',
        lineWidth: 2,
      });
      series.setData(lineData);
      break;

    case 'candlestick':
      series = chart.addCandlestickSeries({
        upColor:    '#26a69a',
        downColor:  '#ef5350',
        borderVisible: false,
        wickUpColor:   '#26a69a',
        wickDownColor: '#ef5350',
      });
      series.setData(candleData);
      break;

    case 'baseline':
      // simple line; you can add right-click baseline toggle here
      series = chart.addLineSeries({
        color:     '#26a69a',
        lineWidth: 2,
      });
      series.setData(lineData);
      break;

    case 'heikin':
      // treat as candlestick—data must be preprocessed outside this fn
      series = chart.addCandlestickSeries({
        upColor:    '#26a69a',
        downColor:  '#ef5350',
        borderVisible: false,
        wickUpColor:   '#26a69a',
        wickDownColor: '#ef5350',
      });
      series.setData(candleData);
      break;

    case 'renko':
      // default candlestick style for Renko bricks
      series = chart.addCandlestickSeries({
        upColor:    '#26a69a',
        downColor:  '#ef5350',
      });
      series.setData(candleData);
      break;

    default:
      // fallback to candlestick
      series = chart.addCandlestickSeries();
      series.setData(candleData);
  }

  // 5) If comparisons are allowed, draw ticker2 & ticker3
  // if (allowComparisons) {
  //   const palette = ['#2196f3','#7efa7e','#ffa64d']; // T1, T2, T3
  //   compIds.forEach((id, idx) => {
  //     const code = document.getElementById(id).value;
  //     if (!code) return;
  //     let cmpSeries;

  //     if (type === 'Area') {
  //       cmpSeries = chart.addAreaSeries({
  //         topColor:   '#7efa7e44',
  //         bottomColor:'#ffffff00',
  //         lineColor:  palette[idx+1],
  //         lineWidth:  2,
  //       });
  //       cmpSeries.setData(lineDataFor(code));  
  //     }
  //     else if (type === 'Line') {
  //       cmpSeries = chart.addLineSeries({
  //         color:     palette[idx+1],
  //         lineWidth: 2,
  //       });
  //       cmpSeries.setData(lineDataFor(code));
  //     }
  //     // store for cleanup
  //     comparisonSeries.push(cmpSeries);
  //   });
  // }
}



function validateChartForm() {
  const tickerCode = document.getElementById('ticker-code').value.trim();
  const dateFrom = document.getElementById('dateFrom').value.trim();
  const dateTo = document.getElementById('dateTo').value.trim();
  const interval = document.getElementById('interval').value.trim();
  const chartType = document.getElementById('chartType').value.trim();
  const errorFields = [
    'ticker', 'dateFrom', 'dateTo', 'interval', 'chartType'
  ];
  errorFields.forEach(id => {
    const err = document.getElementById('error-' + id);
    if (err) err.textContent = '';
    const input = document.getElementById(id);
    if (input) input.classList.remove('input-error-border');
  });

  let errors = [];
   if (!tickerCode) {
    errors.ticker = "Please select a valid ticker.";
  }
  if (!dateFrom) {
    errors.dateFrom = "Please select the start date/time.";
  }
  if (!dateTo) {
    errors.dateTo = "Please select the end date/time.";
  }
  if (dateFrom && dateTo && dateFrom >= dateTo) {
    errors.dateTo = "Start date/time must be before end date/time.";
  }


  Object.keys(errors).forEach(id => {
    const err = document.getElementById('error-' + id);
    if (err) err.textContent = errors[id];
    const input = document.getElementById(id);
    if (input) input.classList.add('input-error-border');
  });

  if (Object.keys(errors).length) return false;

  const formData = {
    symbol: tickerCode,
    from: dateFrom,
    to: dateTo,
    interval: interval,
    chartType: chartType
  };

  fetchAndRenderChartData(formData);
  return true;
}

function Logout() {
  fetch('/logout', {
    method: 'GET',
    credentials: 'same-origin'
  })
    .then(res => {
      window.location.href = '/';
    })
    .catch(() => {
      window.location.href = '/';
    });
}

function openChangePasswordModal() {
  document.getElementById('changePasswordModal').style.display = 'flex';
  document.body.style.overflow = 'hidden'; 
  clearPasswordForm();
  setTimeout(() => document.getElementById('oldPassword').focus(), 80);
}

function closeChangePasswordModal() {
  document.getElementById('changePasswordModal').style.display = 'none';
  document.body.style.overflow = '';
  clearPasswordForm();
}

function clearPasswordForm() {
  ['oldPassword','newPassword','confirmPassword'].forEach(id=>{
    document.getElementById(id).value = '';
    document.getElementById('error-' + id).textContent = '';
    document.getElementById(id).classList.remove('input-error-border');
  });
}

async function submitChangePassword() { 
  updateEnvKey('PASSWORD', 'value');
  let valid = true;
  const oldPass = document.getElementById('oldPassword').value.trim();
  const newPass = document.getElementById('newPassword').value.trim();
  const confirmPass = document.getElementById('confirmPassword').value.trim();
  if (!oldPass) {
    valid = false;
    document.getElementById('error-oldPassword').textContent = 'Enter your old password.';
    document.getElementById('oldPassword').classList.add('input-error-border');
  }
  if (!newPass) {
    valid = false;
    document.getElementById('error-newPassword').textContent = 'Enter a new password.';
    document.getElementById('newPassword').classList.add('input-error-border');
  } else if (newPass.length < 6) {
    valid = false;
    document.getElementById('error-newPassword').textContent = 'At least 6 characters.';
    document.getElementById('newPassword').classList.add('input-error-border');
  }
  if (!confirmPass) {
    valid = false;
    document.getElementById('error-confirmPassword').textContent = 'Confirm your new password.';
    document.getElementById('confirmPassword').classList.add('input-error-border');
  } else if (newPass !== confirmPass) {
    valid = false;
    document.getElementById('error-confirmPassword').textContent = 'Passwords do not match.';
    document.getElementById('confirmPassword').classList.add('input-error-border');
  }

  if (!valid) return false;
  let url = baseUrl+"changePassword";
  const params = [];
  if (oldPass) params.push(`old=${encodeURIComponent(oldPass)}`);
  if (newPass) params.push(`to=${encodeURIComponent(newPass)}`);
  const response = await fetch(url);
  closeChangePasswordModal();
  alert("Password changed successfully! (demo, no real change)");
  return false; 
}
function updateInterval() {
  const dateFrom = document.getElementById('dateFrom').value;
  const dateTo = document.getElementById('dateTo').value;
  const interval = document.getElementById('interval');
  const errorSpan = document.getElementById('error-interval');
  const options = interval.options;

  // Clear previous error and enable all
  errorSpan.textContent = '';
  for (let i = 0; i < options.length; i++) options[i].disabled = false;

  if (dateFrom && dateTo) {
    const from = new Date(dateFrom);
    const to = new Date(dateTo);
    const diffMs = to - from;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    // ---- 1min: only if 1 day or less ----
    let opt1min = interval.querySelector('option[value="1m"]');
    if (diffDays > 1 - 1e-9) { // allow a little float error
      if (opt1min) opt1min.disabled = true;
      if (interval.value === "1m") {
        autoSelectFirstEnabled(interval);
      }
    }

    // ---- 15/30/60min: only up to 5 days ----
    ['15m', '30m', '1h'].forEach(val => {
      let opt = interval.querySelector(`option[value="${val}"]`);
      if (diffDays > 5) {
        if (opt) opt.disabled = true;
        if (interval.value === val) {
          autoSelectFirstEnabled(interval);
        }
      }
    });
  }
}

// Utility to auto-select first enabled option
function autoSelectFirstEnabled(select) {
  for (let i = 0; i < select.options.length; i++) {
    if (!select.options[i].disabled) {
      select.value = select.options[i].value;
      break;
    }
  }
}
function applyAxisConfig(data) {
  if (!data || data.length < 2) return;

  // 1) Compute span in days
  const first   = new Date(data[0].time);
  const last    = new Date(data[data.length - 1].time);
  const spanMs  = last - first;
  const spanDays = spanMs / (1000 * 60 * 60 * 24);

  // 2) Apply chart options
  chart.applyOptions({
    rightPriceScale: {
      autoScale: true,
      scaleMargins: { top: 0.2, bottom: 0.1 }
    },
    timeScale: {
      tickMarkFormatter: (unixSeconds, tickType, locale) => {
        const d     = new Date(unixSeconds * 1000);
        const day   = d.getDate();
        const month = d.toLocaleString(locale, { month: 'short' });
        const year  = d.getFullYear();

        if (spanDays <= 30) {
          // 1–30 days: label by day
          return String(day);
        } else if (spanDays <= 90) {
          // 31–90 days: day + short month
          return `${day} ${month}`;
        } else if (spanDays <= 365) {
          // 91–365 days: month only
          return month;
        } else if (spanDays <= 1825) {
          // 366–1825 days: quarter + year
          const q = Math.floor(d.getMonth() / 3) + 1;
          return `Q${q} ${year}`;
        } else {
          // Beyond 5 years: full year
          return String(year);
        }
      }
    }
  });
}
