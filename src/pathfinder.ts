export type Pos = { x: number; y: number };

export type Direction =
  | "north"
  | "south"
  | "east"
  | "west"
  | "northeast"
  | "northwest"
  | "southeast"
  | "southwest";

export type Segment = {
  a: Pos;
  b: Pos;
  direction: Direction;
};

export class Pathfinder {
  private blocked: Set<string> = new Set();

  constructor(blockedPositions: Pos[] = []) {
    for (const p of blockedPositions) {
      this.blocked.add(this.key(p));
    }
  }

  private key(p: Pos): string {
    return `${p.x},${p.y}`;
  }

  addBlocked(pos: Pos) {
    this.blocked.add(this.key(pos));
  }

  removeBlocked(pos: Pos) {
    this.blocked.delete(this.key(pos));
  }

  clearBlocked() {
    this.blocked.clear();
  }

  isBlocked = (p: Pos): boolean => {
    return this.blocked.has(this.key(p));
  };

  private heuristic(a: Pos, b: Pos): number {
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  }

  private getNeighbors(p: Pos): Pos[] {
    const deltas = [
      { x: 0, y: -1 }, // north
      { x: 0, y: 1 },  // south
      { x: 1, y: 0 },  // east
      { x: -1, y: 0 }, // west
      { x: 1, y: -1 }, // northeast
      { x: -1, y: -1 },// northwest
      { x: 1, y: 1 },  // southeast
      { x: -1, y: 1 }, // southwest
    ];
    return deltas.map(d => ({ x: p.x + d.x, y: p.y + d.y }));
  }

  private getDirection(a: Pos, b: Pos): Direction {
    const dx = b.x - a.x;
    const dy = b.y - a.y;

    if (dx === 0 && dy === -1) return "north";
    if (dx === 0 && dy === 1) return "south";
    if (dx === 1 && dy === 0) return "east";
    if (dx === -1 && dy === 0) return "west";
    if (dx === 1 && dy === -1) return "northeast";
    if (dx === -1 && dy === -1) return "northwest";
    if (dx === 1 && dy === 1) return "southeast";
    if (dx === -1 && dy === 1) return "southwest";

    throw new Error("Invalid direction");
  }

  private aggregateSegments(path: Pos[]): Segment[] {
    if (path.length < 2) return [];

    const segments: Segment[] = [];
    let start = path[0];
    let prevDir = this.getDirection(path[0], path[1]);

    for (let i = 1; i < path.length; i++) {
      const currDir = i < path.length - 1 ? this.getDirection(path[i], path[i + 1]) : null;
      if (currDir !== prevDir || i === path.length - 1) {
        segments.push({ a: start, b: path[i], direction: prevDir });
        start = path[i];
        prevDir = currDir!;
      }
    }

    return segments;
  }

  findPath(start: Pos, goal: Pos): Segment[] | null {
    const open: Pos[] = [start];
    const cameFrom = new Map<string, Pos>();
    const gScore = new Map<string, number>([[this.key(start), 0]]);
    const fScore = new Map<string, number>([[this.key(start), this.heuristic(start, goal)]]);

    while (open.length > 0) {
      open.sort((a, b) => (fScore.get(this.key(a)) ?? Infinity) - (fScore.get(this.key(b)) ?? Infinity));
      const current = open.shift()!;

      if (current.x === goal.x && current.y === goal.y) {
        const path: Pos[] = [];
        let curKey = this.key(current);
        let cur: Pos | undefined = current;
        while (cur) {
          path.push(cur);
          cur = cameFrom.get(curKey);
          curKey = cur ? this.key(cur) : "";
        }
        path.reverse();

        return this.aggregateSegments(path);
      }

      for (const neighbor of this.getNeighbors(current)) {
        if (this.isBlocked(neighbor)) continue;
        const tentativeG = (gScore.get(this.key(current)) ?? Infinity) + 1;
        if (tentativeG < (gScore.get(this.key(neighbor)) ?? Infinity)) {
          cameFrom.set(this.key(neighbor), current);
          gScore.set(this.key(neighbor), tentativeG);
          fScore.set(this.key(neighbor), tentativeG + this.heuristic(neighbor, goal));
          if (!open.find(p => p.x === neighbor.x && p.y === neighbor.y)) {
            open.push(neighbor);
          }
        }
      }
    }

    return null;
  }
}
