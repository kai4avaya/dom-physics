# Optimization Examples - Code Changes & Testing

This document shows **what would need to change** for each optimization, **how it works**, and **how to test it**.

---

## 1. Spatial Partitioning (Spatial Hash Grid)

### Current Problem
```typescript
// Current: O(n²) collision detection
// Lines 196-223 in World.ts
for (let i = 0; i < this.bodies.length; i++) {
  const bodyA = this.bodies[i];
  const posA = bodyA.getWorldPosition();
  
  for (let j = i + 1; j < this.bodies.length; j++) {
    const bodyB = this.bodies[j];
    const posB = bodyB.getWorldPosition();
    const dx = posB.x - posA.x;
    const dy = posB.y - posA.y;
    const distSq = dx * dx + dy * dy;
    
    // Skip if too far (100px threshold)
    if (distSq > maxCollisionDistSq) {
      collisionSkips++;
      continue;
    }
    
    collisionChecks++;
    this.resolveCollision(bodyA, bodyB);
  }
}
```

**Issue**: Still O(n²) - even with distance check, we're checking every pair.

### Proposed Solution: Spatial Hash Grid

#### What Changes Needed

**1. Add spatial hash grid class to World.ts:**

```typescript
// Add to World class properties (around line 42)
private _spatialGrid: Map<string, Body[]> | null = null;
private _gridCellSize: number = 100; // Match maxCollisionDist
private _spatialGridDirty: boolean = true;

// Add method to get cell key from position
private _getCellKey(x: number, y: number): string {
  const cellX = Math.floor(x / this._gridCellSize);
  const cellY = Math.floor(y / this._gridCellSize);
  return `${cellX},${cellY}`;
}

// Add method to get cells a body overlaps (for bodies that span cells)
private _getBodyCells(body: Body): string[] {
  const pos = body.getWorldPosition();
  const radius = body.radius;
  
  const minX = Math.floor((pos.x - radius) / this._gridCellSize);
  const maxX = Math.floor((pos.x + radius) / this._gridCellSize);
  const minY = Math.floor((pos.y - radius) / this._gridCellSize);
  const maxY = Math.floor((pos.y + radius) / this._gridCellSize);
  
  const cells: string[] = [];
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      cells.push(`${x},${y}`);
    }
  }
  return cells;
}

// Build spatial grid
private _buildSpatialGrid(): Map<string, Body[]> {
  if (!this._spatialGridDirty && this._spatialGrid) {
    return this._spatialGrid;
  }
  
  const grid = new Map<string, Body[]>();
  
  for (const body of this.bodies) {
    if (body.isStatic && !body.enabled) continue;
    
    const cells = this._getBodyCells(body);
    for (const cellKey of cells) {
      if (!grid.has(cellKey)) {
        grid.set(cellKey, []);
      }
      grid.get(cellKey)!.push(body);
    }
  }
  
  this._spatialGrid = grid;
  this._spatialGridDirty = false;
  return grid;
}
```

**2. Replace collision detection loop (lines 196-223):**

```typescript
// NEW: Build spatial grid once per step
const gridStart = performance.now();
const spatialGrid = this._buildSpatialGrid();
const gridTime = performance.now() - gridStart;

// NEW: Track which pairs we've already checked (avoid duplicate checks)
const checkedPairs = new Set<string>();

// NEW: Iterate through grid cells instead of all bodies
for (const [cellKey, bodiesInCell] of spatialGrid.entries()) {
  // Check collisions within same cell
  for (let i = 0; i < bodiesInCell.length; i++) {
    const bodyA = bodiesInCell[i];
    const posA = bodyA.getWorldPosition();
    
    for (let j = i + 1; j < bodiesInCell.length; j++) {
      const bodyB = bodiesInCell[j];
      
      // Create unique pair key to avoid duplicate checks
      const pairKey = bodyA < bodyB ? `${bodyA}-${bodyB}` : `${bodyB}-${bodyA}`;
      if (checkedPairs.has(pairKey)) continue;
      checkedPairs.add(pairKey);
      
      collisionChecks++;
      const skipReason = this.resolveCollision(bodyA, bodyB);
      // ... track skip reasons ...
    }
  }
  
  // Check collisions with neighboring cells (for bodies near cell boundaries)
  const [cellX, cellY] = cellKey.split(',').map(Number);
  const neighbors = [
    `${cellX - 1},${cellY - 1}`, `${cellX},${cellY - 1}`, `${cellX + 1},${cellY - 1}`,
    `${cellX - 1},${cellY}`,     /* current cell */        `${cellX + 1},${cellY}`,
    `${cellX - 1},${cellY + 1}`, `${cellX},${cellY + 1}`, `${cellX + 1},${cellY + 1}`
  ];
  
  for (const neighborKey of neighbors) {
    const neighborBodies = spatialGrid.get(neighborKey);
    if (!neighborBodies) continue;
    
    for (const bodyA of bodiesInCell) {
      for (const bodyB of neighborBodies) {
        if (bodyA === bodyB) continue;
        
        const pairKey = bodyA < bodyB ? `${bodyA}-${bodyB}` : `${bodyB}-${bodyA}`;
        if (checkedPairs.has(pairKey)) continue;
        checkedPairs.add(pairKey);
        
        // Quick distance check before expensive collision resolution
        const posA = bodyA.getWorldPosition();
        const posB = bodyB.getWorldPosition();
        const dx = posB.x - posA.x;
        const dy = posB.y - posA.y;
        const distSq = dx * dx + dy * dy;
        const minDist = bodyA.radius + bodyB.radius;
        
        if (distSq > (minDist * minDist)) {
          collisionSkips++;
          continue;
        }
        
        collisionChecks++;
        const skipReason = this.resolveCollision(bodyA, bodyB);
        // ... track skip reasons ...
      }
    }
  }
}
```

