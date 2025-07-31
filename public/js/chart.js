let ohlcData = [];
let earliestDateLoaded = null;
let isLoadingMore = false;
let chart, chartContainer, series, volumeSeries;
let baseUrl = "/api/chart/";
let compareSeries = [];
let allNewsData = []; 
let isNewsExpanded = false;
let RTATData = [];
let mainData = [];
let compareDataArray = [];
let renkoSettings = {
  type: "fixed",
  fixedBrickSize: 1.0,
  atrPeriod: 14,
  percentageValue: 1,
};

document.addEventListener("DOMContentLoaded", init);
chartContainer = document.getElementById("chartDiv");

async function init() {
  setupChart();
  setMaxDateTime();
  setupTicker();
  chartExpandSrink();
  newsExpandSrink();
}
function setMaxDateTime() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0"); 
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");

  const maxDateTime = `${year}-${month}-${day}T${hours}:${minutes}`;
  const maxDate = `${year}-${month}-${day}`;
  document.getElementById("dateFrom").max = maxDateTime;
  document.getElementById("dateTo").max = maxDateTime;
    document.getElementById('newsEndDate').max = maxDate;
      document.getElementById('newsStartDate').max = maxDate;

}
function setupChart() {
  if (window.chart) {
    window.chart.remove();
  }

  chart = LightweightCharts.createChart(chartContainer, {
    layout: {
      textColor: "black",
      background: { type: "solid", color: "white" },
    },
    width: chartContainer.clientWidth,
    height: chartContainer.clientHeight,
        handleScale: false,
            handleScroll: false,
  });

  window.addEventListener(
    "resize",
    function resizeChartHandler() {
      if (chart && chartContainer) {
        chart.applyOptions({
          width: chartContainer.clientWidth,
          height: chartContainer.clientHeight,
        });
      }
    },
    { passive: true }
  );

  document.querySelectorAll('input[name="renkoType"]').forEach((radio) => {
    radio.addEventListener("change", (e) => toggleRenkoFields(e.target.value));
  });

  window.onclick = function (event) {
    const modal = document.getElementById("renkoSettingsModal");
    if (event.target === modal) {
      closeRenkoSettingsModal();
    }
  };
}
function setupTicker() {
  const chartTypeSelect = document.getElementById("chartType");
  if (chartTypeSelect) {
    toggleCompareInputs(chartTypeSelect.value);

    chartTypeSelect.addEventListener("change", (e) => {
      toggleCompareInputs(e.target.value);
    });
  } 

  const inputs = [
    {
      inputId: "ticker",
      listId: "ticker-list",
      codeId: "ticker-code",
      defaultValue: "AAPL",
    },
    {
      inputId: "compare-ticker-1",
      listId: "compare-ticker-list-1",
      codeId: "compare-ticker-code-1",
      defaultValue: "",
    },
    {
      inputId: "compare-ticker-2",
      listId: "compare-ticker-list-2",
      codeId: "compare-ticker-code-2",
      defaultValue: "",
    },
  ];

  let stockList = [];

  fetch("/api/chart/ticker")
    .then((res) => {
      if (!res.ok) throw new Error("Failed to fetch ticker data");
      return res.json();
    })
    .then((data) => {
      stockList = data.map((stock) => ({
        code: stock.Code || stock.code,
        name: stock.Name || stock.name,
      }));
    })
    .catch((err) => {     
     
    });

  function setupSingleInput(config) {
    const tickerInput = document.getElementById(config.inputId);
    const tickerList = document.getElementById(config.listId);
    const tickerCodeInput = document.getElementById(config.codeId);

    if (config.defaultValue) {
      tickerInput.value = config.defaultValue.split(".")[0]; 
      tickerCodeInput.value = config.defaultValue;
    }

    tickerInput.addEventListener("input", function () {
      const val = this.value.trim().toUpperCase();
      if (val.length === 0) {
        tickerList.style.display = "none";
        return;
      }
      const filtered = stockList
        .filter(
          (s) =>
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
          (s) =>
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

  inputs.forEach(setupSingleInput);
}
function newsExpandSrink() {
  const newsCard = document.getElementById("newsCard");
  const expandNewsBtn = document.getElementById("expandNewsBtn");
  const newsExpandIcon = document.getElementById("newsExpandIcon");

  expandNewsBtn.addEventListener("click", function () {
    newsCard.classList.toggle("news-expanded");
    isNewsExpanded = !isNewsExpanded;
    
    if (isNewsExpanded) {
      newsExpandIcon.textContent = "fullscreen_exit";
      displayNews(allNewsData); // Show all news
    } else {
      newsExpandIcon.textContent = "fullscreen";
      displayNews(allNewsData.slice(0, 7)); // Show only 7 news
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
    to: toStr,
    interval,
    chartType = "Candlestick",
  } = options;
  const isStatic = interval === "static";

  const compareSymbol1 =
    document.getElementById("compare-ticker-code-1")?.value.trim() || "";
  const compareSymbol2 =
    document.getElementById("compare-ticker-code-2")?.value.trim() || "";
  const compareSymbols = [compareSymbol1, compareSymbol2].filter((sym) => sym);

  let startDate = new Date(fromStr);
  if (isStatic) {
    startDate.setHours(0, 0, 0, 0);
  }
  let endDate = new Date(toStr);
  if (isStatic) {
    endDate.setHours(23, 59, 59, 999);
  }

const buildUrl = (sym) => {
  const url = new URL('ohlc', window.location.origin + baseUrl);
  url.searchParams.set('symbol', sym);
  url.searchParams.set('from', startDate.toISOString());
  url.searchParams.set('to', endDate.toISOString());

  if (!isStatic) {
    url.searchParams.set('interval', interval); 
  }

  return url;
};



  try {
    const mainResp = await fetch(buildUrl(symbol).toString());
    if (!mainResp.ok)
      throw new Error(`HTTP ${mainResp.status} ${mainResp.statusText}`);
    const mainPayload = await mainResp.json();
    if (mainPayload.success === false)
      throw new Error(mainPayload.message || "Server returned an error");

    const mainRows = Array.isArray(mainPayload)
      ? mainPayload
      : mainPayload.data || [];
    mainData = mainRows
      .map((d) => ({
        time: Math.floor(Date.parse(d.datetime) / 1000),
        open: parseFloat(d.open),
        high: parseFloat(d.high),
        low: parseFloat(d.low),
        close: parseFloat(d.close),
        volume: parseInt(d.volume, 10),
      }))
      .filter((d) => !Object.values(d).some(isNaN))
      .sort((a, b) => a.time - b.time);

    const lowerCaseType = chartType.toLowerCase();
    if (
      (lowerCaseType === "line" || lowerCaseType === "area") &&
      compareSymbols.length > 0
    ) {
      const comparePromises = compareSymbols.map(async (sym) => {
        const resp = await fetch(buildUrl(sym).toString());
        if (!resp.ok) return []; 
        const payload = await resp.json();
        const rows = Array.isArray(payload) ? payload : payload.data || [];
        return rows
          .map((d) => ({
            time: Math.floor(Date.parse(d.datetime) / 1000),
            open: parseFloat(d.open),
            high: parseFloat(d.high),
            low: parseFloat(d.low),
            close: parseFloat(d.close),
            volume: parseInt(d.volume, 10),
          }))
          .filter((d) => !Object.values(d).some(isNaN))
          .sort((a, b) => a.time - b.time);
      });
      compareDataArray = await Promise.all(comparePromises);
    }
  } catch (e) {
    chartContainer.innerHTML = `<div class="chart-error">Could not load chart data: ${e.message}</div>`;
    return;
  }

  let finalData = mainData;
  // if (isStatic && mainData.length > 0) {
  //   const msPerDay = 24 * 60 * 60 * 1000;
  //   const spanDays = (endDate - startDate) / msPerDay;
  //   const slots = getStaticSlots(spanDays);
  //   const allowedTimestamps = new Set();

  //   for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
  //     const dayOfWeek = d.getDay();
  //     if (dayOfWeek === 0 || dayOfWeek === 6) continue;
  //     if (spanDays > 365 && dayOfWeek !== 1 && dayOfWeek !== 5) continue;
  //     slots.forEach(({ h, m }) => {
  //       const dt = new Date(d);
  //       dt.setHours(h, m, 0, 0);
  //       allowedTimestamps.add(Math.floor(dt.getTime() / 1000));
  //     });
  //   }
  //   finalData = mainData.filter(d => allowedTimestamps.has(d.time));
  // }
  if (chartType.toLowerCase() === "heikin") {
    finalData = computeHeikinAshi(finalData);
  }
  if (chartType.toLowerCase() === 'renko') {
  finalData = computeRenko(finalData);
  }

  ohlcData = finalData;
  switchChartType(chartType, finalData, compareDataArray);

  if (finalData.length > 0) {
    applyAxisConfig(finalData);
    chart.timeScale().fitContent();
    earliestDateLoaded = finalData[0]?.time;
  } else {
    if (series) chart.removeSeries(series);
    chartContainer.innerHTML =
      '<div class="chart-error">No data available for the selected static intervals.</div>';
    setTimeout(() => setupChart(), 100);
  }
  RTATData = generateRTAT();
  setupRTATTooltip();
}
function isTradingDay(d) {
  const wd = d.getDay();
  return wd >= 1 && wd <= 5;
}
function getStaticSlots(spanDays) {
  if (spanDays <= 5) {
    return [
      { h: 4, m: 0 },
      { h: 5, m: 0 },
      { h: 6, m: 0 },
      { h: 7, m: 0 },
      { h: 8, m: 0 },
      { h: 9, m: 0 },
      { h: 10, m: 0 },
      { h: 12, m: 0 },
      { h: 14, m: 0 },
      { h: 16, m: 0 },
      { h: 16, m: 30 },
      { h: 17, m: 0 },
      { h: 19, m: 0 },
    ];
  } else if (spanDays <= 15) {
    return [
      { h: 4, m: 0 },
      { h: 7, m: 0 },
      { h: 8, m: 30 },
      { h: 9, m: 30 },
      { h: 11, m: 0 },
      { h: 13, m: 30 },
      { h: 16, m: 30 },
      { h: 17, m: 30 },
      { h: 19, m: 0 },
    ];
  } else if (spanDays <= 60) {
    return [
      { h: 4, m: 0 },
      { h: 9, m: 30 },
      { h: 12, m: 0 },
      { h: 16, m: 30 },
      { h: 19, m: 0 },
    ];
  } else if (spanDays <= 120) {
    return [
      { h: 4, m: 0 },
      { h: 9, m: 30 },
      { h: 16, m: 30 },
      { h: 19, m: 0 },
    ];
  } else if (spanDays <= 210) {
    return [
      { h: 4, m: 0 },
      { h: 19, m: 0 },
    ];
  } else if (spanDays <= 365) {
    return [{ h: 19, m: 0 }];
  } else {
    return [{ h: 19, m: 0 }];
  }
}
function switchChartType(type, mainData, compareDataArray = []) {
  if (series) {
    chart.removeSeries(series);
    series = null;
  }

  if (compareSeries && compareSeries.length > 0) {
    compareSeries.forEach((cs) => chart.removeSeries(cs));
    compareSeries = [];
  }

  if (!mainData || mainData.length === 0) {
    return;
  }

  const lowerCaseType = type.toLowerCase();
  const candleData = mainData;
  const lineData = mainData.map((d) => ({ time: d.time, value: d.close }));

  // Static colors
  const mainColor = "#ADD8E6"; // Light blue
  const compareColors = ["#90EE90", "#FFDAB9"]; // Light green, light orange

  // Helper function to create a series of the matching type
  const createSeries = (color, seriesData) => {
    if (lowerCaseType === "area") {
      const s = chart.addAreaSeries({
        topColor: "#7bb5ff88",
        bottomColor: "#ffffff00",
        lineColor: color,
        lineWidth: 2,
      });
      s.setData(seriesData);
      return s;
    } else if (lowerCaseType === "line") {
      const s = chart.addLineSeries({
        color: color,
        lineWidth: 2,
      });
      s.setData(seriesData);
      return s;
    }
    return null; // No series for non-matching types
  };

  // Render main series
  switch (lowerCaseType) {
    case "renko":
      series = chart.addCandlestickSeries({
        upColor: "#00ff00", // Green for up bricks
        downColor: "#ff0000", // Red for down bricks
        borderVisible: false,
        wickVisible: false, // No wicks for Renko
      });
      series.setData(candleData); // Use computed Renko data
      break;

    case "heikin":
      series = chart.addCandlestickSeries({
        upColor: "#00ff00", // Green for up candles
        downColor: "#ff0000", // Red for down candles
        borderVisible: false,
        wickUpColor: "#00ff00",
        wickDownColor: "#ff0000",
      });
      series.setData(candleData); // Use computed Heikin Ashi data
      break;

    case "area":
    case "line":
      series = createSeries(mainColor, lineData);
      break;

    case "candlestick":
      series = chart.addCandlestickSeries({
        upColor: "#26a69a",
        downColor: "#ef5350",
        borderVisible: false,
        wickUpColor: "#26a69a",
        wickDownColor: "#ef5350",
      });
      series.setData(candleData);
      break;

    case "baseline":
      series = chart.addBaselineSeries({
        baseValue: { type: "price", price: mainData[0]?.close || 0 },
        topLineColor: "rgba( 38, 166, 154, 1)",
        topFillColor1: "rgba( 38, 166, 154, 0.28)",
        topFillColor2: "rgba( 38, 166, 154, 0.05)",
        bottomLineColor: "rgba( 239, 83, 80, 1)",
        bottomFillColor1: "rgba( 239, 83, 80, 0.05)",
        bottomFillColor2: "rgba( 239, 83, 80, 0.28)",
      });
      series.setData(lineData);
      break;

    default:
      return;
  }

  // Render comparison series only for line or area
  if (lowerCaseType === "line" || lowerCaseType === "area") {
    compareDataArray.forEach((compareData, index) => {
      if (compareData && compareData.length > 0) {
        const compareLineData = compareData.map((d) => ({
          time: d.time,
          value: d.close,
        }));
        const color = compareColors[index % compareColors.length];
        const cs = createSeries(color, compareLineData);
        if (cs) {
          compareSeries.push(cs);
        }
      }
    });
  }
}
function validateChartForm() {
  const tickerCode = document.getElementById("ticker-code").value.trim();
  const dateFrom = document.getElementById("dateFrom").value.trim();
  const dateTo = document.getElementById("dateTo").value.trim();
  const interval = document.getElementById("interval").value.trim();
  const chartType = document.getElementById("chartType").value.trim();
  const errorFields = ["ticker", "dateFrom", "dateTo", "interval", "chartType"];
  errorFields.forEach((id) => {
    const err = document.getElementById("error-" + id);
    if (err) err.textContent = "";
    const input = document.getElementById(id);
    if (input) input.classList.remove("input-error-border");
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

  Object.keys(errors).forEach((id) => {
    const err = document.getElementById("error-" + id);
    if (err) err.textContent = errors[id];
    const input = document.getElementById(id);
    if (input) input.classList.add("input-error-border");
  });

  if (Object.keys(errors).length) return false;

  const formData = {
    symbol: tickerCode,
    from: dateFrom,
    to: dateTo,
    interval: interval,
    chartType: chartType,
  };

  fetchAndRenderChartData(formData);
  return true;
}
function Logout() {
  deleteCacheHistory();
  fetch("/logout", {
    method: "GET",
    credentials: "same-origin",
  })
    .then((res) => {
      window.location.href = "/";
    })
    .catch(() => {
      window.location.href = "/";
    });
}
function openChangePasswordModal() {
  document.getElementById("changePasswordModal").style.display = "flex";
  document.body.style.overflow = "hidden";
  clearPasswordForm();
  setTimeout(() => document.getElementById("oldPassword").focus(), 80);
}
function closeChangePasswordModal() {
  document.getElementById("changePasswordModal").style.display = "none";
  document.body.style.overflow = "";
  clearPasswordForm();
}
function clearPasswordForm() {
  ["oldPassword", "newPassword", "confirmPassword"].forEach((id) => {
    document.getElementById(id).value = "";
    document.getElementById("error-" + id).textContent = "";
    document.getElementById(id).classList.remove("input-error-border");
  });
}
async function submitChangePassword() {
  updateEnvKey("PASSWORD", "value");
  let valid = true;
  const oldPass = document.getElementById("oldPassword").value.trim();
  const newPass = document.getElementById("newPassword").value.trim();
  const confirmPass = document.getElementById("confirmPassword").value.trim();
  if (!oldPass) {
    valid = false;
    document.getElementById("error-oldPassword").textContent =
      "Enter your old password.";
    document.getElementById("oldPassword").classList.add("input-error-border");
  }
  if (!newPass) {
    valid = false;
    document.getElementById("error-newPassword").textContent =
      "Enter a new password.";
    document.getElementById("newPassword").classList.add("input-error-border");
  } else if (newPass.length < 6) {
    valid = false;
    document.getElementById("error-newPassword").textContent =
      "At least 6 characters.";
    document.getElementById("newPassword").classList.add("input-error-border");
  }
  if (!confirmPass) {
    valid = false;
    document.getElementById("error-confirmPassword").textContent =
      "Confirm your new password.";
    document
      .getElementById("confirmPassword")
      .classList.add("input-error-border");
  } else if (newPass !== confirmPass) {
    valid = false;
    document.getElementById("error-confirmPassword").textContent =
      "Passwords do not match.";
    document
      .getElementById("confirmPassword")
      .classList.add("input-error-border");
  }

  if (!valid) return false;
  let url = baseUrl + "changePassword";
  const params = [];
  if (oldPass) params.push(`old=${encodeURIComponent(oldPass)}`);
  if (newPass) params.push(`to=${encodeURIComponent(newPass)}`);
  const response = await fetch(url);
  closeChangePasswordModal();
  alert("Password changed successfully! (demo, no real change)");
  return false;
}
function updateInterval() {
  const dateFrom = document.getElementById("dateFrom").value;
  const dateTo = document.getElementById("dateTo").value;
  const interval = document.getElementById("interval");
  const errorSpan = document.getElementById("error-interval");
  const options = interval.options;

  errorSpan.textContent = "";
  for (let i = 0; i < options.length; i++) options[i].disabled = false;

  if (dateFrom && dateTo) {
    const from = new Date(dateFrom);
    const to = new Date(dateTo);
    const diffMs = to - from;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    let opt1min = interval.querySelector('option[value="1m"]');
    if (diffDays > 1 - 1e-9) {
      if (opt1min) opt1min.disabled = true;
      if (interval.value === "1m") {
        autoSelectFirstEnabled(interval);
      }
    }

    ["15m", "30m", "1h"].forEach((val) => {
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
function autoSelectFirstEnabled(select) {
  for (let i = 0; i < select.options.length; i++) {
    if (!select.options[i].disabled) {
      select.value = select.options[i].value;
      break;
    }
  }
}
function applyAxisConfig(data) {
  if (!data || data.length < 2) {
    return;
  }

  const first = new Date(data[0].time * 1000);
  const last = new Date(data[data.length - 1].time * 1000);
  const spanMs = last.getTime() - first.getTime();
  const spanDays = spanMs / (1000 * 60 * 60 * 24);

  chart.applyOptions({
    rightPriceScale: {
      autoScale: true,
      scaleMargins: { top: 0.2, bottom: 0.1 },
    },
    timeScale: {
      visible: true,  
      fixLeftEdge: true, 
      fixRightEdge: true,
      timeVisible: spanDays <= 5,  
      secondsVisible: spanDays <= 1, 
      tickMarkFormatter: (unixSeconds, tickType, locale) => {
        const d = new Date(unixSeconds * 1000);
        const day = d.getDate();
        const month = d.toLocaleString(locale, { month: "short" });
        const year = d.getFullYear();
        const hours = d.getHours().toString().padStart(2, '0');
        const minutes = d.getMinutes().toString().padStart(2, '0');
        const seconds = d.getSeconds().toString().padStart(2, '0');

        if (tickType === 'major') {
          if (spanDays <= 1) {
            return `${hours}:${minutes}:${seconds}`;  
          } else if (spanDays <= 15) {
            return `${day} ${month} ${hours}:${minutes}`;  
          } else if (spanDays <= 90) {
            return `${day} ${month} ${year}`;  
          } else if (spanDays <= 365) {
            return `${month} ${year}`; 
          } else if (spanDays <= 1825) {
            const q = Math.floor(d.getMonth() / 3) + 1;
            return `Q${q} ${year}`;  
          } else {
            return String(year);  
          }
        } else {
         
          if (spanDays <= 1) {
            return `${hours}:${minutes}`;  
          } else if (spanDays <= 15) {
            return `${day}`;  
          } else {
            return `${month}`; 
          }
        }
      },
    },
  });
}
async function deleteCacheHistory() {
  if (
    !confirm(
      "Are you sure you want to delete all cached chart history? This action cannot be undone."
    )
  ) {
    return;
  }

  try {
    const response = await fetch("/api/chart/cache", {
      method: "DELETE",
    });

    const result = await response.json();

    if (response.ok && result.success) {
      alert(result.message);
    } else {
      throw new Error(result.message || "An unknown error occurred.");
    }
  } catch (error) {
    alert("Failed to delete cache: " + error.message);
  }
}
function toggleCompareInputs(chartType) {
  const compareContainer = document.querySelector(
    "#toolbarLeft .comparison-tickers-container"
  );

 

  const lowerCaseType = chartType.toLowerCase();

  if (lowerCaseType === "line" || lowerCaseType === "area") {
    compareContainer.style.display = "flex";
  } else {
    compareContainer.style.display = "none";
  }
}
function computeHeikinAshi(ohlcData) {
  if (ohlcData.length === 0) return haData;
  let haData = [];
  haData.push({
    time: ohlcData[0].time,
    open: ohlcData[0].open,
    high: ohlcData[0].high,
    low: ohlcData[0].low,
    close: ohlcData[0].close,
  });

  for (let i = 1; i < ohlcData.length; i++) {
    const prevHa = haData[i - 1];
    const curr = ohlcData[i];

    const haClose = (curr.open + curr.high + curr.low + curr.close) / 4;
    const haOpen = (prevHa.open + prevHa.close) / 2;
    const haHigh = Math.max(curr.high, haOpen, haClose);
    const haLow = Math.min(curr.low, haOpen, haClose);

    haData.push({
      time: curr.time,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
    });
  }

  return haData;
}
function openRenkoSettingsModal() {
  const modal = document.getElementById("renkoSettingsModal");
  modal.style.display = "flex";

  document.querySelector(
    `input[name="renkoType"][value="${renkoSettings.type}"]`
  ).checked = true;
  document.getElementById("fixedBrickSize").value =
    renkoSettings.fixedBrickSize;
  document.getElementById("atrPeriod").value = renkoSettings.atrPeriod;
  document.getElementById("percentageValue").value =
    renkoSettings.percentageValue;

  toggleRenkoFields(renkoSettings.type); 
}
function closeRenkoSettingsModal() {
  document.getElementById("renkoSettingsModal").style.display = "none";
}
function toggleRenkoFields(selectedType) {
  document.getElementById("fixedSettings").style.display =
    selectedType === "fixed" ? "block" : "none";
  document.getElementById("atrSettings").style.display =
    selectedType === "atr" ? "block" : "none";
  document.getElementById("percentageSettings").style.display =
    selectedType === "percentage" ? "block" : "none";
}
function saveRenkoSettings() {
  const selectedType = document.querySelector(
    'input[name="renkoType"]:checked'
  ).value;
  renkoSettings.type = selectedType;

  if (selectedType === "fixed") {
    renkoSettings.fixedBrickSize = parseFloat(
      document.getElementById("fixedBrickSize").value
    );
  } else if (selectedType === "atr") {
    renkoSettings.atrPeriod = parseInt(
      document.getElementById("atrPeriod").value,
      10
    );
  } else if (selectedType === "percentage") {
    renkoSettings.percentageValue = parseFloat(
      document.getElementById("percentageValue").value
    );
  }

  closeRenkoSettingsModal();
}
function computeRenko(ohlcData) {
  const renkoData = [];
  if (ohlcData.length === 0) return renkoData;
  let brickSize;
  if (renkoSettings.type === 'fixed') {
    brickSize = renkoSettings.fixedBrickSize;
  } else if (renkoSettings.type === 'atr') {
    brickSize = calculateATR(ohlcData, renkoSettings.atrPeriod);
  } else if (renkoSettings.type === 'percentage') {
    brickSize = (ohlcData[0].close * renkoSettings.percentageValue) / 100;
  }

  if (brickSize <= 0) {
    return renkoData;  
  }

  let lastPrice = ohlcData[0].close;
  let direction = 0; 

  ohlcData.forEach((bar) => {
    const diff = bar.close - lastPrice;
    let bricks = Math.floor(Math.abs(diff) / brickSize);

    if (bricks > 0) {
      const brickDirection = diff > 0 ? 1 : -1;
      if (brickDirection !== direction && direction !== 0) {

        renkoData.push({
          time: bar.time,
          open: lastPrice,
          high: lastPrice + brickSize * brickDirection,
          low: lastPrice,
          close: lastPrice + brickSize * brickDirection,
        });
        lastPrice += brickSize * brickDirec
        bricks--;  
      }

      for (let i = 0; i < bricks; i++) {
        const open = lastPrice;
        const close = open + brickSize * brickDirection;
        renkoData.push({
          time: bar.time,
          open: open,
          high: Math.max(open, close),
          low: Math.min(open, close),
          close: close,
        });
        lastPrice = close;
      }
      direction = brickDirection;
    }
  });

  return renkoData;
}
function calculateATR(data, period) {
  if (!data || data.length < period) {
    return 0; 
  }

  const trValues = [];
  for (let i = 1; i < data.length; i++) {
    const tr = Math.max(
      data[i].high - data[i].low,
      Math.abs(data[i].high - data[i - 1].close),
      Math.abs(data[i].low - data[i - 1].close)
    );
    trValues.push(tr);
  }

  if (trValues.length === 0) {
    return 0;
  }

  let atr = trValues.slice(0, period).reduce((sum, v) => sum + v, 0) / period;

  for (let i = period; i < trValues.length; i++) {
    atr = (atr * (period - 1) + trValues[i]) / period;
  }

  if (!isFinite(atr)) {
    return 1; 
  }

  return atr;
}
function generateNews() {
  const newsStartDate = document.getElementById('newsStartDate').value;
  const newsEndDate = document.getElementById('newsEndDate').value;
  const tickers = [document.getElementById('ticker-code').value, document.getElementById('compare-ticker-code-1').value, document.getElementById('compare-ticker-code-2').value].filter(Boolean);

  if (tickers.length === 0 || !newsStartDate || !newsEndDate) {
    alert('Please select tickers and dates.');
    return;
  }
    const container = document.getElementById('newsHeadlines');
  container.innerHTML = '';



  const url = `${baseUrl}news?tickers=${tickers.join(',')}&from=${newsStartDate}&to=${newsEndDate}`;

  fetch(url)
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(news => {
      if (news.length === 0) {
        alert('No news found for the selected criteria.');
        return;
      }
      allNewsData = news; 
      isNewsExpanded = false; 
      displayNews(news.slice(0, 7)); 
      document.getElementById('newsCard').style.display = 'block';    
      document.getElementById('newsExpandIcon').textContent = 'fullscreen';
      document.getElementById('newsCard').classList.remove('news-expanded');
    })
    .catch(error => console.error('Error fetching news:', error));
}
function displayNews(newsItems) {
  console.log('Displaying news:', newsItems);
  const container = document.getElementById('newsHeadlines');
  container.innerHTML = '';
  newsItems.forEach(item => {
    const row = document.createElement('tr');
    const dateOnly = new Date(item.date).toLocaleDateString();
    row.innerHTML = `
      <td>${dateOnly} - (${item.symbol})</td>
      <td>${item.publication}</td>
      <td><a href="${item.link}" target="_blank">${item.headline}</a></td>
    `;
    container.appendChild(row);
  });
}
async function generateRTAT() {
  const fromDate = document.getElementById('dateFrom').value;
  const toDate = document.getElementById('dateTo').value;
  const tickers = [document.getElementById('ticker-code').value, document.getElementById('compare-ticker-code-1').value, document.getElementById('compare-ticker-code-2').value].filter(Boolean);

  if (tickers.length === 0 || !fromDate || !toDate) {
    alert('Please select tickers and dates.');
    return;
  }

  const url = `${baseUrl}rtat?tickers=${tickers.join(',')}&from=${fromDate}&to=${toDate}`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const averages = await response.json();
    console.log('RTAT Averages:', averages); 
  } catch (error) {
    console.error('Error fetching RTAT:', error);
  }
}





