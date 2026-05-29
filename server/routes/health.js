const express = require('express');
const config = require('../config');
const { checkConnection } = require('../db');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const dbOk = await checkConnection();
    res.json({
      status: 'ok',
      app: config.appName,
      db: dbOk ? 'connected' : 'disconnected',
    });
  })
);

module.exports = router;
