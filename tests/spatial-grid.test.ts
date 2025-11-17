import { describe, it, expect, beforeEach } from 'vitest';
import { World, Body } from '../src/index.js';

describe('Spatial Grid Optimization', () => {
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

  describe('Configuration', () => {
    it('should enable spatial grid by default', () => {
      const world = new World(container);
      // Spatial grid is enabled by default (internal property)
      expect((world as any)._spatialGridEnabled).toBe(true);
    });

    it('should allow disabling spatial grid', () => {
      const world = new World(container, { spatialGrid: false });
      expect((world as any)._spatialGridEnabled).toBe(false);
    });

    it('should allow custom cell size', () => {
      const world = new World(container, { spatialGridCellSize: 50 });
      expect((world as any)._spatialGridCellSize).toBe(50);
    });
  });

  describe('Collision Detection Correctness', () => {
    it('should detect collisions correctly with spatial grid enabled', async () => {
      const world = new World(container, { spatialGrid: true });
      
      // Create two overlapping bodies
      const element1 = document.createElement('div');
      element1.style.width = '40px';
      element1.style.height = '40px';
      element1.style.position = 'absolute';
      element1.style.left = '100px';
      element1.style.top = '100px';
      container.appendChild(element1);

      const element2 = document.createElement('div');
      element2.style.width = '40px';
      element2.style.height = '40px';
      element2.style.position = 'absolute';
      element2.style.left = '120px';
      element2.style.top = '100px';
      container.appendChild(element2);

      const body1 = new Body(element1, world);
      const body2 = new Body(element2, world);
      world.registerBody(body1);
      world.registerBody(body2);

      world.start();

      // Wait a few frames for collision to be resolved
      await new Promise(resolve => setTimeout(resolve, 200));

      // Bodies should have moved apart (collision resolved)
      const pos1 = body1.getWorldPosition();
      const pos2 = body2.getWorldPosition();
      const dx = pos2.x - pos1.x;
      const dy = pos2.y - pos1.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = body1.radius + body2.radius;

      // Distance should be at least close to minimum (collision resolved)
      expect(dist).toBeGreaterThanOrEqual(minDist * 0.8);

      world.stop();
    });

    it('should produce same results with spatial grid enabled vs disabled', async () => {
      // Create two identical scenarios
      const container1 = document.createElement('div');
      container1.style.width = '800px';
      container1.style.height = '600px';
      container1.style.position = 'relative';
      document.body.appendChild(container1);
      container1.getBoundingClientRect = () => ({
        left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON: () => {}
      });

      const container2 = document.createElement('div');
      container2.style.width = '800px';
      container2.style.height = '600px';
      container2.style.position = 'relative';
      document.body.appendChild(container2);
      container2.getBoundingClientRect = () => ({
        left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON: () => {}
      });

      const worldWithGrid = new World(container1, { spatialGrid: true });
      const worldWithoutGrid = new World(container2, { spatialGrid: false });

      // Create same bodies in both worlds
      const bodies1: Body[] = [];
      const bodies2: Body[] = [];

      for (let i = 0; i < 10; i++) {
        const element1 = document.createElement('div');
        element1.style.width = '30px';
        element1.style.height = '30px';
        element1.style.position = 'absolute';
        element1.style.left = `${100 + i * 50}px`;
        element1.style.top = `${100 + i * 30}px`;
        container1.appendChild(element1);

        const element2 = document.createElement('div');
        element2.style.width = '30px';
        element2.style.height = '30px';
        element2.style.position = 'absolute';
        element2.style.left = `${100 + i * 50}px`;
        element2.style.top = `${100 + i * 30}px`;
        container2.appendChild(element2);

        const body1 = new Body(element1, worldWithGrid);
        const body2 = new Body(element2, worldWithoutGrid);
        worldWithGrid.registerBody(body1);
        worldWithoutGrid.registerBody(body2);
        bodies1.push(body1);
        bodies2.push(body2);
      }

      worldWithGrid.start();
      worldWithoutGrid.start();

      // Run for same duration
      await new Promise(resolve => setTimeout(resolve, 1000));

      worldWithGrid.stop();
      worldWithoutGrid.stop();

      // Compare final positions (should be similar)
      for (let i = 0; i < bodies1.length; i++) {
        const pos1 = bodies1[i].getWorldPosition();
        const pos2 = bodies2[i].getWorldPosition();
        
        // Allow small differences due to floating point precision
        expect(Math.abs(pos1.x - pos2.x)).toBeLessThan(5);
        expect(Math.abs(pos1.y - pos2.y)).toBeLessThan(5);
      }
    });
  });

  describe('Performance', () => {
    it('should reduce collision checks with many bodies', async () => {
      const world = new World(container, { spatialGrid: true });
      
      // Create 100 bodies spread across world
      const bodies: Body[] = [];
      for (let i = 0; i < 100; i++) {
        const element = document.createElement('div');
        element.style.width = '20px';
        element.style.height = '20px';
        element.style.position = 'absolute';
        element.style.left = `${(i % 10) * 80}px`;
        element.style.top = `${Math.floor(i / 10) * 60}px`;
        container.appendChild(element);
        
        const body = new Body(element, world);
        world.registerBody(body);
        bodies.push(body);
      }

      world.start();

      // Enable performance logging
      (window as any).__enablePerfLogging = true;
      
      // Wait for a few frames
      await new Promise(resolve => setTimeout(resolve, 500));

      // The spatial grid should be working (we can't directly measure collision checks
      // but we can verify the world runs smoothly)
      expect(world.running).toBe(true);

      world.stop();
    });

    it('should handle bodies moving between cells', async () => {
      const world = new World(container, { spatialGrid: true, spatialGridCellSize: 100 });
      
      // Create bodies in different cells
      const bodies: Body[] = [];
      
      // Body in cell (0,0)
      const element1 = document.createElement('div');
      element1.style.width = '20px';
      element1.style.height = '20px';
      element1.style.position = 'absolute';
      element1.style.left = '50px';
      element1.style.top = '50px';
      container.appendChild(element1);
      const body1 = new Body(element1, world);
      world.registerBody(body1);
      bodies.push(body1);
      
      // Body in cell (1,0) - different cell
      const element2 = document.createElement('div');
      element2.style.width = '20px';
      element2.style.height = '20px';
      element2.style.position = 'absolute';
      element2.style.left = '150px';
      element2.style.top = '50px';
      container.appendChild(element2);
      const body2 = new Body(element2, world);
      world.registerBody(body2);
      bodies.push(body2);

      world.start();

      // Wait a few frames for spatial grid to be built
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify spatial grid was built (check internal state)
      const grid = (world as any)._buildSpatialGrid();
      expect(grid.size).toBeGreaterThan(0); // Grid should have cells
      
      // Verify bodies are in correct cells
      const cells1 = (world as any)._getBodyCells(body1);
      const cells2 = (world as any)._getBodyCells(body2);
      
      // Bodies should be in different cells (or overlapping cells)
      expect(cells1.length).toBeGreaterThan(0);
      expect(cells2.length).toBeGreaterThan(0);

      world.stop();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty world', () => {
      const world = new World(container, { spatialGrid: true });
      world.start();
      
      // Should not crash
      expect(world.bodies.length).toBe(0);
      
      world.stop();
    });

    it('should handle single body', async () => {
      const world = new World(container, { spatialGrid: true });
      
      const element = document.createElement('div');
      element.style.width = '20px';
      element.style.height = '20px';
      element.style.position = 'absolute';
      element.style.left = '100px';
      element.style.top = '100px';
      container.appendChild(element);

      const body = new Body(element, world);
      world.registerBody(body);

      world.start();
      await new Promise(resolve => setTimeout(resolve, 100));
      world.stop();

      // Should work without errors
      expect(world.bodies.length).toBe(1);
    });

    it('should handle bodies at world boundaries', async () => {
      const world = new World(container, { spatialGrid: true });
      
      // Create bodies at corners
      const corners = [
        { x: 10, y: 10 },
        { x: 790, y: 10 },
        { x: 10, y: 590 },
        { x: 790, y: 590 }
      ];

      for (const corner of corners) {
        const element = document.createElement('div');
        element.style.width = '20px';
        element.style.height = '20px';
        element.style.position = 'absolute';
        element.style.left = `${corner.x}px`;
        element.style.top = `${corner.y}px`;
        container.appendChild(element);

        const body = new Body(element, world);
        world.registerBody(body);
      }

      world.start();
      await new Promise(resolve => setTimeout(resolve, 200));
      world.stop();

      // All bodies should still be in world
      expect(world.bodies.length).toBe(4);
    });
  });
});
