import type { Body } from './Body';

/**
 * Spatial hash for collision optimization
 * Divides space into cells to reduce collision checks
 */
export class SpatialHash {
  private cellSize: number;
  private grid: Map<string, Body[]>;

  constructor(cellSize: number = 100) {
    this.cellSize = cellSize;
    this.grid = new Map();
  }

  insert(body: Body): void {
    const worldPos = body.getWorldPosition();
    const cellX = Math.floor(worldPos.x / this.cellSize);
    const cellY = Math.floor(worldPos.y / this.cellSize);

    // Insert into 9 cells (current + 8 neighbors) to handle edge cases
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = `${cellX + dx},${cellY + dy}`;
        if (!this.grid.has(key)) {
          this.grid.set(key, []);
        }
        this.grid.get(key)!.push(body);
      }
    }
  }

  getPairs(): [Body, Body][] {
    const pairs: [Body, Body][] = [];
    const tested = new Set<string>();

    for (const cell of this.grid.values()) {
      for (let i = 0; i < cell.length; i++) {
        for (let j = i + 1; j < cell.length; j++) {
          const a = cell[i];
          const b = cell[j];
          
          // Create unique pair key
          const pairKey = a < b ? `${a}-${b}` : `${b}-${a}`;
          
          if (!tested.has(pairKey)) {
            tested.add(pairKey);
            pairs.push([a, b]);
          }
        }
      }
    }

    return pairs;
  }

  clear(): void {
    this.grid.clear();
  }
}
