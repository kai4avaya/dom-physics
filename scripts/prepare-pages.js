#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read the demo HTML
const demoPath = path.join(__dirname, '..', 'demo-package', 'index.html');
const demoContent = fs.readFileSync(demoPath, 'utf8');

// Replace the import path to work on GitHub Pages (relative path)
const updatedContent = demoContent.replace(
  /import\s*{\s*World,\s*Body\s*}\s*from\s*['"]\/dist\/index\.js['"]/,
  "import { World, Body } from './dist/index.js'"
);

// Write to docs directory
const docsDir = path.join(__dirname, '..', 'docs');
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

fs.writeFileSync(path.join(docsDir, 'index.html'), updatedContent);

console.log('✅ Prepared demo for GitHub Pages');
