// Dev-only: regenerates icon-180/192/512.png (Lilac Nocturne card-fan mark).
// node make-icons.mjs — renders the SVG below via Playwright at each size.
import { chromium } from 'playwright';

const SVG = (px) => `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="50%" cy="40%" r="78%">
      <stop offset="0%" stop-color="#251345"/>
      <stop offset="55%" stop-color="#150b28"/>
      <stop offset="100%" stop-color="#0b0e1c"/>
    </radialGradient>
    <linearGradient id="card" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#cdbaff"/>
      <stop offset="45%" stop-color="#a984ff"/>
      <stop offset="100%" stop-color="#7a52e8"/>
    </linearGradient>
    <linearGradient id="backL" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#2b1950"/>
      <stop offset="100%" stop-color="#1c1038"/>
    </linearGradient>
    <linearGradient id="backR" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#331e5c"/>
      <stop offset="100%" stop-color="#221342"/>
    </linearGradient>
    <filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="22"/></filter>
    <filter id="soft" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="6"/></filter>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <!-- the forge: a card coming off the anvil, still hot -->
  <ellipse cx="256" cy="300" rx="180" ry="120" fill="#8f6bff" opacity=".30" filter="url(#glow)"/>
  <ellipse cx="256" cy="286" rx="120" ry="46" fill="#c9b6ff" opacity=".55" filter="url(#glow)"/>
  <!-- anvil: horn left, waist, flared base; lilac rim light on the working face -->
  <g>
    <path d="M86 296 C130 272 182 268 214 268 L406 268 L406 322 L338 338 L338 390 L392 424 L392 456 L152 456 L152 424 L206 390 L206 338 L150 330 C112 322 86 310 86 296 Z"
      fill="#1a0f30" stroke="#4b3573" stroke-width="4"/>
    <path d="M100 293 C140 273 186 270 216 270 L402 270" fill="none" stroke="#c9b6ff" stroke-width="5" stroke-linecap="round" opacity=".85"/>
  </g>
  <ellipse cx="272" cy="470" rx="150" ry="14" fill="#000" opacity=".35"/>
  <!-- the card, mid-forge -->
  <g transform="rotate(-7 256 160)">
    <rect x="186" y="58" width="140" height="200" rx="18" fill="#14091f" opacity=".5" filter="url(#soft)"/>
    <rect x="186" y="52" width="140" height="200" rx="18" fill="url(#card)" stroke="#e4dbff" stroke-width="5"/>
    <path d="M279 88 L218 186 L251 186 L236 234 L297 132 L262 132 Z" fill="#14091f"/>
  </g>
  <!-- sparks off the strike -->
  <path d="M356 236 l6 17 17 6 -17 6 -6 17 -6 -17 -17 -6 17 -6 Z" fill="#e4dbff"/>
  <path d="M150 220 l5 13 13 5 -13 5 -5 13 -5 -13 -13 -5 13 -5 Z" fill="#c9b6ff"/>
  <path d="M382 176 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4 Z" fill="#a984ff"/>
  <g stroke="#c9b6ff" stroke-width="4" stroke-linecap="round" opacity=".8">
    <line x1="330" y1="250" x2="346" y2="238"/>
    <line x1="176" y1="248" x2="162" y2="236"/>
    <line x1="352" y1="278" x2="370" y2="274"/>
  </g>
</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 600, height: 600 }, deviceScaleFactor: 1 });
for (const px of [512, 192, 180]) {
  await page.setContent(`<body style="margin:0">${SVG(px)}</body>`);
  await page.locator('svg').screenshot({ path: `icon-${px}.png` });
  console.log(`icon-${px}.png written`);
}
await browser.close();
