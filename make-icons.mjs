// Dev-only: regenerates icon-180/192/512.png (Lilac Nocturne card-fan mark).
// node make-icons.mjs — renders the SVG below via Playwright at each size.
// snap-logo.png is the OFFICIAL logo as published on marvelsnap.com's public
// homepage (not extracted from game files) — composited per the owner's call.
import { chromium } from 'playwright';
import fs from 'fs';

const LOGO = fs.readFileSync('snap-logo.png').toString('base64');

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
      <!-- the default card back: aurora streaks falling behind the glowing hex emblem -->
      <g stroke="#c9b6ff" stroke-linecap="round">
        <line x1="200" y1="100" x2="200" y2="240" stroke-width="14" opacity=".10"/>
        <line x1="256" y1="100" x2="256" y2="300" stroke-width="20" opacity=".13"/>
        <line x1="312" y1="100" x2="312" y2="250" stroke-width="14" opacity=".10"/>
        <line x1="180" y1="100" x2="180" y2="196" stroke-width="4" opacity=".35"/>
        <line x1="222" y1="100" x2="222" y2="266" stroke-width="3" opacity=".5"/>
        <line x1="243" y1="100" x2="243" y2="322" stroke-width="5" opacity=".45"/>
        <line x1="270" y1="100" x2="270" y2="290" stroke-width="3" opacity=".55"/>
        <line x1="292" y1="100" x2="292" y2="240" stroke-width="4" opacity=".4"/>
        <line x1="330" y1="100" x2="330" y2="208" stroke-width="3" opacity=".35"/>
      </g>
      <circle cx="196" cy="308" r="5" fill="#c9b6ff" opacity=".35"/>
      <circle cx="322" cy="330" r="4" fill="#c9b6ff" opacity=".3"/>
      <circle cx="176" cy="238" r="3" fill="#e4dbff" opacity=".45"/>
      <circle cx="336" cy="262" r="3.5" fill="#e4dbff" opacity=".4"/>
      <circle cx="286" cy="356" r="3" fill="#c9b6ff" opacity=".3"/>
      <ellipse cx="256" cy="252" rx="95" ry="90" fill="#8f6bff" opacity=".4" filter="url(#glow)"/>
      <polygon points="256,174 323,213 323,291 256,330 189,291 189,213" fill="rgba(169,132,255,.14)"
        stroke="#a984ff" stroke-width="12" stroke-linejoin="round" opacity=".8" filter="url(#soft)"/>
      <polygon points="256,174 323,213 323,291 256,330 189,291 189,213" fill="none"
        stroke="#efe9ff" stroke-width="5" stroke-linejoin="round"/>
      <polygon points="256,192 308,222 308,282 256,312 204,282 204,222" fill="none"
        stroke="#c9b6ff" stroke-width="2" stroke-linejoin="round" opacity=".6"/>
      <image href="data:image/png;base64,${LOGO}" x="176" y="200" width="160" height="104" preserveAspectRatio="xMidYMid meet"/>
      <rect x="158" y="106" width="196" height="292" rx="18" fill="none" stroke="#b9b3cc" stroke-width="2" opacity=".55"/>
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
    <path d="M232 390 l5 13 13 5 -13 5 -5 13 -5 -13 -13 -5 13 -5 Z" fill="#c9b6ff"/>
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
