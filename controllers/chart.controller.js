const chartService = require("../services/chart.service");

exports.getOHLC = async (req, res) => {
  try {
    const { from } = req.query;
    const { to } = req.query;
    const {symbol} = req.query;
    const { interval } = req.query;
    const data = await chartService.fetchOHLC(from,to,symbol,interval);
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
    const data = await chartService.changePassword(oldPass,newPass);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
