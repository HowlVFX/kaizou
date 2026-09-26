const express = require('express');
const db = require('../../database/db');
const verifyToken = require('../../middleware/auth');
const managementAuth = require('../../middleware/management-auth');
const router = express.Router();

router.get('/:reportType', verifyToken, managementAuth, async (req, res) => {
  try {
    const reportType = req.params.reportType;
    if (reportType === 'learner-data') {
      const data = await db.query(`
        SELECT learner_id, COUNT(*) as data_points 
        FROM portal_aggregates 
        GROUP BY learner_id 
        HAVING COUNT(DISTINCT learner_id) >= 5
      `);
      res.json(data.rows);
    } else if (reportType === 'anonymised-metrics') {
      const metrics = await db.query(`
        SELECT metric_name, AVG(value) as avg_value 
        FROM portal_aggregates 
        GROUP BY metric_name 
        HAVING COUNT(DISTINCT learner_id) >= 5
      `);
      res.json(metrics.rows);
    } else {
      res.status(404).json({error: 'Report type not found'});
    }
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

module.exports = router;
