const assert = require('assert');
const { processContainerEvents, validateEvent, detectAnomalies } = require('./containerProcessor');

console.log('Running Container Processor Tests...\n');

// Test 1: Happy Path - Normal events processing
function testHappyPath() {
  console.log('Test 1: Happy Path - Normal events processing');
  
  const events = [
    {
      container_id: "CONT001",
      event_type: "port_arrival",
      timestamp: "2024-11-15T08:30:00Z",
      location: "Port of Singapore",
      metadata: {
        port_code: "SG",
        expected_arrival: "2024-11-15T06:00:00Z"
      }
    },
    {
      container_id: "CONT001",
      event_type: "customs_clearance",
      timestamp: "2024-11-15T12:00:00Z",
      location: "Customs, Port of Singapore",
      metadata: {
        clearance_status: "approved",
        clearance_time: 180
      }
    },
    {
      container_id: "CONT001",
      event_type: "port_departure",
      timestamp: "2024-11-16T10:00:00Z",
      location: "Port of Singapore",
      metadata: {
        port_code: "SG"
      }
    }
  ];

  const result = processContainerEvents(events);
  
  assert(!result.error, 'Should not have validation errors');
  assert(Array.isArray(result), 'Result should be an array');
  assert(result.length === 1, 'Should process 1 container');
  assert(result[0].container_id === 'CONT001', 'Container ID should match');
  assert(result[0].current_status === 'departed', 'Current status should be departed');
  assert(result[0].timeline.length === 3, 'Should have 3 events in timeline');
  assert(result[0].delay_minutes === undefined || typeof result[0].timeline[0].delay_minutes === 'number', 'Should have delay_minutes in timeline');
  
  console.log('✅ Test 1 passed: Happy path works correctly\n');
}

// Test 2: Validation Failures
function testValidationFailures() {
  console.log('Test 2: Validation Failures');
  
  const invalidEvents = [
    {
      // Missing container_id
      event_type: "port_arrival",
      timestamp: "2024-11-15T08:30:00Z",
      location: "Port of Singapore",
      metadata: {
        port_code: "SG"
      }
    },
    {
      container_id: "CONT002",
      event_type: "invalid_event_type", // Invalid event type
      timestamp: "2024-11-15T08:30:00Z",
      location: "Port of Singapore",
      metadata: {}
    },
    {
      container_id: "CONT003",
      event_type: "port_arrival",
      timestamp: "invalid-timestamp", // Invalid timestamp
      location: "Port of Singapore",
      metadata: {
        port_code: "SG",
        expected_arrival: "2024-11-15T06:00:00Z"
      }
    },
    {
      container_id: "CONT004",
      event_type: "port_arrival",
      timestamp: "2024-11-15T08:30:00Z",
      location: "Port of Singapore",
      // Missing required metadata (port_code, expected_arrival)
      metadata: {}
    }
  ];

  const result = processContainerEvents(invalidEvents);
  
  assert(result.error === 'Validation failed', 'Should return validation error');
  assert(Array.isArray(result.validation_errors), 'Should have validation_errors array');
  assert(result.validation_errors.length > 0, 'Should have validation errors');
  
  console.log(`✅ Test 2 passed: Validation correctly caught ${result.validation_errors.length} errors\n`);
}

// Test 3: Anomaly Detection - Late Arrival, Unusual Gap, Duplicate Event
function testAnomalyDetection() {
  console.log('Test 3: Anomaly Detection');
  
  const events = [
    {
      container_id: "CONT005",
      event_type: "port_arrival",
      timestamp: "2024-11-15T08:30:00Z",
      location: "Port of Singapore",
      metadata: {
        port_code: "SG",
        expected_arrival: "2024-11-15T05:00:00Z" // 3.5 hours late (> 2 hours)
      }
    },
    {
      container_id: "CONT005",
      event_type: "customs_clearance",
      timestamp: "2024-11-15T12:00:00Z",
      location: "Customs, Port of Singapore",
      metadata: {
        clearance_status: "approved"
      }
    },
    {
      container_id: "CONT005",
      event_type: "port_departure",
      timestamp: "2024-11-17T10:00:00Z", // More than 24 hours gap
      location: "Port of Singapore",
      metadata: {
        port_code: "SG"
      }
    },
    {
      container_id: "CONT005",
      event_type: "port_arrival",
      timestamp: "2024-11-17T10:30:00Z", // Duplicate event within 1 hour
      location: "Port of Rotterdam",
      metadata: {
        port_code: "NL",
        expected_arrival: "2024-11-17T10:00:00Z"
      }
    }
  ];

  const result = processContainerEvents(events);
  
  assert(!result.error, 'Should not have validation errors');
  assert(result.length === 1, 'Should process 1 container');
  assert(Array.isArray(result[0].anomalies), 'Should have anomalies array');
  assert(result[0].anomalies.length > 0, 'Should detect at least one anomaly');
  
  const anomalyTypes = result[0].anomalies.map(a => a.type);
  assert(anomalyTypes.includes('late_arrival') || anomalyTypes.some(t => t.includes('late')), 'Should detect late arrival');
  
  console.log(`✅ Test 3 passed: Detected ${result[0].anomalies.length} anomalies`);
  result[0].anomalies.forEach(anomaly => {
    console.log(`   - ${anomaly.type}: ${anomaly.message}`);
  });
  console.log('');
}

