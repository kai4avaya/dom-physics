/**
 * World - Physics simulation container
 * Matches original demo exactly
 */

import { Body } from './Body.js';

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
  
  gravity: number;
  friction: number;
  restitution: number;
  timeStep: number;
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
    
    this.gravity = config.gravity !== undefined ? config.gravity : 980;
    this.friction = config.friction !== undefined ? config.friction : 0.99;
    this.restitution = config.restitution !== undefined ? config.restitution : 0.8;
    this.timeStep = config.timeStep ?? 1/60;
    
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
    if (index > -1) {
      this.bodies.splice(index, 1);
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
    // Integrate
    for (const body of this.bodies) {
      body.integrate(this.timeStep, this);
    }
    
    // Collisions
    for (let i = 0; i < this.bodies.length; i++) {
      for (let j = i + 1; j < this.bodies.length; j++) {
        this.resolveCollision(this.bodies[i], this.bodies[j]);
      }
    }
    
    // Bounds
    for (const body of this.bodies) {
      this.constrainToBounds(body);
    }
  }
  
  private resolveCollision(a: Body, b: Body): void {
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
    
    const totalMass = a.mass + b.mass;
    const aRatio = b.mass / totalMass;
    const bRatio = a.mass / totalMass;
    
    if (!a.isStatic) {
      a.x -= nx * overlap * aRatio;
      a.y -= ny * overlap * aRatio;
    }
    if (!b.isStatic) {
      b.x += nx * overlap * bRatio;
      b.y += ny * overlap * bRatio;
    }
    
    const restitution = Math.min(
      a.restitution !== null ? a.restitution : this.restitution,
      b.restitution !== null ? b.restitution : this.restitution
    );
    
    const aVx = (a.x - a.prevX) * restitution;
    const aVy = (a.y - a.prevY) * restitution;
    const bVx = (b.x - b.prevX) * restitution;
    const bVy = (b.y - b.prevY) * restitution;
    
    if (!a.isStatic) {
      a.prevX = a.x - bVx;
      a.prevY = a.y - bVy;
    }
    if (!b.isStatic) {
      b.prevX = b.x - aVx;
      b.prevY = b.y - aVy;
    }
  }
  
  private constrainToBounds(body: Body): void {
    if (body.isStatic || !body.enabled) return;
    
    const restitution = body.restitution !== null ? body.restitution : this.restitution;
    const pos = body.getWorldPosition();
    
    // Bottom
    if (pos.y + body.radius > this.bounds.height) {
      const diff = (this.bounds.height - body.radius) - pos.y;
      body.y += diff;
      body.prevY = body.y + (body.y - body.prevY) * restitution;
    }
    
    // Top
    if (pos.y - body.radius < 0) {
      const diff = body.radius - pos.y;
      body.y += diff;
      body.prevY = body.y - (body.y - body.prevY) * restitution;
    }
    
    // Left
    if (pos.x - body.radius < 0) {
      const diff = body.radius - pos.x;
      body.x += diff;
      body.prevX = body.x - (body.x - body.prevX) * restitution;
    }
    
    // Right
    if (pos.x + body.radius > this.bounds.width) {
      const diff = (this.bounds.width - body.radius) - pos.x;
      body.x += diff;
      body.prevX = body.x + (body.x - body.prevX) * restitution;
    }
  }
}
