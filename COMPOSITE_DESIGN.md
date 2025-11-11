# Composite Design for DOM Physics

## Overview
A `Composite` is a collection of bodies and constraints that can be managed together. This makes it easy to create complex structures like soft bodies, cloth, chains, etc.

## Design Goals
1. **Simplicity**: One function call to create a soft body
2. **Flexibility**: Can create various patterns (grid, mesh, chain, etc.)
3. **Consistency**: Follow Matter.js patterns where applicable
4. **DOM Integration**: Work seamlessly with our DOM-based system

## Proposed Structure

### Composite Class
```typescript
export class Composite {
  bodies: Body[];
  constraints: Constraint[];
  label?: string;
  
  constructor(bodies: Body[], constraints: Constraint[], label?: string);
  
  // Register all bodies and constraints with world
  register(world: World): void;
  
  // Remove all bodies and constraints from world
  remove(world: World): void;
}
```

### Helper Functions (Static/Module-level)

#### 1. `createSoftBody()` - Grid-based soft body
```typescript
createSoftBody(
  world: World,
  container: HTMLElement,
  x: number,
  y: number,
  columns: number,
  rows: number,
  particleRadius: number,
  spacing?: number,
  options?: {
    stiffness?: number;
    damping?: number;
    crossBrace?: boolean; // Add diagonal constraints
    particleOptions?: Partial<BodyConfig>;
  }
): Composite
```

**Key Features:**
- Creates a grid of circular particles
- Connects adjacent particles with constraints
- Optional cross-bracing for stability
- Returns a Composite for easy management

**Matter.js Equivalents:**
- `Composites.stack()` - Creates grid of bodies
- `Composites.mesh()` - Connects bodies with constraints

#### 2. `createCloth()` - Hanging cloth
```typescript
createCloth(
  world: World,
  container: HTMLElement,
  x: number,
  y: number,
  columns: number,
  rows: number,
  particleRadius: number,
  spacing?: number,
  options?: {
    stiffness?: number;
    damping?: number;
    pinTop?: boolean; // Make top row static
  }
): Composite
```

**Key Features:**
- Similar to soft body but optimized for cloth
- Lower stiffness (0.06 vs 0.2)
- Option to pin top row
- Collision filtering to prevent self-collision

#### 3. `createChain()` - Chain pendulum (already exists, could be moved here)
```typescript
createChain(
  world: World,
  container: HTMLElement,
  startX: number,
  startY: number,
  numLinks: number,
  linkLength: number,
  options?: {
    linkMass?: number;
    stiffness?: number;
    damping?: number;
  }
): Composite
```

## Implementation Approach

### Option A: Separate Composite.ts file
**Pros:**
- Clean separation of concerns
- Easy to extend with new composite types
- Matches Matter.js structure

**Cons:**
- Another file to maintain
- Need to export from index.ts

### Option B: Add to World.ts as static methods
**Pros:**
- Everything in one place
- No need for separate Composite class

**Cons:**
- World.ts becomes large
- Less flexible for future extensions

### Option C: Separate module file (composites.ts)
**Pros:**
- All composite helpers in one place
- No Composite class needed (just return arrays)
- Simple and lightweight

**Cons:**
- Less object-oriented
- Can't easily manage composites as units

## Recommendation: Option A + C Hybrid

**Structure:**
- `Composite.ts` - Composite class for managing collections
- `composites.ts` - Helper functions for creating common patterns
- Export both from `index.ts`

**Why:**
- Composite class provides structure for managing groups
- Helper functions provide convenience
- Users can use either approach
- Easy to extend

## Key Implementation Details

### Matter.js Patterns to Follow:

1. **Particle Properties:**
   - `inertia: Infinity` - Prevents rotation (we don't have rotation yet, but good to note)
   - Low friction (0.05-0.00001)
   - Collision filtering for self-collision prevention

2. **Constraint Properties:**
   - Soft body: `stiffness: 0.2`
   - Cloth: `stiffness: 0.06`
   - Damping: `0.1-0.3` for stability

3. **Grid Creation:**
   - Use spacing to position particles
   - Calculate actual distances for constraint lengths
   - Support cross-bracing (diagonal constraints)

4. **Collision Handling:**
   - Use constraint network detection (already implemented)
   - Option for collision groups (future enhancement)

## Example Usage

```typescript
import { World, createSoftBody } from 'dom-physics';

const world = new World(container);
const softBody = createSoftBody(
  world,
  container,
  400, 300,  // x, y
  8, 3,      // columns, rows
  15,        // particle radius
  30,        // spacing
  {
    stiffness: 0.2,
    damping: 0.1,
    crossBrace: true
  }
);

// softBody is a Composite - can be removed later
// softBody.remove(world);
```

## Migration Path

1. Create `Composite.ts` with basic class
2. Create `composites.ts` with `createSoftBody()` helper
3. Update `demo-softbody.html` to use new helper
4. Add more helpers as needed (`createCloth`, etc.)
5. Export from `index.ts`

## Future Enhancements

- `createRope()` - Rope/chain with different properties
- `createBlob()` - Circular soft body
- `createMesh()` - Custom mesh pattern
- Collision groups for better self-collision handling
- Composite-level operations (remove all, set properties, etc.)
