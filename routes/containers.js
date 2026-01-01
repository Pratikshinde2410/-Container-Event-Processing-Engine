// routes/containers.js
const express = require('express');
const router = express.Router();
const { processEvents, processBatch, processFile } = require('../controllers/containerController');

router.post('/process', processEvents);        // Main required endpoint
router.post('/process-batch', processBatch);   // Bonus
router.post('/process-file', processFile);     // Bonus

module.exports = router;