**3. Mark grid dirty when bodies change:**

```typescript
// In registerBody() - add after line 75:
this._spatialGridDirty = true;

// In unregisterBody() - add after line 82:
this._spatialGridDirty = true;
```

**4. Update performance logging:**

```typescript
// Update performance log (around line 233) to include grid time:
console.log(`[Performance] Step ${frameCount}: total=${totalTime.toFixed(2)}ms, ` +
  `gravity=${gravityTime.toFixed(2)}ms, integrate=${integrateTime.toFixed(2)}ms, ` +
  `constraints=${constraintTime.toFixed(2)}ms, ` +
  `grid=${gridTime.toFixed(2)}ms, ` +  // NEW
  `collisions=${collisionTime.toFixed(2)}ms (${collisionChecks} checks: ${collisionResolved} resolved, ...)`);
```

### How It Works

1. **Grid Creation**: Divide world into cells (100px × 100px by default)
2. **Body Assignment**: Each body is added to all cells it overlaps (based on radius)
3. **Collision Checking**: Only check collisions between bodies in same cell or adjacent cells
4. **Complexity**: O(n × k) where k = average bodies per cell (typically much less than n)

**Expected Speedup**: 
- 100 bodies: ~2-3x faster
- 500 bodies: ~5-10x faster  
- 1000+ bodies: ~10-20x faster

### How to Test

**1. Unit Test - Verify correctness:**

```typescript
// tests/spatial-grid.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { World, Body } from '../src/index.js';

describe('Spatial Grid Optimization', () => {
  let world: World;
  let container: HTMLElement;
  
  beforeEach(() => {
    container = document.createElement('div');
    container.style.width = '800px';
    container.style.height = '600px';
    document.body.appendChild(container);
    world = new World(container);
  });
  
  it('should only check collisions between nearby bodies', () => {
    // Create 100 bodies spread across world
    const bodies: Body[] = [];
    for (let i = 0; i < 100; i++) {
      const element = document.createElement('div');
      element.style.width = '20px';
      element.style.height = '20px';
      element.style.position = 'absolute';
      element.style.left = `${(i % 10) * 80}px`;
      element.style.top = `${Math.floor(i / 10) * 60}px`;
      container.appendChild(element);
      
      const body = new Body(element, world);
      world.registerBody(body);
      bodies.push(body);
    }
    
    world.start();
    
    // Wait a few frames
    return new Promise(resolve => {
      setTimeout(() => {
        // Enable performance logging
        (window as any).__enablePerfLogging = true;
        
        // Count collision checks over 60 frames
        let totalChecks = 0;
        const originalLog = console.log;
        console.log = (...args: any[]) => {
          const msg = args[0] as string;
          if (msg.includes('[Performance]')) {
            const match = msg.match(/collisions=.*?\((\d+) checks/);
            if (match) {
              totalChecks += parseInt(match[1]);
            }
          }
          originalLog(...args);
        };
        
        setTimeout(() => {
          console.log = originalLog;
          world.stop();
          
          // With spatial grid: should have ~10-20% of checks compared to O(n²)
          // Without grid: 100 bodies = ~5000 checks per frame
          // With grid: ~500-1000 checks per frame (only nearby pairs)
          const avgChecksPerFrame = totalChecks / 60;
          expect(avgChecksPerFrame).toBeLessThan(2000); // Much less than 5000
          
          resolve(undefined);
        }, 1000);
      }, 100);
    });
  });
  
  it('should produce same physics results as brute force', () => {
    // Create two test scenarios: with and without spatial grid
    // Run both and compare final positions
    // (This would require exposing a flag to disable spatial grid)
  });
});
```

**2. Performance Benchmark:**

```typescript
// tests/performance-spatial-grid.test.ts
describe('Spatial Grid Performance', () => {
  it('should be faster with many bodies', async () => {
    const container = document.createElement('div');
    container.style.width = '800px';
    container.style.height = '600px';
    document.body.appendChild(container);
    
    // Create 500 bodies
    const world = new World(container);
    for (let i = 0; i < 500; i++) {
      const element = document.createElement('div');
      element.style.width = '10px';
      element.style.height = '10px';
      element.style.position = 'absolute';
      element.style.left = `${Math.random() * 800}px`;
      element.style.top = `${Math.random() * 600}px`;
      container.appendChild(element);
      
      const body = new Body(element, world);
      world.registerBody(body);
    }
    
    world.start();
    
    // Measure frame time over 60 frames
    const frameTimes: number[] = [];
    const originalStep = (world as any).step.bind(world);
    (world as any).step = function() {
      const start = performance.now();
      originalStep();
      frameTimes.push(performance.now() - start);
    };
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    world.stop();
    
    const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    console.log(`Average frame time with spatial grid: ${avgFrameTime.toFixed(2)}ms`);
    
    // Should be under 16ms for 60fps
    expect(avgFrameTime).toBeLessThan(16);
  });
});
```

