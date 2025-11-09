# DOM Physics Engine

A physics engine for DOM elements that preserves DOM structure while enabling physics simulation. Built with TypeScript, supports recursive nesting, independent simulation loops, and physics inheritance.

🌐 **[Live Demo on GitHub Pages](https://kai4avaya.github.io/dom-physics/)** | 📦 [npm](https://www.npmjs.com/package/dom-physics)

## Features

✅ **DOM Structure Preserved** - Never modifies DOM hierarchy, only manipulates transforms  
✅ **Recursive Nesting** - Worlds extend Bodies, enabling nested physics spaces  
✅ **Independent Simulations** - Each World runs its own simulation loop  
✅ **Physics Inheritance** - Bodies inherit gravity/friction/restitution from parent World  
✅ **Worlds as Bodies** - Worlds can collide with Bodies outside themselves  
✅ **Flexible Bounds** - Any Body/World can constrain its children  
✅ **Framework Agnostic** - Works with vanilla JS, React, Vue, etc.  
✅ **TypeScript** - Full type safety and IntelliSense support  

## Installation

```bash
npm install dom-physics
```

## Quick Start

```typescript
import { World, Body } from 'dom-physics';

// Create a world
const container = document.getElementById('world');
const world = new World(container, {
  gravity: 400,
  friction: 0.97,
  restitution: 0.5
});

// Create bodies
const element = document.querySelector('.my-element');
const body = new Body(element, world, {
  mass: 1,
  radius: 15,
  restitution: 0.8
});

// Register and start
world.registerBody(body);
world.start();
```

## Running the Demo

After installing the package, you can run the included demo:

```bash
# Install the package
npm install dom-physics

# Run the demo (uses the package)
cd node_modules/dom-physics
npm run demo:package

# Or if you're developing the package
npm run demo          # Original inline demo
npm run demo:package  # Package-based demo
```

Then open http://localhost:3000 in your browser.

## Testing

Run the test suite:

```bash
npm test              # Run tests in watch mode
npm run test:run      # Run tests once
npm run test:coverage # Run tests with coverage
```

## Architecture

### World extends Body

The core insight: **World extends Body**, enabling recursive nesting:

- Worlds can contain Bodies
- Bodies can contain Bodies (because any Body could be a World)
- Worlds can be nested inside Worlds
- Worlds can collide with Bodies outside themselves

### Independent Simulation Loops

Each World runs its own `requestAnimationFrame` loop:

```typescript
const outerWorld = new World(outerContainer, { gravity: 500 });
const innerWorld = new World(innerContainer, { gravity: 200 });

outerWorld.addBody(innerWorld); // World added as Body!
innerWorld.start(); // Independent simulation loop
outerWorld.start(); // Separate simulation loop
```

### Physics Inheritance

Bodies inherit physics properties from their parent World:

```typescript
const world = new World(container, { gravity: 500 });

// Inherits gravity: 500
const body1 = new Body(element1, world);

// Override gravity to 100
const body2 = new Body(element2, world, { gravity: 100 });
```

## API Reference

### World

```typescript
class World extends Body {
  constructor(container: HTMLElement, config?: WorldConfig)
  
  // Simulation control
  start(): void
  stop(): void
  
  // Body management
  registerBody(body: Body): void
  unregisterBody(body: Body): void
  
  // Queries
  getBodiesByParent(parent: HTMLElement): Body[]
  getEscapedBodies(): Body[]
  
  // Events
  on(event: string, callback: Function): void
  off(event: string, callback: Function): void
  
  // Lifecycle
  reset(): void
  destroy(): void
}
```

### Body

```typescript
class Body {
  constructor(
    element: HTMLElement,
    physicsParent: Body | null,
    config?: BodyConfig
  )
  
  // Physics control
  applyForce(fx: number, fy: number): void
  setVelocity(vx: number, vy: number): void
  
  // Hierarchy
  addBody(body: Body): void
  removeBody(body: Body): void
  
  // Position queries
  getWorldPosition(): Vec2
  getLocalPosition(): Vec2
  getVelocity(): Vec2
  
  // Physics inheritance
  getEffectiveGravity(): number
  getEffectiveFriction(): number
  getEffectiveRestitution(): number
  
  // State
  reset(): void
  restore(): void
  render(): void
}
```

## Examples

### Basic Usage

```typescript
const world = new World(container, {
  gravity: 400,
  friction: 0.97,
  restitution: 0.5
});

const body = new Body(element, world, {
  mass: 1,
  radius: 15
});

world.registerBody(body);
world.start();
```

### Nested Worlds

```typescript
const outerWorld = new World(outerContainer, { gravity: 500 });
const innerWorld = new World(innerContainer, { gravity: 200 });

outerWorld.addBody(innerWorld);
innerWorld.start();
outerWorld.start();

// Bodies in inner world
const innerBody = new Body(innerElement, innerWorld);
innerWorld.registerBody(innerBody);
```

### Physics Inheritance

```typescript
const world = new World(container, {
  gravity: 500,
  friction: 0.99
});

// Inherits all physics
const body1 = new Body(element1, world);

// Override gravity only
const body2 = new Body(element2, world, {
  gravity: 100  // Override
  // friction: null (inherits 0.99)
});
```

### Body as Container

```typescript
const containerBody = new Body(containerElement, world, {
  bounds: { x: 0, y: 0, width: 200, height: 200 }
});

world.registerBody(containerBody);

const childBody = new Body(childElement, containerBody);
containerBody.addBody(childBody); // Automatically registered to world
```

## Configuration

### WorldConfig

```typescript
interface WorldConfig {
  gravity?: number;        // px/s² (default: 980)
  friction?: number;       // 0-1 (default: 0.99)
  restitution?: number;    // 0-1 (default: 0.8)
  bounds?: Bounds | null;  // null = auto-detect
  timeStep?: number;       // seconds (default: 1/60)
}
```

### BodyConfig

```typescript
interface BodyConfig {
  mass?: number;
  radius?: number;
  width?: number;
  height?: number;
  
  // null = inherit from parent World
  gravity?: number | null;
  friction?: number | null;
  restitution?: number | null;
  
  bounds?: Bounds | null;
  isStatic?: boolean;
  enabled?: boolean;
  
  collisionGroup?: number;
  collidesWith?: number;
  
  initialVelocity?: Vec2;
}
```

## Principles

1. **DOM Structure Preserved** - Never modifies DOM hierarchy
2. **Transform Only** - Only manipulates `transform` CSS property
3. **Original State Remembered** - Can restore original DOM state
4. **World Space Simulation** - Bodies simulate in world space, render relative to DOM
5. **Recursive Nesting** - Worlds extend Bodies for maximum flexibility

## License

MIT
