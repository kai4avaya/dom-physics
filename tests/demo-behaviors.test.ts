import { describe, it, expect, beforeEach, vi } from 'vitest';
import { World } from '../src/World.js';
import { Body } from '../src/Body.js';

/**
 * Tests for demo behaviors - dragging and collisions
 * These tests verify that the behaviors demonstrated in the demos actually work correctly
 */

describe('Demo Behaviors', () => {
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

  describe('Dragging Components (Squares Demo)', () => {
    it('should allow dragging a body by applying force', () => {
      const world = new World(container, {
        gravity: 300,
        friction: 0.98,
        restitution: 0.7
      });

      // Create a square element
      const square = document.createElement('div');
      square.className = 'square';
      square.style.width = '30px';
      square.style.height = '30px';
      square.style.position = 'absolute';
      square.style.left = '100px';
      square.style.top = '100px';
      container.appendChild(square);

      square.getBoundingClientRect = () => ({
        left: 100, top: 100, right: 130, bottom: 130,
        width: 30, height: 30, x: 100, y: 100, toJSON: () => {}
      });

      const body = new Body(square, world, {
        mass: 1,
        radius: 15,
        restitution: 0.7
      });

      world.registerBody(body);
      world.start();

      // Simulate dragging: apply force in a direction
      const initialX = body.x;
      const initialY = body.y;

      // Simulate mouse drag - apply force to move body
      body.applyForce(1000, 500);

      // Step the simulation
      world['step']();

      // Body should have moved
      expect(body.x).not.toBe(initialX);
      expect(body.y).not.toBe(initialY);

      world.stop();
    });

    it('should find closest body when clicking near multiple bodies', () => {
      const world = new World(container, {
        gravity: 300,
        friction: 0.98,
        restitution: 0.7
      });

      const bodies: Body[] = [];

      // Create multiple squares
      for (let i = 0; i < 3; i++) {
        const square = document.createElement('div');
        square.className = 'square';
        square.style.width = '30px';
        square.style.height = '30px';
        square.style.position = 'absolute';
        square.style.left = `${100 + i * 100}px`;
        square.style.top = '100px';
        container.appendChild(square);

        const x = 100 + i * 100;
        square.getBoundingClientRect = () => ({
          left: x, top: 100, right: x + 30, bottom: 130,
          width: 30, height: 30, x: x, y: 100, toJSON: () => {}
        });

        const body = new Body(square, world, {
          mass: 1,
          radius: 15,
          restitution: 0.7
        });

        world.registerBody(body);
        bodies.push(body);
      }

      // Simulate finding closest body to a click point
      const clickX = 115; // Close to first square (center ~115)
      const clickY = 115;

      let closestBody: Body | null = null;
      let minDist = Infinity;

      bodies.forEach(body => {
        const pos = body.getWorldPosition();
        const dx = pos.x - clickX;
        const dy = pos.y - clickY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 30 && dist < minDist) {
          minDist = dist;
          closestBody = body;
        }
      });

      expect(closestBody).toBe(bodies[0]);
      expect(minDist).toBeLessThan(30);
    });

    it('should apply drag force continuously during mouse move', () => {
      const world = new World(container, {
        gravity: 300,
        friction: 0.98,
        restitution: 0.7
      });

      const square = document.createElement('div');
      square.className = 'square';
      square.style.width = '30px';
      square.style.height = '30px';
      square.style.position = 'absolute';
      square.style.left = '100px';
      square.style.top = '100px';
      container.appendChild(square);

      square.getBoundingClientRect = () => ({
        left: 100, top: 100, right: 130, bottom: 130,
        width: 30, height: 30, x: 100, y: 100, toJSON: () => {}
      });

      const body = new Body(square, world, {
        mass: 1,
        radius: 15,
        restitution: 0.7
      });

      world.registerBody(body);

      // Simulate dragging: multiple mouse moves
      const targetX = 200;
      const targetY = 200;

      // Simulate multiple drag steps
      for (let i = 0; i < 10; i++) {
        const pos = body.getWorldPosition();
        const dx = targetX - pos.x;
        const dy = targetY - pos.y;
        
        // Apply force to drag (like in squares demo)
        body.applyForce(dx * 10, dy * 10);
        world['step']();
      }

      // Body should have moved toward target
      const finalPos = body.getWorldPosition();
      expect(finalPos.x).toBeGreaterThan(100);
      expect(finalPos.y).toBeGreaterThan(100);
    });
  });

  describe('Collision Detection', () => {
    it('should detect collision between two bodies (Bouncing Demo)', () => {
      const world = new World(container, {
        gravity: 200,
        friction: 0.99,
        restitution: 0.9
      });

      // Create two balls that will collide
      const ball1 = document.createElement('div');
      ball1.className = 'ball';
      ball1.style.width = '40px';
      ball1.style.height = '40px';
      ball1.style.position = 'absolute';
      ball1.style.left = '100px';
      ball1.style.top = '100px';
      container.appendChild(ball1);

      ball1.getBoundingClientRect = () => ({
        left: 100, top: 100, right: 140, bottom: 140,
        width: 40, height: 40, x: 100, y: 100, toJSON: () => {}
      });

      const ball2 = document.createElement('div');
      ball2.className = 'ball';
      ball2.style.width = '40px';
      ball2.style.height = '40px';
      ball2.style.position = 'absolute';
      ball2.style.left = '150px'; // Close enough to collide (radius 20 each, so 40px total, distance ~50px)
      ball2.style.top = '100px';
      container.appendChild(ball2);

      ball2.getBoundingClientRect = () => ({
        left: 150, top: 100, right: 190, bottom: 140,
        width: 40, height: 40, x: 150, y: 100, toJSON: () => {}
      });

      const body1 = new Body(ball1, world, {
        mass: 1,
        radius: 20,
        restitution: 0.9
      });

      const body2 = new Body(ball2, world, {
        mass: 1,
        radius: 20,
        restitution: 0.9
      });

      world.registerBody(body1);
      world.registerBody(body2);

      // Move bodies closer to ensure collision
      body1.x = 0;
      body1.y = 0;
      body2.x = 30; // Within collision distance (radius 20 + 20 = 40, distance = 30)

      const pos1Before = body1.getWorldPosition();
      const pos2Before = body2.getWorldPosition();

      // Step simulation - should resolve collision
      world['step']();

      const pos1After = body1.getWorldPosition();
      const pos2After = body2.getWorldPosition();

      // Bodies should have been separated
      const dx = pos2After.x - pos1After.x;
      const dy = pos2After.y - pos1After.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      // Distance should be at least the sum of radii (collision resolved)
      expect(dist).toBeGreaterThanOrEqual(40);
    });

    it('should handle multiple collisions (Squares Demo)', () => {
      const world = new World(container, {
        gravity: 300,
        friction: 0.98,
        restitution: 0.7
      });

      const bodies: Body[] = [];

      // Create a grid of squares that will collide
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const square = document.createElement('div');
          square.className = 'square';
          square.style.width = '30px';
          square.style.height = '30px';
          square.style.position = 'absolute';
          const x = 100 + i * 35; // Close spacing to ensure collisions
          const y = 100 + j * 35;
          square.style.left = `${x}px`;
          square.style.top = `${y}px`;
          container.appendChild(square);

          square.getBoundingClientRect = () => ({
            left: x, top: y, right: x + 30, bottom: y + 30,
            width: 30, height: 30, x: x, y: y, toJSON: () => {}
          });

          const body = new Body(square, world, {
            mass: 1,
            radius: 15,
            restitution: 0.7
          });

          world.registerBody(body);
          bodies.push(body);
        }
      }

      // Step simulation multiple times
      for (let i = 0; i < 10; i++) {
        world['step']();
      }

      // All bodies should still be within bounds
      bodies.forEach(body => {
        const pos = body.getWorldPosition();
        expect(pos.x).toBeGreaterThanOrEqual(0);
        expect(pos.x).toBeLessThanOrEqual(800);
        expect(pos.y).toBeGreaterThanOrEqual(0);
        expect(pos.y).toBeLessThanOrEqual(600);
      });
    });

    it('should stack blocks correctly (Stack Demo)', () => {
      const world = new World(container, {
        gravity: 400,
        friction: 0.95,
        restitution: 0.3
      });

      const blocks: Body[] = [];
      const initialPositions: { x: number; y: number }[] = [];

      // Create blocks that should stack
      const widths = [200, 150, 100];
      const startX = 300;
      const startY = 50;

      for (let i = 0; i < 3; i++) {
        const width = widths[i % widths.length];
        const height = 30;
        const block = document.createElement('div');
        block.className = 'block';
        block.style.width = `${width}px`;
        block.style.height = `${height}px`;
        block.style.position = 'absolute';
        const x = startX - width / 2;
        const y = startY + i * 32; // Slight overlap to ensure contact
        block.style.left = `${x}px`;
        block.style.top = `${y}px`;
        container.appendChild(block);

        block.getBoundingClientRect = () => ({
          left: x, top: y, right: x + width, bottom: y + height,
          width: width, height: height, x: x, y: y, toJSON: () => {}
        });

        const radius = Math.sqrt(width * width + height * height) / 2;
        const body = new Body(block, world, {
          mass: (width * height) / 1000,
          radius: radius,
          restitution: 0.3
        });

        world.registerBody(body);
        blocks.push(body);
        initialPositions.push({ x: body.getWorldPosition().x, y: body.getWorldPosition().y });
      }

      // Step simulation to let blocks settle
      for (let i = 0; i < 20; i++) {
        world['step']();
      }

      // Verify blocks have responded to physics
      blocks.forEach((block, i) => {
        const pos = block.getWorldPosition();
        const initialPos = initialPositions[i];
        
        // Blocks should have moved (physics is active)
        const hasMoved = Math.abs(pos.x - initialPos.x) > 0.1 || Math.abs(pos.y - initialPos.y) > 0.1;
        expect(hasMoved).toBe(true);
        
        // Blocks should be within bounds (constrainToBounds should keep them in)
        // Allow small margin for physics calculations
        expect(pos.x).toBeGreaterThanOrEqual(-10);
        expect(pos.x).toBeLessThanOrEqual(810);
        expect(pos.y).toBeGreaterThanOrEqual(-10);
        expect(pos.y).toBeLessThanOrEqual(610);
      });

      // Verify collisions are being resolved (blocks aren't overlapping excessively)
      for (let i = 0; i < blocks.length; i++) {
        for (let j = i + 1; j < blocks.length; j++) {
          const pos1 = blocks[i].getWorldPosition();
          const pos2 = blocks[j].getWorldPosition();
          const dx = pos2.x - pos1.x;
          const dy = pos2.y - pos1.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = blocks[i].radius + blocks[j].radius;
          
          // Distance should be close to or greater than minimum (collision resolved)
          // Allow some tolerance for ongoing physics simulation
          expect(dist).toBeGreaterThan(minDist * 0.8);
        }
      }
    });

    it('should respect bounds constraints (all demos)', () => {
      const world = new World(container, {
        gravity: 400,
        friction: 0.95,
        restitution: 0.7
      });

      // Create a body near the edge
      const element = document.createElement('div');
      element.style.width = '50px';
      element.style.height = '50px';
      element.style.position = 'absolute';
      element.style.left = '750px'; // Near right edge
      element.style.top = '550px';  // Near bottom edge
      container.appendChild(element);

      element.getBoundingClientRect = () => ({
        left: 750, top: 550, right: 800, bottom: 600,
        width: 50, height: 50, x: 750, y: 550, toJSON: () => {}
      });

      const body = new Body(element, world, {
        mass: 1,
        radius: 25,
        restitution: 0.7
      });

      world.registerBody(body);

      // Give it velocity that would push it out of bounds
      body.x = 100; // Try to move far right
      body.y = 100; // Try to move far down
      body.prevX = 0;
      body.prevY = 0;

      // Step simulation
      world['step']();

      // Body should be constrained within bounds
      const pos = body.getWorldPosition();
      expect(pos.x + body.radius).toBeLessThanOrEqual(800);
      expect(pos.y + body.radius).toBeLessThanOrEqual(600);
      expect(pos.x - body.radius).toBeGreaterThanOrEqual(0);
      expect(pos.y - body.radius).toBeGreaterThanOrEqual(0);
    });
  });
});
