# DOM Physics Engine Architecture Plan v2 (TypeScript)

## Core Principles

### 1. Preserve DOM Structure
The physics engine **never modifies the DOM hierarchy**. It only:
- **Reads** the DOM hierarchy and styles
- **Manipulates** transform properties
- **Remembers** original relationships

### 2. Recursive Architecture
**World extends Body** - This enables:
- Worlds can contain Bodies
- Bodies can contain Bodies (because any Body could be a World)
- Worlds can be nested inside Worlds
- Worlds can collide with Bodies outside themselves

### 3. Independent Simulation Spaces
Each World runs its **own independent simulation loop**. Nested Worlds are completely autonomous physics spaces.

### 4. Physics Inheritance
Bodies inherit physics properties (gravity, friction, restitution) from their parent World, but can override them.

### 5. Flexible Bounds
Any Body or World can have bounds to constrain its children.

---

## Architecture Overview

```
World (extends Body)
  ├── isWorld: true
  ├── Own simulation loop (independent)
  ├── Own physics values (gravity, friction, restitution)
  ├── Bodies registered for simulation
  │
  ├── Body (regular)
  │     ├── Inherits physics from parent World
  │     ├── Can contain child Bodies
  │     └── Collides with siblings in same World
  │
  └── World (nested, also a Body!)
        ├── isWorld: true
        ├── Own simulation loop (independent)
        ├── Own physics values
        ├── Can collide with Bodies in parent World
        └── Bodies (only collide within this World)
```

---

## Type Definitions

```typescript
// Core vector math
interface Vec2 {
  x: number;
  y: number;
}

// Physics configuration for World
interface WorldConfig {
  gravity?: number;        // px/s² (default: 980)
  friction?: number;       // 0-1, velocity damping (default: 0.99)
  restitution?: number;   // 0-1, bounciness (default: 0.8)
  bounds?: Bounds | null;  // null = auto-detect from container
  timeStep?: number;       // fixed timestep in seconds (default: 1/60)
}

// Body configuration
interface BodyConfig {
  mass?: number;
  radius?: number;
  width?: number;
  height?: number;
  
  // Physics inheritance: null = inherit from parent World
  gravity?: number | null;
  friction?: number | null;
  restitution?: number | null;
  
  // Optional bounds (constrains children if set)
  bounds?: Bounds | null;
  
  // Flags
  isStatic?: boolean;
  enabled?: boolean;
  
  // Collision filtering
  collisionGroup?: number;
  collidesWith?: number;   // bitmask
  
  // Initial state
  initialVelocity?: Vec2;
}

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Collision event
interface CollisionEvent {
  bodyA: Body;
  bodyB: Body;
  normal: Vec2;
  overlap: number;
}

// Parent relationship info (preserved from DOM)
interface ParentInfo {
  element: HTMLElement;
  computedStyle: CSSStyleDeclaration;
  bounds: DOMRect;
  zIndex: number;
}
```

---

## Body Class (Base for Everything)

