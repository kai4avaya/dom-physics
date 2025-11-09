# DOM Physics Engine Architecture Plan (TypeScript)

## The Core Insight: Preserve DOM, Flatten Physics

You're absolutely right - **we must preserve the original DOM structure completely**. The physics engine doesn't restructure anything, it only:

1. **Reads** the DOM hierarchy and styles
2. **Manipulates** transform properties
3. **Remembers** the original relationships

```
DOM Structure (PRESERVED):           Physics Simulation (FLATTENED):
<div class="container">              World.bodies = [
  <h1>Title</h1>          ──────────→   Body { element: <h1>, parent: <div> }
  <div class="nested">    ──────────→   Body { element: <div>, parent: <div> }
    <span>Text</span>     ──────────→   Body { element: <span>, parent: <div.nested> }
  </div>                               ]
</div>

CSS Classes Intact ✓                 Original parent refs preserved ✓
Layout properties kept ✓             Can query parent anytime ✓
Event handlers work ✓                Can break bounds but know origin ✓
```

**Key: Bodies store references to their DOM parent, but simulate in world space.**

---

## TypeScript Architecture

### Type Definitions

```typescript
// Core vector math
interface Vec2 {
  x: number;
  y: number;
}

// Physics configuration
interface WorldConfig {
  gravity?: number;        // px/s²
  friction?: number;       // 0-1, velocity damping
  restitution?: number;    // 0-1, bounciness
  bounds?: Bounds | null;  // null = use container size
  timeStep?: number;       // fixed timestep (default 1/60)
}

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Body configuration
interface BodyConfig {
  mass?: number;
  radius?: number;
  width?: number;
  height?: number;
  restitution?: number;    // null = use world default
  friction?: number;       // null = use world default
  isStatic?: boolean;
  collisionGroup?: number;
  collidesWith?: number;   // bitmask
  initialVelocity?: Vec2;
}

// Collision callback data
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

### Body Class (Preserves DOM Context)

```typescript
class Body {
  // DOM references (NEVER modified)
  readonly element: HTMLElement;
  readonly originalParent: ParentInfo | null;
  readonly originalPosition: DOMRect;
  readonly originalStyles: {
    position: string;
    transform: string;
    display: string;
    [key: string]: string;
  };

  // Physics state (world-space coordinates)
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  ax: number;  // acceleration
  ay: number;

  // Physical properties
  mass: number;
  radius: number;
  width: number;
  height: number;
  restitution: number | null;
  friction: number | null;

  // Flags
  isStatic: boolean;
  sleeping: boolean;
  enabled: boolean;
  
  // Collision filtering
  collisionGroup: number;
  collidesWith: number;

  // Origin offset (for transform composition)
  private originX: number;
  private originY: number;

