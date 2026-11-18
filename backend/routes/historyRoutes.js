const express = require('express');
const router = express.Router();
const HealthHistory = require('../models/HealthHistory');
const Server = require('../models/Server');

/**
 * GET /api/history
 * Retrieve recent health check history logs
 */
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const filter = {};

    if (req.query.serverId) {
      filter.serverId = req.query.serverId;
    }
    if (req.query.status) {
      filter.currentStatus = req.query.status.toUpperCase();
    }

    const history = await HealthHistory.find(filter)
      .sort({ checkedAt: -1 })
      .limit(limit)
      .lean();

    return res.json({
      success: true,
      count: history.length,
      data: history
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/history/stats
 * Aggregate dashboard statistics:
 *  - Total servers
 *  - Healthy, Down, Unknown counts
 *  - Overall availability percentage
 *  - Average response time across healthy servers
 *  - Recent latency data for charts
 */
router.get('/stats', async (req, res) => {
  try {
    const servers = await Server.find().lean();
    const totalServers = servers.length;

    let healthyCount = 0;
    let downCount = 0;
    let unknownCount = 0;
    let responseTimeSum = 0;
    let responseTimeCount = 0;

    servers.forEach((srv) => {
      if (srv.currentStatus === 'HEALTHY') healthyCount++;
      else if (srv.currentStatus === 'DOWN') downCount++;
      else unknownCount++;

      if (srv.lastResponseTime !== null && srv.lastResponseTime !== undefined && srv.lastResponseTime > 0) {
        responseTimeSum += srv.lastResponseTime;
        responseTimeCount++;
      }
    });

    // Calculate availability %:
    // Servers that have been checked: healthy / (healthy + down) * 100
    // If none checked yet or no active servers, default to 100% or 0%
    const checkedCount = healthyCount + downCount;
    const availability = checkedCount > 0
      ? Math.round((healthyCount / checkedCount) * 100 * 10) / 10
      : (totalServers > 0 ? 100 : 0);

    const averageResponseTime = responseTimeCount > 0
      ? Math.round(responseTimeSum / responseTimeCount)
      : 0;

    // Fetch last 30 history points for trend charts
    const recentHistory = await HealthHistory.find()
      .sort({ checkedAt: -1 })
      .limit(30)
      .lean();

    return res.json({
      success: true,
      data: {
        totalServers,
        healthyCount,
        downCount,
        unknownCount,
        availability,
        averageResponseTime,
        recentHistory: recentHistory.reverse()
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/history/clear
 * Clear all health history logs (useful for reset/fresh demos)
 */
router.delete('/clear', async (req, res) => {
  try {
    const result = await HealthHistory.deleteMany({});
    return res.json({
      success: true,
      message: `Cleared ${result.deletedCount} history records.`
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