```typescript
class Body {
  // ============================================================
  // DOM References (NEVER modified)
  // ============================================================
  readonly element: HTMLElement;
  readonly originalParent: ParentInfo | null;
  readonly originalPosition: DOMRect;
  readonly originalStyles: Record<string, string>;

  // ============================================================
  // Physics Hierarchy
  // ============================================================
  physicsParent: Body | null = null;
  readonly bodies: Body[] = [];
  readonly isWorld: boolean = false;

  // ============================================================
  // Physics Properties (null = inherit from parent World)
  // ============================================================
  gravity: number | null = null;
  friction: number | null = null;
  restitution: number | null = null;
  
  // Optional bounds (constrains children if set)
  bounds: Bounds | null = null;

  // ============================================================
  // Physics State (local coordinates relative to physicsParent)
  // ============================================================
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  ax: number;  // acceleration
  ay: number;

  // ============================================================
  // Physical Properties
  // ============================================================
  mass: number;
  radius: number;
  width: number;
  height: number;
  isStatic: boolean;
  sleeping: boolean;
  enabled: boolean;
  
  // Collision filtering
  collisionGroup: number;
  collidesWith: number;

  // ============================================================
  // Origin Offset (for transform composition)
  // ============================================================
  private originX: number;
  private originY: number;

  constructor(
    element: HTMLElement,
    physicsParent: Body | null,
    config: BodyConfig = {}
  ) {
    this.element = element;
    this.physicsParent = physicsParent;

    // Preserve original DOM context
    this.originalParent = this.captureParentInfo();
    this.originalPosition = element.getBoundingClientRect();
    this.originalStyles = this.captureStyles([
      'position', 'transform', 'display', 'zIndex'
    ]);

    // Calculate world-space origin
    const worldRect = this.findRootWorld()?.container.getBoundingClientRect() 
      ?? element.getBoundingClientRect();
    this.originX = this.originalPosition.left - worldRect.left;
    this.originY = this.originalPosition.top - worldRect.top;

    // Initialize physics state
    this.x = config.initialVelocity?.x ?? 0;
    this.y = config.initialVelocity?.y ?? 0;
    this.prevX = this.x - (config.initialVelocity?.x ?? 0);
    this.prevY = this.y - (config.initialVelocity?.y ?? 0);
    this.ax = 0;
    this.ay = 0;

    // Physical properties
    this.mass = config.mass ?? 1;
    this.radius = config.radius ?? Math.max(
      this.originalPosition.width,
      this.originalPosition.height
    ) / 2;
    this.width = config.width ?? this.originalPosition.width;
    this.height = config.height ?? this.originalPosition.height;
    
    // Physics inheritance (null = inherit)
    this.gravity = config.gravity ?? null;
    this.friction = config.friction ?? null;
    this.restitution = config.restitution ?? null;
    
    // Bounds (optional)
    this.bounds = config.bounds ?? null;

    // Flags
    this.isStatic = config.isStatic ?? false;
    this.sleeping = false;
    this.enabled = config.enabled ?? true;
    
    // Collision filtering
    this.collisionGroup = config.collisionGroup ?? 1;
    this.collidesWith = config.collidesWith ?? 0xFFFFFFFF;

    // Ensure element can be transformed
    if (getComputedStyle(element).display === 'inline') {
      element.style.display = 'inline-block';
    }
  }

  /**
   * Find root World by walking up physics hierarchy
   */
  private findRootWorld(): World | null {
    let current: Body | null = this;
    while (current) {
      if (current.isWorld) {
        return current as World;
      }
      current = current.physicsParent;
    }
    return null;
  }

  /**
   * Capture parent DOM info WITHOUT modifying structure
   */
  private captureParentInfo(): ParentInfo | null {
    const parent = this.element.parentElement;
    if (!parent) return null;

    return {
      element: parent,
      computedStyle: getComputedStyle(parent),
      bounds: parent.getBoundingClientRect(),
      zIndex: parseInt(getComputedStyle(parent).zIndex) || 0
    };
  }

  /**
   * Capture original CSS properties
   */
  private captureStyles(properties: string[]): Record<string, string> {
    const styles: Record<string, string> = {};
    const computed = getComputedStyle(this.element);
    
    for (const prop of properties) {
      styles[prop] = computed.getPropertyValue(prop);
    }
    
    return styles;
  }

  /**
   * Get effective physics values (with inheritance)
   * Walks up physics hierarchy to find parent World
   */
  getEffectiveGravity(): number {
    if (this.gravity !== null) return this.gravity;
    
    // Walk up physics hierarchy to find parent World
    let parent = this.physicsParent;
    while (parent) {
      if (parent.isWorld) {
        return (parent as World).gravity;
      }
      if (parent.gravity !== null) {
        return parent.gravity;
      }
      parent = parent.physicsParent;
    }
    
    return 0; // No gravity if no parent World
  }

  getEffectiveFriction(): number {
    if (this.friction !== null) return this.friction;
    
    let parent = this.physicsParent;
    while (parent) {
      if (parent.isWorld) {
        return (parent as World).friction;
      }
      if (parent.friction !== null) {
        return parent.friction;
      }
      parent = parent.physicsParent;
    }
    
    return 0.99; // Default friction
  }

  getEffectiveRestitution(): number {
    if (this.restitution !== null) return this.restitution;
    
    let parent = this.physicsParent;
    while (parent) {
      if (parent.isWorld) {
        return (parent as World).restitution;
      }
      if (parent.restitution !== null) {
        return parent.restitution;
      }
      parent = parent.physicsParent;
    }
    
    return 0.8; // Default restitution
  }

  /**
   * Get world-space position (recursively walks up physics tree)
   */
  getWorldPosition(): Vec2 {
    let worldX = this.originX + this.x;
    let worldY = this.originY + this.y;
    
    let parent = this.physicsParent;
    while (parent) {
      worldX += parent.originX + parent.x;
      worldY += parent.originY + parent.y;
      parent = parent.physicsParent;
    }
    
    return { x: worldX, y: worldY };
  }

  /**
   * Get local position relative to immediate physics parent
   */
  getLocalPosition(): Vec2 {
    return { x: this.x, y: this.y };
  }

  /**
   * Get current velocity
   */
  getVelocity(): Vec2 {
    return {
      x: this.x - this.prevX,
      y: this.y - this.prevY
    };
  }

  /**
   * Apply force (F = ma, so a = F/m)
   */
  applyForce(fx: number, fy: number): void {
    if (this.isStatic || !this.enabled) return;
    
    this.ax += fx / this.mass;
    this.ay += fy / this.mass;
    
    if (this.sleeping) {
      this.sleeping = false;
    }
  }

  /**
   * Set velocity directly
   */
  setVelocity(vx: number, vy: number): void {
    if (this.isStatic || !this.enabled) return;
    
    this.prevX = this.x - vx;
    this.prevY = this.y - vy;
    
    if (this.sleeping) {
      this.sleeping = false;
    }
  }

  /**
   * Verlet integration (uses effective physics values)
   */
  integrate(dt: number): void {
    if (this.isStatic || !this.enabled || this.sleeping) return;

    // Get effective physics values (with inheritance)
    const gravity = this.getEffectiveGravity();
    const friction = this.getEffectiveFriction();

    // Apply gravity
    this.ay += gravity;

    // Verlet: new = current + (current - previous) * friction + accel * dt²
    const vx = (this.x - this.prevX) * friction;
    const vy = (this.y - this.prevY) * friction;

    this.prevX = this.x;
    this.prevY = this.y;

    this.x += vx + this.ax * dt * dt;
    this.y += vy + this.ay * dt * dt;

    // Reset acceleration
    this.ax = 0;
    this.ay = 0;

    // Check for sleep
    const speed = Math.sqrt(vx * vx + vy * vy);
    if (speed < 0.1) {
      this.sleeping = true;
    }
  }

  /**
   * Constrain to bounds (if set)
   * Works in local coordinate space
   */
  constrainToBounds(): void {
    if (!this.bounds || this.isStatic || !this.enabled) return;

    const restitution = this.getEffectiveRestitution();
    const localPos = { x: this.x, y: this.y };

    // Bottom
    if (localPos.y + this.radius > this.bounds.height) {
      const diff = (this.bounds.height - this.radius) - localPos.y;
      this.y += diff;
      this.prevY = this.y + (this.y - this.prevY) * restitution;
      this.sleeping = false;
    }

    // Top
    if (localPos.y - this.radius < 0) {
      const diff = body.radius - localPos.y;
      this.y += diff;
      this.prevY = this.y - (this.y - this.prevY) * restitution;
      this.sleeping = false;
    }

    // Left
    if (localPos.x - this.radius < 0) {
      const diff = this.radius - localPos.x;
      this.x += diff;
      this.prevX = this.x - (this.x - this.prevX) * restitution;
      this.sleeping = false;
    }

    // Right
    if (localPos.x + this.radius > this.bounds.width) {
      const diff = (this.bounds.width - this.radius) - localPos.x;
      this.x += diff;
      this.prevX = this.x + (this.x - this.prevX) * restitution;
      this.sleeping = false;
    }
  }

  /**
   * Add a child body to this Body
   */
  addBody(body: Body): void {
    if (this.bodies.includes(body)) return;
    
    // Set physics parent
    body.physicsParent = this;
    
    // Convert world position to local coordinates relative to this body
    const thisWorldPos = this.getWorldPosition();
    const bodyWorldPos = body.getWorldPosition();
    
    body.x = bodyWorldPos.x - thisWorldPos.x;
    body.y = bodyWorldPos.y - thisWorldPos.y;
    
    this.bodies.push(body);
    
    // If this is a World, register for simulation
    if (this.isWorld) {
      (this as World).registerBody(body);
    }
  }

  /**
   * Remove a child body
   */
  removeBody(body: Body): void {
    const index = this.bodies.indexOf(body);
    if (index > -1) {
      this.bodies.splice(index, 1);
      body.physicsParent = null;
      
      if (this.isWorld) {
        (this as World).unregisterBody(body);
      }
    }
  }

  /**
   * Check if body has broken parent bounds (DOM parent)
   */
  isOutsideParentBounds(): boolean {
    if (!this.originalParent) return false;

    const parentBounds = this.originalParent.bounds;
    const worldPos = this.getWorldPosition();

    return (
      worldPos.x < parentBounds.left ||
      worldPos.x + this.width > parentBounds.right ||
      worldPos.y < parentBounds.top ||
      worldPos.y + this.height > parentBounds.bottom
    );
  }

  /**
   * Sync DOM element (ONLY modifies transform)
   */
  render(): void {
    // Compose transform with original transform if it exists
    const baseTransform = this.originalStyles.transform !== 'none' 
      ? this.originalStyles.transform + ' ' 
      : '';
    
    this.element.style.transform = 
      `${baseTransform}translate(${this.x}px, ${this.y}px)`;
    
    // Children render themselves (they have their own elements)
    // No need to compose transforms here - each Body renders its own element
  }

  /**
   * Reset to original position
   */
  reset(): void {
    this.x = 0;
    this.y = 0;
    this.prevX = 0;
    this.prevY = 0;
    this.ax = 0;
    this.ay = 0;
    this.sleeping = false;
    this.render();
  }

  /**
   * Restore original DOM state completely
   */
  restore(): void {
    for (const [prop, value] of Object.entries(this.originalStyles)) {
      this.element.style.setProperty(prop, value);
    }
  }
}
```

