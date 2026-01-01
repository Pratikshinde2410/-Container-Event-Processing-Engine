#!/usr/bin/env node

/**
 * CLI script to process shipment JSON files
 * Usage: node process-file.js <file_path>
 */

const fs = require('fs');
const path = require('path');
const { processContainerEvents } = require('./containerProcessor');

// Get file path from command line arguments
const filePath = process.argv[2];

if (!filePath) {
  console.error('Error: File path is required');
  console.log('Usage: node process-file.js <file_path>');
  console.log('Example: node process-file.js "sample data/shipments_detailed_input_wetrack_developer_assignment.json"');
  process.exit(1);
}

// Resolve file path
let resolvedPath;
try {
  if (path.isAbsolute(filePath)) {
    resolvedPath = filePath;
  } else {
    resolvedPath = path.resolve(process.cwd(), filePath);
  }
} catch (error) {
  console.error(`Error: Unable to resolve file path: ${error.message}`);
  process.exit(1);
}

// Check if file exists
if (!fs.existsSync(resolvedPath)) {
  console.error(`Error: File not found at path: ${resolvedPath}`);
  process.exit(1);
}

// Read and parse JSON file
let shipments;
try {
  const fileContent = fs.readFileSync(resolvedPath, 'utf8');
  shipments = JSON.parse(fileContent);
  console.error(`✓ Successfully loaded file: ${resolvedPath}`);
} catch (error) {
  if (error instanceof SyntaxError) {
    console.error(`Error: Invalid JSON file: ${error.message}`);
  } else {
    console.error(`Error: Failed to read file: ${error.message}`);
  }
  process.exit(1);
}

// Validate input is an array
if (!Array.isArray(shipments)) {
  console.error('Error: JSON file must contain an array of shipments');
  process.exit(1);
}

if (shipments.length === 0) {
  console.error('Error: Shipments array is empty');
  process.exit(1);
}

console.error(`✓ Found ${shipments.length} shipment(s)`);

// Extract events from shipments
const allEvents = [];
shipments.forEach((shipment, shipmentIndex) => {
  if (!shipment.container_id) {
    console.error(`Warning: Shipment at index ${shipmentIndex} missing container_id`);
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
  console.error('Error: No events found in shipments');
  process.exit(1);
}

console.error(`✓ Extracted ${allEvents.length} event(s) from shipments`);

// Process events
console.error('\nProcessing events...\n');
const result = processContainerEvents(allEvents);

// Check if there were validation errors
if (result.error) {
  console.error('Validation Errors:');
  result.validation_errors.forEach(error => {
    console.error(`  - ${error}`);
  });
  process.exit(1);
}

// Display results
console.log('='.repeat(60));
console.log('PROCESSING RESULTS');
console.log('='.repeat(60));
console.log(`File: ${resolvedPath}`);
console.log(`Shipments Processed: ${shipments.length}`);
console.log(`Containers Processed: ${result.length}`);
console.log(`Total Events: ${allEvents.length}`);
console.log('='.repeat(60));
console.log('');

// Display processing summary to stderr
console.error('\n' + '='.repeat(60));
console.error('PROCESSING COMPLETE');
console.error('='.repeat(60));
console.error(`File: ${resolvedPath}`);
console.error(`Shipments Processed: ${shipments.length}`);
console.error(`Containers Processed: ${result.length}`);
console.error(`Total Events: ${allEvents.length}`);
console.error('='.repeat(60));
console.error('\nOutput:\n');

// Output the result as JSON to stdout (main console output)
console.log(JSON.stringify(result, null, 2));

// Optionally save results to file
const outputPath = path.join(path.dirname(resolvedPath), 'processing_results.json');
try {
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.error(`✓ Results saved to: ${outputPath}`);
} catch (error) {
  console.error(`Warning: Could not save results to file: ${error.message}`);
}

console.error('\n✓ Processing completed successfully!');