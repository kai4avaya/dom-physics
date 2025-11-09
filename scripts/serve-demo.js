#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const usePackage = args.includes('--package');

const PORT = 3000;
const DEMO_DIR = usePackage ? 'demo-package' : 'demo';

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

function serveFile(filePath, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('File not found');
      return;
    }

    const mimeType = getMimeType(filePath);
    res.writeHead(200, { 'Content-Type': mimeType });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  let filePath = path.join(__dirname, '..', DEMO_DIR, req.url === '/' ? 'index.html' : req.url);

  // Security: prevent directory traversal
  const resolvedPath = path.resolve(filePath);
  const demoPath = path.resolve(path.join(__dirname, '..', DEMO_DIR));
  const distPath = path.resolve(path.join(__dirname, '..', 'dist'));

  if (!resolvedPath.startsWith(demoPath) && !resolvedPath.startsWith(distPath)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  // If requesting from dist, serve from dist (works for both demo types)
  if (req.url.startsWith('/dist/')) {
    filePath = path.join(__dirname, '..', req.url);
  }
  
  // Also handle ./dist/ imports in demo-package
  if (req.url.startsWith('/demo-package/dist/')) {
    filePath = path.join(__dirname, '..', 'dist', req.url.replace('/demo-package/dist/', ''));
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404);
      res.end('File not found');
      return;
    }

    serveFile(filePath, res);
  });
});

server.listen(PORT, () => {
  const demoType = usePackage ? 'package' : 'original';
  console.log(`\n🚀 DOM Physics Demo Server`);
  console.log(`📦 Demo type: ${demoType}`);
  console.log(`🌐 Server running at http://localhost:${PORT}`);
  console.log(`\nPress Ctrl+C to stop\n`);
});