**3. Visual Test - Demo Page:**

```html
<!-- demo-package/demo-spatial-grid-test.html -->
<!DOCTYPE html>
<html>
<head>
  <title>Spatial Grid Performance Test</title>
</head>
<body>
  <div id="world" style="width: 800px; height: 600px; border: 1px solid #000;"></div>
  <div id="stats" style="position: fixed; top: 10px; right: 10px; background: white; padding: 10px;">
    <div>Bodies: <span id="bodyCount">0</span></div>
    <div>Collision Checks: <span id="collisionChecks">0</span></div>
    <div>Frame Time: <span id="frameTime">0</span>ms</div>
    <div>FPS: <span id="fps">0</span></div>
  </div>
  
  <script type="module">
    import { World, Body } from '../dist/index.js';
    
    const world = new World(document.getElementById('world'));
    let bodyCount = 0;
    
    // Add bodies on click
    document.getElementById('world').addEventListener('click', (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const element = document.createElement('div');
      element.style.width = '20px';
      element.style.height = '20px';
      element.style.background = 'red';
      element.style.borderRadius = '50%';
      element.style.position = 'absolute';
      element.style.left = `${x - 10}px`;
      element.style.top = `${y - 10}px`;
      document.getElementById('world').appendChild(element);
      
      const body = new Body(element, world);
      world.registerBody(body);
      bodyCount++;
      document.getElementById('bodyCount').textContent = bodyCount;
    });
    
    // Enable performance logging
    window.__enablePerfLogging = true;
    
    // Track stats
    let frameCount = 0;
    const originalLog = console.log;
    console.log = (...args) => {
      const msg = args[0];
      if (typeof msg === 'string' && msg.includes('[Performance]')) {
        const checksMatch = msg.match(/collisions=.*?\((\d+) checks/);
        const timeMatch = msg.match(/total=([\d.]+)ms/);
        if (checksMatch) {
          document.getElementById('collisionChecks').textContent = checksMatch[1];
        }
        if (timeMatch) {
          const frameTime = parseFloat(timeMatch[1]);
          document.getElementById('frameTime').textContent = frameTime.toFixed(2);
          document.getElementById('fps').textContent = (1000 / frameTime).toFixed(1);
        }
      }
      originalLog(...args);
    };
    
    world.start();
  </script>
</body>
</html>
```

---

## 2. Constraint Batching

### Current Problem
```typescript
// Current: Solve all constraints every iteration
// Lines 156-174 in World.ts
for (let i = 0; i < this.constraintIterations; i++) {
  // First pass: solve fixed constraints
  for (const constraint of this.constraints) {
    const fixedA = !constraint.bodyA || (constraint.bodyA && constraint.bodyA.isStatic);
    const fixedB = constraint.bodyB.isStatic;
    if (fixedA || fixedB) {
      constraint.solve(timeScale);
    }
  }
  
  // Second pass: solve free constraints
  for (const constraint of this.constraints) {
    const fixedA = !constraint.bodyA || (constraint.bodyA && constraint.bodyA.isStatic);
    const fixedB = constraint.bodyB.isStatic;
    if (!fixedA && !fixedB) {
      constraint.solve(timeScale);
    }
  }
}
```

**Issue**: Solving all constraints every frame, even when bodies are far apart and constraints are stable.

### Proposed Solution: Constraint Batching by Distance

#### What Changes Needed

**1. Add constraint distance tracking:**

```typescript
// Add to Constraint class (Constraint.ts, around line 26):
private _lastDistance: number = 0;
private _lastViolation: number = 0;
private _stableFrames: number = 0; // How many frames constraint has been stable

// Update solve() method to track stability:
solve(timeScale: number): void {
  // ... existing code to get worldA, worldB, currentLength ...
  
  // Track constraint state
  this._lastDistance = currentLength;
  this._lastViolation = Math.abs(difference);
  
  // If constraint is very stable (violation < 0.01 for 5+ frames), skip solving
  if (this._lastViolation < 0.01) {
    this._stableFrames++;
    if (this._stableFrames > 5) {
      // Skip solving this constraint - it's stable
      return;
    }
  } else {
    this._stableFrames = 0;
  }
  
  // ... rest of existing solve() code ...
}
```

**2. Add distance-based batching to World.ts:**

