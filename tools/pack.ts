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
if (
  walk.FrameWidth !== idle.FrameWidth ||
  walk.FrameHeight !== idle.FrameHeight
) {
  throw new Error("Walk and Idle animations must have the same size");
}

const imagesPerRow = 4;
const anim = (row: number, playback: number) => ({
  sequence: [row * imagesPerRow, (row + 1) * imagesPerRow - 1],
  frameRate: playback,
  useSequenceAsRange: true,
  loop: true,
});

const spritesheet: any = {
  framing: {
    frameWidth: walk.FrameWidth,
    frameHeight: walk.FrameHeight,
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

const all = Promise.all([
  sharp(img1)
    .extract({
      top: 0,
      left: 0,
      width: walk.FrameWidth,
      height: walk.FrameHeight,
    })
    .png()
    .toBuffer()
    .then(async (buffer) => {
      await fsp.writeFile(output + "-normal.png", buffer);
    }),
  sharp(img1)
    .extract({
      top: 0,
      left: 0,
      width: walk.FrameWidth * imagesPerRow,
      height: walk.FrameHeight,
    })
    .png()
    .toBuffer()
    .then(async (buffer) => {
      await fsp.writeFile(output + "-idle.png", buffer);
    }),
]).then(async () => {
  const buffer = await sharp({
    create: {
      width: walk.FrameWidth * imagesPerRow,
      height: walk.FrameHeight * Object.values(spritesheet.animations).length,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: output + "-idle.png", top: 0, left: 0 }, // adjust position
      { input: img2, top: walk.FrameHeight, left: 0 },
    ])
    .png()
    .toBuffer()
  
  await fsp.writeFile(output + ".png", buffer);
});
