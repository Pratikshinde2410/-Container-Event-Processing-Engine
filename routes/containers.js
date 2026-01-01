const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { processContainerEvents } = require('../containerProcessor');

// POST /api/containers/process
// Accepts an array of container tracking events
router.post('/process', (req, res) => {
  try {
    const events = req.body;

    // Validate input is an array
    if (!Array.isArray(events)) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'Request body must be an array of events'
      });
    }

    if (events.length === 0) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'Events array cannot be empty'
      });
    }

    // Process events
    const result = processContainerEvents(events);

    // Check if there were validation errors
    if (result.error) {
      return res.status(400).json(result);
    }

    // Return successful results
    res.json({
      success: true,
      containers_processed: result.length,
      results: result
    });

  } catch (error) {
    console.error('Error processing container events:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// POST /api/containers/process-batch
// Alternative endpoint that accepts shipments with embedded events
router.post('/process-batch', (req, res) => {
  try {
    const shipments = req.body;

    // Validate input is an array
    if (!Array.isArray(shipments)) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'Request body must be an array of shipments'
      });
    }

    // Extract events from shipments
    const allEvents = [];
    shipments.forEach((shipment, shipmentIndex) => {
      if (shipment.events && Array.isArray(shipment.events)) {
        shipment.events.forEach(event => {
          allEvents.push({
            ...event,
            container_id: shipment.container_id || `SHIPMENT_${shipmentIndex}`
          });
        });
      }
    });

    if (allEvents.length === 0) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'No events found in shipments'
      });
    }

    // Process events
    const result = processContainerEvents(allEvents);

    // Check if there were validation errors
    if (result.error) {
      return res.status(400).json(result);
    }

    // Return successful results
    res.json({
      success: true,
      containers_processed: result.length,
      results: result
    });

  } catch (error) {
    console.error('Error processing container events:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// POST /api/containers/process-file
// Accepts a file path and processes the shipment JSON file
router.post('/process-file', (req, res) => {
  try {
    const { file_path } = req.body;

    // Validate file path is provided
    if (!file_path || typeof file_path !== 'string') {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'file_path is required and must be a string'
      });
    }

    // Resolve file path (handles both relative and absolute paths)
    let resolvedPath;
    try {
      if (path.isAbsolute(file_path)) {
        resolvedPath = file_path;
      } else {
        // Relative to project root
        resolvedPath = path.resolve(process.cwd(), file_path);
      }
    } catch (error) {
      return res.status(400).json({
        error: 'Invalid file path',
        message: `Unable to resolve file path: ${error.message}`
      });
    }

    // Check if file exists
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({
        error: 'File not found',
        message: `File not found at path: ${resolvedPath}`
      });
    }

    // Read and parse JSON file
    let shipments;
    try {
      const fileContent = fs.readFileSync(resolvedPath, 'utf8');
      shipments = JSON.parse(fileContent);
    } catch (error) {
      if (error instanceof SyntaxError) {
        return res.status(400).json({
          error: 'Invalid JSON',
          message: `Failed to parse JSON file: ${error.message}`
        });
      } else {
        return res.status(500).json({
          error: 'File read error',
          message: `Failed to read file: ${error.message}`
        });
      }
    }

    // Validate input is an array
    if (!Array.isArray(shipments)) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'JSON file must contain an array of shipments'
      });
    }

    if (shipments.length === 0) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'Shipments array cannot be empty'
      });
    }

    // Extract events from shipments
    const allEvents = [];
    shipments.forEach((shipment, shipmentIndex) => {
      if (!shipment.container_id) {
        console.warn(`Warning: Shipment at index ${shipmentIndex} missing container_id`);
        return;
      }

      if (shipment.events && Array.isArray(shipment.events)) {
        shipment.events.forEach(event => {
          allEvents.push({
            ...event,
            container_id: shipment.container_id
          });
        });
      }
    });

    if (allEvents.length === 0) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'No events found in shipments'
      });
    }

    // Process events
    const result = processContainerEvents(allEvents);

    // Check if there were validation errors
    if (result.error) {
      return res.status(400).json({
        ...result,
        file_path: resolvedPath
      });
    }

    // Return successful results
    res.json({
      success: true,
      file_path: resolvedPath,
      shipments_processed: shipments.length,
      containers_processed: result.length,
      total_events: allEvents.length,
      results: result
    });

  } catch (error) {
    console.error('Error processing file:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

module.exports = router;

