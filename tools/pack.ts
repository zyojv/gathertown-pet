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

import { XMLParser } from "fast-xml-parser";
import path from "path";
import fs from "fs";
import fsp from "fs/promises";
import sharp from "sharp";

const [dir, output] = process.argv.slice(2);

const animDataPath = path.join(dir, "AnimData.xml");
const animData = fs.readFileSync(animDataPath, "utf-8");

const xml = new XMLParser().parse(animData);
const anims = xml.AnimData.Anims.Anim;

const walk = anims.find((anim: any) => "Name" in anim && anim.Name === "Walk");
const idle = anims.find((anim: any) => "Name" in anim && anim.Name === "Idle");

if (!walk || !idle) {
  throw new Error("Could not find walk or idle animation");
}

// Calculate maximum dimensions across all animations for padding
const maxFrameWidth = Math.max(walk.FrameWidth, idle.FrameWidth);
const maxFrameHeight = Math.max(walk.FrameHeight, idle.FrameHeight);

console.log(`Walk dimensions: ${walk.FrameWidth}x${walk.FrameHeight}`);
console.log(`Idle dimensions: ${idle.FrameWidth}x${idle.FrameHeight}`);
console.log(`Padded dimensions: ${maxFrameWidth}x${maxFrameHeight}`);

// Calculate frames per row from image dimensions
const idleFramesPerRow = Math.floor(192 / idle.FrameWidth); // 6 frames
const walkFramesPerRow = Math.floor(128 / walk.FrameWidth); // 4 frames

// Use walk frames per row for output consistency
const imagesPerRow = walkFramesPerRow;

console.log(`Idle frames per row: ${idleFramesPerRow}`);
console.log(`Walk frames per row: ${walkFramesPerRow}`);
console.log(`Output images per row: ${imagesPerRow}`);

const anim = (row: number, playback: number) => ({
  sequence: [row * imagesPerRow, (row + 1) * imagesPerRow - 1],
  frameRate: playback,
  useSequenceAsRange: true,
  loop: true,
});

const spritesheet: any = {
  framing: {
    frameWidth: maxFrameWidth,
    frameHeight: maxFrameHeight,
  },
  animations: {
    "idle-s": anim(0, idle.Durations.Duration[0]),
    "walk-s": anim(1, walk.Durations.Duration[0]),
    "walk-se": anim(2, walk.Durations.Duration[0]),
    "walk-e": anim(3, walk.Durations.Duration[0]),
    "walk-ne": anim(4, walk.Durations.Duration[0]),
    "walk-n": anim(5, walk.Durations.Duration[0]),
    "walk-nw": anim(6, walk.Durations.Duration[0]),
    "walk-w": anim(7, walk.Durations.Duration[0]),
    "walk-sw": anim(8, walk.Durations.Duration[0]),
  },
};

fs.writeFileSync(output + ".json", JSON.stringify(spritesheet, null, 2));

const img1 = path.join(dir, "Idle-Anim.png");
const img2 = path.join(dir, "Walk-Anim.png");

console.log(img1);

// Helper function to extract and pad individual frames from a spritesheet
const extractAndPadFrames = async (inputPath: string, frameWidth: number, frameHeight: number, totalFrames: number, framesPerRow: number) => {
  const paddingX = Math.floor((maxFrameWidth - frameWidth) / 2);
  const paddingY = Math.floor((maxFrameHeight - frameHeight) / 2);
  
  const frames: Buffer[] = [];
  
  console.log(`Extracting ${totalFrames} frames from ${inputPath}, each ${frameWidth}x${frameHeight}, ${framesPerRow} per row`);
  
  // Extract each frame and pad it
  for (let i = 0; i < totalFrames; i++) {
    const row = Math.floor(i / framesPerRow);
    const col = i % framesPerRow;
    const left = col * frameWidth;
    const top = row * frameHeight;
    
    console.log(`Frame ${i}: extracting at left=${left}, top=${top}, size=${frameWidth}x${frameHeight}`);
    
    const frameBuffer = await sharp(inputPath)
      .extract({
        left: left,
        top: top,
        width: frameWidth,
        height: frameHeight
      })
      .extend({
        top: paddingY,
        bottom: maxFrameHeight - frameHeight - paddingY,
        left: paddingX,
        right: maxFrameWidth - frameWidth - paddingX,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toBuffer();
    
    frames.push(frameBuffer);
  }
  
  return frames;
};

// Helper function to create a horizontal strip from padded frames
const createFrameStrip = async (frames: Buffer[], outputPath: string) => {
  const compositeInputs = frames.map((frame, index) => ({
    input: frame,
    left: index * maxFrameWidth,
    top: 0
  }));

  return sharp({
    create: {
      width: maxFrameWidth * frames.length,
      height: maxFrameHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(compositeInputs)
    .png()
    .toFile(outputPath);
};

(async () => {
  // Process idle animation frames (take only first 4 frames to match walk)
  const allIdleFrames = await extractAndPadFrames(img1, idle.FrameWidth, idle.FrameHeight, idleFramesPerRow, idleFramesPerRow);
  const idleFrames = allIdleFrames.slice(0, imagesPerRow); // Take only first 4 frames
  
  // Process walk animation frames  
  const walkFrames = await extractAndPadFrames(img2, walk.FrameWidth, walk.FrameHeight, imagesPerRow * 8, walkFramesPerRow); // 8 directions, 4 frames each
  
  // Create normal image (first idle frame)
  await fsp.writeFile(output + "-normal.png", idleFrames[0]);
  
  // Create idle strip
  await createFrameStrip(idleFrames, output + "-idle.png");
  
  // Create walk strips for each direction
  const walkStripPaths: string[] = [];
  for (let direction = 0; direction < 8; direction++) {
    const directionFrames = walkFrames.slice(direction * imagesPerRow, (direction + 1) * imagesPerRow);
    const stripPath = `${output}-walk-${direction}.png`;
    
    await sharp({
      create: {
        width: maxFrameWidth * imagesPerRow,
        height: maxFrameHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .composite(directionFrames.map((frame, index) => ({
        input: frame,
        left: index * maxFrameWidth,
        top: 0
      })))
      .png()
      .toFile(stripPath);
    
    walkStripPaths.push(stripPath);
  }
  
  // Create final composite spritesheet
  const compositeInputs = [
    { input: output + "-idle.png", top: 0, left: 0 } // idle row at top
  ];
  
  // Add walk strips for each direction
  walkStripPaths.forEach((stripPath: string, index: number) => {
    compositeInputs.push({
      input: stripPath,
      top: (index + 1) * maxFrameHeight, // start after idle row
      left: 0
    });
  });
  
  const buffer = await sharp({
    create: {
      width: maxFrameWidth * imagesPerRow,
      height: maxFrameHeight * Object.values(spritesheet.animations).length,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(compositeInputs)
    .png()
    .toBuffer()
  
  await fsp.writeFile(output + ".png", buffer);
  
  // Clean up temporary files
  const cleanupPromises = [
    fsp.unlink(output + "-idle.png").catch(() => {}),
    fsp.unlink(output + "-normal.png").catch(() => {}),
  ];
  
  // Add walk strip cleanup
  walkStripPaths.forEach(stripPath => {
    cleanupPromises.push(fsp.unlink(stripPath).catch(() => {}));
  });
  
  await Promise.all(cleanupPromises);
})().catch(console.error);
