# Testing Guide

The `dom-physics` package includes a comprehensive test suite using Vitest.

## Running Tests

### Watch Mode (Development)
```bash
npm test
```
Runs tests in watch mode - automatically re-runs when files change.

### Single Run
```bash
npm run test:run
```
Runs all tests once and exits. Used in CI/CD pipelines.

### With Coverage
```bash
npm run test:coverage
```
Runs tests and generates coverage reports in `coverage/` directory.

## Test Structure

```
tests/
├── Body.test.ts      # Tests for Body class (25 tests)
├── World.test.ts     # Tests for World class (16 tests)
└── SpatialHash.test.ts # Tests for SpatialHash (7 tests)
```

## Test Coverage

The test suite covers:

### Body Tests
- Constructor and initialization
- Physics inheritance from parent World
- Position and velocity calculations
- Force application
- Physics integration
- Bounds constraints
- Body hierarchy (add/remove children)
- Rendering and DOM manipulation
- Reset and restore functionality

### World Tests
- Constructor and configuration
- Body registration/unregistration
- Simulation control (start/stop)
- Physics inheritance (World always uses own values)
- Nested world handling
- Body queries (by parent, escaped bodies)
- Reset and destroy operations

### SpatialHash Tests
- Hash creation and configuration
- Body insertion
- Collision pair generation
- Duplicate pair prevention
- Clearing hash

## Writing New Tests

Tests use Vitest with jsdom environment for DOM testing:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Body } from '../src/Body';
import { World } from '../src/World';

describe('MyFeature', () => {
  let container: HTMLElement;
  let world: World;

  beforeEach(() => {
    // Setup DOM
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    world = new World(container);
  });

  it('should do something', () => {
    // Your test here
    expect(true).toBe(true);
  });
});
```

## CI/CD Integration

Tests run automatically before publishing:
```json
"prepublishOnly": "npm run build && npm run test:run"
```

This ensures all published versions pass the test suite.
