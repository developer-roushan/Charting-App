require("dotenv").config();
const axios = require("axios");
const { Console } = require("console");
const path = require("path");
const fs = require("fs").promises;

const nasdaqApiKey = process.env.NASDAQ_API_KEY;
const apiKey = process.env.EODHD_API_KEY;
const baseUrl = "https://eodhd.com/api/";

const tickerFilePath = path.join(__dirname, "../data/ticker.json");
const cacheDir = path.join(__dirname, "..", "data", "cache");

async function ensureCacheDir() {
  await fs.mkdir(cacheDir, { recursive: true });
}
async function saveTickerData(data) {
  await fs.writeFile(tickerFilePath, JSON.stringify(data, null, 2), "utf-8");
}
async function readTickerData() {
  const raw = await fs.readFile(tickerFilePath, "utf-8");
  return JSON.parse(raw);
}
function generateCacheFilename(symbol, fromISO, toISO, interval) {
  const from = fromISO
    ? `from_${new Date(fromISO).toISOString().split("T")[0]}`
    : "from_na";
  const to = toISO
    ? `to_${new Date(toISO).toISOString().split("T")[0]}`
    : "to_na";
  const int = interval ? `interval_${interval}` : "interval_na";
  const safeSymbol = symbol.replace(/[^a-zA-Z0-9.-]/g, "_");
  return `${safeSymbol}_${from}_${to}_${int}.json`;
}
function generateCacheFilenameTypes(type, symbol, fromISO, toISO) {
  const from = fromISO
    ? `from_${new Date(fromISO).toISOString().split("T")[0]}`
    : "from_na";
  const to = toISO
    ? `to_${new Date(toISO).toISOString().split("T")[0]}`
    : "to_na";
  const safesymbol = symbol.replace(/[^a-zA-Z0-9.-]/g, "_");
  return `${type}_${safesymbol}_${from}_${to}.json`;
}
function generateRealtimeCacheFilename(symbol, interval) {
  const date = new Date().toISOString().split("T")[0];
  const safeSymbol = symbol.replace(/[^a-zA-Z0-9.-]/g, "_");
  return `realtime_${safeSymbol}_${date}_${interval}.json`;
}
exports.fetchOHLC = async (fromISO, toISO, symbol, interval) => {
  await ensureCacheDir();

  const filename = generateCacheFilename(symbol, fromISO, toISO, interval);
  const filePath = path.join(cacheDir, filename);

  try {
    const cachedData = await fs.readFile(filePath, "utf-8");
    return JSON.parse(cachedData);
  } catch (error) {}

  const params = new URLSearchParams({
    api_token: apiKey,
    fmt: "json",
  });
  if (interval) params.set("interval", interval);
  if (fromISO) {
    const fromTs = Math.floor(new Date(fromISO).getTime() / 1000);
    params.set("from", String(fromTs));
  }
  if (toISO) {
    const toTs = Math.floor(new Date(toISO).getTime() / 1000);
    params.set("to", String(toTs));
  }

  const url = `${baseUrl}intraday/${encodeURIComponent(
    symbol
  )}?${params.toString()}`;

  try {
    const resp = await axios.get(url);
    const raw = Array.isArray(resp.data) ? resp.data : [];
    const data = raw.filter(
      (d) =>
        d.datetime &&
        !isNaN(d.open) &&
        !isNaN(d.high) &&
        !isNaN(d.low) &&
        !isNaN(d.close) &&
        !isNaN(d.volume)
    );

    if (data.length > 0) {
      try {
        await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
      } catch (writeError) {}
    }
    return data;
  } catch (err) {
    throw err;
  }
};
exports.fetchNews = async (tickers, fromISO, toISO) => {
  await ensureCacheDir();
  const filename = generateCacheFilenameTypes("news", tickers.join('_'), fromISO, toISO);
  const filePath = path.join(cacheDir, filename);

  try {
    const cachedData = await fs.readFile(filePath, "utf-8");
    return JSON.parse(cachedData);
  } catch (error) {}

  const publicationDomains = {
    "Market Watch": ["marketwatch.com"],
    "Bloom Berg": ["bloomberg.com"],
    Reuters: ["reuters.com"],
    "Financial Times": ["ft.com", "financialtimes.com"],
    WSJ: ["wsj.com", "dowjones.com"],
    "Yahoo Finance": ["finance.yahoo.com"],
  };

  const identifyPublication = (link) => {
    const linkLower = (link || "").toLowerCase();
    for (const [pub, domains] of Object.entries(publicationDomains)) {
      for (const domain of domains) {
        if (linkLower.includes(domain)) {
          return pub;
        }
      }
    }
    return null;
  };

  let allNews = [];

  for (const ticker of tickers) {
    try {
      const url = `${baseUrl}news?s=${ticker}&from=${fromISO}&to=${toISO}&limit=100&api_token=${apiKey}&fmt=json`;
      const response = await axios.get(url);

      if (response.data && Array.isArray(response.data)) {
        const filtered = response.data
          .map((item) => {
            const publication = identifyPublication(item.link);
            return publication
              ? {
                  date: item.date,
                  publication,
                  headline: item.title,
                  link: item.link,
                  symbol: ticker,
                }
              : null;
          })
          .filter((item) => item !== null);

        allNews = allNews.concat(filtered);
      }
    } catch (error) {}
  }

  allNews.sort((a, b) => new Date(b.date) - new Date(a.date));

  try {
    await fs.writeFile(filePath, JSON.stringify(allNews, null, 2), "utf-8");
  } catch (writeErr) {}

  return allNews;
};
exports.fetchRTAT = async (tickers, fromISO, toISO) => {
  await ensureCacheDir();

  const filename = generateCacheFilenameTypes(
    "rtat",
    tickers.join("_"),
    fromISO,
    toISO
  );
  const filePath = path.join(cacheDir, filename);

  try {
    const cachedData = await fs.readFile(filePath, "utf-8");
    return JSON.parse(cachedData);
  } catch (error) {}

  let allData = {};

  for (const ticker of tickers) {
    try {
      const url = `https://data.nasdaq.com/api/v3/datatables/NDAQ/RTAT?ticker=${ticker}&date.gte=${fromISO}&date.lte=${toISO}&qopts.columns=date,ticker,activity,sentiment&api_key=${nasdaqApiKey}`;
      const response = await axios.get(url);
      const rows = response.data?.datatable?.data || [];

      const perDay = rows.map((row) => ({
        date: row[0],
        activity: row[2],
        sentiment: row[3],
      }));

      allData[ticker] = perDay;
    } catch (error) {}
  }

  try {
    await fs.writeFile(filePath, JSON.stringify(allData, null, 2), "utf-8");
  } catch (writeErr) {}

  return allData;
};
exports.fetchAndSaveTicker = async () => {
  let url = `${baseUrl}exchange-symbol-list/us?api_token=${apiKey}&type=common_stock&fmt=json`;
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
exports.changePassword = async (oldPass, newPass) => {
  const envPath = path.resolve(".env");
  const currentPassword = process.env.PASSWORD;

  if (oldPass !== currentPassword) {
    return false;
  }

  try {
    const envContent = await fs.readFile(envPath, "utf-8");
    let lines = envContent.split("\n");
    let found = false;

    lines = lines.map((line) => {
      if (line.trim().startsWith("PASSWORD=") && !line.trim().startsWith("#")) {
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

    await fs.writeFile(envPath, lines.join("\n") + "\n", "utf-8");
    return true;
  } catch (error) {}
};
exports.clearCacheFiles = async () => {
  try {
    await fs.rm(cacheDir, { recursive: true, force: true });
    await fs.mkdir(cacheDir, { recursive: true });
    return {
      success: true,
      message: "Successfully cleared all cached history.",
    };
  } catch (error) {}
};
exports.fetchRealtimeData = async (symbol, interval) => {
  await ensureCacheDir();
  const filename = generateRealtimeCacheFilename(symbol, interval);
  const filePath = path.join(__dirname, "..", "data", "cache", filename);

  try {
    const cachedData = await fs.readFile(filePath, "utf-8");
    return JSON.parse(cachedData);
  } catch (error) {}

  const intervalMap = {
    "1min": "1m",
    "1m": "1m",
    "15min": "15m",
    "15m": "15m",
    "30min": "30m",
    "30m": "30m",
    "60min": "1h",
    "60m": "1h",
    "1h": "1h",
  };
  const apiInterval = intervalMap[(interval || "").toLowerCase()] || "1m";

  const now = Math.floor(Date.now() / 1000);
  const today4AM = new Date();
  today4AM.setHours(4, 0, 0, 0);
  const fromTs = Math.floor(today4AM.getTime() / 1000);

  const params = new URLSearchParams({
    api_token: apiKey,
    fmt: "json",
    interval: apiInterval,
    from: String(fromTs),
    to: String(now),
  });
  const url = `${baseUrl}intraday/${encodeURIComponent(
    symbol
  )}?${params.toString()}`;
  try {
    const resp = await axios.get(url);
    const raw = Array.isArray(resp.data) ? resp.data : [];
    const data = raw.filter(
      (d) =>
        d.datetime &&
        !isNaN(d.open) &&
        !isNaN(d.high) &&
        !isNaN(d.low) &&
        !isNaN(d.close) &&
        !isNaN(d.volume)
    );
    if (data.length > 0) {
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
    }
    return data;
  } catch (err) {}
};
exports.clearRealtimeCache = async (symbol) => {
  const filename = generateRealtimeCacheFilename(symbol, "1min");
  const filePath = path.join(cacheDir, filename);
  try {
    await fs.unlink(filePath);
  } catch (err) {}
};
exports.fetchRealtimeTickData = async (symbol) => {
  await ensureCacheDir();

  const filename = generateRealtimeCacheFilename(symbol, "realtimeTickData");
  const filePath = path.join(cacheDir, filename);

  try {
    const cachedData = await fs.readFile(filePath, "utf-8");
    return JSON.parse(cachedData);
  } catch (error) {}

  const url = `${baseUrl}real-time/${encodeURIComponent(
    symbol
  )}?api_token=${apiKey}&fmt=json`;
  const res = await fetch(url);
  const data = await res.json();
  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (writeErr) {}
  return data;
};
exports.fetchDividends = async (symbol, from, to) => {
  await ensureCacheDir();

  const filename = generateCacheFilenameTypes("dividends", symbol, from, to);
  const filePath = path.join(cacheDir, filename);

  try {
    const cachedData = await fs.readFile(filePath, "utf-8");
    return JSON.parse(cachedData);
  } catch (error) {}
  const url = `${baseUrl}div/${encodeURIComponent(
    symbol
  )}?api_token=${apiKey}&from=${from}&to=${to}&fmt=json`;
  const res = await fetch(url);
  const data = await res.json();
  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (writeErr) {}
  return data;
};
exports.fetchEarnings = async (symbol, from, to) => {
  await ensureCacheDir();

  const filename = generateCacheFilenameTypes("earnings", symbol, from, to);
  const filePath = path.join(cacheDir, filename);
  try {
    const cachedData = await fs.readFile(filePath, "utf-8");
    return JSON.parse(cachedData);
  } catch (error) {}
  const url = `${baseUrl}fundamentals/${encodeURIComponent(
    symbol
  )}?api_token=${apiKey}&from=${from}&to=${to}&fmt=json`;
  const res = await fetch(url);
  const data = await res.json();
  try {
    await fs.writeFile(
      filePath,
      JSON.stringify(data.Earnings, null, 2),
      "utf-8"
    );
  } catch (writeErr) {}

  return data.Earnings || [];
};
exports.fetchInsiderBuy = async (symbol, from, to) => {
  await ensureCacheDir();

  const filename = generateCacheFilenameTypes("insiderBuy", symbol, from, to);
  const filePath = path.join(cacheDir, filename);
  try {
    const cachedData = await fs.readFile(filePath, "utf-8");
    return JSON.parse(cachedData);
  } catch (error) {}

  const url = `${baseUrl}fundamentals/${encodeURIComponent(
    symbol
  )}?api_token=${apiKey}&from=${from}&to=${to}&fmt=json`;
  const res = await fetch(url);
  const data = await res.json();
  try {
    await fs.writeFile(
      filePath,
      JSON.stringify(data.InsiderTransactions, null, 2),
      "utf-8"
    );
  } catch (writeErr) {}
  return data.InsiderTransactions || [];
};
