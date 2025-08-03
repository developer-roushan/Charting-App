// ========== Config ==========
// NOTE: Replace with actual user-selected tickers or pass via server-side rendering as needed.
const symbol = 'AAPL';
const compareSymbols = []; // Push up to 2 more ticker codes here if you want compare boxes to be filled.

let chart, series, ohlcData = [], RTATData = {};

// ========== INIT ==========

window.addEventListener('DOMContentLoaded', () => {
  initChart();
  document.getElementById('realTimeChartType').addEventListener('change', updateChart);
  document.getElementById('realTimeInterval').addEventListener('change', pollData);

  document.getElementById('renkoSettingsBtn').addEventListener('click', () => {
    alert('Renko settings modal coming soon.'); // plug your modal logic here
  });
  document.getElementById('exitClearBtn').addEventListener('click', async () => {
    await fetch(`/clear-realtime-cache?symbol=${encodeURIComponent(symbol)}`, { method: 'POST' });
    window.location.href = '/';
  });
});

// ========== MAIN FUNCTIONS ==========

function initChart() {
  chart = LightweightCharts.createChart(document.getElementById('realTimeChartDiv'), {
    width: document.getElementById('realTimeChartDiv').offsetWidth,
    height: 500,
    timeScale: { timeVisible: true, secondsVisible: false },
    rightPriceScale: { autoScale: true },
  });
  series = chart.addCandlestickSeries();
  pollData();
  chart.subscribeCrosshairMove(handleHover);
}

async function pollData() {
  const interval = document.getElementById('realTimeInterval').value;
  // Fetch OHLC
  ohlcData = await fetch(`/realtime-data?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}`)
    .then(r => r.json()).catch(() => []);
  // Fetch RTAT
  RTATData = await fetch(`/rtat?tickers=${encodeURIComponent(symbol)}&from=${getTodayISO()}&to=${getTodayISO()}`)
    .then(r => r.json()).catch(() => ({}));

  updateChart();
  updateLabels();
  updatePurpleBoxes();
  setTimeout(pollData, 60000); // Repeat in 60 seconds
}

function updateChart() {
  const type = document.getElementById('realTimeChartType').value.toLowerCase();
  if (series) chart.removeSeries(series);

  let processedData = ohlcData;
  // You must implement or import `computeHeikinAshi`, `computeRenko` in this file:
  // if (type === 'heikin ashi') processedData = computeHeikinAshi(ohlcData);
  // if (type === 'renko') processedData = computeRenko(ohlcData);

  // Series creation switch (simplified - expand as needed)
  if (['line', 'area', 'baseline'].includes(type)) {
    series = chart.addLineSeries();
  } else if (type === 'candlestick') {
    series = chart.addCandlestickSeries();
  } else if (type === 'bar') {
    series = chart.addBarSeries();
  } else {
    // Default
    series = chart.addCandlestickSeries();
  }
  series.setData(processedData);

  // Y axis scaling: +20% headroom
  if (processedData.length) {
    const maxPrice = Math.max(...processedData.map(d => d.high));
    chart.priceScale('right').applyOptions({ minValue: 0, maxValue: maxPrice * 1.2 });
  }
  chart.timeScale().fitContent();
}

function updateLabels() {
  if (!ohlcData.length) return;
  const high = Math.max(...ohlcData.map(d => d.high));
  const low = Math.min(...ohlcData.map(d => d.low));
  const avg = ohlcData.reduce((sum, d) => sum + d.close, 0) / ohlcData.length;
  document.getElementById('dayHigh').textContent = high.toFixed(2);
  document.getElementById('dayLow').textContent = low.toFixed(2);
  document.getElementById('dayAvg').textContent = avg.toFixed(2);
}

// Placeholder functions - implement or import your existing logic
function calculateSummary(ohlcData, rtatData) {
  // Insert your calculateSummary logic here!
  // Return sample as demo:
  return {
    vwap: 150,
    priceRange: 5,
    totalVolume: 123456,
    volatility: 2.8,
    avg4W: 147,
    avg52W: 130,
    avgSentiment: 14.1,
    avgActivity: 0.05,
    biasScore: { "04-09": 0.2, "09-12": -0.1, "12-16": 0.05, "16-19": 0 }
  };
}
function injectSummaryBoxes(summaryData) {
  // Implement or import - see previous assistant messages for this code.
  // Example for demo:
  let coreBox = document.getElementById('mainBox-core');
  if (coreBox) {
      coreBox.innerHTML = `
        <div class="summary-box">
          <div class="metric"><strong>Avg VWAP:</strong> ${summaryData[symbol].vwap}</div>
          <div class="metric"><strong>Avg Price Range:</strong> ${summaryData[symbol].priceRange}</div>
          <div class="metric"><strong>Avg Total Volume:</strong> ${summaryData[symbol].totalVolume}</div>
          <div class="metric"><strong>Avg Volatility %:</strong> ${summaryData[symbol].volatility}%</div>
        </div>
      `;
  }
}
// ====== Hover logic =======
function handleHover(param) {
  if (!param || !param.time) {
    hideChartInfoBox();
    return;
  }
  const hoveredTime = param.time; // unix timestamp (seconds)
  const point = ohlcData.find(d => d.time === hoveredTime);
  const idx = ohlcData.findIndex(d => d.time === hoveredTime);
  if (!point) return hideChartInfoBox();

  const price = point.close;
  const volume = point.volume;

  // VWAP
  let vwap = '--';
  if (idx >= 0) {
    let pvSum = 0, volSum = 0;
    for (let i = 0; i <= idx; i++) {
      const typical = (ohlcData[i].high + ohlcData[i].low + ohlcData[i].close) / 3;
      pvSum += typical * ohlcData[i].volume;
      volSum += ohlcData[i].volume;
    }
    vwap = volSum > 0 ? (pvSum / volSum).toFixed(2) : '--';
  }

  // RTAT: 1-day lag
  let rtatSentiment = '--', rtatActivity = '--';
  if (point) {
    const lagDateObj = new Date(point.time * 1000);
    lagDateObj.setDate(lagDateObj.getDate() - 1);
    const lagDate = lagDateObj.toISOString().slice(0, 10);
    const rtat = (RTATData[symbol] || []).find(r => r.date === lagDate);
    if (rtat) {
      rtatSentiment = rtat.sentiment;
      rtatActivity = rtat.activity;
    }
  }
  const timeString = new Date(hoveredTime * 1000).toLocaleString();

  showChartInfoBox({ timeString, price, volume, vwap, rtatSentiment, rtatActivity });
}

function showChartInfoBox({ timeString, price, volume, vwap, rtatSentiment, rtatActivity }) {
  const box = document.getElementById('chartInfoBox');
  if (!box) return;
  box.style.display = 'flex';
  document.getElementById('infoTime').innerHTML = "<strong>Time:</strong> " + (timeString ?? "--");
  document.getElementById('infoPrice').innerHTML = "<strong>Price:</strong> " + (price !== undefined ? price : "--");
  document.getElementById('infoVolume').innerHTML = "<strong>Volume:</strong> " + (volume !== undefined ? volume.toLocaleString() : "--");
  document.getElementById('infoVWAP').innerHTML = "<strong>VWAP:</strong> " + (vwap !== undefined ? vwap : "--");
  document.getElementById('infoRTAT').innerHTML = `<strong>RTAT:</strong> S=${rtatSentiment ?? "--"} / A=${rtatActivity ?? "--"}`;
}

function hideChartInfoBox() {
  const box = document.getElementById('chartInfoBox');
  if (box) box.style.display = 'none';
}

// Utility: ISO date string for today
function getTodayISO() {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}
