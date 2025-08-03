
let chart, series;
let ohlcData = [], RTATData = {};
let symbol = '';           
let compareSymbols = [];
let baseUrl = "/api/chart/";
const renkoSettings = {
  type: 'fixed',
  fixedBrickSize: 1.0,
  atrPeriod: 14,
  percentageValue: 1
};

window.addEventListener('DOMContentLoaded', initRealtime);
document.querySelectorAll('#realtime-renkoSettingsForm input[name="renkoType"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    toggleRenkoFields(e.target.value);
  });
});

function initRealtime() {
  setupRealtimeTicker()
  const urlSymbol = getQueryParam('symbol');
  if (urlSymbol) {
    document.getElementById('realtime-main-symbol').value = urlSymbol.toUpperCase();
    generateRealtimeChart();
  } 

}
function setupRealtimeTicker() {
  const chartTypeSelect = document.getElementById("realtime-chartType");

  function toggleCompareInputs(chartType) {
    const multi = ['area', 'line'];
    const c1 = document.getElementById("realtime-compare-ticker-1").closest('.form-group');
    const c2 = document.getElementById("realtime-compare-ticker-2").closest('.form-group');
    if (!c1) return;
    if (multi.includes(chartType)) {
      c1.style.display = "";
      c2.style.display = "";

    } else {
      c1.style.display = "none";
      c2.style.display = "none";

        document.getElementById("realtime-compare-ticker-2").value = "";
      document.getElementById("realtime-compare-ticker-code-2").value = "";
      document.getElementById("realtime-compare-ticker-1").value = "";
      document.getElementById("realtime-compare-ticker-code-1").value = "";
    }
  }

  if (chartTypeSelect) {
    toggleCompareInputs(chartTypeSelect.value);
    chartTypeSelect.addEventListener("change", (e) => {
      toggleCompareInputs(e.target.value);
    });
  }

  const inputs = [
    {
      inputId: "realtime-compare-ticker-1",
      listId: "realtime-compare-ticker-list-1",
      codeId: "realtime-compare-ticker-code-1",
      defaultValue: "",
    },
    {
      inputId: "realtime-compare-ticker-2",
      listId: "realtime-compare-ticker-list-2",
      codeId: "realtime-compare-ticker-code-2",
      defaultValue: "",
    }
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
    });

  function setupSingleInput(config) {
    const tickerInput = document.getElementById(config.inputId);
    const tickerList = document.getElementById(config.listId);
    const tickerCodeInput = document.getElementById(config.codeId);
    if (!tickerInput || !tickerList || !tickerCodeInput) return;

    if (config.defaultValue) {
      tickerInput.value = config.defaultValue.split(".")[0];
      tickerCodeInput.value = config.defaultValue;
    }

    tickerInput.addEventListener("input", function () {
      const val = this.value.trim().toUpperCase();
      if (val.length === 0) {
        tickerList.style.display = "none";
        tickerCodeInput.value = "";
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
        tickerCodeInput.value = "";
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

    document.addEventListener("mousedown", function (e) {
      if (!tickerInput.contains(e.target) && !tickerList.contains(e.target)) {
        tickerList.style.display = "none";
      }
    });
  }

  inputs.forEach(setupSingleInput);
}
async function generateRealtimeChart() {
  symbol = (document.getElementById('realtime-main-symbol').value || '').trim().toUpperCase();

  compareSymbols = [];
  let cs1 = (document.getElementById('realtime-compare-ticker-1').value || '').trim().toUpperCase();
  let cs2 = (document.getElementById('realtime-compare-ticker-2').value || '').trim().toUpperCase();

  [cs1, cs2].forEach(cs => {
    if (cs && cs !== symbol && !compareSymbols.includes(cs)) {
      compareSymbols.push(cs);
    }
  });

  const interval = document.getElementById('realtime-interval').value;
  const chartType = document.getElementById('realtime-chartType').value.toLowerCase();

  if (!symbol) {
    alert('Main symbol is missing.');
    return;
  }

  ohlcData = await fetchRealtimeOHLC(symbol, interval);
  RTATData = await fetchRTAT([symbol, ...compareSymbols]);
  let compareDataArray = [];
  if (compareSymbols.length) {
    for (let sym of compareSymbols) {
      compareDataArray.push(await fetchRealtimeOHLC(sym, interval));
    }
  }

  renderChart(chartType, [symbol, ...compareSymbols], [ohlcData, ...compareDataArray]);
  injectRealtimeSummaryBoxes([symbol, ...compareSymbols], [ohlcData, ...compareDataArray], RTATData);
  updateChartDayLabels(ohlcData);
  subscribeInfoBoxHover(chartType, [symbol, ...compareSymbols], [ohlcData, ...compareDataArray], RTATData);
}
async function fetchRealtimeOHLC(sym, interval) {
  try {
    const resp = await fetch(`${baseUrl}realtime-data?symbol=${encodeURIComponent(sym)}&interval=${encodeURIComponent(interval)}`);
    return await resp.json();
  } catch (e) { return []; }
}
async function fetchRTAT(tickers) {
  try {
    const day = getTodayISO();
    const resp = await fetch(`${baseUrl}rtat?tickers=${encodeURIComponent(tickers.join(','))}&from=${day}&to=${day}`);
    return await resp.json();
  } catch (e) { return {}; }
}
function renderChart(chartType, tickers, ohlcArrays) {
  const chartDiv = document.getElementById('realtime-chartDiv');
  chartDiv.innerHTML = '';
  chart = LightweightCharts.createChart(chartDiv, {
    width: chartDiv.clientWidth,
    height: chartDiv.clientHeight,
    handleScale: false,
    handleScroll: false,
    timeScale: { timeVisible: true, secondsVisible: false },
    rightPriceScale: { autoScale: true },
    crosshair: { mode: 1 }
  });

 ohlcArrays.forEach((arr, idx) => {
  let s;
  if (['line', 'area', 'baseline'].includes(chartType)) {
    s = chart.addLineSeries();
  } else if (chartType === 'candlestick') {
    s = chart.addCandlestickSeries();
  } else if (chartType === 'bar') {
    s = chart.addBarSeries();
  } else if (chartType === 'renko') {
    s = chart.addCandlestickSeries(); 
  } else {
    s = chart.addCandlestickSeries();
  }

  const dataToShow = (chartType === 'renko') ? computeRenko(arr) : arr;
  s.setData(dataToShow);
});


  let all = ohlcArrays.flat();
  if (all.length > 0) {
    const maxPrice = Math.max(...all.map(d => d.high));
    chart.priceScale('right').applyOptions({ minValue: 0, maxValue: maxPrice * 1.2 });
  }
  chart.timeScale().fitContent();
}
function updateChartDayLabels(arr) {
  if (!arr.length) return;
  const high = Math.max(...arr.map(d => d.high));
  const low = Math.min(...arr.map(d => d.low));
  const avg = arr.reduce((sum, d) => sum + d.close, 0) / arr.length;
  document.getElementById('dayHigh').textContent = high.toFixed(2);
  document.getElementById('dayLow').textContent = low.toFixed(2);
  document.getElementById('dayAvg').textContent = avg.toFixed(2);
}
function injectRealtimeSummaryBoxes(tickers, arrays, rtatObj) {
  for (let i = 0; i < tickers.length; ++i) {
    const sum = calculateSummary(arrays[i], (rtatObj[tickers[i]] || []));
    const prefix = i === 0 ? "mainBox" : `compareBox${i}`;
    const setBox = (id, content) => { const el = document.getElementById(`realtime-${prefix}-${id}`); if(el) el.innerHTML = content; };
    setBox('core', `
      <div class="summary-box">
        <div class="metric"><strong>${tickers[i]}</strong> </div>
        <div class="metric"><strong>VWAP:</strong> ${sum.vwap?.toFixed(2) ?? '--'}</div>
        <div class="metric"><strong>Price Range:</strong> ${sum.priceRange?.toFixed(2) ?? '--'}</div>
        <div class="metric"><strong>Total Volume:</strong> ${sum.totalVolume?.toLocaleString() ?? '--'}</div>
        <div class="metric"><strong>Volatility %:</strong> ${sum.volatility?.toFixed(2) ?? '--'}%</div>
      </div>
    `);
    setBox('4w52w', `
      <div class="summary-box">
        <div class="metric"><strong>4W:</strong> ${sum.avg4W?.toFixed(2) ?? '--'}</div>
        <div class="metric"><strong>52W:</strong> ${sum.avg52W?.toFixed(2) ?? '--'}</div>
      </div>
    `);
    setBox('rtat', `
      <div class="summary-box">
        <div class="metric"><strong>Opinion:</strong> ${sum.avgSentiment?.toFixed(2) ?? '--'}</div>
        <div class="metric"><strong>Activity:</strong> ${sum.avgActivity?.toFixed(3) ?? '--'}</div>
      </div>
    `);
    setBox('bias', `
      <div class="summary-box">
        <div class="bias-scores">
          <strong>Scores:</strong><br/>
          04-09: ${(sum.biasScore?.['04-09'] ?? 0).toFixed(2)}<br/>
          09-12: ${(sum.biasScore?.['09-12'] ?? 0).toFixed(2)}<br/>
          12-16: ${(sum.biasScore?.['12-16'] ?? 0).toFixed(2)}<br/>
          16-19: ${(sum.biasScore?.['16-19'] ?? 0).toFixed(2)}
        </div>
      </div>
    `);
  }
}
function subscribeInfoBoxHover(chartType, tickers, arrays, rtatObj) {
  chart.subscribeCrosshairMove(param => {
    if (!param || !param.time) return hideChartInfoBox();
    const arr = arrays[0];
    const point = arr.find(d => d.time === param.time);
    const idx = arr.findIndex(d => d.time === param.time);
    if (!point) return hideChartInfoBox();
    const price = point.close;
    const volume = point.volume;
    let vwap = '--';
    if (idx >= 0) {
      let pvSum = 0, volSum = 0;
      for (let i = 0; i <= idx; i++) {
        const typical = (arr[i].high + arr[i].low + arr[i].close) / 3;
        pvSum += typical * arr[i].volume;
        volSum += arr[i].volume;
      }
      vwap = volSum > 0 ? (pvSum / volSum).toFixed(2) : '--';
    }
    let rtatSentiment = '--', rtatActivity = '--';
    if (point) {
      const lagDateObj = new Date(point.time * 1000);
      lagDateObj.setDate(lagDateObj.getDate() - 1);
      const lagDate = lagDateObj.toISOString().slice(0, 10);
      const rtat = (rtatObj[tickers[0]] || []).find(r => r.date === lagDate);
      if (rtat) {
        rtatSentiment = rtat.sentiment;
        rtatActivity = rtat.activity;
      }
    }
    const timeString = new Date(param.time * 1000).toLocaleString();
    showChartInfoBox({ timeString, price, volume, vwap, rtatSentiment, rtatActivity });
  });
}
function showChartInfoBox({ timeString, price, volume, vwap, rtatSentiment, rtatActivity }) {
  const box = document.getElementById('realtime-chartInfoBox');
  box.style.display = 'flex';
  document.getElementById('realtime-infoTime').innerHTML = "<strong>Time:</strong> " + (timeString ?? "--");
  document.getElementById('realtime-infoPrice').innerHTML = "<strong>Price:</strong> " + (price !== undefined ? price : "--");
  document.getElementById('realtime-infoVolume').innerHTML = "<strong>Volume:</strong> " + (volume !== undefined ? volume.toLocaleString() : "--");
  document.getElementById('realtime-infoVWAP').innerHTML = "<strong>VWAP:</strong> " + (vwap !== undefined ? vwap : "--");
  document.getElementById('realtime-infoRTAT').innerHTML = `<strong>RTAT:</strong> S=${rtatSentiment ?? "--"} / A=${rtatActivity ?? "--"}`;
}
function hideChartInfoBox() {
  const box = document.getElementById('realtime-chartInfoBox');
  if (box) box.style.display = 'none';
}
function openRenkoSettingsModal() {
  const modal = document.getElementById("realtime-renkoSettingsModal");
  modal.style.display = "flex";

  document.querySelector(
    `#realtime-renkoSettingsModal input[name="renkoType"][value="${renkoSettings.type}"]`
  ).checked = true;
  document.getElementById("realtime-fixedBrickSize").value = renkoSettings.fixedBrickSize;
  document.getElementById("realtime-atrPeriod").value = renkoSettings.atrPeriod;
  document.getElementById("realtime-percentageValue").value = renkoSettings.percentageValue;
  toggleRenkoFields(renkoSettings.type);
}
function closeRenkoSettingsModal() {
  document.getElementById("realtime-renkoSettingsModal").style.display = "none";
}
function toggleRenkoFields(selectedType) {
  document.getElementById("realtime-fixedSettings").style.display =
    selectedType === "fixed" ? "block" : "none";
  document.getElementById("realtime-atrSettings").style.display =
    selectedType === "atr" ? "block" : "none";
  document.getElementById("realtime-percentageSettings").style.display =
    selectedType === "percentage" ? "block" : "none";
}
function saveRenkoSettings() {
  const selectedType = document.querySelector(
    '#realtime-renkoSettingsForm input[name="renkoType"]:checked'
  ).value;
  renkoSettings.type = selectedType;

  if (selectedType === "fixed") {
    renkoSettings.fixedBrickSize = parseFloat(
      document.getElementById("realtime-fixedBrickSize").value
    );
  } else if (selectedType === "atr") {
    renkoSettings.atrPeriod = parseInt(
      document.getElementById("realtime-atrPeriod").value, 10
    );
  } else if (selectedType === "percentage") {
    renkoSettings.percentageValue = parseFloat(
      document.getElementById("realtime-percentageValue").value
    );
  }
  closeRenkoSettingsModal();
}
function Logout() {
  if (window.opener) {
    window.close();
  } else {
    window.location.href = "/chart"; 
  }
}

function getQueryParam(key) {
  return new URLSearchParams(window.location.search).get(key);
}
function getTodayISO() {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}
function calculateSummary(ohlcData, rtatData) {
  if (!ohlcData || ohlcData.length === 0) return {};
  ohlcData.sort((a, b) => a.time - b.time);
  const avgVWAP = ohlcData.reduce((sum, bar) => sum + ((bar.open + bar.high + bar.low + bar.close) / 4), 0) / ohlcData.length;
  const avgPriceRange = ohlcData.reduce((sum, bar) => sum + (bar.high - bar.low), 0) / ohlcData.length;
  const avgTotalVolume = ohlcData.reduce((sum, bar) => sum + bar.volume, 0) / ohlcData.length;
  const avgVolatility = ohlcData.reduce((sum, bar) => sum + ((bar.high - bar.low) / bar.open) * 100, 0) / ohlcData.length;
  const avg4W = (() => {
    const slice = ohlcData.slice(-20);
    if (!slice.length) return 0;
    return slice.reduce((sum, bar) => sum + bar.close, 0) / slice.length;
  })();
  const avg52W = (() => {
    const slice = ohlcData.slice(-260);
    if (!slice.length) return 0;
    return slice.reduce((sum, bar) => sum + bar.close, 0) / slice.length;
  })();
  const avgSentiment = rtatData && rtatData.length
    ? rtatData.reduce((sum, r) => sum + (parseFloat(r.sentiment) || 0), 0) / rtatData.length
    : 0;
  const avgActivity = rtatData && rtatData.length
    ? rtatData.reduce((sum, r) => sum + (parseFloat(r.activity) || 0), 0) / rtatData.length
    : 0;
  const biasScore = { '04-09': 0, '09-12': 0, '12-16': 0, '16-19': 0 };
  if (ohlcData[0].time !== undefined && ohlcData[0].open !== undefined) {
    const segments = {
      '04-09': { buy: 0, sell: 0 },
      '09-12': { buy: 0, sell: 0 },
      '12-16': { buy: 0, sell: 0 },
      '16-19': { buy: 0, sell: 0 }
    };
    ohlcData.forEach(bar => {
      const d = new Date(bar.time * 1000);
      const h = d.getUTCHours();
      let segment = null;
      if (h >= 4 && h < 9) segment = '04-09';
      else if (h >= 9 && h < 12) segment = '09-12';
      else if (h >= 12 && h < 16) segment = '12-16';
      else if (h >= 16 && h < 19) segment = '16-19';
      if (!segment) return;
      if (bar.close > bar.open) segments[segment].buy += bar.volume;
      else if (bar.close < bar.open) segments[segment].sell += bar.volume;
    });
    for (const seg in segments) {
      const { buy, sell } = segments[seg];
      biasScore[seg] = (buy + sell) > 0 ? (buy - sell) / (buy + sell) : 0;
    }
  }
  return {
    vwap: avgVWAP,
    priceRange: avgPriceRange,
    totalVolume: avgTotalVolume,
    volatility: avgVolatility,
    avg4W,
    avg52W,
    avgSentiment,
    avgActivity,
    biasScore
  };
}
function computeRenko(ohlcData) {
  const renkoData = [];
  if (ohlcData.length === 0) return renkoData;
  let brickSize;

  if (renkoSettings.type === "fixed") {
    brickSize = renkoSettings.fixedBrickSize;
  } else if (renkoSettings.type === "atr") {
    brickSize = calculateATR(ohlcData, renkoSettings.atrPeriod);
  } else if (renkoSettings.type === "percentage") {
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
        lastPrice += brickSize * brickDirection;
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

  if (!isFinite(atr) || atr === 0) {
    return 1;
  }
  return atr;
}

