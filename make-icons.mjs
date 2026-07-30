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
      <clipPath id="doneClip"><polygon points="130,30 382,30 382,218 222,430 130,430"/></clipPath>
      <clipPath id="printClip"><polygon points="382,218 382,430 222,430"/></clipPath>
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
    <!-- the card, REAL Snap anatomy (referenced against an actual card render):
         full-bleed art behind a thin white frame; a glossy blue cost ORB poking
         above the top-left corner; an orange power HEX top-right; the bolt-as-art
         breaking the frame; the name as huge 3D letters drawn over everything. -->
    <g clip-path="url(#doneClip)">
      <rect x="152" y="100" width="208" height="304" rx="22" fill="url(#art)"/>
      <g opacity=".5">
        <polygon points="256,240 168,132 196,120" fill="#8f6bff"/>
        <polygon points="256,240 152,252 152,220" fill="#8f6bff"/>
        <polygon points="256,240 190,392 162,372" fill="#8f6bff"/>
        <polygon points="256,240 336,136 356,158" fill="#8f6bff"/>
        <polygon points="256,240 360,296 354,322" fill="#8f6bff"/>
        <polygon points="256,240 234,104 264,102" fill="#8f6bff"/>
      </g>
      <path d="M291 62 L199 297 L254 297 L231 388 L329 213 L271 213 Z" fill="#6b4fd0" transform="translate(9 6)"/>
      <path d="M291 62 L199 297 L254 297 L231 388 L329 213 L271 213 Z" fill="#c9b6ff" stroke="#14091f" stroke-width="7" stroke-linejoin="round"/>
      <rect x="152" y="100" width="208" height="304" rx="22" fill="none" stroke="#ffffff" stroke-width="6"/>
      <!-- cost orb: dark ring, glossy blue sphere, electric rim -->
      <circle cx="186" cy="122" r="35" fill="#0a1a3a"/>
      <circle cx="186" cy="122" r="35" fill="none" stroke="#6fd0ff" stroke-width="3" opacity=".85"/>
      <circle cx="186" cy="122" r="28" fill="url(#gemC)"/>
      <path d="M170 110 a22 22 0 0 1 14 -9" fill="none" stroke="#eaf6ff" stroke-width="4" stroke-linecap="round" opacity=".95"/>
      <text x="186" y="137" text-anchor="middle" font-family="Arial, sans-serif" font-style="italic" font-weight="900"
        font-size="44" fill="#ffffff" stroke="#12325c" stroke-width="6" paint-order="stroke">6</text>
      <!-- power hex: beveled orange gem -->
      <polygon points="326,86 357,104 357,140 326,158 295,140 295,104" fill="url(#gemP)" stroke="#b34a10" stroke-width="5" stroke-linejoin="round"/>
      <polygon points="326,94 350,108 350,136 326,150 302,136 302,108" fill="none" stroke="#ffd9a8" stroke-width="2.5" opacity=".9"/>
      <text x="326" y="137" text-anchor="middle" font-family="Arial, sans-serif" font-style="italic" font-weight="900"
        font-size="44" fill="#ffffff" stroke="#7a2f08" stroke-width="6" paint-order="stroke">12</text>
    </g>
    <!-- the drafting corner: same card, still on the bench -->
    <g clip-path="url(#printClip)">
      <rect x="152" y="100" width="208" height="304" rx="22" fill="#0c1c33" opacity=".94"/>
      <g stroke="#5cc2ff" stroke-width="1.5" opacity=".2">
        <line x1="152" y1="266" x2="360" y2="266"/><line x1="152" y1="300" x2="360" y2="300"/>
        <line x1="152" y1="334" x2="360" y2="334"/><line x1="152" y1="368" x2="360" y2="368"/>
        <line x1="254" y1="100" x2="254" y2="404"/><line x1="288" y1="100" x2="288" y2="404"/>
        <line x1="322" y1="100" x2="322" y2="404"/>
      </g>
      <rect x="166" y="114" width="180" height="276" rx="14" fill="none" stroke="#5cc2ff" stroke-width="2.5" stroke-dasharray="8 7" opacity=".7"/>
      <rect x="152" y="100" width="208" height="304" rx="22" fill="none"
        stroke="#5cc2ff" stroke-width="5" stroke-dasharray="14 10"/>
      <g stroke="#5cc2ff" stroke-width="3" stroke-linecap="round" opacity=".7">
        <line x1="318" y1="330" x2="330" y2="330"/><line x1="324" y1="324" x2="324" y2="336"/>
      </g>
    </g>
    <!-- the seam: the render line, still bright -->
    <line x1="360" y1="218" x2="222" y2="404" stroke="#c9b6ff" stroke-width="10" opacity=".55" filter="url(#soft)"/>
    <line x1="360" y1="218" x2="222" y2="404" stroke="#e4dbff" stroke-width="4"/>
    <path d="M354 224 l6 16 16 6 -16 6 -6 16 -6 -16 -16 -6 16 -6 Z" fill="#e4dbff"/>
    <!-- the name: huge 3D letters over everything, overhanging the card like the real ones -->
    <g transform="rotate(-3 256 384)" font-family="'Arial Black', Arial, sans-serif" font-style="italic" font-weight="900" font-size="76" letter-spacing="2">
      <text x="258" y="416" text-anchor="middle" transform="translate(6 10)" fill="#2a1b45" stroke="#14091f" stroke-width="12" paint-order="stroke">WORK</text>
      <text x="258" y="416" text-anchor="middle" fill="url(#card)" stroke="#14091f" stroke-width="7" paint-order="stroke">WORK</text>
    </g>
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
