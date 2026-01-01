# Container Event Processing Engine


## Overview

This application provides a Container Event Processor that:
- Accepts tracking events for containers from multiple sources
- Validates and processes event data
- Detects anomalies or delays in container movement
- Returns shipment status summary with relevant insights

## Features

### Event Validation
- Validates container IDs, event types, timestamps (ISO 8601 format)
- Checks required metadata fields based on event type
- Returns clear validation error messages

### Supported Event Types
- `port_arrival` - Container arrives at port
- `port_departure` - Container leaves port
- `customs_clearance` - Container clears customs
- `customs_hold` - Container held by customs for verification
- `customs_inspection` - Container under customs inspection
- `documentation_hold` - Container held due to documentation issues
- `road_checkpoint` - Container passes road checkpoint
- `lcl_pickup` - LCL shipment picked up from shipper
- `lcl_consolidation` - LCL shipment being consolidated
- `lcl_deconsolidation` - LCL shipment being deconsolidated
- `lcl_delivery` - LCL shipment delivered
- `lcl_damage_inspection` - LCL shipment damage inspection
- `transshipment_arrival` - Container arrives at transshipment port
- `transshipment_loading` - Container being loaded at transshipment port
- `in_transit` - Container in transit between ports

### Anomaly Detection
The system detects the following anomalies:
1. **Late Arrival** - Container arrives > 2 hours after expected arrival
2. **Unusual Gap** - More than 24 hours between consecutive events for the same container
3. **Out of Sequence** - Events occurring out of logical order
4. **Duplicate Event** - Same event type for same container within 1 hour

### Container Status Tracking
For each container, the system tracks:
- Current location and status
- Last event timestamp
- List of all events in chronological order
- Expected vs. actual movement timeline
- Journey progress percentage

## Installation

1. Install dependencies:
```bash
npm install
```

## Running the Application

### Start the server:
```bash
npm start
```

### Start file processing:
```bash
node process-file.js "sample data/shipments_detailed_input_wetrack_developer_assignment.json"
```

Or for development with auto-reload:
```bash
npm run dev
```

The server will start on `http://localhost:3000` (or the port specified in the PORT environment variable).

## API Endpoints

### POST `/api/containers/process`
Process an array of container tracking events.

**Request Body:**
```json
[
  {
    "container_id": "CONT001",
    "event_type": "port_arrival",
    "timestamp": "2024-11-15T08:30:00Z",
    "location": "Port of Singapore",
    "metadata": {
      "port_code": "SG",
      "expected_arrival": "2024-11-15T10:00:00Z"
    }
  }
]
```

**Response:**
```json
{
  "success": true,
  "containers_processed": 1,
  "results": [
    {
      "container_id": "CONT001",
      "current_status": "at_port",
      "current_location": "Port of Singapore",
      "last_event_time": "2024-11-15T08:30:00Z",
      "timeline": [...],
      "anomalies": [...],
      "journey_progress": 20
    }
  ]
}
```

### POST `/api/containers/process-batch`
Process shipments with embedded events (alternative format).

### POST `/api/containers/process-file`
Process a shipment JSON file by providing the file path.

**Request Body:**
```json
{
  "file_path": "sample data/shipments_detailed_input_wetrack_developer_assignment.json"
}
```

```

**Note:** The file path can be relative (to project root) or absolute.

## Processing Files

### Using CLI Script
Process a shipment JSON file directly from the command line:
```bash
node process-file.js "sample data/shipments_detailed_input_wetrack_developer_assignment.json"
```

The script will:
- Load and validate the JSON file
- Process all shipments and events
- Display a summary for each container
- Save results to `processing_results.json` in the same directory as the input file

### Using API Endpoint
Send a POST request to `/api/containers/process-file` with the file path in the request body.

## Running Tests

Run the test suite:
```bash
node test_container_processor.js
```

The test suite includes:
- Happy path scenarios (normal event processing)
- Validation failure scenarios
- Anomaly detection scenarios
- Multiple container processing
- Example from problem statement

## Project Structure

```
Track-container/
├── app.js                          # Express application entry point
├── containerProcessor.js           # Core processing logic
├── process-file.js                 # CLI script for processing files
├── test_container_processor.js     # Test cases
├── package.json                    # Dependencies and scripts
├── routes/
│   ├── index.js                    # General API routes
│   └── containers.js               # Container processing routes
└── README.md                       # This file
```

## Design Decisions

1. **Event Validation First**: All events are validated before processing to ensure data integrity
2. **Chronological Sorting**: Events are sorted by timestamp to ensure proper timeline construction
3. **Anomaly Detection**: Multiple anomaly types are detected simultaneously to provide comprehensive insights
4. **Modular Design**: Core processing logic is separated from API routes for better testability and maintainability
5. **Error Handling**: Graceful error handling with clear error messages for debugging


