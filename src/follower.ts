import { Segment } from "./pathfinder";

export class PetAI {
  private queue: Segment[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private subscribers: ((segment: Segment, travelingTime: number) => void)[] = [];

  public constructor(private readonly travelingTime: number) {}

  public subscribeToMovement(callback: (segment: Segment, travelingTime: number) => void) {
    this.subscribers.push(callback);
  }

  public queueMovement(segments: Segment[]) {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.queue = segments;
    this.nextSegment();
  }

  private computeTravelingTime(segment: Segment) {
    return Math.sqrt(Math.pow(segment.a.x - segment.b.x, 2) + Math.pow(segment.a.y - segment.b.y, 2)) * this.travelingTime;
  }

  private nextSegment() {
    if (this.queue.length === 0) {
      return null;
    }
    const segment = this.queue.shift()!;
    const travelingTime = this.computeTravelingTime(segment);
    this.subscribers.forEach(s => s(segment, travelingTime));
    this.timer = setTimeout(() => {
      this.nextSegment();
    }, travelingTime);
    return segment;
  }
}
