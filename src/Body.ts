/**
 * Body - A physics body attached to a DOM element
 * Matches original demo exactly
 */

// Import World type for type annotations
import type { World } from './World.js';

export interface BodyConfig {
  mass?: number;
  radius?: number;
  restitution?: number | null;
  friction?: number | null;
  isStatic?: boolean;
}

export class Body {
  element: HTMLElement;
  world: World;
  originalParent: HTMLElement | null;
  
  // World-space origin
  originX: number;
  originY: number;
  
  // Physics state (relative to origin)
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  ax: number;
  ay: number;
  
  // Properties
  mass: number;
  radius: number;
  restitution: number | null;
  friction: number | null;
  isStatic: boolean;
  enabled: boolean;

  constructor(element: HTMLElement, world: World, config: BodyConfig = {}) {
    this.element = element;
    this.world = world;
    
    // Capture original parent
    this.originalParent = element.parentElement;
    
    // Get world and element positions
    const worldRect = world.container.getBoundingClientRect();
    const elemRect = element.getBoundingClientRect();
    
    // Calculate origin in world space
    this.originX = elemRect.left - worldRect.left;
    this.originY = elemRect.top - worldRect.top;
    
    // Physics state (relative to origin)
    this.x = 0;
    this.y = 0;
    this.prevX = 0;
    this.prevY = 0;
    this.ax = 0;
    this.ay = 0;
    
    // Properties
    this.mass = config.mass ?? 1;
    this.radius = config.radius ?? Math.max(elemRect.width, elemRect.height) / 2;
    this.restitution = config.restitution !== undefined ? config.restitution : null;
    this.friction = config.friction !== undefined ? config.friction : null;
    this.isStatic = config.isStatic ?? false;
    this.enabled = true;
    
    // Ensure can be transformed
    const display = getComputedStyle(element).display;
    if (display === 'inline') {
      element.style.display = 'inline-block';
    }
  }
  
  applyForce(fx: number, fy: number): void {
    if (this.isStatic || !this.enabled) return;
    this.ax += fx / this.mass;
    this.ay += fy / this.mass;
  }
  
  integrate(dt: number, world: World): void {
    if (this.isStatic || !this.enabled) return;
    
    this.ay += world.gravity;
    
    const friction = this.friction !== null ? this.friction : world.friction;
    const vx = (this.x - this.prevX) * friction;
    const vy = (this.y - this.prevY) * friction;
    
    this.prevX = this.x;
    this.prevY = this.y;
    
    this.x += vx + this.ax * dt * dt;
    this.y += vy + this.ay * dt * dt;
    
    this.ax = 0;
    this.ay = 0;
  }
  
  getWorldPosition(): { x: number; y: number } {
    return {
      x: this.originX + this.x,
      y: this.originY + this.y
    };
  }
  
  render(): void {
    this.element.style.transform = `translate(${this.x}px, ${this.y}px)`;
  }
}
