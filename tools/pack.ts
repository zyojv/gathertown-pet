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

// Get actual frame counts from animation data
const idleFrameCount = idle.Durations.Duration.length;
const walkFrameCount = walk.Durations.Duration.length;

// Use the maximum frame count for consistency
const maxFrameCount = Math.max(idleFrameCount, walkFrameCount);

console.log(`Idle frames: ${idleFrameCount}`);
console.log(`Walk frames: ${walkFrameCount}`);
console.log(`Max frames: ${maxFrameCount}`);

const anim = (row: number, playback: number) => ({
  sequence: [row * maxFrameCount, (row + 1) * maxFrameCount - 1],
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

// Helper function to repeat frames to match target count
const repeatFramesToTarget = (frames: Buffer[], targetCount: number): Buffer[] => {
  if (frames.length >= targetCount) {
    return frames.slice(0, targetCount); // Trim if longer
  }
  
  const result: Buffer[] = [];
  for (let i = 0; i < targetCount; i++) {
    const sourceIndex = i % frames.length; // Cycle through available frames
    result.push(frames[sourceIndex]);
  }
  
  console.log(`Repeated ${frames.length} frames to ${targetCount} frames`);
  return result;
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
  // Get actual image dimensions first
  const idleImage = await sharp(img1).metadata();
  const walkImage = await sharp(img2).metadata();

  // Calculate frames per row from actual image dimensions
  const idleFramesPerRow = Math.floor((idleImage.width || 0) / idle.FrameWidth);
  const walkFramesPerRow = Math.floor((walkImage.width || 0) / walk.FrameWidth);

  console.log(`Idle image: ${idleImage.width}x${idleImage.height}, ${idleFramesPerRow} frames per row`);
  console.log(`Walk image: ${walkImage.width}x${walkImage.height}, ${walkFramesPerRow} frames per row`);

  // Process idle animation frames
  const allIdleFrames = await extractAndPadFrames(img1, idle.FrameWidth, idle.FrameHeight, idleFrameCount, idleFramesPerRow);
  const idleFrames = repeatFramesToTarget(allIdleFrames, maxFrameCount);
  
  // Process walk animation frames  
  const allWalkFrames = await extractAndPadFrames(img2, walk.FrameWidth, walk.FrameHeight, walkFrameCount * 8, walkFramesPerRow); // 8 directions
  
  // Create normal image (first idle frame)
  await fsp.writeFile(output + "-normal.png", idleFrames[0]);
  
  // Create idle strip
  await createFrameStrip(idleFrames, output + "-idle.png");
  
  // Create walk strips for each direction
  const walkStripPaths: string[] = [];
  for (let direction = 0; direction < 8; direction++) {
    // Get the original frames for this direction
    const originalDirectionFrames = allWalkFrames.slice(direction * walkFrameCount, (direction + 1) * walkFrameCount);
    // Repeat frames to match maxFrameCount
    const directionFrames = repeatFramesToTarget(originalDirectionFrames, maxFrameCount);
    const stripPath = `${output}-walk-${direction}.png`;
    
    await sharp({
      create: {
        width: maxFrameWidth * maxFrameCount,
        height: maxFrameHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .composite(directionFrames.map((frame: Buffer, index: number) => ({
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
      width: maxFrameWidth * maxFrameCount,
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
