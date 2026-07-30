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
  <ellipse cx="256" cy="256" rx="200" ry="185" fill="#8f6bff" opacity=".32" filter="url(#glow)"/>
  <!-- one card, half forged, half blueprint: the seam is where the work happens.
       Snap DNA: the cost gem (built, blue) and the power gem (still a draft, orange). -->
  <g transform="rotate(-6 256 256)">
    <defs>
      <clipPath id="doneClip"><polygon points="130,30 302,30 268,430 130,430"/></clipPath>
      <clipPath id="printClip"><polygon points="302,30 382,30 382,430 268,430"/></clipPath>
      <linearGradient id="gemC" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#8fd4ff"/><stop offset="100%" stop-color="#2a86e0"/>
      </linearGradient>
      <linearGradient id="gemP" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#ffb488"/><stop offset="100%" stop-color="#e5642c"/>
      </linearGradient>
      <linearGradient id="art" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#241245"/><stop offset="100%" stop-color="#170c2e"/>
      </linearGradient>
    </defs>
    <rect x="152" y="104" width="208" height="304" rx="22" fill="#14091f" opacity=".5" filter="url(#soft)"/>
    <!-- finished half: proper Snap anatomy — frame band, art window, cost orb, name, art breaking the frame -->
    <g clip-path="url(#doneClip)">
      <rect x="152" y="100" width="208" height="304" rx="22" fill="url(#card)"/>
      <rect x="166" y="114" width="180" height="276" rx="14" fill="url(#art)"/>
      <g stroke="#8f6bff" stroke-width="2.5" opacity=".45">
        <line x1="256" y1="238" x2="196" y2="150"/><line x1="256" y1="238" x2="176" y2="238"/>
        <line x1="256" y1="238" x2="200" y2="330"/><line x1="256" y1="238" x2="316" y2="150"/>
      </g>
      <path d="M282 58 L192 288 L246 288 L224 376 L318 208 L262 208 Z" fill="#a984ff" stroke="#14091f" stroke-width="7" stroke-linejoin="round"/>
      <rect x="152" y="100" width="208" height="304" rx="22" fill="none" stroke="#e4dbff" stroke-width="6"/>
      <circle cx="186" cy="134" r="30" fill="url(#gemC)" stroke="#eaf6ff" stroke-width="4"/>
      <text x="186" y="147" text-anchor="middle" font-family="Arial, sans-serif" font-size="38" font-weight="900" fill="#ffffff">6</text>
      <text x="162" y="368" transform="rotate(-5 162 368)" font-family="Arial, sans-serif" font-style="italic" font-weight="900"
        font-size="33" letter-spacing="1" fill="#ffffff" stroke="#14091f" stroke-width="7" paint-order="stroke">WORKBENCH</text>
    </g>
    <!-- blueprint half: the same card, still being drafted -->
    <g clip-path="url(#printClip)">
      <rect x="152" y="100" width="208" height="304" rx="22" fill="#0c1c33" opacity=".92"/>
      <g stroke="#5cc2ff" stroke-width="1.5" opacity=".18">
        <line x1="152" y1="130" x2="360" y2="130"/><line x1="152" y1="164" x2="360" y2="164"/>
        <line x1="152" y1="198" x2="360" y2="198"/><line x1="152" y1="232" x2="360" y2="232"/>
        <line x1="152" y1="266" x2="360" y2="266"/><line x1="152" y1="300" x2="360" y2="300"/>
        <line x1="152" y1="334" x2="360" y2="334"/><line x1="152" y1="368" x2="360" y2="368"/>
        <line x1="186" y1="100" x2="186" y2="404"/><line x1="220" y1="100" x2="220" y2="404"/>
        <line x1="254" y1="100" x2="254" y2="404"/><line x1="288" y1="100" x2="288" y2="404"/>
        <line x1="322" y1="100" x2="322" y2="404"/>
      </g>
      <rect x="166" y="114" width="180" height="276" rx="14" fill="none" stroke="#5cc2ff" stroke-width="2.5" stroke-dasharray="8 7" opacity=".7"/>
      <path d="M282 58 L192 288 L246 288 L224 376 L318 208 L262 208 Z" fill="none"
        stroke="#8fd4ff" stroke-width="4" stroke-dasharray="9 7"/>
      <rect x="152" y="100" width="208" height="304" rx="22" fill="none"
        stroke="#5cc2ff" stroke-width="5" stroke-dasharray="14 10"/>
      <circle cx="326" cy="134" r="30" fill="none" stroke="url(#gemP)" stroke-width="4" stroke-dasharray="8 7"/>
      <text x="326" y="147" text-anchor="middle" font-family="Arial, sans-serif" font-size="38" font-weight="900"
        fill="none" stroke="#ff9e6b" stroke-width="1.8">12</text>
      <g stroke="#5cc2ff" stroke-width="3" stroke-linecap="round" opacity=".7">
        <line x1="306" y1="238" x2="318" y2="238"/><line x1="312" y1="232" x2="312" y2="244"/>
        <line x1="330" y1="318" x2="342" y2="318"/><line x1="336" y1="312" x2="336" y2="324"/>
      </g>
    </g>
    <!-- the seam: the render line, still bright -->
    <line x1="302" y1="92" x2="268" y2="420" stroke="#c9b6ff" stroke-width="10" opacity=".55" filter="url(#soft)"/>
    <line x1="302" y1="92" x2="268" y2="420" stroke="#e4dbff" stroke-width="4"/>
    <path d="M300 100 l6 16 16 6 -16 6 -6 16 -6 -16 -16 -6 16 -6 Z" fill="#e4dbff"/>
    <path d="M272 402 l5 13 13 5 -13 5 -5 13 -5 -13 -13 -5 13 -5 Z" fill="#c9b6ff"/>
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
