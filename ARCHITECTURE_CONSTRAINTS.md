# Constraint System Architecture Proposal

## Overview
Add constraint system to enable pendular motion, chains, and cloth-like structures while maintaining clean separation of concerns.

## Architecture Design

### 1. **Constraint Class** (`src/Constraint.ts`)

```typescript
export interface ConstraintConfig {
  bodyA: Body | null;        // null = fixed world point
  bodyB: Body;               // Required - the body to constrain
  pointA?: { x: number; y: number };  // World point if bodyA=null, else local to bodyA
  pointB?: { x: number; y: number };  // Local point on bodyB (default: center)
  length?: number;            // Target distance (0 = pin joint)
  stiffness?: number;         // 0-1, higher = stiffer (default: 0.7 for pin, 1.0 for distance)
  damping?: number;           // 0-1, energy loss (default: 0)
}

export class Constraint {
  bodyA: Body | null;
  bodyB: Body;
  pointA: { x: number; y: number };
  pointB: { x: number; y: number };
  length: number;            // Target distance
  stiffness: number;         // How rigid the constraint is
  damping: number;           // Energy loss
  
  // Internal state
  private _currentLength: number;
  
  constructor(config: ConstraintConfig);
  solve(dt: number): void;   // Apply constraint forces
  getWorldPointA(): { x: number; y: number };
  getWorldPointB(): { x: number; y: number };
}
```

**Key Design Decisions:**
- **Separate class**: Keeps concerns separated, easy to test
- **World manages constraints**: Similar to bodies, World owns the constraint list
- **Position-based solving**: Direct position correction (simpler than force-based)
- **Support fixed points**: `bodyA = null` allows world-anchored constraints (pendulums)

### 2. **World Integration**

```typescript
export class World {
  bodies: Body[];
  constraints: Constraint[];  // NEW
  
  registerConstraint(constraint: Constraint): void;
  removeConstraint(constraint: Constraint): void;
  
  private step(): void {
    // 1. Apply gravity
    this._bodiesApplyGravity();
    
    // 2. Integrate bodies
    for (const body of this.bodies) {
      body.integrate(this.timeStep, this);
    }
    
    // 3. Solve constraints (NEW - multiple passes for stability)
    for (let i = 0; i < 2; i++) {  // 2 passes like Matter.js
      for (const constraint of this.constraints) {
        constraint.solve(this.timeStep);
      }
    }
    
    // 4. Collision detection
    // ... existing collision code
    
    // 5. Bounds
    // ... existing bounds code
  }
}
```

**Why this order:**
1. Gravity first (accumulates forces)
2. Integration (moves bodies)
3. Constraints (corrects positions to maintain connections)
4. Collisions (resolves overlaps)
5. Bounds (keeps in world)

### 3. **Constraint Solving Algorithm**

**Position-Based Constraint Solving** (simpler than force-based):

```typescript
solve(dt: number): void {
  // Get world positions of constraint points
  const worldA = this.getWorldPointA();
  const worldB = this.getWorldPointB();
  
  // Calculate current distance
  const dx = worldB.x - worldA.x;
  const dy = worldB.y - worldA.y;
  const currentLength = Math.sqrt(dx * dx + dy * dy);
  
  if (currentLength === 0) return; // Avoid division by zero
  
  // Calculate how much we need to correct
  const difference = currentLength - this.length;
  const correction = difference * this.stiffness;
  
  // Normalize direction
  const nx = dx / currentLength;
  const ny = dy / currentLength;
  
  // Apply correction based on mass ratios
  if (this.bodyA && !this.bodyA.isStatic) {
    const ratioA = this.bodyB.mass / (this.bodyA.mass + this.bodyB.mass);
    this.bodyA.x += nx * correction * ratioA;
    this.bodyA.y += ny * correction * ratioA;
  }
  
  if (!this.bodyB.isStatic) {
    const ratioB = this.bodyA ? 
      this.bodyA.mass / (this.bodyA.mass + this.bodyB.mass) : 1.0;
    this.bodyB.x -= nx * correction * ratioB;
    this.bodyB.y -= ny * correction * ratioB;
  }
}
```

**Key Points:**
- **Mass-weighted**: Heavier bodies move less
- **Stiffness**: Controls how much correction is applied per frame
- **Multiple passes**: More passes = more stable (Matter.js uses 2)
- **Pin joints**: `length=0` creates revolute joints (pendulums)

### 4. **Use Cases**