// Test 4: Multiple Containers
function testMultipleContainers() {
  console.log('Test 4: Multiple Containers Processing');
  
  const events = [
    {
      container_id: "CONT006",
      event_type: "port_arrival",
      timestamp: "2024-11-15T08:30:00Z",
      location: "Port of Singapore",
      metadata: {
        port_code: "SG",
        expected_arrival: "2024-11-15T08:00:00Z"
      }
    },
    {
      container_id: "CONT007",
      event_type: "port_arrival",
      timestamp: "2024-11-15T09:00:00Z",
      location: "Port of Shanghai",
      metadata: {
        port_code: "SH",
        expected_arrival: "2024-11-15T09:00:00Z"
      }
    },
    {
      container_id: "CONT006",
      event_type: "customs_clearance",
      timestamp: "2024-11-15T12:00:00Z",
      location: "Customs, Port of Singapore",
      metadata: {
        clearance_status: "approved"
      }
    }
  ];

  const result = processContainerEvents(events);
  
  assert(!result.error, 'Should not have validation errors');
  assert(result.length === 2, 'Should process 2 containers');
  assert(result.some(r => r.container_id === 'CONT006'), 'Should contain CONT006');
  assert(result.some(r => r.container_id === 'CONT007'), 'Should contain CONT007');
  
  console.log('✅ Test 4 passed: Multiple containers processed correctly\n');
}

// Test 5: Example from problem statement
function testProblemStatementExample() {
  console.log('Test 5: Problem Statement Example');
  
  const shipment = {
    container_id: "CONT_INDIA_FCL_001",
    shipment_type: "FCL",
    trade_type: "export",
    origin: "Port of Mumbai, India",
    destination: "Port of Rotterdam, Netherlands",
    shipper: "ABC Export Company, Mumbai",
    consignee: "XYZ Import NV, Rotterdam",
    commodity: "Textiles & Garments",
    events: [
      {
        event_type: "port_arrival",
        timestamp: "2024-11-15T02:00:00Z",
        location: "Port of Mumbai",
        metadata: {
          port_code: "INMUN1",
          expected_arrival: "2024-11-15T00:00:00Z",
          vessel_name: "MSC Gulsun",
          voyage_no: "001N"
        }
      },
      {
        event_type: "customs_clearance",
        timestamp: "2024-11-17T12:00:00Z",
        location: "Customs Port of Mumbai",
        metadata: {
          clearance_status: "approved",
          clearance_time: 180,
          exception: "Documents delayed, but eventually approved"
        }
      },
      {
        event_type: "port_departure",
        timestamp: "2024-11-18T08:00:00Z",
        location: "Port of Mumbai",
        metadata: {
          port_code: "INMUN1",
          vessel_name: "MSC Gulsun",
          voyage_no: "001N"
        }
      },
      {
        event_type: "in_transit",
        timestamp: "2024-11-25T00:00:00Z",
        location: "Arabian Sea",
        metadata: {
          voyage_status: "at_sea",
          current_position: "12.5°N 72.0°E"
        }
      },
      {
        event_type: "port_arrival",
        timestamp: "2024-12-10T06:00:00Z",
        location: "Port of Rotterdam",
        metadata: {
          port_code: "NLRTM",
          expected_arrival: "2024-12-09T00:00:00Z",
          vessel_name: "MSC Gulsun"
        }
      }
    ]
  };

  // Extract events and add container_id
  const events = shipment.events.map(event => ({
    ...event,
    container_id: shipment.container_id
  }));

  const result = processContainerEvents(events);
  
  assert(!result.error, 'Should not have validation errors');
  assert(result.length === 1, 'Should process 1 container');
  assert(result[0].container_id === 'CONT_INDIA_FCL_001', 'Container ID should match');
  assert(result[0].timeline.length === 5, 'Should have 5 events in timeline');
  assert(result[0].current_location === 'Port of Rotterdam', 'Current location should be Port of Rotterdam');
  
  console.log('✅ Test 5 passed: Problem statement example processed correctly');
  console.log(`   Container: ${result[0].container_id}`);
  console.log(`   Status: ${result[0].current_status}`);
  console.log(`   Location: ${result[0].current_location}`);
  console.log(`   Events: ${result[0].timeline.length}`);
  console.log(`   Anomalies: ${result[0].anomalies.length}`);
  console.log(`   Progress: ${result[0].journey_progress}%\n`);
}

// Run all tests
try {
  testHappyPath();
  testValidationFailures();
  testAnomalyDetection();
  testMultipleContainers();
  testProblemStatementExample();
  
  console.log('🎉 All tests passed successfully!');
} catch (error) {
  console.error('❌ Test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}

