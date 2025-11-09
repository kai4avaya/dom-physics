# Running the Demo

The `dom-physics` package includes two demo versions that you can run locally.

## Quick Start

### After Installing from npm

```bash
# Install the package
npm install dom-physics

# Navigate to the package directory
cd node_modules/dom-physics

# Run the package demo (recommended)
npm run demo:package

# Or run the original inline demo
npm run demo
```

Then open **http://localhost:3000** in your browser.

### During Development

If you're developing the package:

```bash
# Run the original inline demo (no build needed)
npm run demo

# Run the package-based demo (requires build)
npm run build
npm run demo:package
```

## Demo Types

### 1. Original Demo (`demo/index.html`)
- Contains the physics engine code inline
- No build step required
- Good for quick testing
- Run with: `npm run demo`

### 2. Package Demo (`demo-package/index.html`)
- Uses the built package from `dist/`
- Demonstrates how to use the package
- Requires build: `npm run build`
- Run with: `npm run demo:package`

## What the Demo Shows

- **Physics Simulation**: Characters fall with gravity
- **Mouse Interaction**: Hover over text to apply forces
- **Collision Detection**: Characters collide and bounce
- **DOM Preservation**: Original HTML structure remains intact
- **Transform Only**: Only CSS transforms are modified

## Troubleshooting

### Port Already in Use

If port 3000 is already in use, modify `scripts/serve-demo.js` to use a different port.

### Module Not Found

Make sure you've built the package:
```bash
npm run build
```

### CORS Issues

The demo server includes CORS headers. If you still have issues, make sure you're accessing via `http://localhost:3000` and not `file://`.

## Next Steps

- Check out the [README.md](./README.md) for API documentation
- Read the [architecture plan](./architecture/plan-v2.md) for design details
- Run tests: `npm test`
