/**
 * Composites - Helper functions for creating complex structures
 * Based on Matter.js Composites patterns
 */

import type { World } from './World.js';
import { Body, type BodyConfig } from './Body.js';
import { Constraint, type ConstraintConfig } from './Constraint.js';

export interface SoftBodyOptions {
  stiffness?: number;
  damping?: number;
  crossBrace?: boolean; // Add diagonal constraints for stability
  particleOptions?: Partial<BodyConfig>;
  constraintOptions?: Partial<ConstraintConfig>;
}

export interface ClothOptions {
  stiffness?: number;
  damping?: number;
  pinTop?: boolean; // Make top row static
  particleOptions?: Partial<BodyConfig>;
  constraintOptions?: Partial<ConstraintConfig>;
}

/**
 * Create a soft body - grid of particles connected by flexible constraints
 * Based on Matter.js softBody example
 * 
 * @param world - World instance
 * @param container - Container element for DOM particles
 * @param x - Center X position
 * @param y - Center Y position
 * @param columns - Number of columns
 * @param rows - Number of rows
 * @param particleRadius - Radius of each particle
 * @param spacing - Spacing between particles (default: particleRadius * 2.5)
 * @param options - Configuration options
 * @returns Object with bodies and constraints arrays
 */
export function createSoftBody(
  world: World,
  container: HTMLElement,
  x: number,
  y: number,
  columns: number,
  rows: number,
  particleRadius: number,
  spacing?: number,
  options: SoftBodyOptions = {}
): { bodies: Body[]; constraints: Constraint[] } {
  const {
    stiffness = 0.2,
    damping = 0.1,
    crossBrace = false,
    particleOptions = {},
    constraintOptions = {}
  } = options;

  // Default spacing based on particle radius
  const actualSpacing = spacing ?? particleRadius * 2.5;

  // Calculate grid dimensions
  const totalWidth = (columns - 1) * actualSpacing;
  const totalHeight = (rows - 1) * actualSpacing;
  const startX = x - totalWidth / 2;
  const startY = y - totalHeight / 2;

  const bodies: Body[] = [];
  const constraints: Constraint[] = [];

  // Create grid of particles
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const px = startX + col * actualSpacing;
      const py = startY + row * actualSpacing;

      // Create DOM element
      const element = document.createElement('div');
      element.className = 'particle';
      element.style.position = 'absolute';
      element.style.width = (particleRadius * 2) + 'px';
      element.style.height = (particleRadius * 2) + 'px';
      element.style.borderRadius = '50%';
      element.style.left = (px - particleRadius) + 'px';
      element.style.top = (py - particleRadius) + 'px';
      element.style.pointerEvents = 'none';
      container.appendChild(element);

      // Create body with default soft body properties
      const body = new Body(element, world, {
        mass: 0.5,
        radius: particleRadius,
        friction: 0.05,
        restitution: 0.1,
        ...particleOptions
      });

      world.registerBody(body);
      bodies.push(body);
    }
  }

  // Wait a frame for bodies to initialize before creating constraints
  requestAnimationFrame(() => {
    // Create horizontal constraints (connect particles in same row)
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns - 1; col++) {
        const indexA = row * columns + col;
        const indexB = row * columns + col + 1;
        const bodyA = bodies[indexA];
        const bodyB = bodies[indexB];

        const posA = bodyA.getWorldPosition();
        const posB = bodyB.getWorldPosition();
        const dx = posB.x - posA.x;
        const dy = posB.y - posA.y;
        const length = Math.sqrt(dx * dx + dy * dy);

        const constraint = new Constraint({
          bodyA,
          bodyB,
          length,
          stiffness,
          damping,
          ...constraintOptions
        });

        world.registerConstraint(constraint);
        constraints.push(constraint);
      }
    }

    // Create vertical constraints (connect particles in same column)
    for (let row = 0; row < rows - 1; row++) {
      for (let col = 0; col < columns; col++) {
        const indexA = row * columns + col;
        const indexB = (row + 1) * columns + col;
        const bodyA = bodies[indexA];
        const bodyB = bodies[indexB];

        const posA = bodyA.getWorldPosition();
        const posB = bodyB.getWorldPosition();
        const dx = posB.x - posA.x;
        const dy = posB.y - posA.y;
        const length = Math.sqrt(dx * dx + dy * dy);

        const constraint = new Constraint({
          bodyA,
          bodyB,
          length,
          stiffness,
          damping,
          ...constraintOptions
        });

        world.registerConstraint(constraint);
        constraints.push(constraint);
      }
    }

    // Create diagonal constraints (cross-brace) if requested
    if (crossBrace) {
      // Top-left to bottom-right diagonals
      for (let row = 0; row < rows - 1; row++) {
        for (let col = 0; col < columns - 1; col++) {
          const indexA = row * columns + col;
          const indexB = (row + 1) * columns + col + 1;
          const bodyA = bodies[indexA];
          const bodyB = bodies[indexB];

          const posA = bodyA.getWorldPosition();
          const posB = bodyB.getWorldPosition();
          const dx = posB.x - posA.x;
          const dy = posB.y - posA.y;
          const length = Math.sqrt(dx * dx + dy * dy);

          const constraint = new Constraint({
            bodyA,
            bodyB,
            length,
            stiffness,
            damping,
            ...constraintOptions
          });

          world.registerConstraint(constraint);
          constraints.push(constraint);
        }
      }

      // Top-right to bottom-left diagonals
      for (let row = 0; row < rows - 1; row++) {
        for (let col = 1; col < columns; col++) {
          const indexA = row * columns + col;
          const indexB = (row + 1) * columns + col - 1;
          const bodyA = bodies[indexA];
          const bodyB = bodies[indexB];

          const posA = bodyA.getWorldPosition();
          const posB = bodyB.getWorldPosition();
          const dx = posB.x - posA.x;
          const dy = posB.y - posA.y;
          const length = Math.sqrt(dx * dx + dy * dy);

          const constraint = new Constraint({
            bodyA,
            bodyB,
            length,
            stiffness,
            damping,
            ...constraintOptions
          });

          world.registerConstraint(constraint);
          constraints.push(constraint);
        }
      }
    }
  });

  return { bodies, constraints };
}

