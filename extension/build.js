const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

async function build() {
  const distDir = path.join(__dirname, 'dist');

  if (fs.existsSync(distDir)) fs.rmSync(distDir, { recursive: true });
  fs.mkdirSync(distDir, { recursive: true });

  await esbuild.build({
    entryPoints: ['src/background/index.ts'],
    bundle: true,
    outfile: 'dist/background.js',
    format: 'esm',
    target: ['chrome120'],
  });

  await esbuild.build({
    entryPoints: ['src/content.ts'],
    bundle: true,
    outfile: 'dist/content.js',
    format: 'iife',
    target: ['chrome120'],
  });

  fs.copyFileSync('manifest.json', path.join(distDir, 'manifest.json'));

  const popupSrc = path.join('src', 'popup');
  const popupDist = path.join(distDir, 'popup');
  if (fs.existsSync(popupSrc)) {
    fs.cpSync(popupSrc, popupDist, { recursive: true });
  }

  const iconsSrc = path.join(__dirname, 'icons');
  const iconsDist = path.join(distDir, 'icons');
  if (fs.existsSync(iconsSrc)) {
    fs.cpSync(iconsSrc, iconsDist, { recursive: true });
  }

  console.log('Build complete -> extension/dist/');
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
