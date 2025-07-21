const express = require('express');
const router = express.Router();
const chartController = require('../controllers/chart.controller');

router.get('/ohlc', chartController.getOHLC);
router.get('/ticker', chartController.getTicker);
router.get('/changePassword', chartController.changePassword);
module.exports = router;
