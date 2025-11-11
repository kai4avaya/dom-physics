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
  fx: number; // Accumulated force (like Matter.js body.force)
  fy: number;
  
  // Constraint support (like Matter.js)
  constraintImpulseX: number; // Cached constraint corrections for warming
  constraintImpulseY: number;
  inverseMass: number; // 1/mass for constraint force distribution
  
  // Properties
  mass: number;
  radius: number;
  restitution: number | null;
  friction: number | null;
  isStatic: boolean;
  enabled: boolean;
  isDragged: boolean; // Flag to skip physics when being dragged

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
    this.fx = 0; // Force accumulator (like Matter.js)
    this.fy = 0;
    
    // Constraint support
    this.constraintImpulseX = 0;
    this.constraintImpulseY = 0;
    
    // Properties
    this.mass = config.mass ?? 1;
    this.radius = config.radius ?? Math.max(elemRect.width, elemRect.height) / 2;
    this.restitution = config.restitution !== undefined ? config.restitution : null;
    this.friction = config.friction !== undefined ? config.friction : null;
    this.isStatic = config.isStatic ?? false;
    this.enabled = true;
    this.isDragged = false;
    
    // Calculate inverseMass after isStatic is set
    this.inverseMass = this.isStatic ? 0 : (this.mass > 0 ? 1 / this.mass : 0);
    
    // Ensure can be transformed
    const display = getComputedStyle(element).display;
    if (display === 'inline') {
      element.style.display = 'inline-block';
    }
  }
  
  applyForce(fx: number, fy: number): void {
    if (this.isStatic || !this.enabled) return;
    // Accumulate forces directly (like Matter.js)
    this.fx += fx;
    this.fy += fy;
  }
  
  integrate(dt: number, world: World): void {
    if (this.isStatic || !this.enabled || this.isDragged) return;
    
    // Matter.js exact Verlet integration:
    // velocity = (velocityPrev * frictionAir) + (force / mass) * deltaTimeSquared
    // position += velocity
    
    // Calculate deltaTimeSquared (Matter.js style)
    const deltaTimeSquared = dt * dt;
    
    // Calculate previous velocity from position difference (Matter.js style)
    // Matter.js: velocityPrevX = (body.position.x - body.positionPrev.x) * correction
    const velocityPrevX = (this.x - this.prevX);
    const velocityPrevY = (this.y - this.prevY);
    
    // Get friction (air resistance in Matter.js terms)
    // Matter.js: frictionAir = 1 - body.frictionAir * (deltaTime / baseDelta)
    // We use a simpler approach: direct friction multiplier
    const friction = this.friction !== null ? this.friction : world.friction;
    
    // Matter.js exact formula: velocity = (velocityPrev * frictionAir) + (force / mass) * deltaTimeSquared
    const velocityX = (velocityPrevX * friction) + (this.fx / this.mass) * deltaTimeSquared;
    const velocityY = (velocityPrevY * friction) + (this.fy / this.mass) * deltaTimeSquared;
    
    // Apply minimum velocity threshold to stop micro-jiggling
    // BUT: Don't stop if forces are being applied (gravity, etc.) - let them accelerate
    const minVelocity = 0.05; // pixels per frame
    const hasActiveForces = Math.abs(this.fx) > 0.001 || Math.abs(this.fy) > 0.001;
    
    // Only stop if velocity is very small AND no forces are being applied
    if (!hasActiveForces && Math.abs(velocityX) < minVelocity && Math.abs(velocityY) < minVelocity) {
      // Stop the body - set prev position to current position
      this.prevX = this.x;
      this.prevY = this.y;
      // Reset forces before returning
      this.fx = 0;
      this.fy = 0;
      return;
    }
    
    // Gradually reduce very small velocities (but only if no active forces)
    let adjustedVx = velocityX;
    let adjustedVy = velocityY;
    if (!hasActiveForces) {
      if (Math.abs(velocityX) < minVelocity * 2) {
        adjustedVx = velocityX * 0.5; // Reduce velocity by 50%
      }
      if (Math.abs(velocityY) < minVelocity * 2) {
        adjustedVy = velocityY * 0.5; // Reduce velocity by 50%
      }
    }
    
    // Matter.js: positionPrev = position, then position += velocity
    this.prevX = this.x;
    this.prevY = this.y;
    
    // Update position using new velocity (Matter.js style)
    this.x += adjustedVx;
    this.y += adjustedVy;
    
    // Reset forces (Matter.js resets forces after integration)
    this.fx = 0;
    this.fy = 0;
  }
  
  getWorldPosition(): { x: number; y: number } {
    return {
      x: this.originX + this.x,
      y: this.originY + this.y
    };
  }
  
  render(): void {
    // For static bodies, don't apply transform - keep them in normal flow
    // This preserves spacing between letters in text demos
    if (this.isStatic && this.x === 0 && this.y === 0) {

      // Reset transform to keep in flow
      this.element.style.transform = '';
      return;
    }
    
    // For dynamic bodies or moved static bodies, apply transform
    this.element.style.transform = `translate(${this.x}px, ${this.y}px)`;
    
    // Once a body moves, it needs to be positioned absolutely to not affect layout
    if (!this.isStatic && this.element.style.position !== 'absolute') {
      // Ensure display is inline-block for transforms to work
      const display = getComputedStyle(this.element).display;
      if (display === 'inline') {
        this.element.style.display = 'inline-block';
      }
      
      const rect = this.element.getBoundingClientRect();
      const worldRect = this.world.container.getBoundingClientRect();
      const currentX = rect.left - worldRect.left;
      const currentY = rect.top - worldRect.top;
      
      // Set absolute position based on current world position
      this.element.style.position = 'absolute';
      this.element.style.left = `${currentX}px`;
      this.element.style.top = `${currentY}px`;
      
      // Update origin to match new absolute position
      this.originX = currentX;
      this.originY = currentY;
      this.x = 0;
      this.y = 0;
      this.prevX = 0;
      this.prevY = 0;
    }
  }
}
