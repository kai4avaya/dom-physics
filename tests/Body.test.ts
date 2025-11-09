import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Body } from '../src/Body';
import { World } from '../src/World';

describe('Body', () => {
  let container: HTMLElement;
  let element: HTMLElement;
  let world: World;

  beforeEach(() => {
    // Setup DOM
    document.body.innerHTML = '';
    container = document.createElement('div');
    container.id = 'world';
    container.style.width = '800px';
    container.style.height = '600px';
    document.body.appendChild(container);

    element = document.createElement('div');
    element.textContent = 'Test';
    container.appendChild(element);

    world = new World(container, {
      gravity: 500,
      friction: 0.98,
      restitution: 0.8,
    });
  });

  describe('constructor', () => {
    it('should create a body with default properties', () => {
      const body = new Body(element, world);
      
      expect(body.element).toBe(element);
      expect(body.physicsParent).toBe(world);
      expect(body.mass).toBe(1);
      expect(body.isStatic).toBe(false);
      expect(body.enabled).toBe(true);
      expect(body.gravity).toBe(null); // Inherits from world
      expect(body.friction).toBe(null); // Inherits from world
    });

    it('should create a body with custom config', () => {
      const body = new Body(element, world, {
        mass: 2,
        radius: 20,
        isStatic: true,
        gravity: 100,
      });

      expect(body.mass).toBe(2);
      expect(body.radius).toBe(20);
      expect(body.isStatic).toBe(true);
      expect(body.gravity).toBe(100);
    });

    it('should preserve original DOM context', () => {
      const body = new Body(element, world);
      
      expect(body.originalParent).toBeTruthy();
      expect(body.originalPosition).toBeTruthy();
      expect(body.originalStyles).toBeTruthy();
    });

    it('should convert inline elements to inline-block', () => {
      const span = document.createElement('span');
      span.style.display = 'inline';
      container.appendChild(span);
      
      const body = new Body(span, world);
      
      expect(getComputedStyle(span).display).toBe('inline-block');
    });
  });

  describe('physics inheritance', () => {
    it('should inherit gravity from parent World', () => {
      const body = new Body(element, world);
      
      expect(body.gravity).toBe(null);
      expect(body.getEffectiveGravity()).toBe(500); // From world
    });

    it('should inherit friction from parent World', () => {
      const body = new Body(element, world);
      
      expect(body.friction).toBe(null);
      expect(body.getEffectiveFriction()).toBe(0.98); // From world
    });

    it('should inherit restitution from parent World', () => {
      const body = new Body(element, world);
      
      expect(body.restitution).toBe(null);
      expect(body.getEffectiveRestitution()).toBe(0.8); // From world
    });

    it('should override inherited values when set', () => {
      const body = new Body(element, world, {
        gravity: 200,
        friction: 0.95,
      });

      expect(body.getEffectiveGravity()).toBe(200);
      expect(body.getEffectiveFriction()).toBe(0.95);
      expect(body.getEffectiveRestitution()).toBe(0.8); // Still inherits
    });
  });

  describe('position and velocity', () => {
    it('should get world position', () => {
      const body = new Body(element, world);
      body.x = 10;
      body.y = 20;

      const pos = body.getWorldPosition();
      expect(pos.x).toBeGreaterThanOrEqual(0);
      expect(pos.y).toBeGreaterThanOrEqual(0);
    });

    it('should get local position', () => {
      const body = new Body(element, world);
      body.x = 10;
      body.y = 20;

      const pos = body.getLocalPosition();
      expect(pos.x).toBe(10);
      expect(pos.y).toBe(20);
    });

    it('should get velocity', () => {
      const body = new Body(element, world);
      body.x = 10;
      body.y = 20;
      body.prevX = 5;
      body.prevY = 15;

      const vel = body.getVelocity();
      expect(vel.x).toBe(5);
      expect(vel.y).toBe(5);
    });

    it('should set velocity directly', () => {
      const body = new Body(element, world);
      body.setVelocity(10, 20);

      const vel = body.getVelocity();
      expect(vel.x).toBe(10);
      expect(vel.y).toBe(20);
    });
  });

  describe('forces', () => {
    it('should apply force', () => {
      const body = new Body(element, world, { mass: 2 });
      body.applyForce(20, 30);

      expect(body.ax).toBe(10); // 20 / 2
      expect(body.ay).toBe(15); // 30 / 2
    });

    it('should not apply force to static bodies', () => {
      const body = new Body(element, world, { isStatic: true });
      body.applyForce(10, 10);

      expect(body.ax).toBe(0);
      expect(body.ay).toBe(0);
    });

    it('should not apply force to disabled bodies', () => {
      const body = new Body(element, world, { enabled: false });
      body.applyForce(10, 10);

      expect(body.ax).toBe(0);
      expect(body.ay).toBe(0);
    });
  });

  describe('integration', () => {
    it('should integrate physics step', () => {
      const body = new Body(element, world);
      body.x = 0;
      body.y = 0;
      body.prevX = 0;
      body.prevY = 0;
      body.ax = 0;
      body.ay = 0;

      body.integrate(1 / 60);

      // Should have moved due to gravity
      expect(body.y).toBeGreaterThan(0);
    });

    it('should apply friction during integration', () => {
      const body = new Body(element, world);
      body.x = 10;
      body.y = 10;
      body.prevX = 0;
      body.prevY = 0;

      const initialVel = body.getVelocity();
      body.integrate(1 / 60);

      // Velocity should be reduced by friction
      const newVel = body.getVelocity();
      expect(Math.abs(newVel.x)).toBeLessThan(Math.abs(initialVel.x));
    });
  });

  describe('bounds constraints', () => {
    it('should constrain to bounds when set', () => {
      const body = new Body(element, world, {
        bounds: { x: 0, y: 0, width: 100, height: 100 },
        radius: 10,
      });

      body.x = 95; // Would exceed bounds
      body.y = 95;
      body.constrainToBounds();

      expect(body.x).toBeLessThanOrEqual(90); // width - radius
      expect(body.y).toBeLessThanOrEqual(90); // height - radius
    });

    it('should not constrain static bodies', () => {
      const body = new Body(element, world, {
        bounds: { x: 0, y: 0, width: 100, height: 100 },
        isStatic: true,
      });

      body.x = 200;
      body.y = 200;
      body.constrainToBounds();

      expect(body.x).toBe(200);
      expect(body.y).toBe(200);
    });
  });

  describe('body hierarchy', () => {
    it('should add child body', () => {
      const parentBody = new Body(element, world);
      const childElement = document.createElement('div');
      container.appendChild(childElement);
      const childBody = new Body(childElement, parentBody);

      parentBody.addBody(childBody);

      expect(parentBody.bodies).toContain(childBody);
      expect(childBody.physicsParent).toBe(parentBody);
    });

    it('should remove child body', () => {
      const parentBody = new Body(element, world);
      const childElement = document.createElement('div');
      container.appendChild(childElement);
      const childBody = new Body(childElement, parentBody);

      parentBody.addBody(childBody);
      parentBody.removeBody(childBody);

      expect(parentBody.bodies).not.toContain(childBody);
      expect(childBody.physicsParent).toBe(null);
    });
  });

  describe('rendering', () => {
    it('should render transform', () => {
      const body = new Body(element, world);
      body.x = 10;
      body.y = 20;

      body.render();

      expect(element.style.transform).toContain('translate(10px, 20px)');
    });

    it('should preserve original transform', () => {
      element.style.transform = 'rotate(45deg)';
      const body = new Body(element, world);
      body.x = 10;
      body.y = 20;

      body.render();

      expect(element.style.transform).toContain('rotate(45deg)');
      expect(element.style.transform).toContain('translate(10px, 20px)');
    });
  });

  describe('reset and restore', () => {
    it('should reset to original position', () => {
      const body = new Body(element, world);
      body.x = 100;
      body.y = 200;

      body.reset();

      expect(body.x).toBe(0);
      expect(body.y).toBe(0);
    });

    it('should restore original DOM state', () => {
      const originalTransform = element.style.transform;
      const body = new Body(element, world);
      body.x = 100;
      body.y = 200;
      body.render();

      body.restore();

      expect(element.style.transform).toBe(originalTransform);
    });
  });
});
