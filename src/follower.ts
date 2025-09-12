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

import { Segment } from "./pathfinder";

export class PetAI {
  private queue: Segment[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private move: ((segment: Segment, travelingTime: number) => void)[] = [];
  private done: (() => void)[] = [];

  public constructor(private readonly travelingTime: number) {}

  get isIdle() {
    return this.timer === null;
  }

  public clear() {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.queue = [];
    this.timer = null;
  }

  public subscribeToMovement(callback: (segment: Segment, travelingTime: number) => void) {
    this.move.push(callback);
  }

  public subscribeToMovementDone(callback: () => void) {
    this.done.push(callback);
  }

  public queueMovement(segments: Segment[]) {
    if (this.timer) {
      return;
    }
    this.queue = segments;
    this.nextSegment();
  }

  private computeTravelingTime(segment: Segment) {
    return Math.sqrt(Math.pow(segment.a.x - segment.b.x, 2) + Math.pow(segment.a.y - segment.b.y, 2)) * this.travelingTime;
  }

  private nextSegment() {
    if (this.queue.length === 0) {
      this.timer = null;
      this.done.forEach(s => s());
      return null;
    }
    const segment = this.queue.shift()!;
    const travelingTime = this.computeTravelingTime(segment);
    this.move.forEach(s => s(segment, travelingTime));
    this.timer = setTimeout(() => {
      this.nextSegment();
    }, travelingTime);
    return segment;
  }
}
