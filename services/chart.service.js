require('dotenv').config();
const axios = require("axios");
const apiKey = process.env.EODHD_API_KEY;
const password = process.env.PASSWORD;;
const baseUrl = 'https://eodhd.com/api/';
const responseFormat ='&fmt=json';
const path = require("path");
const tickerFilePath = path.join(__dirname, "../data/ticker.json");
const fs = require('fs').promises;
const ohlcCache = {};


/**
 * Fetch intraday OHLC data, with optional from/to/interval.
 *
 * @param {string|null} fromISO    ISO datetime e.g. "2025-07-19T08:58"
 * @param {string|null} toISO      ISO datetime e.g. "2025-07-19T13:58"
 * @param {string}       symbol    e.g. "AAPL.US"
 * @param {string}       interval  e.g. "1min","5min","15min","60min","static"
 */
exports.fetchOHLC = async (fromISO, toISO, symbol = 'AAPL.US', interval) => {
 
  const now      = Date.now();
  const cacheKey = `${symbol}|${fromISO||''}|${toISO||''}|${interval||''}`;
  if (ohlcCache[cacheKey] && (now - ohlcCache[cacheKey].lastFetched < 60_000)) {
    console.log('→ returning cached data');
    return ohlcCache[cacheKey].data;
  }

  const params = new URLSearchParams({
    api_token: apiKey,
    fmt:       'json',
  });
  if (interval) params.set('interval', interval);
  if (fromISO) {
    const fromTs = Math.floor(new Date(fromISO).getTime()/1000);
    params.set('from', String(fromTs));
  }
  if (toISO) {
    const toTs = Math.floor(new Date(toISO).getTime()/1000);
    params.set('to', String(toTs));
  }

  const url = `${baseUrl}intraday/${encodeURIComponent(symbol)}?${params.toString()}${responseFormat}`;
  console.log('→ GET', url);
  let resp;
  try {
    resp = await axios.get(url);
  } catch (err) {
    console.error('Error fetching OHLC:', err.message);
    throw err;
  }

  const raw  = Array.isArray(resp.data) ? resp.data : [];
  const data = raw.filter(d =>
    d.datetime   &&
    !isNaN(d.open)  && !isNaN(d.high) &&
    !isNaN(d.low)   && !isNaN(d.close) &&
    !isNaN(d.volume)
  );

  return data;
};
exports.fetchAndSaveTicker = async () => {
  debugger;
  let url = `${baseUrl}exchange-symbol-list/us?api_token=${apiKey}&type=common_stock${responseFormat}`;
  const response = await axios.get(url);
  await saveTickerData(response.data);
  return response.data;
};
exports.fetchTicker = async () => {
  try {
    const data = await readTickerData();
    return data;
  } catch (err) {
    return await exports.fetchAndSaveTicker();
  }
};
async function saveTickerData(data) {
  await fs.writeFile(tickerFilePath, JSON.stringify(data, null, 2), "utf-8");
}
async function readTickerData() {
  const raw = await fs.readFile(tickerFilePath, "utf-8");
  return JSON.parse(raw);
}
exports.changePassword = async (oldPass, newPass) => {
  const envPath = path.resolve('.env');
  const currentPassword = process.env.PASSWORD;

  if (oldPass !== currentPassword) {
    return false;
  }
  let lines = [];
  if (fs.existsSync(envPath)) {
    lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    let found = false;
    lines = lines.map(line => {
      if (
        line.trim().startsWith('PASSWORD=') &&
        !line.trim().startsWith('#')
      ) {
        found = true;
        return `PASSWORD=${newPass}`;
      }
      return line;
    });
    if (!found) {
      lines.push(`PASSWORD=${newPass}`);
    }
    while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
      lines.pop();
    }
    fs.writeFileSync(envPath, lines.join('\n') + '\n', 'utf-8');
  }
  return true;
};