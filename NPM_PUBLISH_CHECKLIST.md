# npm Publish Checklist

## ✅ Package Configuration

The `package.json` is now configured with:
- ✅ Correct repository URL: `https://github.com/kai4avaya/dom-physics.git`
- ✅ Homepage pointing to GitHub Pages demo: `https://kai4avaya.github.io/dom-physics/`
- ✅ Correct bugs URL: `https://github.com/kai4avaya/dom-physics/issues`
- ✅ README.md with prominent demo link at the top

## What Shows on npm Package Page

When someone visits https://www.npmjs.com/package/dom-physics, they will see:

1. **Homepage Link** - Points directly to the live demo on GitHub Pages
2. **Repository Link** - Links to GitHub repository
3. **README.md** - Displays with the demo link prominently at the top:
   ```
   🌐 Live Demo on GitHub Pages | 📦 npm
   ```
4. **Bugs Link** - Links to GitHub issues

## Publishing to npm

To publish/republish with the updated package.json:

```bash
# Make sure everything is built and tested
npm run build
npm run test:run

# Publish (will require OTP if 2FA is enabled)
npm publish --access public --otp=<your-otp-code>
```

## After Publishing

1. Visit https://www.npmjs.com/package/dom-physics
2. Verify the homepage link points to the demo
3. Verify the repository link is correct
4. Check that the README displays correctly with the demo link

## GitHub Pages Setup

Make sure GitHub Pages is enabled:
1. Go to https://github.com/kai4avaya/dom-physics/settings/pages
2. Under "Source", select **GitHub Actions**
3. Save

The workflow will automatically deploy the demo on every push to master.
