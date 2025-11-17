/**
 * dom-physics - Simple DOM physics engine
 * Matches original demo behavior exactly
 */

export { Body, type BodyConfig } from './Body.js';
export { World, type WorldConfig } from './World.js';
export { Constraint, type ConstraintConfig } from './Constraint.js';
export { createSoftBody, createCloth, type SoftBodyOptions, type ClothOptions } from './composites.js';
export {
	KeyboardController,
	MouseController,
	type MouseControllerOptions
} from './inputController.js';
