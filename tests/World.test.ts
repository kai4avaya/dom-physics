import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Body } from '../src/Body';
import { World } from '../src/World';

describe('World', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    container.id = 'world';
    container.style.width = '800px';
    container.style.height = '600px';
    document.body.appendChild(container);
  });

  describe('constructor', () => {
    it('should create a world with default config', () => {
      const world = new World(container);

      expect(world.container).toBe(container);
      expect(world.gravity).toBe(980);
      expect(world.friction).toBe(0.99);
      expect(world.restitution).toBe(0.8);
      expect(world.isWorld).toBe(true);
    });

    it('should create a world with custom config', () => {
      const world = new World(container, {
        gravity: 500,
        friction: 0.95,
        restitution: 0.7,
      });

      expect(world.gravity).toBe(500);
      expect(world.friction).toBe(0.95);
      expect(world.restitution).toBe(0.7);
    });

    it('should auto-detect bounds from container', () => {
      // Mock getBoundingClientRect for jsdom
      const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function() {
        if (this === container) {
          return {
            width: 800,
            height: 600,
            top: 0,
            left: 0,
            right: 800,
            bottom: 600,
          } as DOMRect;
        }
        return originalGetBoundingClientRect.call(this);
      };

      const world = new World(container);

      expect(world.bounds).toBeTruthy();
      expect(world.bounds!.width).toBe(800);
      expect(world.bounds!.height).toBe(600);

      // Restore
      Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    });

    it('should use custom bounds when provided', () => {
      const world = new World(container, {
        bounds: { x: 0, y: 0, width: 400, height: 300 },
      });

      expect(world.bounds!.width).toBe(400);
      expect(world.bounds!.height).toBe(300);
    });
  });

  describe('body management', () => {
    it('should register a body', () => {
      const world = new World(container);
      const element = document.createElement('div');
      container.appendChild(element);
      const body = new Body(element, world);

      world.registerBody(body);

      // Check via getBodiesByParent (indirect check)
      const bodies = world.getBodiesByParent(container);
      expect(bodies.length).toBeGreaterThan(0);
    });

    it('should not register duplicate bodies', () => {
      const world = new World(container);
      const element = document.createElement('div');
      container.appendChild(element);
      const body = new Body(element, world);

      world.registerBody(body);
      world.registerBody(body);

      // Should only be registered once
      const bodies = world.getBodiesByParent(container);
      expect(bodies.length).toBe(1);
    });

    it('should unregister a body', () => {
      const world = new World(container);
      const element = document.createElement('div');
      container.appendChild(element);
      const body = new Body(element, world);

      world.registerBody(body);
      world.unregisterBody(body);

      const bodies = world.getBodiesByParent(container);
      expect(bodies.length).toBe(0);
    });
  });

  describe('simulation control', () => {
    it('should start simulation', () => {
      const world = new World(container);
      
      world.start();

      expect(world['running']).toBe(true);
    });

    it('should stop simulation', () => {
      const world = new World(container);
      world.start();
      
      world.stop();

      expect(world['running']).toBe(false);
    });

    it('should not start if already running', () => {
      const world = new World(container);
      world.start();
      const rafId = world['rafId'];
      
      world.start();

      // Should not create new animation frame
      expect(world['rafId']).toBe(rafId);
    });
  });

  describe('physics inheritance', () => {
    it('should always return its own physics values', () => {
      const world = new World(container, {
        gravity: 500,
        friction: 0.95,
        restitution: 0.7,
      });

      expect(world.getEffectiveGravity()).toBe(500);
      expect(world.getEffectiveFriction()).toBe(0.95);
      expect(world.getEffectiveRestitution()).toBe(0.7);
    });
  });

  describe('nested worlds', () => {
    it('should stop nested worlds when stopped', () => {
      const outerWorld = new World(container);
      const innerContainer = document.createElement('div');
      container.appendChild(innerContainer);
      const innerWorld = new World(innerContainer);

      outerWorld.addBody(innerWorld);
      innerWorld.start();
      outerWorld.start();

      outerWorld.stop();

      expect(innerWorld['running']).toBe(false);
    });
  });

  describe('queries', () => {
    it('should get bodies by parent element', () => {
      const world = new World(container);
      const parent = document.createElement('div');
      container.appendChild(parent);

      const element1 = document.createElement('div');
      const element2 = document.createElement('div');
      parent.appendChild(element1);
      parent.appendChild(element2);

      const body1 = new Body(element1, world);
      const body2 = new Body(element2, world);
      world.registerBody(body1);
      world.registerBody(body2);

      const bodies = world.getBodiesByParent(parent);
      expect(bodies.length).toBe(2);
      expect(bodies).toContain(body1);
      expect(bodies).toContain(body2);
    });

    it('should get escaped bodies', () => {
      const world = new World(container);
      const parent = document.createElement('div');
      parent.style.width = '100px';
      parent.style.height = '100px';
      container.appendChild(parent);

      const element = document.createElement('div');
      parent.appendChild(element);
      const body = new Body(element, world);
      world.registerBody(body);

      // Move body outside parent bounds
      body.x = 200;
      body.y = 200;

      const escaped = world.getEscapedBodies();
      expect(escaped).toContain(body);
    });
  });

  describe('reset and destroy', () => {
    it('should reset all bodies', () => {
      const world = new World(container);
      const element1 = document.createElement('div');
      const element2 = document.createElement('div');
      container.appendChild(element1);
      container.appendChild(element2);

      const body1 = new Body(element1, world);
      const body2 = new Body(element2, world);
      world.registerBody(body1);
      world.registerBody(body2);

      body1.x = 100;
      body2.x = 200;

      world.reset();

      expect(body1.x).toBe(0);
      expect(body2.x).toBe(0);
    });

    it('should destroy and restore DOM', () => {
      const world = new World(container);
      const element = document.createElement('div');
      container.appendChild(element);
      const body = new Body(element, world);
      world.registerBody(body);

      body.x = 100;
      body.render();

      world.destroy();

      expect(world['running']).toBe(false);
      expect(element.style.transform).not.toContain('translate');
    });
  });
});
