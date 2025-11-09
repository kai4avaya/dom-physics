// Core vector math
export interface Vec2 {
  x: number;
  y: number;
}

// Physics configuration for World
export interface WorldConfig {
  gravity?: number;        // px/s² (default: 980)
  friction?: number;       // 0-1, velocity damping (default: 0.99)
  restitution?: number;    // 0-1, bounciness (default: 0.8)
  bounds?: Bounds | null;  // null = auto-detect from container
  timeStep?: number;       // fixed timestep in seconds (default: 1/60)
}

// Body configuration
export interface BodyConfig {
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

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Collision event (Body type resolved at runtime to avoid circular dependency)
export interface CollisionEvent {
  bodyA: any; // Body type - resolved at runtime
  bodyB: any; // Body type - resolved at runtime
  normal: Vec2;
  overlap: number;
}

// Parent relationship info (preserved from DOM)
export interface ParentInfo {
  element: HTMLElement;
  computedStyle: CSSStyleDeclaration;
  bounds: DOMRect;
  zIndex: number;
}

// Note: Body type is defined in Body.ts to avoid circular dependencies
// CollisionEvent uses Body type which will be resolved at runtime
