require('dotenv').config();
const axios = require("axios");
const path = require("path");
const fs = require('fs').promises;

// --- Configuration ---
const apiKey = process.env.EODHD_API_KEY;
const baseUrl = 'https://eodhd.com/api/';
const tickerFilePath = path.join(__dirname, "../data/ticker.json");
const cacheDir = path.join(__dirname, '..', 'data', 'cache'); // Directory for cached OHLC data

// --- Helper Function for Caching ---
/**
 * Generates a consistent, safe filename for caching based on request parameters.
 * @returns {string} The generated, safe filename.
 */
function generateCacheFilename(symbol, fromISO, toISO, interval) {
  // Use 'na' for null/undefined date/interval to ensure consistent filenames
  const from = fromISO ? `from_${new Date(fromISO).toISOString().split('T')[0]}` : 'from_na';
  const to = toISO ? `to_${new Date(toISO).toISOString().split('T')[0]}` : 'to_na';
  const int = interval ? `interval_${interval}` : 'interval_na';

  // Sanitize the symbol to remove characters invalid in filenames
  const safeSymbol = symbol.replace(/[^a-zA-Z0-9.-]/g, '_');

  return `${safeSymbol}_${from}_${to}_${int}.json`;
}


/**
 * Fetch intraday OHLC data, with file-based caching.
 *
 * @param {string|null} fromISO     ISO datetime e.g. "2025-07-19T08:58"
 * @param {string|null} toISO       ISO datetime e.g. "2025-07-19T13:58"
 * @param {string}      symbol      e.g. "AAPL.US"
 * @param {string}      interval    e.g. "1m","5m","1h"
 */
exports.fetchOHLC = async (fromISO, toISO, symbol, interval) => {
  // 1. Ensure the cache directory exists
  await fs.mkdir(cacheDir, { recursive: true });

  // 2. Generate a unique filename for this specific request
  const filename = generateCacheFilename(symbol, fromISO, toISO, interval);
  const filePath = path.join(cacheDir, filename);

  // 3. Check if the cached file exists (CACHE HIT)
  try {
    const cachedData = await fs.readFile(filePath, 'utf-8');
    console.log(`✅ [CACHE HIT] Serving data from ${filename}`);
    return JSON.parse(cachedData);
  } catch (error) {
    // If file doesn't exist (ENOENT), it's a cache miss. This is expected.
    if (error.code !== 'ENOENT') {
      console.error(`[CACHE READ ERROR] Could not read cache file ${filename}:`, error);
    }
    console.log(`❌ [CACHE MISS] File not found: ${filename}. Fetching from API.`);
  }

  // 4. If cache miss, fetch from the external API
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

  // Sanitize and filter the response data
  const raw = Array.isArray(resp.data) ? resp.data : [];
  const data = raw.filter(d =>
    d.datetime &&
    !isNaN(d.open) && !isNaN(d.high) &&
    !isNaN(d.low) && !isNaN(d.close) &&
    !isNaN(d.volume)
  );

  // 5. If data is valid, save it to the cache for the next request (CACHE WRITE)
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

// --- Your Other Existing Functions (Unchanged) ---

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

// NOTE: This function is not recommended for production environments as it writes to the .env file.
exports.changePassword = async (oldPass, newPass) => {
  const envPath = path.resolve('.env');
  const currentPassword = process.env.PASSWORD;

  if (oldPass !== currentPassword) {
    return false;
  }
  
  // Use async file operations for consistency
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
    
    // Remove trailing blank lines before writing
    while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
      lines.pop();
    }
    
    await fs.writeFile(envPath, lines.join('\n') + '\n', 'utf-8');
    return true;
  } catch (error) {
    // Check if the file just doesn't exist yet
    if (error.code === 'ENOENT') {
      await fs.writeFile(envPath, `PASSWORD=${newPass}\n`, 'utf-8');
      return true;
    }
    console.error("Error updating .env file:", error);
    return false;
  }
};
