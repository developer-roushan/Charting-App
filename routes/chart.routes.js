const express = require('express');
const router = express.Router();
const chartController = require('../controllers/chart.controller');

router.get('/ohlc', chartController.getOHLC);
router.get('/ticker', chartController.getTicker);
router.get('/changePassword', chartController.changePassword);
router.delete('/cache', chartController.clearCache);
router.get('/news', chartController.getNews);

module.exports = router;
