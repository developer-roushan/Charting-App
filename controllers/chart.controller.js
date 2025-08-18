const chartService = require("../services/chart.service");

exports.getOHLC = async (req, res) => {
  try {
    const { from, to, symbol, interval } = req.query;
    const data = await chartService.fetchOHLC(from, to, symbol, interval);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
exports.getTicker = async (req, res) => {
  try {
    const data = await chartService.fetchTicker();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
exports.changePassword = async (oldPass, newPass) => {
  try {
    const data = await chartService.changePassword(oldPass, newPass);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
exports.clearCache = async (req, res) => {
  try {
    const result = await chartService.clearCacheFiles();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
exports.getNews = async (req, res) => {
  const { tickers, from, to } = req.query;
  try {
    const news = await chartService.fetchNews(tickers.split(','), from, to);
    res.json(news);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch news' });
  }
};
exports.getRTAT = async (req, res) => {
  const { tickers, from, to } = req.query;
  try {
    const averages = await chartService.fetchRTAT(tickers.split(','), from, to);
    res.json(averages);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch RTAT averages' });
  }
};
exports.getRealtimePage = (req, res) => {
  res.sendFile(path.join(__dirname, '../public/realtime.html'));
};
exports.getRealtimeData = async (req, res) => {
  const { symbol, interval } = req.query;
  const data = await chartService.fetchRealtimeData(symbol, interval);
  res.json(data);
};
exports.clearRealtimeCache = async (req, res) => {
  const { symbol } = req.query;
  await chartService.clearRealtimeCache(symbol);
  res.json({ success: true });
};
exports.getRTATData = async (req, res) => {
  const { tickers, from, to } = req.query;
  const result = await chartService.fetchRTAT(tickers.split(','), from, to);
  res.json(result);
};
exports.getRealtimeTickData = async (req, res) => {
  const { symbol } = req.query;
  const fullData = await chartService.fetchRealtimeTickData(symbol);
  res.json(fullData);
};
exports.getDividends = async (req, res) => {
  const { symbol, from, to } = req.query;
  if (!symbol) return res.status(400).json({ error: "Symbol required" });
  const data = await chartService.fetchDividends(symbol, from, to);
  res.json(data);
};
exports.getEarnings = async (req, res) => {
  const { symbol, from, to } = req.query;
  if (!symbol) return res.status(400).json({ error: "Symbol required" });
  const data = await chartService.fetchEarnings(symbol, from, to);
  res.json(data);
};
exports.getInsiderBuy = async (req, res) => {
  const { symbol, from, to } = req.query;
  if (!symbol) return res.status(400).json({ error: "Symbol required" });
  const data = await chartService.fetchInsiderBuy(symbol, from, to);
  res.json(data);
};