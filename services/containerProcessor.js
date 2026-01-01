// services/containerProcessor.js

const VALID_EVENT_TYPES = [
  'port_arrival', 'port_departure', 'customs_clearance', 'customs_hold',
  'customs_inspection', 'documentation_hold', 'road_checkpoint',
  'lcl_pickup', 'lcl_consolidation', 'lcl_deconsolidation',
  'lcl_delivery', 'lcl_damage_inspection',
  'transshipment_arrival', 'transshipment_loading', 'in_transit'
];

const REQUIRED_METADATA = {
  port_arrival: ['port_code'],
  port_departure: ['port_code'],
  customs_clearance: ['clearance_status'],
  customs_hold: ['hold_reason'],
  transshipment_arrival: ['port_code'],
  in_transit: ['voyage_status']
};

function isValidISO8601(dateString) {
  if (!dateString || typeof dateString !== 'string') return false;
  const date = new Date(dateString);
  return !isNaN(date) && dateString.includes('T') && dateString.endsWith('Z');
}

function validateEvent(event, index) {
  const errors = [];

  if (!event.container_id || typeof event.container_id !== 'string' || event.container_id.trim() === '') {
    errors.push(`Event ${index}: container_id is required and must be a non-empty string`);
  }

  if (!VALID_EVENT_TYPES.includes(event.event_type)) {
    errors.push(`Event ${index}: Invalid event_type '${event.event_type}'`);
  }

  if (!isValidISO8601(event.timestamp)) {
    errors.push(`Event ${index}: timestamp must be valid ISO 8601 with Z suffix`);
  }

  if (!event.location || typeof event.location !== 'string' || event.location.trim() === '') {
    errors.push(`Event ${index}: location is required and must be a non-empty string`);
  }

  const required = REQUIRED_METADATA[event.event_type] || [];
  if (required.length > 0) {
    if (!event.metadata || typeof event.metadata !== 'object') {
      errors.push(`Event ${index}: metadata object is required for '${event.event_type}'`);
    } else {
      required.forEach(field => {
        if (!(field in event.metadata)) {
          errors.push(`Event ${index}: metadata.${field} is required for '${event.event_type}'`);
        }
      });
    }
  }

  return errors;
}

function calculateDelayMinutes(actual, expected) {
  if (!expected) return null;
  const a = new Date(actual);
  const e = new Date(expected);
  if (isNaN(a) || isNaN(e)) return null;
  return Math.round((a - e) / (1000 * 60));
}

function detectAnomalies(events) {
  if (events.length === 0) return [];

  const anomalies = [];
  const sortedEvents = [...events].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  // 1. Late arrival
  // 2. Unusual gap
  // 3. Duplicate events
  for (let i = 0; i < sortedEvents.length; i++) {
    const curr = sortedEvents[i];

    if (curr.event_type === 'port_arrival' && curr.metadata?.expected_arrival) {
      const delay = calculateDelayMinutes(curr.timestamp, curr.metadata.expected_arrival);
      if (delay > 120) {
        anomalies.push({
          type: 'late_arrival',
          message: `Arrived ${delay} minutes late`,
          timestamp: curr.timestamp
        });
      }
    }

    if (i > 0) {
      const gapHours = (new Date(curr.timestamp) - new Date(sortedEvents[i - 1].timestamp)) / (3600000);
      if (gapHours > 24) {
        anomalies.push({
          type: 'unusual_gap',
          message: `Gap of ${Math.round(gapHours)} hours from previous event`,
          timestamp: curr.timestamp
        });
      }
    }

    for (let j = i + 1; j < sortedEvents.length; j++) {
      if (sortedEvents[j].event_type === curr.event_type) {
        const diffHours = (new Date(sortedEvents[j].timestamp) - new Date(curr.timestamp)) / 3600000;
        if (diffHours <= 1) {
          anomalies.push({
            type: 'duplicate_event',
            message: `Duplicate ${curr.event_type} within 1 hour`,
            timestamp: sortedEvents[j].timestamp
          });
        }
        break;
      }
    }
  }

  // 4. Out of sequence - FIXED VERSION
  const sequenceRules = {
    port_arrival: ['customs_clearance', 'customs_hold', 'customs_inspection', 'documentation_hold', 'port_departure'],
    customs_clearance: ['port_departure', 'in_transit'],
    customs_hold: ['customs_clearance', 'customs_inspection'],
    customs_inspection: ['customs_clearance'],
    documentation_hold: ['customs_clearance', 'port_departure'],
    port_departure: ['in_transit', 'transshipment_arrival', 'port_arrival'],
    in_transit: ['port_arrival', 'transshipment_arrival'],
    transshipment_arrival: ['transshipment_loading', 'port_departure', 'in_transit'],
    transshipment_loading: ['port_departure', 'in_transit']
    // Add more as needed
  };

  for (let i = 0; i < sortedEvents.length - 1; i++) {
    const currentType = sortedEvents[i].event_type;
    const nextType = sortedEvents[i + 1].event_type;
    const allowed = sequenceRules[currentType] || [];

    if (!allowed.includes(nextType)) {
      anomalies.push({
        type: 'out_of_sequence',
        message: `Unexpected sequence: '${nextType}' follows '${currentType}'`,
        timestamp: sortedEvents[i + 1].timestamp
      });
    }
  }

  return anomalies;
}

function getCurrentStatus(lastEvent) {
  const map = {
    port_arrival: 'At Port',
    port_departure: 'Departed Port',
    customs_clearance: 'Cleared Customs',
    customs_hold: 'Held at Customs',
    in_transit: 'In Transit',
    lcl_delivery: 'Delivered',
    port_arrival: 'Arrived at Destination'
  };
  return map[lastEvent.event_type] || 'In Progress';
}

function calculateJourneyProgress(events) {
  if (events.length === 0) return 0;
  const milestones = ['port_arrival', 'customs_clearance', 'port_departure', 'in_transit', 'port_arrival'];
  let count = 0;
  const seen = new Set();
  for (const e of events) {
    if (milestones[count] === e.event_type && !seen.has(e.event_type)) {
      seen.add(e.event_type);
      count++;
    }
  }
  return Math.round((count / milestones.length) * 100);
}

function processContainerEvents(events) {
  const validationErrors = [];
  events.forEach((event, idx) => {
    validationErrors.push(...validateEvent(event, idx));
  });

  if (validationErrors.length > 0) {
    return { error: 'Validation failed', validation_errors: validationErrors };
  }

  const containers = {};
  events.forEach(e => {
    if (!containers[e.container_id]) containers[e.container_id] = [];
    containers[e.container_id].push(e);
  });

  const results = [];
  for (const id in containers) {
    const evts = containers[id];
    const sorted = evts.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const last = sorted[sorted.length - 1];
    const anomalies = detectAnomalies(evts);

    const timeline = sorted.map(e => {
      const item = {
        event_type: e.event_type,
        timestamp: e.timestamp,
        location: e.location
      };
      if (e.event_type === 'port_arrival' && e.metadata?.expected_arrival) {
        const delay = calculateDelayMinutes(e.timestamp, e.metadata.expected_arrival);
        if (delay !== null) item.delay_minutes = delay;
      }
      return item;
    });

    results.push({
      container_id: id,
      current_status: getCurrentStatus(last),
      current_location: last.location,
      last_event_time: last.timestamp,
      total_events: evts.length,
      journey_progress: calculateJourneyProgress(evts),
      anomalies: anomalies.map(a => ({ type: a.type, message: a.message })),
      timeline
    });
  }

  return results;
}

module.exports = { processContainerEvents };