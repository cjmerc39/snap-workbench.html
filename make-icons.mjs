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
  <ellipse cx="256" cy="280" rx="190" ry="165" fill="#8f6bff" opacity=".38" filter="url(#glow)"/>
  <!-- the fan: two backs peeking behind, the drawn card in front -->
  <g transform="translate(256 260) scale(1.14) translate(-256 -260)">
    <g transform="rotate(-14 256 560)">
      <rect x="178" y="122" width="156" height="220" rx="20" fill="url(#backL)" stroke="#4b3573" stroke-width="4"/>
    </g>
    <g transform="rotate(13 256 560)">
      <rect x="178" y="122" width="156" height="220" rx="20" fill="url(#backR)" stroke="#5a4187" stroke-width="4"/>
    </g>
    <g transform="rotate(-2 256 520)">
      <rect x="176" y="118" width="160" height="228" rx="20" fill="#14091f" opacity=".55" filter="url(#soft)"/>
      <rect x="176" y="114" width="160" height="228" rx="20" fill="url(#card)" stroke="#e4dbff" stroke-width="5"/>
      <path d="M282 156 L212 268 L250 268 L232 322 L302 208 L262 208 Z" fill="#14091f"/>
    </g>
  </g>
  <!-- sparks -->
  <path d="M368 118 l7 20 20 7 -20 7 -7 20 -7 -20 -20 -7 20 -7 Z" fill="#e4dbff"/>
  <path d="M142 108 l5 14 14 5 -14 5 -5 14 -5 -14 -14 -5 14 -5 Z" fill="#a984ff"/>
  <path d="M395 322 l4 11 11 4 -11 4 -4 11 -4 -11 -11 -4 11 -4 Z" fill="#c9b6ff" opacity=".9"/>
</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 600, height: 600 }, deviceScaleFactor: 1 });
for (const px of [512, 192, 180]) {
  await page.setContent(`<body style="margin:0">${SVG(px)}</body>`);
  await page.locator('svg').screenshot({ path: `icon-${px}.png` });
  console.log(`icon-${px}.png written`);
}
await browser.close();
