/**
 * World - Physics simulation container
 * Matches original demo exactly
 */

import { Body } from './Body.js';
import { Constraint } from './Constraint.js';

export interface WorldConfig {
  gravity?: number;
  friction?: number;
  restitution?: number;
  timeStep?: number;
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  spatialGrid?: boolean; // Enable spatial grid optimization (default: true)
  spatialGridCellSize?: number; // Size of each grid cell in pixels (default: 100)
}

export class World {
  container: HTMLElement;
  bodies: Body[];
  constraints: Constraint[];
  
  gravity: number;
  friction: number;
  restitution: number;
  timeStep: number;
  constraintIterations: number; // Number of constraint solving passes
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  
  running: boolean;
  lastTime: number;
  accumulator: number;
  private rafId: number | null = null;
  
  // Cached constraint network for performance
  private _constraintNetworkCache: Map<Body, Set<Body>> | null = null;
  private _constraintNetworkDirty: boolean = true;
  
  // Spatial grid for collision optimization
  private _spatialGrid: Map<string, Body[]> | null = null;
  private _spatialGridDirty: boolean = true;
  private _spatialGridEnabled: boolean;
  private _spatialGridCellSize: number;
  
  // Body tracking for incremental grid updates
  private _bodyCellMap: WeakMap<Body, Set<string>> = new WeakMap(); // Track which cells each body is in
  private _bodyIdMap: WeakMap<Body, number> = new WeakMap(); // Unique ID for each body (for pair deduplication)
  private _nextBodyId: number = 0;

  constructor(container: HTMLElement, config: WorldConfig = {}) {
    this.container = container;
    this.bodies = [];
    this.constraints = [];
    
    this.gravity = config.gravity !== undefined ? config.gravity : 980;
    this.friction = config.friction !== undefined ? config.friction : 0.99;
    this.restitution = config.restitution !== undefined ? config.restitution : 0.8;
    this.timeStep = config.timeStep ?? 1/60;
    this.constraintIterations = 2; // Matter.js default is 2, increase for longer chains
    
    // Spatial grid configuration
    this._spatialGridEnabled = config.spatialGrid !== undefined ? config.spatialGrid : true;
    this._spatialGridCellSize = config.spatialGridCellSize ?? 100;
    
    const rect = container.getBoundingClientRect();
    this.bounds = config.bounds || {
      x: 0,
      y: 0,
      width: rect.width,
      height: rect.height
    };
    
    this.running = false;
    this.lastTime = 0;
    this.accumulator = 0;
  }
  
  registerBody(body: Body): void {
    if (!this.bodies.includes(body)) {
      this.bodies.push(body);
      // Assign unique ID for pair deduplication
      this._bodyIdMap.set(body, this._nextBodyId++);
      this._spatialGridDirty = true; // Mark grid dirty when bodies change
    }
  }
  
  unregisterBody(body: Body): void {
    const index = this.bodies.indexOf(body);
    if (index !== -1) {
      this.bodies.splice(index, 1);
      // Clean up body tracking
      this._bodyCellMap.delete(body);
      this._bodyIdMap.delete(body);
      this._spatialGridDirty = true; // Mark grid dirty when bodies change
    }
  }
  
  registerConstraint(constraint: Constraint): void {
    if (!this.constraints.includes(constraint)) {
      this.constraints.push(constraint);
      this._constraintNetworkDirty = true; // Invalidate cache
    }
  }
  
