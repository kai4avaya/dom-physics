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

  constructor(container: HTMLElement, config: WorldConfig = {}) {
    this.container = container;
    this.bodies = [];
    this.constraints = [];
    
    this.gravity = config.gravity !== undefined ? config.gravity : 980;
    this.friction = config.friction !== undefined ? config.friction : 0.99;
    this.restitution = config.restitution !== undefined ? config.restitution : 0.8;
    this.timeStep = config.timeStep ?? 1/60;
    this.constraintIterations = 2; // Matter.js default is 2, increase for longer chains
    
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
    }
  }
  
  unregisterBody(body: Body): void {
    const index = this.bodies.indexOf(body);
    if (index !== -1) {
      this.bodies.splice(index, 1);
    }
  }
  
  registerConstraint(constraint: Constraint): void {
    if (!this.constraints.includes(constraint)) {
      this.constraints.push(constraint);
    }
  }
  
  removeConstraint(constraint: Constraint): void {
    const index = this.constraints.indexOf(constraint);
    if (index !== -1) {
      this.constraints.splice(index, 1);
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
    // Apply gravity to all bodies (like Matter.js)
    this._bodiesApplyGravity();
    
    // Integrate
    for (const body of this.bodies) {
      body.integrate(this.timeStep, this);
    }
    
    // Solve constraints (like Matter.js - solve fixed constraints first, then free)
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
    
    // Collisions
    for (let i = 0; i < this.bodies.length; i++) {
      for (let j = i + 1; j < this.bodies.length; j++) {
        this.resolveCollision(this.bodies[i], this.bodies[j]);
      }
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
   * Applies gravitational force to all bodies (Matter.js exact style)
   * Matter.js: body.force.y += body.mass * gravity.y * gravityScale
   * We use: body.fy += body.mass * gravity (since our gravity is already scaled)
   */
  /**
   * Check if two bodies are in the same constraint network (connected directly or indirectly)
   * Uses BFS to find if there's a path between the bodies through constraints
   */
  private _areBodiesInSameConstraintNetwork(a: Body, b: Body): boolean {
    // If they're the same body, they're in the same network
    if (a === b) return true;
    
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
    
    // If either body has no constraints, they're not in a network together
    if (!neighbors.has(a) || !neighbors.has(b)) {
      return false;
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
  
  private resolveCollision(a: Body, b: Body): void {
    // Skip collision resolution if either body is being dragged
    if (a.isDragged || b.isDragged) return;
    
    // CRITICAL: Skip collisions between bodies in the same constraint network
    // This prevents chain links (even non-adjacent ones) from colliding and adding energy
    if (this._areBodiesInSameConstraintNetwork(a, b)) {
      // Bodies are in the same constraint network - let constraints handle their relationship
      return;
    }
    
    const posA = a.getWorldPosition();
    const posB = b.getWorldPosition();
    
    const dx = posB.x - posA.x;
    const dy = posB.y - posA.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const minDist = a.radius + b.radius;
    
    if (dist >= minDist || dist === 0) return;
    
    const nx = dx / dist;
    const ny = dy / dist;
    const overlap = minDist - dist;
    
    // Don't use separation factor - it causes floating
    // Just resolve the overlap directly
    const totalMass = a.mass + b.mass;
    const aRatio = b.mass / totalMass;
    const bRatio = a.mass / totalMass;
    
    // Prevent excessive upward movement - if collision normal points up significantly,
    // reduce the vertical component to prevent floating
    let adjustedNY = ny;
    if (ny < -0.3) { // Collision normal pointing upward
      // Reduce upward push - prefer horizontal separation
      adjustedNY = ny * 0.3; // Dampen upward component
    }
    
    if (!a.isStatic && !a.isDragged) {
      a.x -= nx * overlap * aRatio;
      a.y -= adjustedNY * overlap * aRatio;
    }
    if (!b.isStatic && !b.isDragged) {
      b.x += nx * overlap * bRatio;
      b.y += adjustedNY * overlap * bRatio;
    }
    
    // Calculate relative velocity along collision normal
    const aVx = (a.x - a.prevX);
    const aVy = (a.y - a.prevY);
    const bVx = (b.x - b.prevX);
    const bVy = (b.y - b.prevY);
    const relVx = bVx - aVx;
    const relVy = bVy - aVy;
    const relVelAlongNormal = relVx * nx + relVy * ny;
    
    // Only apply restitution if bodies are moving towards each other
    // and relative velocity is significant (prevents micro-bounces)
    const minRelativeVelocity = 0.5; // pixels per frame
    if (relVelAlongNormal > -minRelativeVelocity) {
      // Bodies are separating or moving slowly - don't add energy
      // Just resolve overlap without bounce
      return;
    }
    
    const restitution = Math.min(
      a.restitution !== null ? a.restitution : this.restitution,
      b.restitution !== null ? b.restitution : this.restitution
    );
    
    // Calculate impulse based on relative velocity and restitution
    // Impulse = (1 + restitution) * relative_velocity_along_normal / (1/massA + 1/massB)
    const impulse = (1 + restitution) * relVelAlongNormal / (a.inverseMass + b.inverseMass);
    
    // DEBUG: Log collisions between chain links
    if (typeof window !== 'undefined' && (window as any).__debugPendulum) {
      const isChainLink = (body: Body) => !body.isStatic && body.mass < 1;
      if (isChainLink(a) && isChainLink(b)) {
        const velBeforeA = Math.sqrt(aVx * aVx + aVy * aVy);
        const velBeforeB = Math.sqrt(bVx * bVx + bVy * bVy);
        console.log(`[Collision] Chain links collide: relVel=${relVelAlongNormal.toFixed(2)}, impulse=${impulse.toFixed(2)}, velA=${velBeforeA.toFixed(2)}, velB=${velBeforeB.toFixed(2)}`);
      }
    }
    
    // Apply impulse to both bodies (proportional to inverse mass)
    const impulseX = impulse * nx;
    const impulseY = impulse * ny;
    
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
