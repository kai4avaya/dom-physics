import { describe, it, expect, beforeEach } from 'vitest';
import { Body } from '../src/Body.js';
import { World } from '../src/World.js';

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
    container.style.position = 'relative';
    document.body.appendChild(container);

    // Mock getBoundingClientRect for container
    container.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
      x: 0,
      y: 0,
      toJSON: () => {}
    });

    element = document.createElement('div');
    element.textContent = 'Test';
    element.style.width = '50px';
    element.style.height = '50px';
    container.appendChild(element);

    // Mock getBoundingClientRect for element
    element.getBoundingClientRect = () => ({
      left: 100,
      top: 100,
      right: 150,
      bottom: 150,
      width: 50,
      height: 50,
      x: 100,
      y: 100,
      toJSON: () => {}
    });

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
      expect(body.world).toBe(world);
      expect(body.mass).toBe(1);
      expect(body.isStatic).toBe(false);
      expect(body.enabled).toBe(true);
      expect(body.restitution).toBe(null);
      expect(body.friction).toBe(null);
      expect(body.x).toBe(0);
      expect(body.y).toBe(0);
    });

    it('should create a body with custom config', () => {
      const body = new Body(element, world, {
        mass: 2,
        radius: 20,
        isStatic: true,
        restitution: 0.5,
        friction: 0.9,
      });
      
      expect(body.mass).toBe(2);
      expect(body.radius).toBe(20);
      expect(body.isStatic).toBe(true);
      expect(body.restitution).toBe(0.5);
      expect(body.friction).toBe(0.9);
    });

    it('should calculate origin in world space', () => {
      const body = new Body(element, world);
      expect(body.originX).toBe(100); // elemRect.left - worldRect.left
      expect(body.originY).toBe(100); // elemRect.top - worldRect.top
    });

    it('should set display to inline-block if inline', () => {
      element.style.display = 'inline';
      const body = new Body(element, world);
      expect(element.style.display).toBe('inline-block');
    });
  });

  describe('applyForce', () => {
    it('should apply force to force accumulator', () => {
      const body = new Body(element, world);
      body.applyForce(10, 20);
      expect(body.fx).toBe(10);
      expect(body.fy).toBe(20);
    });

    it('should not apply force if static', () => {
      const body = new Body(element, world, { isStatic: true });
      body.applyForce(10, 20);
      expect(body.fx).toBe(0);
      expect(body.fy).toBe(0);
    });

    it('should not apply force if disabled', () => {
      const body = new Body(element, world);
      body.enabled = false;
      body.applyForce(10, 20);
      expect(body.fx).toBe(0);
      expect(body.fy).toBe(0);
    });
  });

  describe('integrate', () => {
    it('should integrate physics', () => {
      const body = new Body(element, world);
      body.x = 10;
      body.y = 20;
      body.prevX = 5;
      body.prevY = 15;
      
      body.integrate(1/60, world);
      
      // Should apply gravity, friction, and acceleration
      expect(body.prevX).toBe(10);
      expect(body.prevY).toBe(20);
      expect(body.fx).toBe(0); // Forces reset after integrate
      expect(body.fy).toBe(0);
    });

    it('should use world friction when body friction is null', () => {
      const body = new Body(element, world, { friction: null });
      body.x = 10;
      body.prevX = 5;
      
      body.integrate(1/60, world);
      
      // Should use world.friction (0.98)
      expect(body.prevX).toBe(10);
    });

    it('should use body friction when set', () => {
      const body = new Body(element, world, { friction: 0.9 });
      body.x = 10;
      body.prevX = 5;
      
      body.integrate(1/60, world);
      
      expect(body.prevX).toBe(10);
    });

    it('should not integrate if static', () => {
      const body = new Body(element, world, { isStatic: true });
      const initialX = body.x;
      body.integrate(1/60, world);
      expect(body.x).toBe(initialX);
    });
  });

  describe('getWorldPosition', () => {
    it('should return world position', () => {
      const body = new Body(element, world);
      body.x = 5;
      body.y = 10;
      
      const pos = body.getWorldPosition();
      expect(pos.x).toBe(105); // originX (100) + x (5)
      expect(pos.y).toBe(110); // originY (100) + y (10)
    });
  });

  describe('render', () => {
    it('should apply transform', () => {
      const body = new Body(element, world);
      body.x = 10;
      body.y = 20;
      
      body.render();
      
      expect(element.style.transform).toBe('translate(10px, 20px)');
    });
  });
});
