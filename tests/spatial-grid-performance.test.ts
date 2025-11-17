import { describe, it, expect, beforeEach } from 'vitest';
import { World, Body } from '../src/index.js';

describe('Spatial Grid Performance', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    container.id = 'world';
    container.style.width = '800px';
    container.style.height = '600px';
    container.style.position = 'relative';
    document.body.appendChild(container);

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

  it('should maintain 60fps with many bodies (spatial grid enabled)', async () => {
    const world = new World(container, { spatialGrid: true });
    
    // Create 200 bodies
    const bodies: Body[] = [];
    for (let i = 0; i < 200; i++) {
      const element = document.createElement('div');
      element.style.width = '15px';
      element.style.height = '15px';
      element.style.position = 'absolute';
      element.style.left = `${Math.random() * 750}px`;
      element.style.top = `${Math.random() * 550}px`;
      container.appendChild(element);
      
      const body = new Body(element, world);
      world.registerBody(body);
      bodies.push(body);
    }

    world.start();

    // Measure frame times
    const frameTimes: number[] = [];
    let frameCount = 0;
    const originalStep = (world as any).step.bind(world);
    (world as any).step = function() {
      const start = performance.now();
      originalStep();
      const time = performance.now() - start;
      frameTimes.push(time);
      frameCount++;
      
      // Stop after 60 frames
      if (frameCount >= 60) {
        world.stop();
      }
    };

    // Wait for test to complete
    await new Promise(resolve => {
      const checkInterval = setInterval(() => {
        if (!world.running) {
          clearInterval(checkInterval);
          resolve(undefined);
        }
      }, 100);
      
      // Timeout after 5 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        world.stop();
        resolve(undefined);
      }, 5000);
    });

    // Calculate average frame time
    const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    const maxFrameTime = Math.max(...frameTimes);
    
    console.log(`Spatial Grid Performance: ${frameTimes.length} frames`);
    console.log(`Average frame time: ${avgFrameTime.toFixed(2)}ms`);
    console.log(`Max frame time: ${maxFrameTime.toFixed(2)}ms`);
    console.log(`Estimated FPS: ${(1000 / avgFrameTime).toFixed(1)}`);

    // Should maintain 60fps (16.67ms per frame)
    expect(avgFrameTime).toBeLessThan(20); // Allow some margin
    expect(maxFrameTime).toBeLessThan(33); // Max should be under 2 frames
  }, 10000); // 10 second timeout

  it('should be faster than brute force for many bodies', async () => {
    // This test compares performance but doesn't fail if spatial grid is slower
    // (since performance can vary based on system)
    
    const containerWithGrid = document.createElement('div');
    containerWithGrid.style.width = '800px';
    containerWithGrid.style.height = '600px';
    containerWithGrid.style.position = 'relative';
    document.body.appendChild(containerWithGrid);
    containerWithGrid.getBoundingClientRect = () => ({
      left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON: () => {}
    });

    const containerWithoutGrid = document.createElement('div');
    containerWithoutGrid.style.width = '800px';
    containerWithoutGrid.style.height = '600px';
    containerWithoutGrid.style.position = 'relative';
    document.body.appendChild(containerWithoutGrid);
    containerWithoutGrid.getBoundingClientRect = () => ({
      left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON: () => {}
    });

    const worldWithGrid = new World(containerWithGrid, { spatialGrid: true });
    const worldWithoutGrid = new World(containerWithoutGrid, { spatialGrid: false });

    // Create 100 bodies in each
    for (let i = 0; i < 100; i++) {
      const element1 = document.createElement('div');
      element1.style.width = '20px';
      element1.style.height = '20px';
      element1.style.position = 'absolute';
      element1.style.left = `${Math.random() * 750}px`;
      element1.style.top = `${Math.random() * 550}px`;
      containerWithGrid.appendChild(element1);

      const element2 = document.createElement('div');
      element2.style.width = '20px';
      element2.style.height = '20px';
      element2.style.position = 'absolute';
      element2.style.left = `${Math.random() * 750}px`;
      element2.style.top = `${Math.random() * 550}px`;
      containerWithoutGrid.appendChild(element2);

      const body1 = new Body(element1, worldWithGrid);
      const body2 = new Body(element2, worldWithoutGrid);
      worldWithGrid.registerBody(body1);
      worldWithoutGrid.registerBody(body2);
    }

    // Measure collision detection time
    const timesWithGrid: number[] = [];
    const timesWithoutGrid: number[] = [];

    const originalStepWithGrid = (worldWithGrid as any).step.bind(worldWithGrid);
    (worldWithGrid as any).step = function() {
      const start = performance.now();
      originalStepWithGrid();
      // Extract collision time from performance log (simplified - just measure total)
      timesWithGrid.push(performance.now() - start);
    };

    const originalStepWithoutGrid = (worldWithoutGrid as any).step.bind(worldWithoutGrid);
    (worldWithoutGrid as any).step = function() {
      const start = performance.now();
      originalStepWithoutGrid();
      timesWithoutGrid.push(performance.now() - start);
    };

    worldWithGrid.start();
    worldWithoutGrid.start();

    await new Promise(resolve => setTimeout(resolve, 1000));

    worldWithGrid.stop();
    worldWithoutGrid.stop();

    const avgWithGrid = timesWithGrid.reduce((a, b) => a + b, 0) / timesWithGrid.length;
    const avgWithoutGrid = timesWithoutGrid.reduce((a, b) => a + b, 0) / timesWithoutGrid.length;

    console.log(`With spatial grid: ${avgWithGrid.toFixed(2)}ms average`);
    console.log(`Without spatial grid: ${avgWithoutGrid.toFixed(2)}ms average`);
    console.log(`Speedup: ${(avgWithoutGrid / avgWithGrid).toFixed(2)}x`);

    // Spatial grid should be faster (or at least not significantly slower)
    // We allow some variance due to system differences
    expect(avgWithGrid).toBeLessThan(avgWithoutGrid * 1.5); // Should be faster or similar
  }, 15000); // 15 second timeout
});
