import { Body } from './Body.js';
import { SpatialHash } from './SpatialHash.js';
import type {
  WorldConfig,
  CollisionEvent,
} from './types.js';

/**
 * World class - Extends Body to manage physics simulation
 * Each World runs its own independent simulation loop
 */
export class World extends Body {
  // ============================================================
  // World-Specific Properties (always has values, never null)
  // ============================================================
  override gravity: number;
  override friction: number;
  override restitution: number;
  readonly container: HTMLElement;
  timeStep: number;

  // ============================================================
  // Simulation Management
  // ============================================================
  private simulationBodies: Body[] = [];  // Bodies registered for THIS world's simulation
  private running: boolean = false;
  private lastTime: number = 0;
  private accumulator: number = 0;
  private rafId: number | null = null;

  // ============================================================
  // Event System
  // ============================================================
  private listeners: Map<string, Function[]> = new Map();

  // ============================================================
  // Spatial Optimization
  // ============================================================
  private spatialHash: SpatialHash | null = null;

  constructor(container: HTMLElement, config: WorldConfig = {}) {
    // Initialize as Body (no physics parent for root World)
    super(container, null, config);
    
    // Mark as World (override readonly property)
    (this as any).isWorld = true;
    this.container = container;

    // World always has explicit physics values (never null)
    this.gravity = config.gravity ?? 980;
    this.friction = config.friction ?? 0.99;
    this.restitution = config.restitution ?? 0.8;
    this.timeStep = config.timeStep ?? 1 / 60;

    // Bounds (auto-detect if not provided)
    if (config.bounds === undefined) {
      const rect = container.getBoundingClientRect();
      this.bounds = {
        x: 0,
        y: 0,
        width: rect.width,
        height: rect.height
      };
    } else {
      this.bounds = config.bounds;
    }

    // Initialize spatial hash for collision optimization
    this.spatialHash = new SpatialHash(100);
  }

  /**
   * Register body for simulation in THIS world
   */
  registerBody(body: Body): void {
    if (this.simulationBodies.includes(body)) return;
    this.simulationBodies.push(body);
    this.emit('bodyAdded', { body });
  }

  /**
   * Unregister body
   */
  unregisterBody(body: Body): void {
    const index = this.simulationBodies.indexOf(body);
    if (index > -1) {
      this.simulationBodies.splice(index, 1);
      this.emit('bodyRemoved', { body });
    }
  }

  /**
   * Query bodies by parent element (DOM parent)
   */
  getBodiesByParent(parent: HTMLElement): Body[] {
    return this.simulationBodies.filter(
      body => body.originalParent?.element === parent
    );
  }

  /**
   * Query bodies that escaped parent bounds
   */
  getEscapedBodies(): Body[] {
    return this.simulationBodies.filter(body => body.isOutsideParentBounds());
  }

