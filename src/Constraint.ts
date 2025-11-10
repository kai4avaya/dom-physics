/**
 * Constraint - Maintains fixed distance between bodies or body and fixed point
 * Based on Matter.js constraint system with Gauss-Seidel iterative solving
 */

import type { Body } from './Body.js';

export interface ConstraintConfig {
  bodyA: Body | null;  // null = fixed world point
  bodyB: Body;         // Required - the body to constrain
  pointA?: { x: number; y: number };  // World point if bodyA=null, else local to bodyA
  pointB?: { x: number; y: number };  // Local point on bodyB (default: center)
  length?: number;      // Target distance (0 = pin joint)
  stiffness?: number;   // 0-1, higher = stiffer (default: 0.7 for pin, 1.0 for distance)
  damping?: number;     // 0-1, energy loss (default: 0)
}

export class Constraint {
  bodyA: Body | null;
  bodyB: Body;
  pointA: { x: number; y: number };
  pointB: { x: number; y: number };
  length: number;
  stiffness: number;
  damping: number;
  
  private static readonly _minLength = 0.000001; // Prevent division by zero
  private static readonly _warming = 0.9; // Constraint warming factor
  
  constructor(config: ConstraintConfig) {
    this.bodyA = config.bodyA;
    this.bodyB = config.bodyB;
    
    // Default attachment points to center if not specified
    this.pointA = config.pointA ?? { x: 0, y: 0 };
    this.pointB = config.pointB ?? { x: 0, y: 0 };
    
    // Calculate initial length if not specified OR if explicitly set to 0 (pin joint)
    // For pin joints (length: 0), we still need to know the current distance to maintain it
    if (config.length === undefined || config.length === 0) {
      const worldA = this.getWorldPointA();
      const worldB = this.getWorldPointB();
      const dx = worldB.x - worldA.x;
      const dy = worldB.y - worldA.y;
      const calculatedLength = Math.sqrt(dx * dx + dy * dy);
      // If length was explicitly 0, use calculated length (pin joint maintains current distance)
      // If length was undefined, use calculated length or minimum
      this.length = calculatedLength > Constraint._minLength ? calculatedLength : Constraint._minLength;
      
    } else {
      this.length = config.length;
    }
    
    // Default stiffness: 0.7 for pin joints (length: 0), 1.0 for distance constraints
    const wasPinJoint = config.length === 0;
    this.stiffness = config.stiffness ?? (wasPinJoint ? 0.7 : 1.0);
    this.damping = config.damping ?? 0;
  }
  
  /**
   * Get world-space position of constraint point A
   */
  getWorldPointA(): { x: number; y: number } {
    if (!this.bodyA) {
      // Fixed world point
      return { x: this.pointA.x, y: this.pointA.y };
    }
    // Local point on bodyA transformed to world space
    const bodyAPos = this.bodyA.getWorldPosition();
    return {
      x: bodyAPos.x + this.pointA.x,
      y: bodyAPos.y + this.pointA.y
    };
  }
  
  /**
   * Get world-space position of constraint point B
   */
  getWorldPointB(): { x: number; y: number } {
    const bodyBPos = this.bodyB.getWorldPosition();
    return {
      x: bodyBPos.x + this.pointB.x,
      y: bodyBPos.y + this.pointB.y
    };
  }
  
