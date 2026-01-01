// controllers/containerController.js
const { processContainerEvents } = require('../services/containerProcessor');
const fs = require('fs');
const path = require('path');

const processEvents = (req, res) => {
  try {
    const events = req.body;
    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'Invalid input', message: 'Body must be a non-empty array of events' });
    }

    const result = processContainerEvents(events);
    if (result.error) return res.status(400).json(result);

    res.json({ success: true, containers_processed: result.length, results: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const processBatch = (req, res) => {
  // Same logic as your original /process-batch
  try {
    const shipments = req.body;
    if (!Array.isArray(shipments)) {
      return res.status(400).json({ error: 'Invalid input', message: 'Must be array of shipments' });
    }

    const allEvents = [];
    shipments.forEach((s, i) => {
      if (s.events && Array.isArray(s.events)) {
        s.events.forEach(e => allEvents.push({ ...e, container_id: s.container_id || `unknown_${i}` }));
      }
    });

    if (allEvents.length === 0) {
      return res.status(400).json({ error: 'No events found' });
    }

    const result = processContainerEvents(allEvents);
    if (result.error) return res.status(400).json(result);

    res.json({ success: true, containers_processed: result.length, results: result });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

const processFile = (req, res) => {
  // Your original /process-file logic (kept as bonus)
  try {
    const { file_path } = req.body;
    if (!file_path || typeof file_path !== 'string') {
      return res.status(400).json({ error: 'file_path is required and must be string' });
    }

    const resolvedPath = path.isAbsolute(file_path) ? file_path : path.resolve(process.cwd(), file_path);
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const data = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
    if (!Array.isArray(data)) {
      return res.status(400).json({ error: 'File must contain array of shipments' });
    }

    const allEvents = [];
    data.forEach(s => {
      if (s.container_id && s.events) {
        s.events.forEach(e => allEvents.push({ ...e, container_id: s.container_id }));
      }
    });

    if (allEvents.length === 0) {
      return res.status(400).json({ error: 'No events found in file' });
    }

    const result = processContainerEvents(allEvents);
    if (result.error) return res.status(400).json({ ...result, file_path: resolvedPath });

    res.json({
      success: true,
      file_path: resolvedPath,
      containers_processed: result.length,
      results: result
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { processEvents, processBatch, processFile };