  /**
   * Start THIS world's simulation loop (independent)
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.loop);
  }

  /**
   * Stop THIS world's simulation
   */
  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    
    // Also stop nested Worlds
    for (const body of this.bodies) {
      if (body.isWorld) {
        (body as World).stop();
      }
    }
  }

  /**
   * Simulation loop (independent for each World)
   */
  private loop = (time: number): void => {
    if (!this.running) return;

    const deltaTime = time - this.lastTime;
    this.lastTime = time;

    // Fixed timestep with accumulator
    this.accumulator += deltaTime;

    while (this.accumulator >= this.timeStep * 1000) {
      this.step();
      this.accumulator -= this.timeStep * 1000;
    }

    // Render all bodies in this world
    for (const body of this.simulationBodies) {
      body.render();
    }
    
    // Only render World itself if it's nested (has a physics parent)
    // Root World's container should not be transformed
    if (this.physicsParent) {
      this.render();
    }

    this.rafId = requestAnimationFrame(this.loop);
  };

  /**
   * Single physics step for THIS world
   */
  private step(): void {
    // Step only bodies registered in THIS world
    // Note: Nested Worlds step themselves in their own loops
    for (const body of this.simulationBodies) {
      if (!body.isWorld) {
        // Regular bodies integrate in this world
        body.integrate(this.timeStep);
      }
      // Nested Worlds are stepped by their own simulation loops
    }

    // Collision detection (includes Worlds as Bodies!)
    this.detectAndResolveCollisions();

    // Apply bounds constraints
    for (const body of this.simulationBodies) {
      body.constrainToBounds();
    }
    
    // Also constrain this World itself
    this.constrainToBounds();
  }

  /**
   * Collision detection with spatial hashing
   * Worlds can collide with Bodies!
   * Optimized: Uses simple O(n²) for small body counts (< 50)
   */
  private detectAndResolveCollisions(): void {
    const bodyCount = this.simulationBodies.length;
    
    // For small numbers, simple O(n²) is faster than spatial hash overhead
    if (bodyCount < 50) {
      for (let i = 0; i < bodyCount; i++) {
        const bodyA = this.simulationBodies[i];
        if (!bodyA.enabled) continue;
        
        for (let j = i + 1; j < bodyCount; j++) {
          const bodyB = this.simulationBodies[j];
          if (!bodyB.enabled) continue;
          
          // Check collision group filtering
          if (!(bodyA.collisionGroup & bodyB.collidesWith) ||
              !(bodyB.collisionGroup & bodyA.collidesWith)) {
            continue;
          }
          
          this.resolveCollision(bodyA, bodyB);
        }
      }
      return;
    }
    
    // Use spatial hash for larger body counts
    if (!this.spatialHash) return;

    this.spatialHash.clear();
    
    // Insert all simulation bodies (including nested Worlds!)
    for (const body of this.simulationBodies) {
      if (body.enabled) {
        this.spatialHash.insert(body);
      }
    }
    
    // Also insert this World itself if it's not static and enabled
    if (!this.isStatic && this.enabled) {
      this.spatialHash.insert(this);
    }

    // Get potential collision pairs
    const pairs = this.spatialHash.getPairs();

    for (const [bodyA, bodyB] of pairs) {
      // Check collision group filtering
      if (!(bodyA.collisionGroup & bodyB.collidesWith) ||
          !(bodyB.collisionGroup & bodyA.collidesWith)) {
        continue;
      }

      // Worlds can collide with Bodies!
      // Both could be Worlds, both could be Bodies, or mixed
      this.resolveCollision(bodyA, bodyB);
    }
  }

  /**
   * Resolve collision between two bodies
   * Works for Body-Body, World-Body, World-World
   */
  private resolveCollision(a: Body, b: Body): void {
    const posA = a.getWorldPosition();
    const posB = b.getWorldPosition();
    
    const dx = posB.x - posA.x;
    const dy = posB.y - posA.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const minDist = a.radius + b.radius;

    if (dist >= minDist || dist === 0) return;

    // Calculate collision normal
    const nx = dx / dist;
    const ny = dy / dist;
    const overlap = minDist - dist;

    // Emit collision event
    this.emit('collision', {
      bodyA: a,
      bodyB: b,
      normal: { x: nx, y: ny },
      overlap
    } as CollisionEvent);

    // Separate bodies based on mass ratio
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

    // Apply restitution (bounce)
    const restitution = Math.min(
      a.getEffectiveRestitution(),
      b.getEffectiveRestitution()
    );

    const aVx = (a.x - a.prevX) * restitution;
    const aVy = (a.y - a.prevY) * restitution;
    const bVx = (b.x - b.prevX) * restitution;
    const bVy = (b.y - b.prevY) * restitution;

    if (!a.isStatic) {
      a.prevX = a.x - bVx;
      a.prevY = a.y - bVy;
      a.sleeping = false;
    }
    if (!b.isStatic) {
      b.prevX = b.x - aVx;
      b.prevY = b.y - aVy;
      b.sleeping = false;
    }
  }

  /**
   * Override to use World's own values (never inherit)
   */
  override getEffectiveGravity(): number {
    return this.gravity; // World always uses its own value
  }

  override getEffectiveFriction(): number {
    return this.friction;
  }

  override getEffectiveRestitution(): number {
    return this.restitution;
  }

  /**
   * Event system
   */
  on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  off(event: string, callback: Function): void {
    const callbacks = this.listeners.get(event);
    if (!callbacks) return;
    
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
  }

  private emit(event: string, data: any): void {
    const callbacks = this.listeners.get(event);
    if (!callbacks) return;
    
    for (const callback of callbacks) {
      callback(data);
    }
  }

  /**
   * Reset all bodies to original positions
   */
  reset(): void {
    for (const body of this.simulationBodies) {
      body.reset();
    }
    // Reset this World itself (call parent Body.reset())
    super.reset();
  }

  /**
   * Cleanup - restore all DOM elements and stop simulation
   */
  destroy(): void {
    this.stop();
    
    // Restore all bodies
    for (const body of this.simulationBodies) {
      body.restore();
    }
    
    // Restore this World itself
    this.restore();
    
    // Clear arrays
    this.simulationBodies.length = 0;
    this.bodies.length = 0;
  }
}
