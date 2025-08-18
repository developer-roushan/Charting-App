const express = require('express');
const router = express.Router();
const chartController = require('../controllers/chart.controller');

router.get('/ohlc', chartController.getOHLC);
router.get('/ticker', chartController.getTicker);
router.get('/changePassword', chartController.changePassword);
router.delete('/cache', chartController.clearCache);
router.get('/news', chartController.getNews);
router.get('/rtat', chartController.getRTAT);
router.get('/realtime', chartController.getRealtimePage);
router.get('/realtime-data', chartController.getRealtimeData);
router.post('/clear-realtime-cache', chartController.clearRealtimeCache);
router.get('/rtat', chartController.getRTATData);
router.get('/realtime-tickData', chartController.getRealtimeTickData);
router.get('/dividends', chartController.getDividends);
router.get('/earnings', chartController.getEarnings);
router.get('/insbuy', chartController.getInsiderBuy);
module.exports = router;