  constructor(element: HTMLElement, world: World, config: BodyConfig = {}) {
    this.element = element;

    // PRESERVE original DOM context
    this.originalParent = this.captureParentInfo();
    this.originalPosition = element.getBoundingClientRect();
    this.originalStyles = this.captureStyles([
      'position', 'transform', 'display', 'zIndex'
    ]);

    // Calculate world-space origin
    const worldRect = world.container.getBoundingClientRect();
    this.originX = this.originalPosition.left - worldRect.left;
    this.originY = this.originalPosition.top - worldRect.top;

    // Initialize physics position at origin
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
    this.restitution = config.restitution ?? null;
    this.friction = config.friction ?? null;

    // Flags
    this.isStatic = config.isStatic ?? false;
    this.sleeping = false;
    this.enabled = true;
    
    // Collision filtering
    this.collisionGroup = config.collisionGroup ?? 1;
    this.collidesWith = config.collidesWith ?? 0xFFFFFFFF;

    // Ensure element can be transformed
    if (getComputedStyle(element).display === 'inline') {
      element.style.display = 'inline-block';
    }
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
   * Check if body has broken parent bounds
   */
  isOutsideParentBounds(): boolean {
    if (!this.originalParent) return false;

    const parentBounds = this.originalParent.bounds;
    const worldX = this.originX + this.x;
    const worldY = this.originY + this.y;

    return (
      worldX < parentBounds.left ||
      worldX + this.width > parentBounds.right ||
      worldY < parentBounds.top ||
      worldY + this.height > parentBounds.bottom
    );
  }

  /**
   * Get current world-space position
   */
  getWorldPosition(): Vec2 {
    return {
      x: this.originX + this.x,
      y: this.originY + this.y
    };
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
   * Verlet integration
   */
  integrate(dt: number, world: World): void {
    if (this.isStatic || !this.enabled || this.sleeping) return;

    // Get effective friction
    const friction = this.friction ?? world.friction;

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
   * Sync DOM element (ONLY modifies transform)
   */
  render(): void {
    // Compose transform with original transform if it exists
    const baseTransform = this.originalStyles.transform !== 'none' 
      ? this.originalStyles.transform + ' ' 
      : '';
    
    this.element.style.transform = 
      `${baseTransform}translate(${this.x}px, ${this.y}px)`;
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

### World Class (Manages Simulation)

```typescript
class World {
  readonly container: HTMLElement;
  readonly bodies: Body[] = [];
  
  // Physics parameters
  gravity: number;
  friction: number;
  restitution: number;
  bounds: Bounds | null;
  timeStep: number;

  // Simulation state
  private running: boolean = false;
  private lastTime: number = 0;
  private accumulator: number = 0;
  private rafId: number | null = null;

  // Event listeners
  private listeners: Map<string, Function[]> = new Map();

  // Spatial optimization
  private spatialHash: SpatialHash | null = null;

  constructor(container: HTMLElement, config: WorldConfig = {}) {
    this.container = container;
    this.gravity = config.gravity ?? 980;
    this.friction = config.friction ?? 0.99;
    this.restitution = config.restitution ?? 0.8;
    this.timeStep = config.timeStep ?? 1 / 60;

    // Auto-detect bounds
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
   * Register a body for simulation
   * DOES NOT modify DOM structure
   */
  registerBody(body: Body): void {
    if (this.bodies.includes(body)) return;
    this.bodies.push(body);
    this.emit('bodyAdded', { body });
  }

  /**
   * Unregister a body
   * DOES NOT remove from DOM
   */
  unregisterBody(body: Body): void {
    const index = this.bodies.indexOf(body);
    if (index > -1) {
      this.bodies.splice(index, 1);
      this.emit('bodyRemoved', { body });
    }
  }

  /**
   * Query bodies by parent element
   */
  getBodiesByParent(parent: HTMLElement): Body[] {
    return this.bodies.filter(
      body => body.originalParent?.element === parent
    );
  }

  /**
   * Query bodies that escaped parent bounds
   */
  getEscapedBodies(): Body[] {
    return this.bodies.filter(body => body.isOutsideParentBounds());
  }

  /**
   * Main simulation loop
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

    // Render all bodies
    for (const body of this.bodies) {
      body.render();
    }

    this.rafId = requestAnimationFrame(this.loop);
  };

  /**
   * Single physics step
   */
  private step(): void {
    // Apply gravity and integrate
    for (const body of this.bodies) {
      if (!body.isStatic && body.enabled) {
        body.ay += this.gravity;
      }
      body.integrate(this.timeStep, this);
    }

    // Collision detection & resolution
    this.detectAndResolveCollisions();

    // Apply constraints
    if (this.bounds) {
      for (const body of this.bodies) {
        this.constrainToBounds(body);
      }
    }
  }

  /**
   * Collision detection with spatial hashing
   */
  private detectAndResolveCollisions(): void {
    if (!this.spatialHash) return;

    this.spatialHash.clear();
    
    // Insert all bodies into spatial hash
    for (const body of this.bodies) {
      if (body.enabled) {
        this.spatialHash.insert(body);
      }
    }

    // Get potential collision pairs
    const pairs = this.spatialHash.getPairs();

    for (const [bodyA, bodyB] of pairs) {
      // Check collision group filtering
      if (!(bodyA.collisionGroup & bodyB.collidesWith) ||
          !(bodyB.collisionGroup & bodyA.collidesWith)) {
        continue;
      }

      this.resolveCollision(bodyA, bodyB);
    }
  }

  /**
   * Resolve collision between two bodies
   */
  private resolveCollision(a: Body, b: Body): void {
    const dx = b.x + b.originX - (a.x + a.originX);
    const dy = b.y + b.originY - (a.y + a.originY);
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
      a.restitution ?? this.restitution,
      b.restitution ?? this.restitution
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
   * Constrain body to world bounds
   */
  private constrainToBounds(body: Body): void {
    if (!this.bounds || body.isStatic || !body.enabled) return;

    const restitution = body.restitution ?? this.restitution;
    const worldPos = body.getWorldPosition();

    // Bottom
    if (worldPos.y + body.radius > this.bounds.height) {
      const diff = (this.bounds.height - body.radius) - worldPos.y;
      body.y += diff;
      body.prevY = body.y + (body.y - body.prevY) * restitution;
      body.sleeping = false;
    }

    // Top
    if (worldPos.y - body.radius < 0) {
      const diff = body.radius - worldPos.y;
      body.y += diff;
      body.prevY = body.y - (body.y - body.prevY) * restitution;
      body.sleeping = false;
    }

    // Left
    if (worldPos.x - body.radius < 0) {
      const diff = body.radius - worldPos.x;
      body.x += diff;
      body.prevX = body.x - (body.x - body.prevX) * restitution;
      body.sleeping = false;
    }

    // Right
    if (worldPos.x + body.radius > this.bounds.width) {
      const diff = (this.bounds.width - body.radius) - worldPos.x;
      body.x += diff;
      body.prevX = body.x + (body.x - body.prevX) * restitution;
      body.sleeping = false;
    }
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
   * Start simulation
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.loop);
  }

  /**
   * Stop simulation
   */
  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /**
   * Reset all bodies to original positions
   */
  reset(): void {
    for (const body of this.bodies) {
      body.reset();
    }
  }

  /**
   * Cleanup - restore all DOM elements
   */
  destroy(): void {
    this.stop();
    for (const body of this.bodies) {
      body.restore();
    }
    this.bodies.length = 0;
  }
}
```

---

### Spatial Hash (Collision Optimization)

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

## Usage Example: Text with Nested DOM

```typescript
// HTML structure (COMPLETELY PRESERVED):
/*
<div id="world" class="container">
  <div class="header" style="padding: 20px; background: blue;">
    <h1 style="color: white;">
      <span>H</span><span>E</span><span>L</span><span>L</span><span>O</span>
    </h1>
  </div>
  <div class="content" style="border: 2px solid red;">
    <p class="text">
      <span>W</span><span>O</span><span>R</span><span>L</span><span>D</span>
    </p>
  </div>
</div>
*/

// Initialize world
const container = document.getElementById('world')!;
const world = new World(container, {
  gravity: 600,
  friction: 0.98,
  restitution: 0.7
});

// Register all spans as physics bodies
const spans = container.querySelectorAll('span');
const bodies: Body[] = [];

spans.forEach((span) => {
  const body = new Body(span as HTMLElement, world, {
    mass: 1,
    radius: 15,
    restitution: 0.8
  });
  
  world.registerBody(body);
  bodies.push(body);
});

// Check which bodies escaped their parent
world.on('collision', (event: CollisionEvent) => {
  const { bodyA, bodyB } = event;
  
  // Check if they have same parent
  if (bodyA.originalParent?.element === bodyB.originalParent?.element) {
    console.log('Siblings collided!');
  }
  
  // Check if they escaped parent bounds
  if (bodyA.isOutsideParentBounds()) {
    console.log('Body A escaped its parent:', bodyA.originalParent?.element);
  }
});

// Mouse interaction
container.addEventListener('mousemove', (e) => {
  const rect = container.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  bodies.forEach(body => {
    const worldPos = body.getWorldPosition();
    const dx = worldPos.x - mx;
    const dy = worldPos.y - my;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 100 && dist > 0) {
      const force = (100 - dist) * 50;
      body.applyForce(
        (dx / dist) * force,
        (dy / dist) * force
      );
    }
  });
});

world.start();

// Later: completely restore original DOM
// world.destroy(); // All CSS and transforms restored
```

---

## Key Benefits of This Approach

### 1. **DOM Structure Preserved**
```typescript
// Before physics:
<div class="parent">
  <span class="child">A</span>
</div>

// After physics (structure unchanged!):
<div class="parent">
  <span class="child" style="transform: translate(50px, 100px)">A</span>
</div>
```

### 2. **Original CSS Intact**
```typescript
body.originalStyles = {
  position: 'relative',
  transform: 'rotate(45deg)',  // User's transform
  display: 'inline-block'
}

// Physics composes with original:
body.render(); 
// Result: "rotate(45deg) translate(50px, 100px)"
```

### 3. **Parent Awareness**
```typescript
// Body always knows its parent
if (body.originalParent) {
  console.log('Parent element:', body.originalParent.element);
  console.log('Parent padding:', body.originalParent.computedStyle.padding);
  console.log('Escaped bounds?', body.isOutsideParentBounds());
}
```

### 4. **Framework Integration**
```typescript
// React example
function PhysicsText({ children }: { children: string }) {
  const worldRef = useRef<World>(null);
  
  return (
    <div ref={el => worldRef.current = new World(el!)}>
      {children.split('').map((char, i) => (
        <PhysicsChar key={i} world={worldRef.current}>
          {char}
        </PhysicsChar>
      ))}
    </div>
  );
}
```

### 5. **Complete Restoration**
```typescript
// Revert everything back to original state
world.destroy();

// All bodies restore their original:
// - transform
// - position
// - display
// - Any other modified properties
```

---

## Summary

**The physics engine never touches the DOM tree structure.** It only:

1. ✅ Reads element positions and parent relationships
2. ✅ Stores references to parents and original styles
3. ✅ Manipulates `transform` property only
4. ✅ Allows querying parent relationships during simulation
5. ✅ Can detect when bodies escape parent bounds
6. ✅ Fully restores original DOM state on cleanup

Bodies remember their "home" (parent, original position, original styles) even when flying around the screen. The DOM tree stays completely intact.