#### **Pendulum** (Simple)
```typescript
const pendulum = new Body(ballElement, world);
const constraint = new Constraint({
  bodyA: null,  // Fixed world point
  bodyB: pendulum,
  pointA: { x: 400, y: 100 },  // World coordinates
  pointB: { x: 0, y: 0 },       // Center of ball
  length: 0,                     // Pin joint
  stiffness: 0.9                 // Very rigid
});
world.registerConstraint(constraint);
```

#### **Chain** (Connected pendulums)
```typescript
const links = [];
for (let i = 0; i < 10; i++) {
  const link = new Body(linkElement, world);
  links.push(link);
  
  if (i === 0) {
    // First link anchored to world
    world.registerConstraint(new Constraint({
      bodyA: null,
      bodyB: link,
      pointA: { x: 400, y: 50 },
      length: 0,
      stiffness: 0.9
    }));
  } else {
    // Connect to previous link
    world.registerConstraint(new Constraint({
      bodyA: links[i - 1],
      bodyB: link,
      pointA: { x: 0, y: 20 },   // Bottom of previous
      pointB: { x: 0, y: -20 },   // Top of current
      length: 0,
      stiffness: 0.9
    }));
  }
}
```

#### **Cloth** (Grid with constraints)
```typescript
const cloth = [];
const rows = 20;
const cols = 20;
const spacing = 10;

// Create grid of bodies
for (let row = 0; row < rows; row++) {
  cloth[row] = [];
  for (let col = 0; col < cols; col++) {
    const particle = new Body(particleElement, world, { mass: 0.1 });
    cloth[row][col] = particle;
    
    // Connect horizontally
    if (col > 0) {
      world.registerConstraint(new Constraint({
        bodyA: cloth[row][col - 1],
        bodyB: particle,
        length: spacing,
        stiffness: 0.2  // Soft spring
      }));
    }
    
    // Connect vertically
    if (row > 0) {
      world.registerConstraint(new Constraint({
        bodyA: cloth[row - 1][col],
        bodyB: particle,
        length: spacing,
        stiffness: 0.2
      }));
    }
  }
}

// Anchor top row
for (let col = 0; col < cols; col++) {
  world.registerConstraint(new Constraint({
    bodyA: null,
    bodyB: cloth[0][col],
    pointA: { x: 200 + col * spacing, y: 50 },
    length: 0,
    stiffness: 0.9
  }));
}
```

### 5. **Complexity Considerations**

**Minimal additions:**
- ✅ One new file: `Constraint.ts` (~150 lines)
- ✅ World gets `constraints` array and `registerConstraint()` method
- ✅ `step()` adds constraint solving loop (2 passes)
- ✅ No changes to `Body.ts` (constraints reference bodies, not vice versa)

**Benefits:**
- ✅ Clean separation: Constraints don't pollute Body class
- ✅ Easy to extend: Can add angular constraints, motors later
- ✅ Testable: Constraint solving can be tested independently
- ✅ Performant: Only solves active constraints

**Potential Issues:**
- ⚠️ **Stability**: May need tuning stiffness/iterations for different scenarios
- ⚠️ **Performance**: Many constraints (cloth) may need optimization
- ⚠️ **Visual rendering**: Constraints need visual representation (optional)

### 6. **Implementation Phases**

**Phase 1: Basic Constraints**
- Constraint class with distance constraint
- World integration
- Simple pendulum demo

**Phase 2: Chains**
- Chain demo with multiple connected links
- Test stability with multiple constraints

**Phase 3: Cloth/Soft Bodies**
- Grid generation helper
- Cloth demo
- Performance optimization if needed

**Phase 4: Visual Rendering (Optional)**
- Draw constraint lines/springs
- Visual debugging

### 7. **Alternative Approaches Considered**

**❌ Constraints in Body class:**
- Would pollute Body with constraint logic
- Harder to manage constraint lifecycle

**❌ Force-based constraints:**
- More complex math
- Harder to tune for stability
- Position-based is simpler and more stable

**❌ Separate ConstraintSolver class:**
- Over-engineering for current needs
- World can manage solving directly

## Recommendation

**Proceed with this architecture:**
1. Create `Constraint.ts` as separate class
2. Add `constraints: Constraint[]` to World
3. Implement position-based constraint solving
4. Start with simple pendulum demo
5. Iterate based on stability/performance needs

This keeps complexity low while enabling all desired features (pendulums, chains, cloth).
