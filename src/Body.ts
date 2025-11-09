import type {
  Vec2,
  BodyConfig,
  Bounds,
  ParentInfo,
} from './types';
import type { World } from './World';

/**
 * Body class - Base for all physics entities
 * Can contain other Bodies, enabling recursive nesting
 */
export class Body {
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
    const rootWorld = this.findRootWorld();
    const worldRect = rootWorld?.container.getBoundingClientRect() 
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
      const diff = this.radius - localPos.y;
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
      // Type assertion to access World methods
      const world = this as unknown as World;
      world.registerBody(body);
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
        const world = this as unknown as World;
        world.unregisterBody(body);
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