```typescript
// Add method to check if constraint bodies are far apart:
private _areConstraintBodiesDistant(constraint: Constraint, threshold: number): boolean {
  const worldA = constraint.getWorldPointA();
  const worldB = constraint.getWorldPointB();
  const dx = worldB.x - worldA.x;
  const dy = worldB.y - worldA.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  
  // If constraint length is much smaller than actual distance, bodies are stretched
  // If constraint length is much larger than actual distance, bodies are compressed
  // In both cases, if the difference is large, constraint is "distant"
  const lengthRatio = dist / constraint.length;
  
  // If bodies are far from their constraint length, they're "distant"
  return Math.abs(lengthRatio - 1.0) > threshold;
}

// Modify constraint solving loop (replace lines 156-174):
const constraintStart = performance.now();
Constraint.preSolveAll(this.bodies);

// Separate constraints into batches
const activeConstraints: Constraint[] = [];
const inactiveConstraints: Constraint[] = [];

for (const constraint of this.constraints) {
  // Skip constraints where bodies are very far apart (stretched/compressed)
  if (this._areConstraintBodiesDistant(constraint, 2.0)) {
    // Bodies are far from constraint length - skip solving
    inactiveConstraints.push(constraint);
    continue;
  }
  
  // Check if constraint is stable (from Constraint._stableFrames)
  if ((constraint as any)._stableFrames > 5) {
    inactiveConstraints.push(constraint);
    continue;
  }
  
  activeConstraints.push(constraint);
}

const timeScale = 1.0;

// Only solve active constraints
for (let i = 0; i < this.constraintIterations; i++) {
  // First pass: fixed constraints
  for (const constraint of activeConstraints) {
    const fixedA = !constraint.bodyA || (constraint.bodyA && constraint.bodyA.isStatic);
    const fixedB = constraint.bodyB.isStatic;
    if (fixedA || fixedB) {
      constraint.solve(timeScale);
    }
  }
  
  // Second pass: free constraints
  for (const constraint of activeConstraints) {
    const fixedA = !constraint.bodyA || (constraint.bodyA && constraint.bodyA.isStatic);
    const fixedB = constraint.bodyB.isStatic;
    if (!fixedA && !fixedB) {
      constraint.solve(timeScale);
    }
  }
}

Constraint.postSolveAll(this.bodies);
const constraintTime = performance.now() - constraintStart;

// Update performance logging to show active vs inactive:
if (typeof window !== 'undefined' && (window as any).__enablePerfLogging && totalTime > 16) {
  console.log(`[Performance] Constraints: ${activeConstraints.length} active, ${inactiveConstraints.length} inactive`);
}
```

**3. Add configuration option:**

```typescript
// Add to WorldConfig interface (around line 9):
export interface WorldConfig {
  // ... existing options ...
  constraintBatching?: boolean; // Enable distance-based batching (default: true)
  constraintStabilityThreshold?: number; // Frames before constraint considered stable (default: 5)
}

// Add to World constructor (around line 48):
this.constraintBatching = config.constraintBatching ?? true;
this.constraintStabilityThreshold = config.constraintStabilityThreshold ?? 5;
```

### How It Works

1. **Stability Tracking**: Each constraint tracks how many frames it's been stable (violation < threshold)
2. **Distance Check**: Skip constraints where bodies are far from their target length
3. **Selective Solving**: Only solve "active" constraints that need correction
4. **Result**: For cloth/soft bodies with many constraints, only solve the ones that actually need it

**Expected Speedup**:
- Cloth with 400 constraints: ~30-50% faster (only ~200 constraints need solving)
- Chain with 10 constraints: Minimal improvement (all constraints are usually active)
- Soft body at rest: ~60-70% faster (most constraints stable)

### How to Test

**1. Unit Test - Verify stability detection:**

```typescript
// tests/constraint-batching.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { World, Body, Constraint } from '../src/index.js';

describe('Constraint Batching', () => {
  let world: World;
  let container: HTMLElement;
  
  beforeEach(() => {
    container = document.createElement('div');
    container.style.width = '800px';
    container.style.height = '600px';
    document.body.appendChild(container);
    world = new World(container, { constraintBatching: true });
  });
  
  it('should skip stable constraints', async () => {
    // Create two bodies connected by constraint
    const element1 = document.createElement('div');
    element1.style.width = '20px';
    element1.style.height = '20px';
    element1.style.position = 'absolute';
    element1.style.left = '100px';
    element1.style.top = '100px';
    container.appendChild(element1);
    
    const element2 = document.createElement('div');
    element2.style.width = '20px';
    element2.style.height = '20px';
    element2.style.position = 'absolute';
    element2.style.left = '150px';
    element2.style.top = '100px';
    container.appendChild(element2);
    
    const body1 = new Body(element1, world);
    const body2 = new Body(element2, world);
    world.registerBody(body1);
    world.registerBody(body2);
    
    const constraint = new Constraint({
      bodyA: body1,
      bodyB: body2,
      length: 50,
      stiffness: 1.0
    });
    world.registerConstraint(constraint);
    
    world.start();
    
    // Wait for system to stabilize
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check that constraint has been marked as stable
    const stableFrames = (constraint as any)._stableFrames;
    expect(stableFrames).toBeGreaterThan(5);
    
    world.stop();
  });
  
  it('should solve active constraints when bodies move', async () => {
    // Create constraint, let it stabilize, then move one body
    // Verify constraint solving resumes
  });
});
```

**2. Performance Test - Cloth Demo:**

