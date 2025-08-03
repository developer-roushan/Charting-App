require("dotenv").config();
const axios = require("axios");
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


function generateCacheFilename(symbol, fromISO, toISO, interval) {
  const from = fromISO
    ? `from_${new Date(fromISO).toISOString().split("T")[0]}`
    : "from_na";
  const to = toISO ? `to_${new Date(toISO).toISOString().split("T")[0]}` : "to_na";
  const int = interval ? `interval_${interval}` : "interval_na";
  const safeSymbol = symbol.replace(/[^a-zA-Z0-9.-]/g, "_");
  return `${safeSymbol}_${from}_${to}_${int}.json`;
}

function generateNewsCacheFilename(tickers, fromISO, toISO) {
  const from = fromISO ? `from_${new Date(fromISO).toISOString().split("T")[0]}` : "from_na";
  const to = toISO ? `to_${new Date(toISO).toISOString().split("T")[0]}` : "to_na";
  const safeTickers = tickers.map(t => t.replace(/[^a-zA-Z0-9.-]/g, "_")).join("_");
  return `news_${safeTickers}_${from}_${to}.json`;
}

function generateRTATCacheFilename(tickers, fromISO, toISO) {
  const from = fromISO ? `from_${new Date(fromISO).toISOString().split("T")[0]}` : "from_na";
  const to = toISO ? `to_${new Date(toISO).toISOString().split("T")[0]}` : "to_na";
  const safeTickers = tickers.map(t => t.replace(/[^a-zA-Z0-9.-]/g, "_")).join("_");
  return `rtat_${safeTickers}_${from}_${to}.json`;
}

exports.fetchOHLC = async (fromISO, toISO, symbol, interval) => {
  await ensureCacheDir();

  const filename = generateCacheFilename(symbol, fromISO, toISO, interval);
  const filePath = path.join(cacheDir, filename);

  try {
    const cachedData = await fs.readFile(filePath, "utf-8");
    return JSON.parse(cachedData);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Error reading OHLC cache file:", error);
    }
  }

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
    // Filter valid data points
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
      } catch (writeError) {
        // Log or ignore write errors
      }
    }

    return data;
  } catch (err) {
    throw err;
  }
};

exports.fetchNews = async (tickers, fromISO, toISO) => {
  await ensureCacheDir();

  const filename = generateNewsCacheFilename(tickers, fromISO, toISO);
  const filePath = path.join(cacheDir, filename);

  try {
    const cachedData = await fs.readFile(filePath, "utf-8");
    return JSON.parse(cachedData);
  } catch (err) {
    if (err.code !== "ENOENT") {
      // Unexpected error, handle/log
      console.error("Error reading news cache:", err);
    }
  }

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
    } catch (error) {
      // Log or ignore individual ticker errors
      console.error(`Error fetching news for ticker ${ticker}:`, error.message);
    }
  }

  // Sort news by descending date
  allNews.sort((a, b) => new Date(b.date) - new Date(a.date));

  try {
    await fs.writeFile(filePath, JSON.stringify(allNews, null, 2), "utf-8");
  } catch (writeErr) {
  }

  return allNews;
};

exports.fetchRTAT = async (tickers, fromISO, toISO) => {
  await ensureCacheDir();

  const filename = generateRTATCacheFilename(tickers, fromISO, toISO);
  const filePath = path.join(cacheDir, filename);

  try {
    const cachedData = await fs.readFile(filePath, "utf-8");
    return JSON.parse(cachedData);
  } catch (err) {
    if (err.code !== "ENOENT") {
      // Unexpected error reading cache
      console.error("Error reading RTAT cache:", err);
    }
  }

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
    } catch (error) {
      console.error(`Error fetching RTAT for ${ticker}:`, error.message);
      allData[ticker] = [];
    }
  }

  try {
    await fs.writeFile(filePath, JSON.stringify(allData, null, 2), "utf-8");
  } catch (writeErr) {
    // Ignore cache write errors
  }

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

async function saveTickerData(data) {
  await fs.writeFile(tickerFilePath, JSON.stringify(data, null, 2), "utf-8");
}

async function readTickerData() {
  const raw = await fs.readFile(tickerFilePath, "utf-8");
  return JSON.parse(raw);
}

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
  } catch (error) {
    if (error.code === "ENOENT") {
      await fs.writeFile(envPath, `PASSWORD=${newPass}\n`, "utf-8");
      return true;
    }
    return false;
  }
};

exports.clearCacheFiles = async () => {
  try {
    await fs.rm(cacheDir, { recursive: true, force: true });
    await fs.mkdir(cacheDir, { recursive: true });
    return {
      success: true,
      message: "Successfully cleared all cached history.",
    };
  } catch (error) {
    throw new Error("Failed to clear cache files due to a server error.");
  }
};



function generateRealtimeCacheFilename(symbol, interval) {
  const date = new Date().toISOString().split('T')[0];
  const safeSymbol = symbol.replace(/[^a-zA-Z0-9.-]/g, "_");
  return `realtime_${safeSymbol}_${date}_${interval}.json`;
}

exports.fetchRealtimeData = async (symbol, interval) => {
  await ensureCacheDir();
  const filename = generateRealtimeCacheFilename(symbol, interval);
  const filePath = path.join(__dirname, "..", "data", "cache", filename);

  try {
    const cachedData = await fs.readFile(filePath, "utf-8");
    return JSON.parse(cachedData);
  } catch (err) {
    if (err.code !== "ENOENT") console.error("Error reading realtime cache:", err);
  }

  const intervalMap = {
    '1min': '1m', '1m': '1m',
    '15min': '15m', '15m': '15m',
    '30min': '30m', '30m': '30m',
    '60min': '1h', '60m': '1h', '1h': '1h'
  };
  const apiInterval = intervalMap[(interval || '').toLowerCase()] || '1m';

  const now = Math.floor(Date.now() / 1000);
  const today4AM = new Date();
  today4AM.setHours(4, 0, 0, 0);
  const fromTs = Math.floor(today4AM.getTime() / 1000);

  const params = new URLSearchParams({
    api_token: apiKey,
    fmt: "json",
    interval: apiInterval,
    from: String(fromTs),
    to: String(now)
  });
  const url = `${baseUrl}intraday/${encodeURIComponent(symbol)}?${params.toString()}`;

  try {
    const resp = await axios.get(url);
    // resp.data: [{ datetime, open, high, low, close, volume }, ...]
    const raw = Array.isArray(resp.data) ? resp.data : [];
    // filter for valid bars
    const data = raw.filter(d =>
      d.datetime && !isNaN(d.open) && !isNaN(d.high) && !isNaN(d.low) &&
      !isNaN(d.close) && !isNaN(d.volume)
    );
    if (data.length > 0) {
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
    }
    return data;
  } catch (err) {
    console.error("Error fetching realtime data:", err.message || err);
    return [];
  }
};
exports.clearRealtimeCache = async (symbol) => {
  const filename = generateRealtimeCacheFilename(symbol, '1min');
  const filePath = path.join(cacheDir, filename);
  try {
    await fs.unlink(filePath);
  } catch (err) {
    if (err.code !== "ENOENT") console.error("Error clearing realtime cache:", err);
  }
};
