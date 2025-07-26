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
    return JSON.parse(cachedData);
  } catch (error) {
    if (error.code !== 'ENOENT') {
    }
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

  let resp;
  try {
    resp = await axios.get(url);
  } catch (err) {
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
    } catch (writeError) {
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
    return false;
  }
};

exports.clearCacheFiles = async () => {
  try {
    await fs.rm(cacheDir, { recursive: true, force: true });
    await fs.mkdir(cacheDir, { recursive: true });
    return { success: true, message: 'Successfully cleared all cached history.' };
  } catch (error) {
    throw new Error('Failed to clear cache files due to a server error.');
  }
};
exports.fetchNews = async (tickers, from, to) => {
  const publicationDomains = {
    'Market Watch': ['marketwatch.com'],
    'Bloom Berg': ['bloomberg.com'],
    'Reuters': ['reuters.com'], 
    'Financial Times': ['ft.com', 'financialtimes.com'],
    'WSJ': ['wsj.com', 'dowjones.com'],
    'Yahoo Finance': ['finance.yahoo.com']
  };

  const identifyPublication = (link) => {
    const linkLower = link.toLowerCase();
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
      const url = `${baseUrl}news?s=${ticker}&from=${from}&to=${to}&limit=100&api_token=${apiKey}&fmt=json`;
      const response = await axios.get(url);
      
      if (response.data && Array.isArray(response.data)) {
        const filteredForTicker = response.data
          .map(item => {
            const publication = identifyPublication(item.link || '');
            return publication ? {
              date: item.date,
              publication: publication,
              headline: item.title,
              link: item.link,
              symbol: ticker
            } : null;
          })
          .filter(item => item !== null);
        
        allNews = allNews.concat(filteredForTicker);
      }
    } catch (error) {
      console.error(`Error fetching news for ${ticker}:`, error.message);
    }
  }

  allNews.sort((a, b) => new Date(b.date) - new Date(a.date));
  
  return allNews;
};


