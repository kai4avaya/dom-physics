import { describe, it, expect, beforeEach, vi } from 'vitest';
import { World } from '../src/World.js';
import { Body } from '../src/Body.js';

describe('World', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    container.id = 'world';
    container.style.width = '800px';
    container.style.height = '600px';
    container.style.position = 'relative';
    document.body.appendChild(container);

    // Mock getBoundingClientRect
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
  });

  describe('constructor', () => {
    it('should create a world with default properties', () => {
      const world = new World(container);
      
      expect(world.container).toBe(container);
      expect(world.bodies).toEqual([]);
      expect(world.gravity).toBe(980);
      expect(world.friction).toBe(0.99);
      expect(world.restitution).toBe(0.8);
      expect(world.timeStep).toBe(1/60);
      expect(world.running).toBe(false);
    });

    it('should create a world with custom config', () => {
      const world = new World(container, {
        gravity: 500,
        friction: 0.95,
        restitution: 0.5,
        timeStep: 1/30,
      });
      
      expect(world.gravity).toBe(500);
      expect(world.friction).toBe(0.95);
      expect(world.restitution).toBe(0.5);
      expect(world.timeStep).toBe(1/30);
    });

    it('should auto-detect bounds from container', () => {
      const world = new World(container);
      expect(world.bounds.width).toBe(800);
      expect(world.bounds.height).toBe(600);
      expect(world.bounds.x).toBe(0);
      expect(world.bounds.y).toBe(0);
    });

    it('should use custom bounds if provided', () => {
      const world = new World(container, {
        bounds: { x: 10, y: 20, width: 100, height: 200 }
      });
      expect(world.bounds.width).toBe(100);
      expect(world.bounds.height).toBe(200);
      expect(world.bounds.x).toBe(10);
      expect(world.bounds.y).toBe(20);
    });
  });

  describe('registerBody', () => {
    it('should register a body', () => {
      const world = new World(container);
      const element = document.createElement('div');
      container.appendChild(element);
      element.getBoundingClientRect = () => ({
        left: 100, top: 100, right: 150, bottom: 150,
        width: 50, height: 50, x: 100, y: 100, toJSON: () => {}
      });
      
      const body = new Body(element, world);
      world.registerBody(body);
      
      expect(world.bodies).toContain(body);
      expect(world.bodies.length).toBe(1);
    });

    it('should not register duplicate bodies', () => {
      const world = new World(container);
      const element = document.createElement('div');
      container.appendChild(element);
      element.getBoundingClientRect = () => ({
        left: 100, top: 100, right: 150, bottom: 150,
        width: 50, height: 50, x: 100, y: 100, toJSON: () => {}
      });
      
      const body = new Body(element, world);
      world.registerBody(body);
      world.registerBody(body);
      
      expect(world.bodies.length).toBe(1);
    });
  });

  describe('unregisterBody', () => {
    it('should unregister a body', () => {
      const world = new World(container);
      const element = document.createElement('div');
      container.appendChild(element);
      element.getBoundingClientRect = () => ({
        left: 100, top: 100, right: 150, bottom: 150,
        width: 50, height: 50, x: 100, y: 100, toJSON: () => {}
      });
      
      const body = new Body(element, world);
      world.registerBody(body);
      world.unregisterBody(body);
      
      expect(world.bodies).not.toContain(body);
      expect(world.bodies.length).toBe(0);
    });
  });

  describe('start/stop', () => {
    it('should start simulation', () => {
      const world = new World(container);
      world.start();
      
      expect(world.running).toBe(true);
      
      world.stop();
      expect(world.running).toBe(false);
    });

    it('should not start if already running', () => {
      const world = new World(container);
      world.start();
      const initialTime = world.lastTime;
      
      // Wait a bit
      vi.useFakeTimers();
      vi.advanceTimersByTime(100);
      
      world.start(); // Should not restart
      expect(world.lastTime).toBe(initialTime);
      
      vi.useRealTimers();
      world.stop();
    });
  });

  describe('step', () => {
    it('should integrate bodies', () => {
      const world = new World(container);
      const element1 = document.createElement('div');
      const element2 = document.createElement('div');
      container.appendChild(element1);
      container.appendChild(element2);
      
      element1.getBoundingClientRect = () => ({
        left: 100, top: 100, right: 150, bottom: 150,
        width: 50, height: 50, x: 100, y: 100, toJSON: () => {}
      });
      element2.getBoundingClientRect = () => ({
        left: 200, top: 200, right: 250, bottom: 250,
        width: 50, height: 50, x: 200, y: 200, toJSON: () => {}
      });
      
      const body1 = new Body(element1, world);
      const body2 = new Body(element2, world);
      world.registerBody(body1);
      world.registerBody(body2);
      
      // Step should integrate and check collisions
      world['step']();
      
      // Bodies should have been integrated (gravity applied)
      expect(body1.ay).toBe(0); // Acceleration reset after integrate
    });
  });
});
