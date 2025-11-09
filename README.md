# DOM Physics Engine

A simple, performant physics engine for DOM elements. Preserves DOM structure while enabling realistic physics simulation. Built with TypeScript.

🌐 **[Live Demos on GitHub Pages](https://kai4avaya.github.io/dom-physics/)** | 📦 [npm](https://www.npmjs.com/package/dom-physics)

## Why This Package?

### Simple & Fast
- **No complex nesting** - Simple `Body` and `World` classes
- **Direct physics** - No inheritance chains or recursive lookups
- **Optimized collision detection** - Simple O(n²) for small counts, efficient for most use cases
- **Minimal overhead** - Only manipulates CSS `transform` properties

### What Changed from Complex Version?

The previous version had advanced features like:
- World extending Body (nesting)
- Physics inheritance with recursive lookups
- SpatialHash optimization
- Complex coordinate transformations

**Why we simplified:**
1. **Performance** - Recursive lookups (`getEffectiveGravity()`, `getWorldPosition()`) were called every frame, causing O(n) complexity
2. **Simplicity** - Most use cases don't need nesting - a simple World with Bodies is enough
3. **Reliability** - Fewer moving parts = fewer bugs
4. **Maintainability** - Easier to understand and modify

**Result:** The simplified version matches the original demo's performance exactly while being much easier to use and understand.

## Features

✅ **DOM Structure Preserved** - Never modifies DOM hierarchy, only manipulates transforms  
✅ **Simple API** - Just `World` and `Body` classes  
✅ **Framework Agnostic** - Works with vanilla JS, React, Vue, etc.  
✅ **TypeScript** - Full type safety and IntelliSense support  
✅ **Performant** - Optimized for 60fps with many bodies  

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

// Create a body
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

## Demos

🌐 **[Try all demos live](https://kai4avaya.github.io/dom-physics/)**

- **Text Demo** - Interactive text that responds to mouse movement
- **Squares Demo** - Click to add squares, hover to push them around
- **Bouncing Balls** - Colorful balls bouncing in a circular container
- **Stack Demo** - Build towers by clicking, watch blocks stack

### Running Demos Locally

```bash
# Install the package
npm install dom-physics

# Run demos (if developing the package)
npm run demo:package

# Then open http://localhost:3000/demo-package/
```

## API Reference

### World

```typescript
class World {
  constructor(container: HTMLElement, config?: WorldConfig)
  
  // Simulation control
  start(): void
  stop(): void
  
  // Body management
  registerBody(body: Body): void
  unregisterBody(body: Body): void
  
  // Properties
  container: HTMLElement
  bodies: Body[]
  gravity: number
  friction: number
  restitution: number
  timeStep: number
  bounds: { x: number; y: number; width: number; height: number }
}
```

### Body

```typescript
class Body {
  constructor(
    element: HTMLElement,
    world: World,
    config?: BodyConfig
  )
  
  // Physics control
  applyForce(fx: number, fy: number): void
  
  // Position queries
  getWorldPosition(): { x: number; y: number }
  
  // Rendering
  render(): void
  
  // Properties
  element: HTMLElement
  world: World
  x: number
  y: number
  mass: number
  radius: number
  restitution: number | null
  friction: number | null
  isStatic: boolean
  enabled: boolean
}
```

## Configuration

### WorldConfig

```typescript
interface WorldConfig {
  gravity?: number;        // px/s² (default: 980)
  friction?: number;       // 0-1 (default: 0.99)
  restitution?: number;    // 0-1 (default: 0.8)
  bounds?: {               // Default: auto-detect from container
    x: number;
    y: number;
    width: number;
    height: number;
  };
  timeStep?: number;       // seconds (default: 1/60)
}
```

### BodyConfig

```typescript
interface BodyConfig {
  mass?: number;           // Default: 1
  radius?: number;          // Default: auto-calculated from element size
  restitution?: number | null;  // null = use world's restitution
  friction?: number | null;     // null = use world's friction
  isStatic?: boolean;      // Default: false
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

### Mouse Interaction

```typescript
container.addEventListener('mousemove', (e) => {
  const rect = container.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  
  world.bodies.forEach(body => {
    const pos = body.getWorldPosition();
    const dx = pos.x - mx;
    const dy = pos.y - my;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist < 100 && dist > 0) {
      const force = (100 - dist) * 2;
      body.applyForce(
        (dx / dist) * force,
        (dy / dist) * force
      );
    }
  });
});
```

### Custom Physics Properties

```typescript
// Body uses world's friction and restitution
const body1 = new Body(element1, world);

// Body overrides restitution
const body2 = new Body(element2, world, {
  restitution: 0.9  // Bouncier than world default
});

// Body overrides friction
const body3 = new Body(element3, world, {
  friction: 0.95  // Less friction than world default
});
```

## Principles

1. **DOM Structure Preserved** - Never modifies DOM hierarchy
2. **Transform Only** - Only manipulates `transform` CSS property
3. **World Space Simulation** - Bodies simulate in world space, render relative to DOM
4. **Simple & Fast** - No unnecessary complexity

## Testing

```bash
npm test              # Run tests in watch mode
npm run test:run      # Run tests once
npm run test:coverage # Run tests with coverage
```

## License

MIT
