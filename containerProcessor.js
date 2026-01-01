// Valid event types
const VALID_EVENT_TYPES = [
  'port_arrival',
  'port_departure',
  'customs_clearance',
  'customs_hold',
  'customs_inspection',
  'documentation_hold',
  'road_checkpoint',
  'lcl_pickup',
  'lcl_consolidation',
  'lcl_deconsolidation',
  'lcl_delivery',
  'lcl_damage_inspection',
  'transshipment_arrival',
  'transshipment_loading',
  'in_transit'
];

// Required metadata fields for each event type
const REQUIRED_METADATA = {
  port_arrival: ['port_code'], // expected_arrival is optional
  port_departure: ['port_code'],
  customs_clearance: ['clearance_status'],
  customs_hold: ['hold_reason'],
  customs_inspection: [], // Optional metadata
  documentation_hold: [], // Optional metadata
  road_checkpoint: [], // checkpoint_id is optional
  lcl_pickup: [], // pickup_location is optional
  lcl_consolidation: [], // Optional metadata
  lcl_deconsolidation: [], // Optional metadata
  lcl_delivery: [], // Optional metadata
  lcl_damage_inspection: [], // Optional metadata
  transshipment_arrival: ['port_code'],
  transshipment_loading: [], // Optional metadata
  in_transit: ['voyage_status']
};

/**
 * Validates if a string is a valid ISO 8601 date
 */
function isValidISO8601(dateString) {
  if (!dateString || typeof dateString !== 'string') {
    return false;
  }
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date) && dateString.includes('T') && dateString.includes('Z');
}

/**
 * Validates a single event
 */
function validateEvent(event, index) {
  const errors = [];

  // Validate container_id
  if (!event.container_id || typeof event.container_id !== 'string' || event.container_id.trim() === '') {
    errors.push(`Event ${index}: container_id is required and must not be empty`);
  }

  // Validate event_type
  if (!VALID_EVENT_TYPES.includes(event.event_type)) {
    errors.push(`Event ${index}: Invalid event_type '${event.event_type}'. Must be one of: ${VALID_EVENT_TYPES.join(', ')}`);
  }

  // Validate timestamp
  if (!isValidISO8601(event.timestamp)) {
    errors.push(`Event ${index}: timestamp must be a valid ISO 8601 format (e.g., 2024-11-15T08:30:00Z)`);
  }

  // Validate location
  if (!event.location || typeof event.location !== 'string' || event.location.trim() === '') {
    errors.push(`Event ${index}: location is required and must not be empty`);
  }

  // Validate metadata based on event type
  if (event.event_type && REQUIRED_METADATA[event.event_type]) {
    const requiredFields = REQUIRED_METADATA[event.event_type];
    if (!event.metadata || typeof event.metadata !== 'object') {
      errors.push(`Event ${index}: metadata is required for event_type '${event.event_type}'`);
    } else {
      requiredFields.forEach(field => {
        if (!(field in event.metadata)) {
          errors.push(`Event ${index}: metadata.${field} is required for event_type '${event.event_type}'`);
        }
      });
    }
  }

  return errors;
}

/**
 * Calculates delay in minutes between expected and actual time
 */
function calculateDelayMinutes(actualTime, expectedTime) {
  if (!expectedTime) return null;
  const actual = new Date(actualTime);
  const expected = new Date(expectedTime);
  if (isNaN(actual) || isNaN(expected)) return null;
  return Math.round((actual - expected) / (1000 * 60));
}

/**
 * Detects anomalies for container events
 */
function detectAnomalies(events) {
  const anomalies = [];
  const sortedEvents = [...events].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  for (let i = 0; i < sortedEvents.length; i++) {
    const currentEvent = sortedEvents[i];
    const currentTime = new Date(currentEvent.timestamp);

    // 1. Late Arrival: Container arrives > 2 hours after expected arrival
    if (currentEvent.event_type === 'port_arrival' && currentEvent.metadata?.expected_arrival) {
      const delayMinutes = calculateDelayMinutes(currentEvent.timestamp, currentEvent.metadata.expected_arrival);
      if (delayMinutes !== null && delayMinutes > 120) {
        anomalies.push({
          type: 'late_arrival',
          event_index: i,
          timestamp: currentEvent.timestamp,
          message: `Container arrived ${delayMinutes} minutes after expected time`
        });
      }
    }

    // 2. Unusual Gap: More than 24 hours between consecutive events
    if (i > 0) {
      const prevTime = new Date(sortedEvents[i - 1].timestamp);
      const gapHours = (currentTime - prevTime) / (1000 * 60 * 60);
      if (gapHours > 24) {
        anomalies.push({
          type: 'unusual_gap',
          event_index: i,
          timestamp: currentEvent.timestamp,
          message: `More than ${Math.round(gapHours)} hours gap between events (${sortedEvents[i - 1].event_type} and ${currentEvent.event_type})`
        });
      }
    }

    // 3. Duplicate Event: Same event type within 1 hour
    for (let j = i + 1; j < sortedEvents.length; j++) {
      if (sortedEvents[j].event_type === currentEvent.event_type) {
        const timeDiff = (new Date(sortedEvents[j].timestamp) - currentTime) / (1000 * 60 * 60);
        if (timeDiff <= 1) {
          anomalies.push({
            type: 'duplicate_event',
            event_index: j,
            timestamp: sortedEvents[j].timestamp,
            message: `Duplicate ${currentEvent.event_type} event detected within 1 hour`
          });
        }
        break; // Only check the first duplicate
      }
    }
  }

  // 4. Out of Sequence: Events occurring out of logical order
  const sequenceRules = {
    port_arrival: ['customs_clearance', 'customs_hold', 'customs_inspection', 'documentation_hold', 'port_departure'],
    customs_clearance: ['port_departure', 'in_transit'],
    customs_hold: ['customs_clearance', 'customs_inspection'],
    customs_inspection: ['customs_clearance'],
    documentation_hold: ['customs_clearance', 'port_departure'],
    port_departure: ['in_transit', 'transshipment_arrival', 'port_arrival'],
    in_transit: ['port_arrival', 'transshipment_arrival'],
    transshipment_arrival: ['port_departure', 'transshipment_loading', 'in_transit'],
    transshipment_loading: ['port_departure', 'in_transit'],
    lcl_pickup: ['lcl_consolidation', 'road_checkpoint', 'port_arrival'],
    lcl_consolidation: ['port_departure', 'transshipment_arrival'],
    lcl_deconsolidation: ['lcl_delivery', 'port_departure'],
    lcl_delivery: [],
    lcl_damage_inspection: ['lcl_delivery'],
    road_checkpoint: ['port_arrival', 'customs_clearance', 'lcl_consolidation']
  };

  for (let i = 0; i < sortedEvents.length - 1; i++) {
    const currentType = sortedEvents[i].event_type;
    const nextType = sortedEvents[i + 1].event_type;
    
    if (sequenceRules[currentType] && !sequenceRules[currentType].includes(nextType)) {
      // Check if there's a more logical sequence violation
      const currentIndex = events.findIndex(e => e.timestamp === sortedEvents[i].timestamp && e.event_type === currentType);
      const nextIndex = events.findIndex(e => e.timestamp === sortedEvents[i + 1].timestamp && e.event_type === nextType);
      
      anomalies.push({
        type: 'out_of_sequence',
        event_index: nextIndex,
        timestamp: sortedEvents[i + 1].timestamp,
        message: `Out of sequence: ${nextType} follows ${currentType} unexpectedly`
      });
    }
  }

  return anomalies;
}

