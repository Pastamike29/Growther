const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const web = path.join(root, 'site-package');
const files = [
  'index.html', 'manifest.webmanifest', 'meal-scanner.css', 'meal-scanner.js',
  'service-worker.js', 'supabase-config.js',
];
for (const file of files) fs.copyFileSync(path.join(root, file), path.join(web, file));
for (const directory of ['assets', 'icons']) {
  fs.cpSync(path.join(root, directory), path.join(web, directory), { recursive: true, force: true });
}
