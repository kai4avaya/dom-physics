#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const usePackage = args.includes('--package');

const PORT = 8087;
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
      res.end('File not found: ' + err.message);
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

  let url = req.url;
  
  // Handle root - serve index.html
  if (url === '/' || url === '/demo-package' || url === '/demo-package/') {
    url = '/index.html';
  }
  
  // Remove leading slash for path joining
  if (url.startsWith('/')) {
    url = url.slice(1);
  }
  
  // Handle dist imports (absolute paths in demos)
  if (url.startsWith('dist/')) {
    const filePath = path.join(__dirname, '..', url);
    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404);
        res.end('File not found: ' + url);
        return;
      }
      serveFile(filePath, res);
    });
    return;
  }
  
  // Serve from demo directory
  let filePath = path.join(__dirname, '..', DEMO_DIR, url);

  // Security: prevent directory traversal
  const resolvedPath = path.resolve(filePath);
  const demoPath = path.resolve(path.join(__dirname, '..', DEMO_DIR));
  const distPath = path.resolve(path.join(__dirname, '..', 'dist'));

  if (!resolvedPath.startsWith(demoPath) && !resolvedPath.startsWith(distPath)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404);
      res.end('File not found: ' + url);
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
  if (usePackage) {
    console.log(`\n📝 Available demos:`);
    console.log(`   - http://localhost:${PORT}/demo-text.html`);
    console.log(`   - http://localhost:${PORT}/demo-squares.html`);
    console.log(`   - http://localhost:${PORT}/demo-bouncing.html`);
    console.log(`   - http://localhost:${PORT}/demo-stack.html`);
    console.log(`   - http://localhost:${PORT}/ (landing page)`);
  }
  console.log(`\nPress Ctrl+C to stop\n`);
});