```typescript
// tests/constraint-batching-performance.test.ts
describe('Constraint Batching Performance', () => {
  it('should improve performance for large cloth', async () => {
    const container = document.createElement('div');
    container.style.width = '800px';
    container.style.height = '600px';
    document.body.appendChild(container);
    
    // Create cloth with batching enabled
    const worldWithBatching = new World(container, { constraintBatching: true });
    // ... create cloth using createCloth() ...
    
    // Create cloth with batching disabled
    const worldWithoutBatching = new World(container, { constraintBatching: false });
    // ... create cloth ...
    
    // Measure constraint solving time for both
    const timesWith: number[] = [];
    const timesWithout: number[] = [];
    
    // Hook into constraint solving
    // ... measure and compare ...
    
    const avgWith = timesWith.reduce((a, b) => a + b, 0) / timesWith.length;
    const avgWithout = timesWithout.reduce((a, b) => a + b, 0) / timesWithout.length;
    
    console.log(`With batching: ${avgWith.toFixed(2)}ms`);
    console.log(`Without batching: ${avgWithout.toFixed(2)}ms`);
    console.log(`Speedup: ${(avgWithout / avgWith).toFixed(2)}x`);
    
    expect(avgWith).toBeLessThan(avgWithout);
  });
});
```

**3. Visual Test - Cloth Demo with Stats:**

```html
<!-- Modify demo-package/demo-softbody.html to show constraint stats -->
<div id="constraintStats">
  <div>Total Constraints: <span id="totalConstraints">0</span></div>
  <div>Active Constraints: <span id="activeConstraints">0</span></div>
  <div>Inactive Constraints: <span id="inactiveConstraints">0</span></div>
  <div>Constraint Solve Time: <span id="constraintTime">0</span>ms</div>
</div>

<script>
  // Enable performance logging and parse constraint stats
  window.__enablePerfLogging = true;
  // ... parse and display stats ...
</script>
```

---

## 3. Adaptive Iteration Count

### Current Problem
```typescript
// Current: Fixed 2 iterations always
// Line 57 in World.ts
this.constraintIterations = 2; // Matter.js default is 2

// Lines 156-174: Always solve constraints 2 times
for (let i = 0; i < this.constraintIterations; i++) {
  // ... solve constraints ...
}
```

**Issue**: When system is stable (bodies at rest, constraints satisfied), we're still doing 2 full passes unnecessarily.

### Proposed Solution: Adaptive Iterations Based on System Energy

#### What Changes Needed

**1. Add energy/stability tracking to World:**

```typescript
// Add to World class properties (around line 42):
private _systemEnergy: number = 0;
private _previousEnergy: number = 0;
private _energyHistory: number[] = []; // Last 10 frames
private _adaptiveIterations: number = 2; // Current iteration count
private _minIterations: number = 1; // Minimum iterations (for stability)
private _maxIterations: number = 4; // Maximum iterations (for complex systems)

// Add method to calculate system energy:
private _calculateSystemEnergy(): number {
  let totalEnergy = 0;
  
  for (const body of this.bodies) {
    if (body.isStatic || !body.enabled) continue;
    
    // Kinetic energy: 0.5 * m * v²
    const vx = body.x - body.prevX;
    const vy = body.y - body.prevY;
    const vSq = vx * vx + vy * vy;
    const kinetic = 0.5 * body.mass * vSq;
    
    // Potential energy: m * g * h (height in world)
    const pos = body.getWorldPosition();
    const potential = body.mass * this.gravity * (this.bounds.height - pos.y);
    
    totalEnergy += kinetic + potential;
  }
  
  // Add constraint violation energy
  for (const constraint of this.constraints) {
    const worldA = constraint.getWorldPointA();
    const worldB = constraint.getWorldPointB();
    const dx = worldB.x - worldA.x;
    const dy = worldB.y - worldA.y;
    const currentLength = Math.sqrt(dx * dx + dy * dy);
    const violation = Math.abs(currentLength - constraint.length);
    
    // Violation energy: stiffness * violation²
    const violationEnergy = constraint.stiffness * violation * violation;
    totalEnergy += violationEnergy;
  }
  
  return totalEnergy;
}

// Add method to adjust iterations based on energy:
private _adjustConstraintIterations(): void {
  // Calculate current energy
  this._systemEnergy = this._calculateSystemEnergy();
  
  // Add to history (keep last 10 frames)
  this._energyHistory.push(this._systemEnergy);
  if (this._energyHistory.length > 10) {
    this._energyHistory.shift();
  }
  
  // Calculate energy change rate
  if (this._energyHistory.length >= 3) {
    const recent = this._energyHistory.slice(-3);
    const energyChange = Math.abs(recent[2] - recent[0]);
    const avgEnergy = recent.reduce((a, b) => a + b, 0) / recent.length;
    
    // If energy is very low and not changing much, system is stable
    const isStable = avgEnergy < 100 && energyChange < 10;
    
    // If energy is high or changing rapidly, system is active
    const isActive = avgEnergy > 1000 || energyChange > 100;
    
    // Adjust iterations
    if (isStable && this._adaptiveIterations > this._minIterations) {
      // System is stable - reduce iterations
      this._adaptiveIterations = Math.max(this._minIterations, this._adaptiveIterations - 0.1);
    } else if (isActive && this._adaptiveIterations < this._maxIterations) {
      // System is active - increase iterations
      this._adaptiveIterations = Math.min(this._maxIterations, this._adaptiveIterations + 0.2);
    }
    
    // Round to integer
    this._adaptiveIterations = Math.round(this._adaptiveIterations);
  }
  
  this._previousEnergy = this._systemEnergy;
}
```

