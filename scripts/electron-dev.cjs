const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const root = path.join(__dirname, '..');
const binary = process.platform === 'win32'
  ? path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
  : path.join(root, 'node_modules', 'electron', 'dist', 'electron');

if (!fs.existsSync(binary)) {
  console.error('Electron binary not found. Run: bun run setup:electron');
  process.exit(1);
}

const child = spawn(binary, ['.'], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: false
});

child.on('exit', (code) => process.exit(code ?? 0));