  removeConstraint(constraint: Constraint): void {
    const index = this.constraints.indexOf(constraint);
    if (index !== -1) {
      this.constraints.splice(index, 1);
      this._constraintNetworkDirty = true; // Invalidate cache
    }
  }
  
  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.loop(this.lastTime);
  }
  
  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
  
  private loop = (time: number): void => {
    if (!this.running) return;
    
    const deltaTime = time - this.lastTime;
    this.lastTime = time;
    this.accumulator += deltaTime;
    
    while (this.accumulator >= this.timeStep * 1000) {
      this.step();
      this.accumulator -= this.timeStep * 1000;
    }
    
    for (const body of this.bodies) {
      body.render();
    }
    
    this.rafId = requestAnimationFrame(this.loop);
  };
  
  private step(): void {
    const perfStart = performance.now();
    
    // Apply gravity to all bodies (like Matter.js)
    const gravityStart = performance.now();
    this._bodiesApplyGravity();
    const gravityTime = performance.now() - gravityStart;
    
    // Integrate
    const integrateStart = performance.now();
    for (const body of this.bodies) {
      body.integrate(this.timeStep, this);
    }
    const integrateTime = performance.now() - integrateStart;
    
    // Solve constraints (like Matter.js - solve fixed constraints first, then free)
    const constraintStart = performance.now();
    Constraint.preSolveAll(this.bodies);
    const timeScale = 1.0; // Normalized time scale
    
    // Matter.js solves constraints in multiple iterations
    for (let i = 0; i < this.constraintIterations; i++) {
      // First pass: solve fixed constraints (bodyA is null or static, or bodyB is static)
      for (const constraint of this.constraints) {
        const fixedA = !constraint.bodyA || (constraint.bodyA && constraint.bodyA.isStatic);
        const fixedB = constraint.bodyB.isStatic;
        if (fixedA || fixedB) {
          constraint.solve(timeScale);
        }
      }
      
      // Second pass: solve free constraints (both bodies are dynamic)
      for (const constraint of this.constraints) {
        const fixedA = !constraint.bodyA || (constraint.bodyA && constraint.bodyA.isStatic);
        const fixedB = constraint.bodyB.isStatic;
        if (!fixedA && !fixedB) {
          constraint.solve(timeScale);
        }
      }
    }
    Constraint.postSolveAll(this.bodies);
    const constraintTime = performance.now() - constraintStart;
    
    // Build constraint network cache once per step (before collision checks)
    const networkStart = performance.now();
    this._getConstraintNetwork();
    const networkTime = performance.now() - networkStart;
    
    // Collisions - use spatial grid optimization if enabled
    const collisionStart = performance.now();
    let collisionChecks = 0;
    let collisionSkips = 0;
    let collisionDirectSkips = 0;
    let collisionSoftBodySkips = 0;
    let collisionBfsSkips = 0;
    let collisionResolved = 0;
    
    if (this._spatialGridEnabled) {
      // Spatial grid collision detection with incremental updates
      const gridStart = performance.now();
      const spatialGrid = this._buildSpatialGrid();
      const gridTime = performance.now() - gridStart;
      
      // Track which pairs we've already checked (avoid duplicate checks)
      const checkedPairs = new Set<string>();
      
      // Maximum collision distance for early culling
      const maxCollisionDist = this._spatialGridCellSize * 2; // Check up to 2 cells away
      const maxCollisionDistSq = maxCollisionDist * maxCollisionDist;
      
      // Iterate through grid cells
      for (const [cellKey, bodiesInCell] of spatialGrid.entries()) {
        // Skip empty cells
        if (bodiesInCell.length === 0) continue;
        
        // Check collisions within same cell
        for (let i = 0; i < bodiesInCell.length; i++) {
          const bodyA = bodiesInCell[i];
          
          for (let j = i + 1; j < bodiesInCell.length; j++) {
            const bodyB = bodiesInCell[j];
            
            // Create unique pair key using proper ID system
            const pairKey = this._getPairKey(bodyA, bodyB);
            if (checkedPairs.has(pairKey)) continue;
            checkedPairs.add(pairKey);
            
            collisionChecks++;
            const skipReason = this.resolveCollision(bodyA, bodyB);
            if (skipReason === 'direct') collisionDirectSkips++;
            else if (skipReason === 'softbody') collisionSoftBodySkips++;
            else if (skipReason === 'bfs') collisionBfsSkips++;
            else if (skipReason === 'resolved') collisionResolved++;
            else collisionSkips++;
          }
        }
        
        // Check collisions with neighboring cells (for bodies near cell boundaries)
        // Only check 4 neighbors (not 8) to reduce duplicate checks - each pair will be checked once
        const [cellX, cellY] = cellKey.split(',').map(Number);
        const neighbors = [
          `${cellX + 1},${cellY}`,     // Right
          `${cellX},${cellY + 1}`,     // Bottom
          `${cellX + 1},${cellY + 1}`, // Bottom-right
          `${cellX - 1},${cellY + 1}`  // Bottom-left (only check this to avoid duplicates)
        ];
        
        for (const neighborKey of neighbors) {
          const neighborBodies = spatialGrid.get(neighborKey);
          if (!neighborBodies || neighborBodies.length === 0) continue;
          
          // Early distance culling: check if cells are too far apart
          const [neighborX, neighborY] = neighborKey.split(',').map(Number);
          const cellDistSq = (neighborX - cellX) ** 2 + (neighborY - cellY) ** 2;
          // Skip if cells are more than 2 cells apart (bodies can't collide)
          if (cellDistSq > 4) continue;
          
          for (const bodyA of bodiesInCell) {
            for (const bodyB of neighborBodies) {
              if (bodyA === bodyB) continue;
              
              const pairKey = this._getPairKey(bodyA, bodyB);
              if (checkedPairs.has(pairKey)) continue;
              checkedPairs.add(pairKey);
              
              // Quick distance check before expensive collision resolution
              const posA = bodyA.getWorldPosition();
              const posB = bodyB.getWorldPosition();
              const dx = posB.x - posA.x;
              const dy = posB.y - posA.y;
              const distSq = dx * dx + dy * dy;
              
              // Early exit: too far apart
              if (distSq > maxCollisionDistSq) {
                collisionSkips++;
                continue;
              }
              
              const minDist = bodyA.radius + bodyB.radius;
              if (distSq > (minDist * minDist)) {
                collisionSkips++;
                continue;
              }
              
              collisionChecks++;
              const skipReason = this.resolveCollision(bodyA, bodyB);
              if (skipReason === 'direct') collisionDirectSkips++;
              else if (skipReason === 'softbody') collisionSoftBodySkips++;
              else if (skipReason === 'bfs') collisionBfsSkips++;
              else if (skipReason === 'resolved') collisionResolved++;
              else collisionSkips++;
            }
          }
        }
      }
      
      // Mark grid for incremental update next frame (bodies may have moved)
      // Don't mark as fully dirty - incremental update will handle it
      // Only mark dirty if bodies were added/removed (handled in registerBody/unregisterBody)
    } else {
      // Fallback to original O(n²) collision detection (for comparison/testing)
      const maxCollisionDist = 100; // Only check collisions within 100px
      const maxCollisionDistSq = maxCollisionDist * maxCollisionDist;
      
      for (let i = 0; i < this.bodies.length; i++) {
        const bodyA = this.bodies[i];
        const posA = bodyA.getWorldPosition();
        
        for (let j = i + 1; j < this.bodies.length; j++) {
          const bodyB = this.bodies[j];
          
          // Quick distance check - skip if too far apart
          const posB = bodyB.getWorldPosition();
          const dx = posB.x - posA.x;
          const dy = posB.y - posA.y;
          const distSq = dx * dx + dy * dy;
          
          // Skip collision check if bodies are too far apart
          if (distSq > maxCollisionDistSq) {
            collisionSkips++;
            continue;
          }
          
          collisionChecks++;
          const skipReason = this.resolveCollision(bodyA, bodyB);
          if (skipReason === 'direct') collisionDirectSkips++;
          else if (skipReason === 'softbody') collisionSoftBodySkips++;
          else if (skipReason === 'bfs') collisionBfsSkips++;
          else if (skipReason === 'resolved') collisionResolved++;
          else collisionSkips++;
        }
      }
    }
    const collisionTime = performance.now() - collisionStart;
    
    const totalTime = performance.now() - perfStart;
    
    // Store performance stats for external access
    if (typeof window !== 'undefined') {
      (window as any).__domPhysicsStats = {
        totalTime,
        gravityTime,
        integrateTime,
        constraintTime,
        networkTime,
        collisionTime,
        collisionChecks,
        collisionResolved,
        collisionDirectSkips,
        collisionSoftBodySkips,
        collisionBfsSkips,
        collisionSkips,
        spatialGridEnabled: this._spatialGridEnabled,
        bodyCount: this.bodies.length,
        constraintCount: this.constraints.length
      };
    }
    
    // Log performance only if explicitly enabled and step takes > 16ms (performance issue)
    if (typeof window !== 'undefined' && (window as any).__enablePerfLogging && totalTime > 16) {
      const frameCount = (window as any).__perfFrameCount || 0;
      (window as any).__perfFrameCount = frameCount + 1;
      
      const gridInfo = this._spatialGridEnabled ? ' (spatial grid enabled)' : ' (spatial grid disabled)';
      console.log(`[Performance] Step ${frameCount}: total=${totalTime.toFixed(2)}ms, ` +
        `gravity=${gravityTime.toFixed(2)}ms, integrate=${integrateTime.toFixed(2)}ms, ` +
        `constraints=${constraintTime.toFixed(2)}ms (${this.constraints.length} constraints, ${this.constraintIterations} iter), ` +
        `network=${networkTime.toFixed(2)}ms, ` +
        `collisions=${collisionTime.toFixed(2)}ms${gridInfo} (${collisionChecks} checks: ${collisionResolved} resolved, ` +
        `${collisionDirectSkips} direct-skip, ${collisionSoftBodySkips} softbody-skip, ${collisionBfsSkips} bfs-skip, ${collisionSkips} other-skip)`);
    }
    
    // DEBUG: Track energy in chain links (log every 60 frames = ~1 second)
    if (typeof window !== 'undefined' && (window as any).__debugPendulum) {
      const frameCount = (window as any).__pendulumFrameCount || 0;
      (window as any).__pendulumFrameCount = frameCount + 1;
      
      if (frameCount % 60 === 0) {
        const chainBodies = this.bodies.filter(b => !b.isStatic && b.mass < 1); // Chain links are small mass
        if (chainBodies.length > 0) {
          let totalEnergy = 0;
          let maxVel = 0;
          chainBodies.forEach(body => {
            const vx = body.x - body.prevX;
            const vy = body.y - body.prevY;
            const vel = Math.sqrt(vx * vx + vy * vy);
            const kinetic = 0.5 * body.mass * vel * vel;
            totalEnergy += kinetic;
            maxVel = Math.max(maxVel, vel);
          });
          console.log(`[Pendulum] Frame ${frameCount}: bodies=${chainBodies.length}, totalKE=${totalEnergy.toFixed(2)}, maxVel=${maxVel.toFixed(2)}`);
        }
      }
    }
    
    // Bounds
    for (const body of this.bodies) {
      this.constrainToBounds(body);
    }
  }
  
  /**
   * Get cell key from world position for spatial grid
   */
  private _getCellKey(x: number, y: number): string {
    const cellX = Math.floor(x / this._spatialGridCellSize);
    const cellY = Math.floor(y / this._spatialGridCellSize);
    return `${cellX},${cellY}`;
  }
  
  /**
   * Get all cells that a body overlaps (for bodies that span multiple cells)
   */
  private _getBodyCells(body: Body): string[] {
    const pos = body.getWorldPosition();
    const radius = body.radius;
    
    const minX = Math.floor((pos.x - radius) / this._spatialGridCellSize);
    const maxX = Math.floor((pos.x + radius) / this._spatialGridCellSize);
    const minY = Math.floor((pos.y - radius) / this._spatialGridCellSize);
    const maxY = Math.floor((pos.y + radius) / this._spatialGridCellSize);
    
    const cells: string[] = [];
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        cells.push(`${x},${y}`);
      }
    }
    return cells;
  }
  
  /**
   * Generate unique pair key for two bodies (for deduplication)
   */
  private _getPairKey(bodyA: Body, bodyB: Body): string {
    const idA = this._bodyIdMap.get(bodyA) ?? 0;
    const idB = this._bodyIdMap.get(bodyB) ?? 0;
    // Always use smaller ID first for consistent ordering
    return idA < idB ? `${idA}-${idB}` : `${idB}-${idA}`;
  }
  
  /**
   * Build spatial grid for collision optimization
   * Uses incremental updates when possible - only rebuilds cells for bodies that moved
   */
  private _buildSpatialGrid(): Map<string, Body[]> {
    if (!this._spatialGridEnabled) {
      return new Map(); // Return empty map if disabled
    }
    
    // If grid doesn't exist or is completely dirty, do full rebuild
    if (!this._spatialGrid || this._spatialGridDirty) {
      const grid = new Map<string, Body[]>();
      
      // Include ALL bodies in grid (both static and dynamic)
      // Static bodies act as collision boundaries even though they don't move
      for (const body of this.bodies) {
        if (!body.enabled) continue; // Only skip disabled bodies
        
        const cells = this._getBodyCells(body);
        const cellSet = new Set<string>(cells);
        this._bodyCellMap.set(body, cellSet);
        
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
    
    // Incremental update: only update cells for bodies that moved
    // Static bodies don't move, so they don't need updates (but they stay in grid)
    const grid = this._spatialGrid;
    
    for (const body of this.bodies) {
      if (!body.enabled) continue; // Skip disabled bodies
      
      // Static bodies don't move, so skip incremental updates for them
      // They're already in the grid from the initial build
      if (body.isStatic) continue;
      
      const oldCells = this._bodyCellMap.get(body);
      const newCells = this._getBodyCells(body);
      const newCellSet = new Set<string>(newCells);
      
      // Check if body moved significantly (quick heuristic: compare cell sets)
      const cellsChanged = !oldCells || 
        oldCells.size !== newCellSet.size ||
        ![...newCellSet].every(cell => oldCells.has(cell));
      
      if (cellsChanged) {
        // Remove body from old cells
        if (oldCells) {
          for (const oldCellKey of oldCells) {
            const cellBodies = grid.get(oldCellKey);
            if (cellBodies) {
              const index = cellBodies.indexOf(body);
              if (index !== -1) {
                cellBodies.splice(index, 1);
                // Remove empty cells
                if (cellBodies.length === 0) {
                  grid.delete(oldCellKey);
                }
              }
            }
          }
        }
        
        // Add body to new cells
        for (const cellKey of newCells) {
          if (!grid.has(cellKey)) {
            grid.set(cellKey, []);
          }
          grid.get(cellKey)!.push(body);
        }
        
        this._bodyCellMap.set(body, newCellSet);
      }
    }
    
    return grid;
  }
  
  /**
   * Applies gravitational force to all bodies (Matter.js exact style)
   * Matter.js: body.force.y += body.mass * gravity.y * gravityScale
   * We use: body.fy += body.mass * gravity (since our gravity is already scaled)
   */
  /**
   * Build or get cached constraint network adjacency list
   * This is expensive, so we cache it and only rebuild when constraints change
   */
  private _getConstraintNetwork(): Map<Body, Set<Body>> {
    if (!this._constraintNetworkDirty && this._constraintNetworkCache) {
      return this._constraintNetworkCache;
    }
    
    // Build adjacency list from constraints
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
  
  /**
   * Check if two bodies are in the same constraint network (connected directly or indirectly)
   * Uses cached adjacency list and BFS to find if there's a path between the bodies
   */
  private _areBodiesInSameConstraintNetwork(a: Body, b: Body): boolean {
    // If they're the same body, they're in the same network
    if (a === b) return true;
    
    const neighbors = this._getConstraintNetwork();
    
    // If either body has no constraints, they're not in a network together
    if (!neighbors.has(a) || !neighbors.has(b)) {
      return false;
    }
    
    // Quick check: are they directly connected?
    if (neighbors.get(a)!.has(b)) {
      return true;
    }
    
    // BFS to find path from a to b
    const visited = new Set<Body>();
    const queue: Body[] = [a];
    visited.add(a);
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === b) {
        return true; // Found path!
      }
      
      const currentNeighbors = neighbors.get(current);
      if (currentNeighbors) {
        for (const neighbor of currentNeighbors) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
    }
    
    return false; // No path found
  }
  
  private _bodiesApplyGravity(): void {
    if (this.gravity === 0) return;
    
    for (const body of this.bodies) {
      if (body.isStatic || !body.enabled || body.isDragged) continue;
      
      // Matter.js exact formula: body.force.y += body.mass * gravity.y * gravityScale
      // Since our gravity is a single value (y direction), we apply it as:
      body.fy += body.mass * this.gravity;
    }
  }
  
  private resolveCollision(a: Body, b: Body): string | null {
    // Skip collision resolution if either body is being dragged
    if (a.isDragged || b.isDragged) return 'dragged';
    
    const posA = a.getWorldPosition();
    const posB = b.getWorldPosition();
    
    const dx = posB.x - posA.x;
    const dy = posB.y - posA.y;
    const distSq = dx * dx + dy * dy;
    const minDist = a.radius + b.radius;
    const minDistSq = minDist * minDist;
    
    // Check for fast-moving objects that might pass through
    // Calculate relative velocity to see if we need continuous collision detection
    const aVx = (a.x - a.prevX);
    const aVy = (a.y - a.prevY);
    const bVx = (b.x - b.prevX);
    const bVy = (b.y - b.prevY);
    const relVx = bVx - aVx;
    const relVy = bVy - aVy;
    const relVelSq = relVx * relVx + relVy * relVy;
    const relVel = Math.sqrt(relVelSq);
    
    // Expand collision detection area for fast-moving objects
    // Use multiple "detection radii" - smaller base, but expand for fast objects
    let effectiveMinDist = minDist;
    if (relVel > 5) { // Fast relative motion (>5 pixels/frame)
      // Expand detection radius based on speed
      // More aggressive expansion for faster objects
      const expansion = relVel * 0.8; // Expand by 80% of relative speed
      effectiveMinDist = minDist + expansion;
      
      // DEBUG: Log fast collision detection
      if (typeof window !== 'undefined' && (window as any).__debugStack) {
        console.log(`[Stack] Fast collision: relVel=${relVel.toFixed(2)}, baseDist=${minDist.toFixed(2)}, expandedDist=${effectiveMinDist.toFixed(2)}`);
      }
    }
    
    const expandedMinDistSq = effectiveMinDist * effectiveMinDist;
    
    // DEBUG: Log block collisions
    if (typeof window !== 'undefined' && (window as any).__debugStack) {
      const dist = Math.sqrt(distSq);
      const overlap = minDist - dist;
      const relVel = Math.sqrt(relVelSq);
      if (overlap > 0 || dist < minDist * 1.2 || relVel > 5) { // Log when close, overlapping, or fast-moving
        console.log(`[Stack] Collision check: dist=${dist.toFixed(2)}, minDist=${minDist.toFixed(2)}, overlap=${overlap.toFixed(2)}, ` +
          `relVel=${relVel.toFixed(2)}, a.radius=${a.radius.toFixed(2)}, b.radius=${b.radius.toFixed(2)}, ` +
          `a.pos=(${posA.x.toFixed(1)}, ${posA.y.toFixed(1)}), b.pos=(${posB.x.toFixed(1)}, ${posB.y.toFixed(1)})`);
      }
    }
    
    // Early exit: too far apart (using expanded distance for fast objects)
    if (distSq >= expandedMinDistSq || distSq === 0) return 'too-far';
    
    // Fast path: If both bodies have constraints, they're likely in a soft body
    // Matter.js skips collisions between soft body particles - constraints handle their relationships
    const aHasConstraints = this._constraintNetworkCache?.has(a);
    const bHasConstraints = this._constraintNetworkCache?.has(b);
    
    if (aHasConstraints && bHasConstraints) {
      // Quick check: are they directly connected?
      const aNeighbors = this._constraintNetworkCache!.get(a);
      if (aNeighbors?.has(b)) {
        return 'direct'; // Directly connected - skip collision (constraints handle it)
      }
      
      // For soft bodies: if particles are close together (within 3x radius), skip collision
      // This avoids expensive BFS for most soft body cases
      const maxSoftBodyDist = Math.max(a.radius, b.radius) * 3;
      if (distSq < maxSoftBodyDist * maxSoftBodyDist) {
        // They're close - likely in same soft body, skip collision
        return 'softbody';
      }
      
      // Only do full BFS if they're far apart but both have constraints
      // This catches edge cases but is rare
      if (this._areBodiesInSameConstraintNetwork(a, b)) {
        return 'bfs';
      }
    }
    
    const dist = Math.sqrt(distSq);
    
    const nx = dx / dist;
    const ny = dy / dist;
    // Use base minDist for overlap calculation (not expanded) to prevent floating
    // The expansion is only for detection, not for correction
    const overlap = minDist - dist;
    
    // For vertical stacking, allow small overlap without correction (settling zone)
    // This prevents oscillation when blocks are trying to settle
    if (Math.abs(ny) > 0.9 && overlap < 1.0) {
      // Blocks are stacking vertically with small overlap - check if they're settling
      // Use velocities already calculated above
      const relVel = Math.sqrt(relVx * relVx + relVy * relVy);
      
      // If relative velocity is very small, allow small overlap (blocks are settling)
      if (relVel < 0.5) {
        // DEBUG: Log settling
        if (typeof window !== 'undefined' && (window as any).__debugStack) {
          console.log(`[Stack] Allowing settling: overlap=${overlap.toFixed(2)}, relVel=${relVel.toFixed(2)}`);
        }
        // Don't correct - blocks are settling into position
        return 'settling';
      }
    }
    
    // DEBUG: Log overlap resolution
    if (typeof window !== 'undefined' && (window as any).__debugStack) {
      console.log(`[Stack] Resolving overlap: overlap=${overlap.toFixed(2)}, normal=(${nx.toFixed(2)}, ${ny.toFixed(2)}), ` +
        `a.mass=${a.mass.toFixed(2)}, b.mass=${b.mass.toFixed(2)}`);
    }
    
    // Don't use separation factor - it causes floating
    // Just resolve the overlap directly
    const totalMass = a.mass + b.mass;
    const aRatio = b.mass / totalMass;
    const bRatio = a.mass / totalMass;
    
    // Prevent excessive upward movement - if collision normal points up significantly,
    // reduce the vertical component to prevent floating
    let adjustedNY = ny;
    let adjustedNX = nx;
    
    // For vertical stacking (collision normal mostly vertical), minimize horizontal corrections
    // This prevents blocks from exploding outward when stacking
    if (Math.abs(ny) > 0.9) { // Very vertical collision (stacking scenario)
      adjustedNX = 0; // Completely eliminate horizontal push for perfect vertical stacking
      if (ny > 0.9) { // Block on top (normal pointing down)
        // For blocks stacking, don't push them apart horizontally at all
        adjustedNY = ny; // Keep full vertical correction
      } else if (ny < -0.9) { // Block below (normal pointing up)
        adjustedNY = ny * 0.2; // Very small upward push to prevent floating
      }
      
      // DEBUG: Log vertical stacking adjustment
      if (typeof window !== 'undefined' && (window as any).__debugStack) {
        console.log(`[Stack] Vertical stacking: ny=${ny.toFixed(2)}, nx eliminated, adjustedNY=${adjustedNY.toFixed(2)}`);
      }
    } else if (Math.abs(ny) > 0.7) { // Mostly vertical but not perfect
      adjustedNX = nx * 0.05; // Almost eliminate horizontal push
      if (ny < -0.3) { // Collision normal pointing upward
        adjustedNY = ny * 0.3; // Dampen upward component
      }
    } else if (ny < -0.3) { // Collision normal pointing upward (but not vertical)
      // Reduce upward push - prefer horizontal separation
      adjustedNY = ny * 0.3; // Dampen upward component
      
      // DEBUG: Log upward collision adjustment
      if (typeof window !== 'undefined' && (window as any).__debugStack) {
        console.log(`[Stack] Upward collision detected: ny=${ny.toFixed(2)} -> adjustedNY=${adjustedNY.toFixed(2)}`);
      }
    }
    
    // For horizontal collisions (mostly side-to-side), reduce horizontal bounce
    // This prevents blocks from sliding apart horizontally when stacking
    if (Math.abs(ny) < 0.5) { // Mostly horizontal collision
      adjustedNX = nx * 0.3; // Reduce horizontal push to prevent sliding
      
      // DEBUG: Log horizontal collision adjustment
      if (typeof window !== 'undefined' && (window as any).__debugStack) {
        console.log(`[Stack] Horizontal collision detected: nx=${nx.toFixed(2)} -> adjustedNX=${adjustedNX.toFixed(2)}`);
      }
    }
    
    // For vertical stacking, dampen corrections to prevent oscillation
    let correctionDamping = 1.0;
    if (Math.abs(ny) > 0.9) {
      // Reduce correction strength for vertical stacking to prevent oscillation
      correctionDamping = 0.5; // Only apply 50% of correction
    }
    
    const correctionAX = adjustedNX * overlap * aRatio * correctionDamping;
    const correctionAY = adjustedNY * overlap * aRatio * correctionDamping;
    const correctionBX = adjustedNX * overlap * bRatio * correctionDamping;
    const correctionBY = adjustedNY * overlap * bRatio * correctionDamping;
    
    if (!a.isStatic && !a.isDragged) {
      a.x -= correctionAX;
      a.y -= correctionAY;
      
      // DEBUG: Log position correction
      if (typeof window !== 'undefined' && (window as any).__debugStack) {
        console.log(`[Stack] Body A corrected: by (${correctionAX.toFixed(2)}, ${correctionAY.toFixed(2)}), ` +
          `new pos=(${a.getWorldPosition().x.toFixed(1)}, ${a.getWorldPosition().y.toFixed(1)})`);
      }
    }
    if (!b.isStatic && !b.isDragged) {
      b.x += correctionBX;
      b.y += correctionBY;
      
      // DEBUG: Log position correction
      if (typeof window !== 'undefined' && (window as any).__debugStack) {
        console.log(`[Stack] Body B corrected: by (${correctionBX.toFixed(2)}, ${correctionBY.toFixed(2)}), ` +
          `new pos=(${b.getWorldPosition().x.toFixed(1)}, ${b.getWorldPosition().y.toFixed(1)})`);
      }
    }
    
    // Calculate relative velocity along collision normal (velocities already calculated above)
    const relVelAlongNormal = relVx * nx + relVy * ny;
    
    // For vertical stacking, apply strong static friction - match velocities completely
    if (Math.abs(ny) > 0.9) {
      // Blocks are stacking vertically - apply strong friction to prevent sliding
      // Match both horizontal AND vertical velocities to create "sticky" stacking
      const avgVx = (aVx + bVx) / 2;
      const avgVy = (aVy + bVy) / 2;
      
      // Strong friction: move velocities 90% towards average (almost perfect matching)
      const frictionStrength = 0.9;
      
      if (!a.isStatic && !a.isDragged) {
        const newAVx = aVx + (avgVx - aVx) * frictionStrength;
        const newAVy = aVy + (avgVy - aVy) * frictionStrength;
        a.prevX = a.x - newAVx;
        a.prevY = a.y - newAVy;
      }
      if (!b.isStatic && !b.isDragged) {
        const newBVx = bVx + (avgVx - bVx) * frictionStrength;
        const newBVy = bVy + (avgVy - bVy) * frictionStrength;
        b.prevX = b.x - newBVx;
        b.prevY = b.y - newBVy;
      }
      
      // DEBUG: Log friction application
      if (typeof window !== 'undefined' && (window as any).__debugStack) {
        console.log(`[Stack] Applied strong friction: avgVx=${avgVx.toFixed(2)}, avgVy=${avgVy.toFixed(2)}`);
      }
    }
    
    // Only apply restitution if bodies are moving towards each other
    // and relative velocity is significant (prevents micro-bounces)
    const minRelativeVelocity = 0.5; // pixels per frame
    if (relVelAlongNormal > -minRelativeVelocity) {
      // Bodies are separating or moving slowly - don't add energy
      // Just resolve overlap without bounce
      return 'resolved';
    }
    
    // For vertical stacking, be even more conservative with bounce
    if (Math.abs(ny) > 0.9) {
      // Blocks stacking - only bounce if moving very fast towards each other
      if (relVelAlongNormal > -2.0) {
        // Moving slowly - just resolve overlap, no bounce
        return 'resolved';
      }
    }
    
    const restitution = Math.min(
      a.restitution !== null ? a.restitution : this.restitution,
      b.restitution !== null ? b.restitution : this.restitution
    );
    
    // For stacked bodies (collision normal pointing up or down), reduce restitution significantly
    // This prevents blocks from bouncing off each other when stacking
    let effectiveRestitution = restitution;
    if (Math.abs(ny) > 0.9) { // Very vertical collision (stacking scenario)
      // Almost no bounce for vertical stacking - helps blocks settle and stay stacked
      effectiveRestitution = restitution * 0.01; // Almost no bounce
    } else if (ny < -0.7 || ny > 0.7) { // Mostly vertical collision
      // Reduce bounce for vertical collisions
      effectiveRestitution = restitution * 0.1; // Much less bounce
    }
    
    // Calculate impulse based on relative velocity and restitution
    // Impulse = (1 + restitution) * relative_velocity_along_normal / (1/massA + 1/massB)
    const impulse = (1 + effectiveRestitution) * relVelAlongNormal / (a.inverseMass + b.inverseMass);
    
    // DEBUG: Log collisions between chain links (only if debug enabled)
    if (typeof window !== 'undefined' && (window as any).__debugPendulum) {
      const isChainLink = (body: Body) => !body.isStatic && body.mass < 1;
      if (isChainLink(a) && isChainLink(b)) {
        const velBeforeA = Math.sqrt(aVx * aVx + aVy * aVy);
        const velBeforeB = Math.sqrt(bVx * bVx + bVy * bVy);
        console.log(`[Collision] Chain links collide: relVel=${relVelAlongNormal.toFixed(2)}, impulse=${impulse.toFixed(2)}, velA=${velBeforeA.toFixed(2)}, velB=${velBeforeB.toFixed(2)}`);
      }
    }
    
    // Apply impulse to both bodies (proportional to inverse mass)
    // For vertical stacking, eliminate horizontal bounce completely
    let impulseNX = nx;
    let impulseNY = ny;
    if (Math.abs(ny) > 0.9) { // Very vertical collision (stacking)
      impulseNX = 0; // No horizontal bounce for stacked blocks
      if (ny > 0.9) {
        // Block on top - allow some downward bounce
        impulseNY = ny;
      } else {
        // Block below - minimal upward bounce
        impulseNY = ny * 0.1;
      }
    } else if (Math.abs(ny) < 0.5) { // Mostly horizontal collision
      impulseNX = nx * 0.2; // Significantly reduce horizontal bounce
    }
    
    const impulseX = impulse * impulseNX;
    const impulseY = impulse * impulseNY;
    
    if (!a.isStatic && !a.isDragged) {
      // Apply impulse to body A: new_velocity = old_velocity + impulse / mass
      // In Verlet: velocity = (x - prevX), so prevX = x - new_velocity
      const newAVx = aVx + impulseX * a.inverseMass;
      const newAVy = aVy + impulseY * a.inverseMass;
      a.prevX = a.x - newAVx;
      a.prevY = a.y - newAVy;
    }
    if (!b.isStatic && !b.isDragged) {
      // Apply impulse to body B: new_velocity = old_velocity - impulse / mass
      const newBVx = bVx - impulseX * b.inverseMass;
      const newBVy = bVy - impulseY * b.inverseMass;
      b.prevX = b.x - newBVx;
      b.prevY = b.y - newBVy;
    }
    
    return 'resolved';
  }
  
  private constrainToBounds(body: Body): void {
    if (body.isStatic || !body.enabled || body.isDragged) return;
    
    const restitution = body.restitution !== null ? body.restitution : this.restitution;
    const pos = body.getWorldPosition();
    const oldY = body.y;
    const oldPrevY = body.prevY;
    const oldX = body.x;
    const oldPrevX = body.prevX;
    
    // In Verlet integration: velocity = (current - previous)
    // To reverse velocity with restitution: new_prev = current - (current - prev) * restitution
    
    // Bottom boundary: body moving down hits bottom
    if (pos.y + body.radius > this.bounds.height) {
      const diff = (this.bounds.height - body.radius) - pos.y;
      const velocityBefore = body.y - body.prevY; // Current velocity (positive = down)
      
      // If velocity is very small, stop bouncing to prevent jitter
      if (Math.abs(velocityBefore) < 0.3) {
        body.y += diff; // Move body back inside bounds
        body.prevY = body.y; // Stop the body completely
        return; // Skip bounce calculation for tiny velocities
      }
      
      body.y += diff; // Move body back inside bounds
      // Reverse Y velocity and apply restitution
      // Velocity before: (y - prevY) > 0 (moving down)
      // Velocity after: should be negative (moving up) with restitution
      // Formula: new_prevY = y + (y - prevY) * restitution
      // This gives: new_velocity = y - new_prevY = y - (y + (y - prevY) * restitution) = -(y - prevY) * restitution
      body.prevY = body.y + (body.y - body.prevY) * restitution;
    }
    
    // Top boundary: body moving up hits top
    if (pos.y - body.radius < 0) {
      const diff = body.radius - pos.y;
      const velocityBefore = body.y - body.prevY; // Current velocity (negative = up)
      
      // If velocity is very small, stop bouncing to prevent jitter
      if (Math.abs(velocityBefore) < 0.3) {
        body.y += diff;
        body.prevY = body.y;
        return;
      }
      
      body.y += diff; // Move body back inside bounds
      // Reverse Y velocity and apply restitution
      // Velocity before: (y - prevY) < 0 (moving up)
      // Velocity after: should be positive (moving down) with restitution
      // Same formula works: new_prevY = y + (y - prevY) * restitution
      // If (y - prevY) is negative, this makes new_prevY < y, so new_velocity > 0
      body.prevY = body.y + (body.y - body.prevY) * restitution;
    }
    
    // Left boundary: body moving left hits left wall
    if (pos.x - body.radius < 0) {
      const diff = body.radius - pos.x;
      const velocityBefore = body.x - body.prevX; // Current velocity (negative = left)
      
      // If velocity is very small, stop bouncing to prevent jitter
      if (Math.abs(velocityBefore) < 0.3) {
        body.x += diff;
        body.prevX = body.x;
        return;
      }
      
      body.x += diff; // Move body back inside bounds
      // Reverse X velocity and apply restitution
      body.prevX = body.x + (body.x - body.prevX) * restitution;
    }
    
    // Right boundary: body moving right hits right wall
    if (pos.x + body.radius > this.bounds.width) {
      const diff = (this.bounds.width - body.radius) - pos.x;
      const velocityBefore = body.x - body.prevX; // Current velocity (positive = right)
      
      // If velocity is very small, stop bouncing to prevent jitter
      if (Math.abs(velocityBefore) < 0.3) {
        body.x += diff;
        body.prevX = body.x;
        return;
      }
      
      body.x += diff; // Move body back inside bounds
      // Reverse X velocity and apply restitution
      body.prevX = body.x + (body.x - body.prevX) * restitution;
    }
  }
}