**2. Modify constraint solving to use adaptive iterations:**

```typescript
// Replace constraint solving section (around line 151):
const constraintStart = performance.now();
Constraint.preSolveAll(this.bodies);

// Adjust iterations based on system state
this._adjustConstraintIterations();

// Use adaptive iteration count instead of fixed
const iterations = this._adaptiveIterations;
const timeScale = 1.0;

for (let i = 0; i < iterations; i++) {
  // ... existing constraint solving code ...
}

Constraint.postSolveAll(this.bodies);
const constraintTime = performance.now() - constraintStart;
```

**3. Add configuration:**

```typescript
// Add to WorldConfig:
export interface WorldConfig {
  // ... existing options ...
  adaptiveIterations?: boolean; // Enable adaptive iteration count (default: true)
  minIterations?: number; // Minimum constraint iterations (default: 1)
  maxIterations?: number; // Maximum constraint iterations (default: 4)
}

// Add to World constructor:
this.adaptiveIterations = config.adaptiveIterations ?? true;
this._minIterations = config.minIterations ?? 1;
this._maxIterations = config.maxIterations ?? 4;
this._adaptiveIterations = this.constraintIterations; // Start with default
```

**4. Update performance logging:**

```typescript
// Update performance log to show adaptive iterations:
console.log(`[Performance] Constraints: ${constraintTime.toFixed(2)}ms ` +
  `(${this.constraints.length} constraints, ${this._adaptiveIterations.toFixed(1)} iter)`);
```

### How It Works

1. **Energy Calculation**: Track total system energy (kinetic + potential + constraint violation)
2. **Stability Detection**: If energy is low and stable, reduce iterations
3. **Activity Detection**: If energy is high or changing rapidly, increase iterations
4. **Smooth Transitions**: Gradually adjust iterations to avoid jitter

**Expected Speedup**:
- System at rest: ~50% faster (1 iteration instead of 2)
- Active system: Same speed (2 iterations maintained)
- Complex system: Slightly slower but more stable (3-4 iterations when needed)

### How to Test

**1. Unit Test - Verify iteration adjustment:**

```typescript
// tests/adaptive-iterations.test.ts
describe('Adaptive Iterations', () => {
  it('should reduce iterations when system is stable', async () => {
    const world = new World(container, { adaptiveIterations: true });
    
    // Create simple pendulum
    const pendulum = new Body(ballElement, world);
    const constraint = new Constraint({
      bodyA: null,
      bodyB: pendulum,
      pointA: { x: 400, y: 100 },
      length: 0
    });
    world.registerConstraint(constraint);
    
    world.start();
    
    // Wait for pendulum to settle
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check that iterations have been reduced
    const iterations = (world as any)._adaptiveIterations;
    expect(iterations).toBeLessThanOrEqual(2); // Should reduce from initial 2
    
    world.stop();
  });
  
  it('should increase iterations when system is active', async () => {
    const world = new World(container, { adaptiveIterations: true, maxIterations: 4 });
    
    // Create complex cloth
    const { bodies, constraints } = createCloth(world, container, 100, 100, 20, 20, 5);
    
    world.start();
    
    // Apply force to cloth to make it active
    bodies[100].applyForce(1000, 1000);
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check that iterations have increased
    const iterations = (world as any)._adaptiveIterations;
    expect(iterations).toBeGreaterThanOrEqual(2); // Should increase for active system
    
    world.stop();
  });
});
```

**2. Performance Benchmark:**

```typescript
// tests/adaptive-iterations-performance.test.ts
describe('Adaptive Iterations Performance', () => {
  it('should be faster for stable systems', async () => {
    // Create two identical worlds: one with adaptive, one without
    const worldAdaptive = new World(container, { adaptiveIterations: true });
    const worldFixed = new World(container, { adaptiveIterations: false, constraintIterations: 2 });
    
    // Create same setup in both
    // ... create cloth ...
    
    // Let both stabilize
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Measure constraint solving time
    const timesAdaptive: number[] = [];
    const timesFixed: number[] = [];
    
    // Hook into step() and measure constraint time
    // ... collect data ...
    
    const avgAdaptive = timesAdaptive.reduce((a, b) => a + b, 0) / timesAdaptive.length;
    const avgFixed = timesFixed.reduce((a, b) => a + b, 0) / timesFixed.length;
    
    console.log(`Adaptive: ${avgAdaptive.toFixed(2)}ms`);
    console.log(`Fixed: ${avgFixed.toFixed(2)}ms`);
    
    // Adaptive should be faster for stable system
    expect(avgAdaptive).toBeLessThan(avgFixed);
  });
});
```