  /**
   * Solve constraint using Gauss-Seidel method (like Matter.js)
   * Directly modifies body positions to maintain constraint length
   * Matches Matter.js implementation exactly
   */
  solve(timeScale: number): void {
    // Skip if either body is disabled or being dragged
    if (this.bodyA && (!this.bodyA.enabled || this.bodyA.isDragged)) {
      return;
    }
    if (!this.bodyB.enabled || this.bodyB.isDragged) {
      return;
    }
    
    // Get world positions of constraint points
    const worldA = this.getWorldPointA();
    const worldB = this.getWorldPointB();
    
    // Calculate current distance (delta vector from B to A, like Matter.js)
    const dx = worldA.x - worldB.x;
    const dy = worldA.y - worldB.y;
    let currentLength = Math.sqrt(dx * dx + dy * dy);
    
    // Prevent singularity (division by zero)
    if (currentLength < Constraint._minLength) {
      currentLength = Constraint._minLength;
    }
    
    // Calculate constraint violation (Matter.js exact formula)
    const difference = (currentLength - this.length) / currentLength;
    
    // Clamp difference to prevent huge corrections that add energy
    // Large violations suggest constraint fighting or initialization issues
    const clampedDifference = Math.max(-0.5, Math.min(0.5, difference));
    
    // Determine if rigid constraint (Matter.js: stiffness >= 1 OR length === 0)
    const isRigid = this.stiffness >= 1 || this.length === 0;
    
    // Calculate stiffness (Matter.js exact formula)
    const stiffness = isRigid 
      ? this.stiffness * timeScale
      : this.stiffness * timeScale * timeScale;
    
    // Calculate force vector (Matter.js: force = delta * (difference * stiffness))
    const forceX = dx * (clampedDifference * stiffness);
    const forceY = dy * (clampedDifference * stiffness);
    const forceMag = Math.sqrt(forceX * forceX + forceY * forceY);
    
    // DEBUG: Log large constraint corrections
    if (typeof window !== 'undefined' && (window as any).__debugPendulum) {
      const isChainLink = (body: Body | null) => body && !body.isStatic && body.mass < 1;
      if (forceMag > 5 && (isChainLink(this.bodyA) || isChainLink(this.bodyB))) {
        const velB = this.bodyB ? Math.sqrt(
          Math.pow(this.bodyB.x - this.bodyB.prevX, 2) + 
          Math.pow(this.bodyB.y - this.bodyB.prevY, 2)
        ) : 0;
        console.log(`[Constraint] Large correction: diff=${difference.toFixed(3)}, force=${forceMag.toFixed(2)}, velB=${velB.toFixed(2)}`);
      }
    }
    
    // Calculate total inverse mass for force distribution
    const massTotal = (this.bodyA ? this.bodyA.inverseMass : 0) + this.bodyB.inverseMass;
    
    if (massTotal === 0) return; // Both bodies are static
    
    // Apply damping if specified (Matter.js style)
    let dampingX = 0;
    let dampingY = 0;
    if (this.damping > 0 && currentLength > Constraint._minLength) {
      // Calculate relative velocity at constraint points
      const velAX = this.bodyA ? (this.bodyA.x - this.bodyA.prevX) : 0;
      const velAY = this.bodyA ? (this.bodyA.y - this.bodyA.prevY) : 0;
      const velBX = this.bodyB.x - this.bodyB.prevX;
      const velBY = this.bodyB.y - this.bodyB.prevY;
      
      const relativeVelX = velAX - velBX; // A relative to B (like Matter.js)
      const relativeVelY = velAY - velBY;
      
      // Normalize direction
      const nx = dx / currentLength;
      const ny = dy / currentLength;
      
      // Project relative velocity onto constraint normal
      const normalVelocity = relativeVelX * nx + relativeVelY * ny;
      
      // Apply damping (Matter.js: damping * normal * normalVelocity)
      const dampingScale = this.damping * timeScale;
      dampingX = dampingScale * nx * normalVelocity;
      dampingY = dampingScale * ny * normalVelocity;
    }
    
    // Apply to bodyA (if exists and not static)
    // Matter.js: bodyA.position -= force * share, bodyA.positionPrev -= damping * share
    if (this.bodyA && !this.bodyA.isStatic) {
      const share = this.bodyA.inverseMass / massTotal;
      const correctionX = forceX * share;
      const correctionY = forceY * share;
      
      // Track impulse for constraint warming (Matter.js style)
      this.bodyA.constraintImpulseX -= correctionX;
      this.bodyA.constraintImpulseY -= correctionY;
      
      // Matter.js exact: bodyA.position -= force * share
      // This modifies position, which implicitly changes velocity (velocity = position - positionPrev)
      this.bodyA.x -= correctionX;
      this.bodyA.y -= correctionY;
      
      // Matter.js exact: bodyA.positionPrev -= damping * share
      // Damping reduces velocity by modifying previous position
      if (this.damping > 0) {
        this.bodyA.prevX -= dampingX * share;
        this.bodyA.prevY -= dampingY * share;
      }
    }
    
    // Apply to bodyB
    // Matter.js: bodyB.position += force * share, bodyB.positionPrev += damping * share
    if (!this.bodyB.isStatic) {
      const share = this.bodyB.inverseMass / massTotal;
      const correctionX = forceX * share;
      const correctionY = forceY * share;
      
      // Track impulse for constraint warming (Matter.js style)
      this.bodyB.constraintImpulseX += correctionX;
      this.bodyB.constraintImpulseY += correctionY;
      
      // Matter.js exact: bodyB.position += force * share
      // This modifies position, which implicitly changes velocity (velocity = position - positionPrev)
      this.bodyB.x += correctionX;
      this.bodyB.y += correctionY;
      
      // Matter.js exact: bodyB.positionPrev += damping * share
      // Damping reduces velocity by modifying previous position
      if (this.damping > 0) {
        this.bodyB.prevX += dampingX * share;
        this.bodyB.prevY += dampingY * share;
      }
    }
  }
  
  /**
   * Apply constraint warming (dampen cached impulses from previous frame)
   * Called before solving to improve stability
   * Matter.js uses this for better convergence with soft constraints
   * DISABLED: Was causing energy buildup in chains
   */
  static preSolveAll(bodies: Body[]): void {
    // DISABLED: Constraint warming was adding energy to chains
    // for (const body of bodies) {
    //   if (body.isStatic || body.isDragged) continue;
    //   
    //   // Apply cached impulse from previous frame (constraint warming)
    //   // This helps soft constraints converge better
    //   if (body.constraintImpulseX !== 0 || body.constraintImpulseY !== 0) {
    //     body.x += body.constraintImpulseX;
    //     body.y += body.constraintImpulseY;
    //   }
    // }
  }
  
  /**
   * Post-solve: dampen impulses for next frame (constraint warming)
   */
  static postSolveAll(bodies: Body[]): void {
    for (const body of bodies) {
      if (body.isStatic || body.isDragged) continue;
      
      // Dampen cached impulse for warming next step
      // Matter.js uses 0.4, we use 0.9 for more stability
      body.constraintImpulseX *= Constraint._warming;
      body.constraintImpulseY *= Constraint._warming;
    }
  }
}