/**
 * Determines current status based on last event
 */
function getCurrentStatus(lastEvent) {
  if (!lastEvent) return 'unknown';
  
  const statusMap = {
    'port_arrival': 'at_port',
    'port_departure': 'departed',
    'customs_clearance': 'cleared_customs',
    'customs_hold': 'held_by_customs',
    'customs_inspection': 'under_customs_inspection',
    'documentation_hold': 'documentation_hold',
    'road_checkpoint': 'in_transit_road',
    'lcl_pickup': 'picked_up',
    'lcl_consolidation': 'consolidating',
    'lcl_deconsolidation': 'deconsolidating',
    'lcl_delivery': 'delivered',
    'lcl_damage_inspection': 'damage_inspection',
    'transshipment_arrival': 'at_transshipment_port',
    'transshipment_loading': 'transshipment_loading',
    'in_transit': 'in_transit'
  };

  return statusMap[lastEvent.event_type] || 'unknown';
}

/**
 * Calculates journey progress percentage (simplified)
 */
function calculateJourneyProgress(events) {
  if (events.length === 0) return 0;
  
  const sortedEvents = [...events].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const milestoneEvents = ['port_arrival', 'customs_clearance', 'port_departure', 'in_transit', 'port_arrival'];
  
  let progress = 0;
  let milestoneIndex = 0;
  
  for (const event of sortedEvents) {
    if (milestoneEvents[milestoneIndex] === event.event_type) {
      milestoneIndex++;
      progress = (milestoneIndex / milestoneEvents.length) * 100;
    }
  }
  
  return Math.min(Math.round(progress), 100);
}

/**
 * Processes container events and generates summary
 */
function processContainerEvents(events) {
  // Validate all events
  const validationErrors = [];
  events.forEach((event, index) => {
    const errors = validateEvent(event, index);
    validationErrors.push(...errors);
  });

  if (validationErrors.length > 0) {
    return {
      error: 'Validation failed',
      validation_errors: validationErrors
    };
  }

  // Group events by container_id
  const containers = {};
  events.forEach(event => {
    if (!containers[event.container_id]) {
      containers[event.container_id] = [];
    }
    containers[event.container_id].push(event);
  });

  // Process each container
  const results = [];
  
  for (const containerId in containers) {
    const containerEvents = containers[containerId];
    
    // Sort events by timestamp
    const sortedEvents = [...containerEvents].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const lastEvent = sortedEvents[sortedEvents.length - 1];

    // Detect anomalies
    const anomalies = detectAnomalies(containerEvents);

    // Build timeline with delay information
    const timeline = sortedEvents.map(event => {
      const timelineItem = {
        event_type: event.event_type,
        timestamp: event.timestamp,
        location: event.location
      };

      // Add delay for port_arrival events
      if (event.event_type === 'port_arrival' && event.metadata?.expected_arrival) {
        const delay = calculateDelayMinutes(event.timestamp, event.metadata.expected_arrival);
        if (delay !== null) {
          timelineItem.delay_minutes = delay;
        }
      }

      return timelineItem;
    });

    // Generate summary
    const summary = {
      container_id: containerId,
      current_status: getCurrentStatus(lastEvent),
      current_location: lastEvent.location,
      last_event_time: lastEvent.timestamp,
      timeline: timeline,
      anomalies: anomalies.map(a => ({
        type: a.type,
        message: a.message
      })),
      journey_progress: calculateJourneyProgress(containerEvents)
    };

    results.push(summary);
  }

  return results;
}

module.exports = {
  processContainerEvents,
  validateEvent,
  detectAnomalies
};

