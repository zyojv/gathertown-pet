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

import fs from "fs/promises";

const [dir, output] = process.argv.slice(2);
if (!dir || !output) {
  throw new Error("Usage: upload.ts <dir> <output>");
}

const spaceID = process.env.GATHER_SPACE_ID ?? "k1s3wHMOVDoLHVCo\\fstest";
const apiKey = process.env.GATHER_API_KEY ?? "";

if (!spaceID || !apiKey) {
  throw new Error("GATHER_SPACE_ID and GATHER_API_KEY must be set");
}

const upload = async (path: string) => {
  const data = await fs.readFile(path);

  const res = await fetch(`https://api.gather.town/api/v2/spaces/${encodeURIComponent(
      spaceID
    )}/uploadImage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apiKey: apiKey,
    },
    body: JSON.stringify({
      bytes: data,
      spaceId: spaceID,
    }),
  });
  console.log(await res.json());
};

upload(dir + "-normal.png");

// const normal = fs.readFileSync(dir + "-normal.png");
// const spritesheet = fs.readFileSync(dir + ".png");

// const data = JSON.parse(fs.readFileSync(dir + ".json", "utf-8"));

// fs.writeFileSync(
//   output,
//   JSON.stringify(
//     {
//       normal: "",
//       spritesheet: data,
//     },
//     null,
//     2
//   )
// );