---

## World Class (Extends Body, Manages Simulation)

```typescript
class World extends Body {
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
    
    // Mark as World
    this.isWorld = true;
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
    
    // Render this World itself (if it has an element)
    this.render();

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
   */
  private detectAndResolveCollisions(): void {
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
    });

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
    this.reset(); // Reset this World itself
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
```

---

## Spatial Hash (Collision Optimization)

```typescript
class SpatialHash {
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
```

---

## How The System Works

### 1. Coordinate Systems

**Three coordinate spaces:**
- **DOM Space**: Original element positions (preserved)
- **Local Space**: Position relative to `physicsParent` (stored in `x`, `y`)
- **World Space**: Absolute position in root World (calculated via `getWorldPosition()`)

**Transformation chain:**
```
Local Position (x, y)
  + Origin Offset (originX, originY)
  + Parent World Position (recursive)
  = World Position
```

### 2. Physics Inheritance

**How it works:**
1. Body checks its own `gravity/friction/restitution`
2. If `null`, walks up `physicsParent` chain
3. Finds first World or Body with non-null value
4. Uses that value

**Example:**
```
World (gravity: 500)
  └── Body (gravity: null) → inherits 500
      └── Body (gravity: 200) → uses 200
          └── Body (gravity: null) → inherits 200 (from parent Body, not World)
```

