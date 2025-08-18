const chartService = require("../services/chart.service");

exports.getOHLC = async (req, res) => {
  try {
    const { from, to, symbol, interval } = req.query;
    const data = await chartService.fetchOHLC(from, to, symbol, interval);
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
exports.getTicker = async (req, res) => {
  try {
    const data = await chartService.fetchTicker();
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
exports.changePassword = async (oldPass, newPass) => {
  try {
    const data = await chartService.changePassword(oldPass, newPass);
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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
    const news = await chartService.fetchNews(tickers.split(","), from, to);
    res.json(news);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
exports.getRTAT = async (req, res) => {
  const { tickers, from, to } = req.query;
  try {
    const averages = await chartService.fetchRTAT(tickers.split(","), from, to);
    res.json(averages);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
exports.getRealtimePage = (req, res) => {
  res.sendFile(path.join(__dirname, "../public/realtime.html"));
};
exports.getRealtimeData = async (req, res) => {
  const { symbol, interval } = req.query;
  try {
    const data = await chartService.fetchRealtimeData(symbol, interval);
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
exports.clearRealtimeCache = async (req, res) => {
  const { symbol } = req.query;
  try {
    await chartService.clearRealtimeCache(symbol);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
exports.getRTATData = async (req, res) => {
  const { tickers, from, to } = req.query;
  try {
    const result = await chartService.fetchRTAT(tickers.split(","), from, to);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
exports.getRealtimeTickData = async (req, res) => {
  const { symbol } = req.query;
  try {
    const fullData = await chartService.fetchRealtimeTickData(symbol);
    res.json(fullData);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
exports.getDividends = async (req, res) => {
  const { symbol, from, to } = req.query;
  try {
    const data = await chartService.fetchDividends(symbol, from, to);
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
exports.getEarnings = async (req, res) => {
  const { symbol, from, to } = req.query;
  try {
    const data = await chartService.fetchEarnings(symbol, from, to);
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
exports.getInsiderBuy = async (req, res) => {
  const { symbol, from, to } = req.query;
  try {
    const data = await chartService.fetchInsiderBuy(symbol, from, to);
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