/**
 * Create a cloth - soft body optimized for fabric-like behavior
 * Based on Matter.js cloth example
 * 
 * @param world - World instance
 * @param container - Container element for DOM particles
 * @param x - Top-left X position
 * @param y - Top-left Y position
 * @param columns - Number of columns
 * @param rows - Number of rows
 * @param particleRadius - Radius of each particle
 * @param spacing - Spacing between particles (default: particleRadius * 2.5)
 * @param options - Configuration options
 * @returns Object with bodies and constraints arrays
 */
export function createCloth(
  world: World,
  container: HTMLElement,
  x: number,
  y: number,
  columns: number,
  rows: number,
  particleRadius: number,
  spacing?: number,
  options: ClothOptions = {}
): { bodies: Body[]; constraints: Constraint[] } {
  const {
    stiffness = 0.06, // Softer than soft body
    damping = 0.1,
    pinTop = true,
    particleOptions = {},
    constraintOptions = {}
  } = options;

  // Default spacing
  const actualSpacing = spacing ?? particleRadius * 2.5;

  const bodies: Body[] = [];
  const constraints: Constraint[] = [];

  // Create grid of particles
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const px = x + col * actualSpacing;
      const py = y + row * actualSpacing;

      // Create DOM element (invisible for cloth)
      const element = document.createElement('div');
      element.className = 'particle';
      element.style.position = 'absolute';
      element.style.width = (particleRadius * 2) + 'px';
      element.style.height = (particleRadius * 2) + 'px';
      element.style.borderRadius = '50%';
      element.style.left = (px - particleRadius) + 'px';
      element.style.top = (py - particleRadius) + 'px';
      element.style.pointerEvents = 'none';
      element.style.visibility = 'hidden'; // Invisible particles
      container.appendChild(element);

      // Create body with cloth properties
      const body = new Body(element, world, {
        mass: 0.5,
        radius: particleRadius,
        friction: 0.00001, // Very low friction for cloth
        restitution: 0.1,
        isStatic: pinTop && row === 0, // Pin top row if requested
        ...particleOptions
      });

      world.registerBody(body);
      bodies.push(body);
    }
  }

  // Wait a frame for bodies to initialize before creating constraints
  requestAnimationFrame(() => {
    // Create horizontal constraints
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns - 1; col++) {
        const indexA = row * columns + col;
        const indexB = row * columns + col + 1;
        const bodyA = bodies[indexA];
        const bodyB = bodies[indexB];

        const posA = bodyA.getWorldPosition();
        const posB = bodyB.getWorldPosition();
        const dx = posB.x - posA.x;
        const dy = posB.y - posA.y;
        const length = Math.sqrt(dx * dx + dy * dy);

        const constraint = new Constraint({
          bodyA,
          bodyB,
          length,
          stiffness,
          damping,
          ...constraintOptions
        });

        world.registerConstraint(constraint);
        constraints.push(constraint);
      }
    }

    // Create vertical constraints
    for (let row = 0; row < rows - 1; row++) {
      for (let col = 0; col < columns; col++) {
        const indexA = row * columns + col;
        const indexB = (row + 1) * columns + col;
        const bodyA = bodies[indexA];
        const bodyB = bodies[indexB];

        const posA = bodyA.getWorldPosition();
        const posB = bodyB.getWorldPosition();
        const dx = posB.x - posA.x;
        const dy = posB.y - posA.y;
        const length = Math.sqrt(dx * dx + dy * dy);

        const constraint = new Constraint({
          bodyA,
          bodyB,
          length,
          stiffness,
          damping,
          ...constraintOptions
        });

        world.registerConstraint(constraint);
        constraints.push(constraint);
      }
    }
  });

  return { bodies, constraints };
}