### 3. Independent Simulation Loops

**Each World runs its own loop:**
- Root World: `requestAnimationFrame` → `step()` → render
- Nested World: `requestAnimationFrame` → `step()` → render (independent)

**Collision scope:**
- Bodies in World A only collide with other Bodies in World A
- World A (as a Body) can collide with Bodies in its parent World
- Nested Worlds don't automatically collide with each other (they're separate spaces)

### 4. Collision Detection

**Rules:**
1. Only Bodies registered in the same World collide
2. Worlds are Bodies, so they can collide with Bodies in parent World
3. Bodies inside nested Worlds only collide within that World
4. Spatial hashing optimizes collision checks

**Example:**
```
OuterWorld
  ├── Body1 (collides with Body2, InnerWorld)
  ├── Body2 (collides with Body1, InnerWorld)
  └── InnerWorld (collides with Body1, Body2)
      ├── Body3 (collides with Body4 only)
      └── Body4 (collides with Body3 only)
```

### 5. Bounds Constraints

**Any Body/World can have bounds:**
- Bounds work in **local coordinate space**
- Constrains the Body itself (if it's a Body)
- Constrains children (if it's a World or container Body)
- Applied after collision resolution

---

## Usage Examples

### Example 1: Backward Compatible (Current Demo)

```typescript
// Works exactly like current demo!
const worldElement = document.getElementById('world');
const world = new World(worldElement, {
  gravity: 400,
  friction: 0.97,
  restitution: 0.5
});

const spans = worldElement.querySelectorAll('span');
spans.forEach((span) => {
  const body = new Body(span as HTMLElement, world, {
    mass: 1,
    radius: 8,
    restitution: 0.6
  });
  world.registerBody(body);
});

world.start();
```

### Example 2: Nested Worlds

```typescript
// Root world
const outerWorld = new World(outerContainer, {
  gravity: 500,
  friction: 0.98
});

// Nested world (also a Body!)
const innerWorld = new World(innerContainer, {
  gravity: 200,  // Different gravity!
  friction: 0.95
});

// Add inner world to outer world
outerWorld.addBody(innerWorld);
innerWorld.start(); // Independent simulation loop

// Bodies in outer world
const outerBody = new Body(outerElement, outerWorld);
outerWorld.registerBody(outerBody);

// Bodies in inner world
const innerBody = new Body(innerElement, innerWorld);
innerWorld.registerBody(innerBody);

// Start both simulations
outerWorld.start();
innerWorld.start();

// innerWorld can collide with outerBody!
// innerBody only collides with other bodies in innerWorld
```

### Example 3: Physics Inheritance

```typescript
const world = new World(container, {
  gravity: 500,
  friction: 0.99,
  restitution: 0.8
});

// Inherits all physics from world
const body1 = new Body(element1, world);
body1.gravity === null; // Will inherit 500
body1.friction === null; // Will inherit 0.99

// Override gravity, inherit others
const body2 = new Body(element2, world, {
  gravity: 100  // Override to 100
});
body2.gravity === 100;
body2.friction === null; // Still inherits 0.99

// Override everything
const body3 = new Body(element3, world, {
  gravity: 0,
  friction: 1.0,
  restitution: 0.5
});
```

### Example 4: Body as Container

```typescript
const world = new World(container);

// Regular body that acts as container
const containerBody = new Body(containerElement, world, {
  bounds: { x: 0, y: 0, width: 200, height: 200 }
});

world.registerBody(containerBody);

// Add children to container body
const child1 = new Body(childElement1, containerBody);
containerBody.addBody(child1); // Automatically registered to world

const child2 = new Body(childElement2, containerBody);
containerBody.addBody(child2);

// Children are constrained by containerBody's bounds
// Children inherit physics from world (through containerBody)
```

### Example 5: Complex Nesting

```typescript
const rootWorld = new World(rootContainer, { gravity: 600 });

// Level 1: Regular body
const level1Body = new Body(level1Element, rootWorld);
rootWorld.registerBody(level1Body);

// Level 2: Nested world
const level2World = new World(level2Container, { gravity: 300 });
level1Body.addBody(level2World); // World added as child of Body!
level2World.start();

// Level 3: Body in nested world
const level3Body = new Body(level3Element, level2World);
level2World.registerBody(level3Body);

// Collision rules:
// - level1Body collides with other bodies in rootWorld
// - level2World collides with bodies in rootWorld (its parent)
// - level3Body collides with other bodies in level2World
```

---

## Key Design Decisions

### 1. Why World extends Body?
- Enables recursive nesting
- Worlds can be treated as Bodies (collision, positioning)
- Minimal API surface (same methods work everywhere)

### 2. Why independent simulation loops?
- Nested Worlds are truly independent physics spaces
- Different gravity, friction, timeStep per World
- Better performance (can pause/stop nested Worlds independently)

### 3. Why physics inheritance?
- Reduces configuration boilerplate
- Bodies inherit sensible defaults from parent World
- Can still override when needed

### 4. Why local coordinates?
- Bodies move relative to their parent
- Enables compound objects (car with wheels)
- Easier to reason about nested structures

### 5. Why preserve DOM structure?
- Framework compatibility (React, Vue, etc.)
- CSS continues to work
- Event handlers remain attached
- Easy to restore original state

---

## Best Practices

### 1. Always register Bodies to a World
```typescript
// Good
const body = new Body(element, world);
world.registerBody(body);

// Also good (if adding to parent Body that's in a World)
const parentBody = new Body(parentElement, world);
world.registerBody(parentBody);
const childBody = new Body(childElement, parentBody);
parentBody.addBody(childBody); // Automatically registered
```

### 2. Start nested Worlds explicitly
```typescript
const innerWorld = new World(innerContainer);
outerWorld.addBody(innerWorld);
innerWorld.start(); // Must start explicitly
```

### 3. Use bounds for containers
```typescript
const containerBody = new Body(containerElement, world, {
  bounds: { x: 0, y: 0, width: 200, height: 200 }
});
// Children will be constrained
```

### 4. Clean up properly
```typescript
// Stop all nested Worlds first
innerWorld.stop();
outerWorld.stop();

// Then destroy
outerWorld.destroy(); // Restores DOM, clears arrays
```

### 5. Use physics inheritance wisely
```typescript
// Most bodies inherit (simpler)
const body = new Body(element, world);

// Override only when needed
const specialBody = new Body(element, world, {
  gravity: 0  // No gravity for this one
});
```

---

## Summary

This architecture provides:

✅ **Recursive nesting** - Worlds contain Bodies, Bodies contain Bodies  
✅ **Independent simulations** - Each World runs its own loop  
✅ **Worlds as Bodies** - Worlds can collide with Bodies outside themselves  
✅ **Physics inheritance** - Bodies inherit from parent World (optional override)  
✅ **Flexible bounds** - Any Body/World can constrain children  
✅ **DOM preservation** - Original structure never modified  
✅ **Backward compatible** - Current demo works unchanged  
✅ **Minimal complexity** - Simple API, clear mental model  

The system is designed to be **framework-agnostic**, **performant**, and **easy to use** while supporting advanced nested physics scenarios.
