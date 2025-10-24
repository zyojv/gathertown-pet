/*
 *  Copyright 2025 Rafael Orman
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

import { Game, MapObject, WireObject } from "@gathertown/gather-game-client";
import fs from "fs";

// Replace the global WebSocket with the isomorphic-ws
global.WebSocket = require("isomorphic-ws");

const game = new Game(
  process.env.GATHER_SPACE_ID ?? "k1s3wHMOVDoLHVCo\\fstest",
  () => Promise.resolve({ apiKey: process.env.GATHER_API_KEY ?? "" })
);

console.log("Connecting to Gather space...");
game.connect();

game.subscribeToConnection((connected) => {
  console.log("Connected to Gather:", connected);
  if (connected) {
    console.log("Monitoring for new objects with image URLs...");
  }
});

// Set to track already seen objects to avoid duplicates
const seenObjects = new Set<string>();

// Function to extract and log image URLs from objects
const logObjectImageUrls = (obj: MapObject | WireObject, key: string, action: string = "detected") => {
  const objectId = obj.id || key;
  
  // Skip if we've already seen this object
  if (seenObjects.has(objectId)) {
    return;
  }
  seenObjects.add(objectId);

  console.log(`New object ${action}: ${objectId}`);
  console.log(`   Extension Class: ${obj.extensionClass || 'N/A'}`);
  console.log(`   Type: ${obj.type || 'N/A'}`);
  console.log(`   Position: (${obj.x}, ${obj.y})`);
  console.log(`   Placer ID: ${obj.objectPlacerId || 'N/A'}`);

  const imageUrls: string[] = [];

  // Check for normal image URL
  if (obj.normal) {
    imageUrls.push(`Normal: ${obj.normal}`);
  }

  // Check for highlighted image URL
  if (obj.highlighted) {
    imageUrls.push(`Highlighted: ${obj.highlighted}`);
  }

  // Check for spritesheet URL
  if (obj.spritesheet?.spritesheetUrl) {
    imageUrls.push(`Spritesheet: ${obj.spritesheet.spritesheetUrl}`);
  }

  // Check for custom properties that might contain image URLs (MapObject has properties)
  if ('properties' in obj && obj.properties) {
    Object.entries(obj.properties).forEach(([propKey, propValue]) => {
      if (typeof propValue === 'string' && 
          (propValue.startsWith('http') || propValue.includes('cdn.gather'))) {
        imageUrls.push(`Property "${propKey}": ${propValue}`);
      }
    });
  }

  if (imageUrls.length > 0) {
    console.log("   * Image URLs found:");
    imageUrls.forEach(url => console.log(`      ${url}`));
    
    // Write to log file
    const logEntry = {
      timestamp: new Date().toISOString(),
      objectId,
      key,
      extensionClass: obj.extensionClass,
      position: { x: obj.x, y: obj.y },
      placerId: obj.objectPlacerId,
      imageUrls: imageUrls.map(url => url.split(': ')[1]),
      action
    };
    
    const logFile = 'object-images.log';
    const logLine = JSON.stringify(logEntry) + '';
    fs.appendFileSync(logFile, logLine);
    console.log(`   * Logged to ${logFile}`);
  } else {
    console.log("   * No image URLs found");
  }
};

game.waitForInit().then(() => {
  const me = game.getMyPlayer();
  console.log(`Initialized as player: ${me.name} (${me.id})`);
  console.log(`Current map: ${me.map}`);

  // Monitor for new objects being placed
  game.subscribeToEvent(
    "mapSetObjectsV2",
    ({ mapSetObjectsV2 }) => {
      console.log(`🆕 Objects updated on map: ${mapSetObjectsV2.mapId}`);
      
      Object.entries(mapSetObjectsV2.objects).forEach(([key, obj]) => {
        logObjectImageUrls(obj, key, "placed");
      });
    }
  );

  console.log("Setup complete! Monitoring for object changes...");
  console.log("Image URLs will be logged to 'object-images.log'");
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down object monitor...');
  game.disconnect();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down object monitor...');
  game.disconnect();
  process.exit(0);
});
