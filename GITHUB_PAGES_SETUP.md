# GitHub Pages Setup

The repository is configured to automatically deploy the demo to GitHub Pages via GitHub Actions.

## Automatic Setup (Recommended)

1. **Enable GitHub Pages**:
   - Go to your repository: https://github.com/kai4avaya/dom-physics
   - Click **Settings** → **Pages**
   - Under "Source", select **GitHub Actions**
   - Save

2. **The workflow will automatically deploy**:
   - Every push to `master` branch triggers a deployment
   - The workflow builds the package and prepares the demo
   - Demo will be available at: https://kai4avaya.github.io/dom-physics/

## Manual Setup (Alternative)

If you prefer to use the `docs` folder approach:

1. Run locally:
   ```bash
   npm run build
   npm run prepare:pages
   ```

2. Commit the `docs` folder:
   ```bash
   git add docs/
   git commit -m "Add docs for GitHub Pages"
   git push
   ```

3. In repository Settings → Pages:
   - Select **Deploy from a branch**
   - Branch: `master`
   - Folder: `/docs`
   - Save

## Verifying Deployment

After enabling GitHub Pages:
1. Check the **Actions** tab to see the deployment workflow
2. Wait for it to complete (usually 1-2 minutes)
3. Visit https://kai4avaya.github.io/dom-physics/
4. The demo should load and work interactively

## Troubleshooting

- **404 Error**: Make sure GitHub Pages is enabled and the workflow completed successfully
- **Module not found**: Check that the `dist` folder was built correctly in the workflow
- **Import errors**: Verify the `prepare-pages.js` script ran and updated the import paths

## Workflow Details

The `.github/workflows/pages.yml` workflow:
1. Checks out the code
2. Installs dependencies
3. Builds the TypeScript package (`npm run build`)
4. Prepares the demo for Pages (copies files and fixes import paths)
5. Deploys to GitHub Pages

The demo uses relative imports (`./dist/index.js`) which work correctly on GitHub Pages.
