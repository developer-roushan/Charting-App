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