**3. Visual Test - Show iteration count:**

```html
<!-- Add to demo pages -->
<div id="adaptiveStats">
  <div>Constraint Iterations: <span id="iterations">2</span></div>
  <div>System Energy: <span id="energy">0</span></div>
  <div>Constraint Time: <span id="constraintTime">0</span>ms</div>
</div>

<script>
  // Monitor and display adaptive iterations
  setInterval(() => {
    const iterations = world._adaptiveIterations;
    const energy = world._systemEnergy;
    document.getElementById('iterations').textContent = iterations.toFixed(1);
    document.getElementById('energy').textContent = energy.toFixed(0);
  }, 100);
</script>
```

---

## 4. Offload Non-Critical Work with requestIdleCallback

### Current Problem
```typescript
// Current: Constraint network built every step (if dirty)
// Lines 179-181 in World.ts
const networkStart = performance.now();
this._getConstraintNetwork();
const networkTime = performance.now() - networkStart;
```

**Issue**: Building constraint network (BFS graph) happens every frame when constraints change, blocking main thread.

### Proposed Solution: Build Network in Idle Time

#### What Changes Needed

**1. Add idle callback support:**

```typescript
// Add to World class properties (around line 42):
private _idleCallbackId: number | null = null;
private _pendingNetworkRebuild: boolean = false;

// Modify _getConstraintNetwork() to schedule idle rebuild:
private _getConstraintNetwork(): Map<Body, Set<Body>> {
  // If cache exists and not dirty, return it
  if (!this._constraintNetworkDirty && this._constraintNetworkCache) {
    return this._constraintNetworkCache;
  }
  
  // If we have a cache, use it temporarily and schedule rebuild
  if (this._constraintNetworkCache && !this._pendingNetworkRebuild) {
    this._pendingNetworkRebuild = true;
    
    // Schedule rebuild in idle time
    if (typeof requestIdleCallback !== 'undefined') {
      if (this._idleCallbackId !== null) {
        cancelIdleCallback(this._idleCallbackId);
      }
      
      this._idleCallbackId = requestIdleCallback(() => {
        this._buildConstraintNetworkSync();
        this._pendingNetworkRebuild = false;
        this._idleCallbackId = null;
      }, { timeout: 100 }); // Timeout ensures it runs within 100ms
    } else {
      // Fallback: build immediately if requestIdleCallback not available
      this._buildConstraintNetworkSync();
      this._pendingNetworkRebuild = false;
    }
    
    // Return stale cache for now
    return this._constraintNetworkCache!;
  }
  
  // No cache exists - build immediately (first time)
  return this._buildConstraintNetworkSync();
}

// Extract network building to separate method:
private _buildConstraintNetworkSync(): Map<Body, Set<Body>> {
  const neighbors = new Map<Body, Set<Body>>();
  
  for (const constraint of this.constraints) {
    if (constraint.bodyA && constraint.bodyB) {
      if (!neighbors.has(constraint.bodyA)) {
        neighbors.set(constraint.bodyA, new Set());
      }
      if (!neighbors.has(constraint.bodyB)) {
        neighbors.set(constraint.bodyB, new Set());
      }
      neighbors.get(constraint.bodyA)!.add(constraint.bodyB);
      neighbors.get(constraint.bodyB)!.add(constraint.bodyA);
    }
  }
  
  this._constraintNetworkCache = neighbors;
  this._constraintNetworkDirty = false;
  return neighbors;
}
```

**2. Clean up idle callbacks:**

```typescript
// Add cleanup in stop() method (around line 108):
stop(): void {
  this.running = false;
  if (this.rafId !== null) {
    cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }
  
  // Cancel pending idle callback
  if (this._idleCallbackId !== null && typeof cancelIdleCallback !== 'undefined') {
    cancelIdleCallback(this._idleCallbackId);
    this._idleCallbackId = null;
  }
}
```

**3. Add TypeScript types for requestIdleCallback (if needed):**

```typescript
// Add to top of World.ts if types not available:
declare global {
  interface Window {
    requestIdleCallback?: (callback: (deadline: IdleDeadline) => void, options?: { timeout?: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  }
}

interface IdleDeadline {
  didTimeout: boolean;
  timeRemaining(): number;
}
```

**4. Add configuration:**

```typescript
// Add to WorldConfig:
export interface WorldConfig {
  // ... existing options ...
  useIdleCallback?: boolean; // Use requestIdleCallback for non-critical work (default: true)
}

// Add to World constructor:
this.useIdleCallback = config.useIdleCallback ?? true;
```

### How It Works

1. **Immediate Return**: When network is dirty, return stale cache immediately
2. **Idle Scheduling**: Schedule network rebuild during browser idle time
3. **Timeout Safety**: Use timeout to ensure rebuild happens within 100ms
4. **Fallback**: If `requestIdleCallback` unavailable, build immediately

**Expected Benefit**:
- Reduces frame time spikes when constraints change
- Network rebuild happens during idle periods
- Minimal impact on frame timing

### How to Test

**1. Unit Test - Verify idle callback usage:**

