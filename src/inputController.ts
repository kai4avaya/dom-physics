import { Body } from './Body.js';
import { World } from './World.js';

const KEY_TO_VECTOR: Record<string, { x: number; y: number }> = {
  ArrowUp:    { x: 0,  y: -1 },
  ArrowDown:  { x: 0,  y: 1 },
  ArrowLeft:  { x: -1, y: 0 },
  ArrowRight: { x: 1,  y: 0 },
  w: { x: 0, y: -1 },
  s: { x: 0, y: 1 },
  a: { x: -1, y: 0 },
  d: { x: 1, y: 0 }
};

export class KeyboardController {
  private bodies: Set<Body> = new Set();
  private forceMagnitude: number;

  constructor(private world: World, selector = '[data-physics-control]', force = 500) {
    this.forceMagnitude = force;
    this.world.bodies.forEach(body => {
      if (body.element.matches(selector)) this.bodies.add(body);
    });
    window.addEventListener('keydown', this.handleKey);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.handleKey);
    this.bodies.clear();
  }

  private handleKey = (event: KeyboardEvent): void => {
    const vector = KEY_TO_VECTOR[event.key];
    if (!vector) return;
    for (const body of this.bodies) {
      if (body.isStatic || !body.enabled) continue;
      body.applyForce(vector.x * this.forceMagnitude, vector.y * this.forceMagnitude);
    }
  };
}

export interface MouseControllerOptions {
  selector?: string;
  capturePointer?: boolean;
}

export class MouseController {
  private selector: string;
  private capturePointer: boolean;
  private activeBody: Body | null = null;
  private pointerId: number | null = null;
  private lastPointerX = 0;
  private lastPointerY = 0;

  constructor(private world: World, options: MouseControllerOptions = {}) {
    this.selector = options.selector ?? '[data-physics-control]';
    this.capturePointer = options.capturePointer ?? true;

    this.world.container.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointercancel', this.handlePointerUp);
  }

  dispose(): void {
    this.world.container.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointercancel', this.handlePointerUp);
    this.releaseActiveBody();
  }

  private handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    const targetElement = event.target instanceof Element ? event.target.closest(this.selector) : null;
    if (!targetElement) return;

    const body = this.findBodyForElement(targetElement as HTMLElement);
    if (!body || body.isStatic || !body.enabled) return;

    this.activeBody = body;
    this.pointerId = event.pointerId;
    body.isDragged = true;
    body.fx = 0;
    body.fy = 0;

    const { x, y } = this.pointerToWorld(event);
    this.lastPointerX = x;
    this.lastPointerY = y;
    if (this.capturePointer && targetElement instanceof HTMLElement && targetElement.setPointerCapture) {
      try {
        targetElement.setPointerCapture(event.pointerId);
      } catch {
        // Ignore browsers that disallow capture on this element
      }
    }

    event.preventDefault();
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (!this.activeBody || event.pointerId !== this.pointerId) return;

    const body = this.activeBody;
    const { x, y } = this.pointerToWorld(event);
    const deltaX = x - this.lastPointerX;
    const deltaY = y - this.lastPointerY;

    const newX = x - body.originX;
    const newY = y - body.originY;

    body.prevX = newX - deltaX;
    body.prevY = newY - deltaY;
    body.x = newX;
    body.y = newY;

    this.lastPointerX = x;
    this.lastPointerY = y;
    event.preventDefault();
  };

  private handlePointerUp = (event: PointerEvent): void => {
    if (!this.activeBody || event.pointerId !== this.pointerId) return;
    if (this.capturePointer && event.target instanceof HTMLElement && event.target.releasePointerCapture) {
      try {
        event.target.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore release errors
      }
    }
    this.releaseActiveBody();
  };

  private releaseActiveBody(): void {
    if (this.activeBody) {
      this.activeBody.isDragged = false;
    }
    this.activeBody = null;
    this.pointerId = null;
  }

  private findBodyForElement(element: HTMLElement): Body | null {
    return this.world.bodies.find(body => body.element === element) ?? null;
  }

  private pointerToWorld(event: PointerEvent): { x: number; y: number } {
    const rect = this.world.container.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }
}