require('dotenv').config();
const axios = require("axios");
const path = require("path");
const fs = require('fs').promises;

const apiKey = process.env.EODHD_API_KEY;
const baseUrl = 'https://eodhd.com/api/';
const tickerFilePath = path.join(__dirname, "../data/ticker.json");
const cacheDir = path.join(__dirname, '..', 'data', 'cache');

function generateCacheFilename(symbol, fromISO, toISO, interval) {
  const from = fromISO ? `from_${new Date(fromISO).toISOString().split('T')[0]}` : 'from_na';
  const to = toISO ? `to_${new Date(toISO).toISOString().split('T')[0]}` : 'to_na';
  const int = interval ? `interval_${interval}` : 'interval_na';
  const safeSymbol = symbol.replace(/[^a-zA-Z0-9.-]/g, '_');
  return `${safeSymbol}_${from}_${to}_${int}.json`;
}

exports.fetchOHLC = async (fromISO, toISO, symbol, interval) => {
  await fs.mkdir(cacheDir, { recursive: true });

  const filename = generateCacheFilename(symbol, fromISO, toISO, interval);
  const filePath = path.join(cacheDir, filename);

  try {
    const cachedData = await fs.readFile(filePath, 'utf-8');
    console.log(`✅ [CACHE HIT] Serving data from ${filename}`);
    return JSON.parse(cachedData);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`[CACHE READ ERROR] Could not read cache file ${filename}:`, error);
    }
    console.log(`❌ [CACHE MISS] File not found: ${filename}. Fetching from API.`);
  }

  const params = new URLSearchParams({
    api_token: apiKey,
    fmt: 'json',
  });
  if (interval) params.set('interval', interval);
  if (fromISO) {
    const fromTs = Math.floor(new Date(fromISO).getTime() / 1000);
    params.set('from', String(fromTs));
  }
  if (toISO) {
    const toTs = Math.floor(new Date(toISO).getTime() / 1000);
    params.set('to', String(toTs));
  }

  const url = `${baseUrl}intraday/${encodeURIComponent(symbol)}?${params.toString()}`;
  console.log('→ [API CALL] GET', url);

  let resp;
  try {
    resp = await axios.get(url);
  } catch (err) {
    console.error('Error fetching OHLC from API:', err.message);
    throw err;
  }

  const raw = Array.isArray(resp.data) ? resp.data : [];
  const data = raw.filter(d =>
    d.datetime &&
    !isNaN(d.open) && !isNaN(d.high) &&
    !isNaN(d.low) && !isNaN(d.close) &&
    !isNaN(d.volume)
  );

  if (data.length > 0) {
    try {
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
      console.log(`💾 [CACHE WRITE] Successfully cached data to ${filename}`);
    } catch (writeError) {
      console.error(`[CACHE WRITE ERROR] Failed to write cache file ${filename}:`, writeError);
    }
  }

  return data;
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
  const envPath = path.resolve('.env');
  const currentPassword = process.env.PASSWORD;

  if (oldPass !== currentPassword) {
    return false;
  }

  try {
    const envContent = await fs.readFile(envPath, 'utf-8');
    let lines = envContent.split('\n');
    let found = false;

    lines = lines.map(line => {
      if (line.trim().startsWith('PASSWORD=') && !line.trim().startsWith('#')) {
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

    await fs.writeFile(envPath, lines.join('\n') + '\n', 'utf-8');
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      await fs.writeFile(envPath, `PASSWORD=${newPass}\n`, 'utf-8');
      return true;
    }
    console.error("Error updating .env file:", error);
    return false;
  }
};

exports.clearCacheFiles = async () => {
  try {
    await fs.rm(cacheDir, { recursive: true, force: true });
    await fs.mkdir(cacheDir, { recursive: true });
    console.log('🗑️ Cache directory has been cleared.');
    return { success: true, message: 'Successfully cleared all cached history.' };
  } catch (error) {
    console.error("Error clearing cache directory:", error);
    throw new Error('Failed to clear cache files due to a server error.');
  }
};