```typescript
// tests/idle-callback.test.ts
describe('Idle Callback Optimization', () => {
  it('should schedule network rebuild in idle time', async () => {
    const world = new World(container, { useIdleCallback: true });
    
    // Create constraints
    const body1 = new Body(element1, world);
    const body2 = new Body(element2, world);
    const constraint = new Constraint({ bodyA: body1, bodyB: body2, length: 50 });
    world.registerConstraint(constraint);
    
    // Mark network dirty
    (world as any)._constraintNetworkDirty = true;
    
    // Get network (should return stale cache and schedule rebuild)
    const network1 = (world as any)._getConstraintNetwork();
    expect(network1).toBeDefined();
    
    // Wait for idle callback
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Get network again (should have fresh cache)
    const network2 = (world as any)._getConstraintNetwork();
    expect((world as any)._constraintNetworkDirty).toBe(false);
  });
  
  it('should fallback to sync rebuild if requestIdleCallback unavailable', () => {
    // Mock: remove requestIdleCallback
    const original = window.requestIdleCallback;
    delete (window as any).requestIdleCallback;
    
    const world = new World(container, { useIdleCallback: true });
    // ... test that it builds synchronously ...
    
    window.requestIdleCallback = original;
  });
});
```

**2. Performance Test - Measure frame time consistency:**

```typescript
// tests/idle-callback-performance.test.ts
describe('Idle Callback Performance', () => {
  it('should reduce frame time spikes', async () => {
    const world = new World(container, { useIdleCallback: true });
    
    // Create many constraints
    const bodies: Body[] = [];
    for (let i = 0; i < 100; i++) {
      const element = document.createElement('div');
      // ... create element ...
      const body = new Body(element, world);
      world.registerBody(body);
      bodies.push(body);
    }
    
    // Add constraints (triggers network rebuild)
    for (let i = 0; i < bodies.length - 1; i++) {
      const constraint = new Constraint({
        bodyA: bodies[i],
        bodyB: bodies[i + 1],
        length: 50
      });
      world.registerConstraint(constraint);
    }
    
    world.start();
    
    // Measure frame times
    const frameTimes: number[] = [];
    const originalStep = (world as any).step.bind(world);
    (world as any).step = function() {
      const start = performance.now();
      originalStep();
      frameTimes.push(performance.now() - start);
    };
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    world.stop();
    
    // Calculate frame time variance (lower is better)
    const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    const variance = frameTimes.reduce((sum, time) => sum + Math.pow(time - avg, 2), 0) / frameTimes.length;
    const stdDev = Math.sqrt(variance);
    
    console.log(`Average frame time: ${avg.toFixed(2)}ms`);
    console.log(`Standard deviation: ${stdDev.toFixed(2)}ms`);
    
    // Frame times should be consistent (low variance)
    expect(stdDev).toBeLessThan(5); // Less than 5ms variance
  });
});
```

**3. Visual Test - Show network rebuild timing:**

```html
<!-- Add to demo pages -->
<div id="idleStats">
  <div>Network Rebuilds: <span id="rebuilds">0</span></div>
  <div>Last Rebuild Time: <span id="rebuildTime">0</span>ms</div>
  <div>Rebuild Method: <span id="rebuildMethod">sync</span></div>
</div>

<script>
  let rebuildCount = 0;
  const originalGetNetwork = world._getConstraintNetwork.bind(world);
  world._getConstraintNetwork = function() {
    const start = performance.now();
    const result = originalGetNetwork();
    const time = performance.now() - start;
    
    if (time > 0.1) { // Rebuild happened
      rebuildCount++;
      document.getElementById('rebuilds').textContent = rebuildCount;
      document.getElementById('rebuildTime').textContent = time.toFixed(2);
      document.getElementById('rebuildMethod').textContent = 
        (window.requestIdleCallback ? 'idle' : 'sync');
    }
    
    return result;
  };
</script>
```

---

## Summary: Testing Strategy

### 1. **Unit Tests** (Correctness)
- Verify optimizations don't break physics behavior
- Test edge cases (empty worlds, single bodies, etc.)
- Compare results with/without optimizations

### 2. **Performance Tests** (Speed)
- Benchmark with realistic scenarios (text demo, cloth demo)
- Measure frame times, collision checks, constraint solves
- Compare before/after metrics

### 3. **Visual Tests** (User Experience)
- Create demo pages with performance stats
- Let users interact and see real-time metrics
- Verify smooth 60fps with many bodies

### 4. **Integration Tests** (Compatibility)
- Test with all existing demos
- Verify no regressions
- Test with different body counts (10, 100, 500, 1000+)

### Performance Targets

- **Spatial Grid**: 5-10x faster collision detection for 500+ bodies
- **Constraint Batching**: 30-50% faster constraint solving for cloth
- **Adaptive Iterations**: 50% faster when system is stable
- **Idle Callback**: Reduce frame time spikes by 20-30%

### Implementation Order

1. **Spatial Grid** (biggest impact, most complex)
2. **Constraint Batching** (good impact, medium complexity)
3. **Adaptive Iterations** (moderate impact, low complexity)
4. **Idle Callback** (small impact, low complexity)
