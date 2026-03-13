/**
 * generate-icons.mjs
 *
 * Renders public/logo.svg to PNG at multiple sizes using Playwright.
 *
 * Usage: npx playwright test --config=false && node scripts/generate-icons.mjs
 * Or simply: node scripts/generate-icons.mjs
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
const svgPath = join(publicDir, 'logo.svg');
const svgContent = readFileSync(svgPath, 'utf-8');

const sizes = [
  { name: 'icon-512x512.png', size: 512 },
  { name: 'icon-192x192.png', size: 192 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'icon.png', size: 512 },
  { name: 'favicon-32.png', size: 32 },
];

async function main() {
  console.log('Launching browser...');
  const browser = await chromium.launch();
  const context = await browser.newContext({
    deviceScaleFactor: 1,
  });

  for (const { name, size } of sizes) {
    console.log(`  Generating ${name} (${size}x${size})...`);
    const page = await context.newPage();
    await page.setViewportSize({ width: size, height: size });

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Mitr:wght@500;600;700&display=block" rel="stylesheet">
        <style>
          * { margin: 0; padding: 0; }
          body { width: ${size}px; height: ${size}px; overflow: hidden; }
          svg { width: ${size}px; height: ${size}px; display: block; }
        </style>
      </head>
      <body>${svgContent}</body>
      </html>
    `;

    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const buffer = await page.screenshot({
      type: 'png',
      omitBackground: true,
    });

    writeFileSync(join(publicDir, name), buffer);
    await page.close();
  }

  // Generate ICO from the 32px and 16px PNGs (simple approach: use 32px as favicon.ico)
  // For a proper .ico we just copy the 32px PNG — browsers accept PNG favicons
  const favicon32 = readFileSync(join(publicDir, 'favicon-32.png'));
  writeFileSync(join(publicDir, 'favicon.ico'), favicon32);
  console.log('  Generated favicon.ico (32x32 PNG)');

  // Clean up temp file
  try { unlinkSync(join(publicDir, 'favicon-32.png')); } catch {}

  await browser.close();
  console.log('\nAll icons generated successfully!');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
