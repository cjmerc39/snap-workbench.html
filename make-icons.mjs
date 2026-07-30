// Dev-only: regenerates icon-180/192/512.png — the Snap default card back,
// half drafted on the workbench. node make-icons.mjs (renders via Playwright).
// snap-logo.png is the OFFICIAL logo as published on marvelsnap.com's public
// homepage (not extracted from game files) — composited per the owner's call.
import { chromium } from 'playwright';
import fs from 'fs';

const LOGO = fs.readFileSync('snap-logo.png').toString('base64');

const SVG = (px) => `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="50%" cy="42%" r="80%">
      <stop offset="0%" stop-color="#2b1650"/>
      <stop offset="55%" stop-color="#170c2c"/>
      <stop offset="100%" stop-color="#0b0e1c"/>
    </radialGradient>
    <linearGradient id="art" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2a1454"/><stop offset="100%" stop-color="#150a2c"/>
    </linearGradient>
    <filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="22"/></filter>
    <filter id="soft" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="6"/></filter>
    <clipPath id="doneClip"><polygon points="0,0 512,0 512,11 189,512 0,512"/></clipPath>
    <clipPath id="printClip"><polygon points="512,11 512,512 189,512"/></clipPath>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <ellipse cx="240" cy="220" rx="215" ry="200" fill="#8f6bff" opacity=".32" filter="url(#glow)"/>
  <g transform="rotate(-4 256 256)">
    <rect x="106" y="45" width="300" height="430" rx="30" fill="#14091f" opacity=".5" filter="url(#soft)"/>
    <!-- done half: the default card back — aurora streaks behind the glowing hex, the logo on it -->
    <g clip-path="url(#doneClip)">
      <rect x="106" y="41" width="300" height="430" rx="30" fill="url(#art)"/>
      <g stroke="#c9b6ff" stroke-linecap="round">
        <line x1="166" y1="41" x2="166" y2="210" stroke-width="16" opacity=".10"/>
        <line x1="236" y1="41" x2="236" y2="290" stroke-width="24" opacity=".13"/>
        <line x1="308" y1="41" x2="308" y2="230" stroke-width="16" opacity=".10"/>
        <line x1="140" y1="41" x2="140" y2="150" stroke-width="4" opacity=".35"/>
        <line x1="196" y1="41" x2="196" y2="252" stroke-width="4" opacity=".5"/>
        <line x1="222" y1="41" x2="222" y2="320" stroke-width="6" opacity=".45"/>
        <line x1="262" y1="41" x2="262" y2="282" stroke-width="4" opacity=".55"/>
        <line x1="288" y1="41" x2="288" y2="222" stroke-width="5" opacity=".4"/>
        <line x1="336" y1="41" x2="336" y2="180" stroke-width="4" opacity=".35"/>
      </g>
      <circle cx="150" cy="300" r="6" fill="#c9b6ff" opacity=".35"/>
      <circle cx="176" cy="212" r="4" fill="#e4dbff" opacity=".45"/>
      <circle cx="330" cy="260" r="4.5" fill="#e4dbff" opacity=".4"/>
      <circle cx="200" cy="392" r="4" fill="#c9b6ff" opacity=".3"/>
      <ellipse cx="236" cy="205" rx="115" ry="108" fill="#8f6bff" opacity=".42" filter="url(#glow)"/>
      <polygon points="236,125 305,165 305,245 236,285 167,245 167,165" fill="rgba(169,132,255,.14)"
        stroke="#a984ff" stroke-width="13" stroke-linejoin="round" opacity=".8" filter="url(#soft)"/>
      <polygon points="236,125 305,165 305,245 236,285 167,245 167,165" fill="none"
        stroke="#efe9ff" stroke-width="6" stroke-linejoin="round"/>
      <image href="data:image/png;base64,${LOGO}" x="151" y="150" width="170" height="110" preserveAspectRatio="xMidYMid meet"/>
      <rect x="113" y="48" width="286" height="416" rx="25" fill="none" stroke="#b9b3cc" stroke-width="2.5" opacity=".55"/>
      <rect x="106" y="41" width="300" height="430" rx="30" fill="none" stroke="#ffffff" stroke-width="8"/>
    </g>
    <!-- blueprint half: the same card, still on the bench -->
    <g clip-path="url(#printClip)">
      <rect x="106" y="41" width="300" height="430" rx="30" fill="#0c1c33" opacity=".95"/>
      <g stroke="#5cc2ff" stroke-width="2" opacity=".2">
        <line x1="106" y1="120" x2="406" y2="120"/><line x1="106" y1="170" x2="406" y2="170"/>
        <line x1="106" y1="220" x2="406" y2="220"/><line x1="106" y1="270" x2="406" y2="270"/>
        <line x1="106" y1="320" x2="406" y2="320"/><line x1="106" y1="370" x2="406" y2="370"/>
        <line x1="106" y1="420" x2="406" y2="420"/>
        <line x1="156" y1="41" x2="156" y2="471"/><line x1="206" y1="41" x2="206" y2="471"/>
        <line x1="256" y1="41" x2="256" y2="471"/><line x1="306" y1="41" x2="306" y2="471"/>
        <line x1="356" y1="41" x2="356" y2="471"/>
      </g>
      <!-- the emblem, still being drafted: a dashed hex echo -->
      <polygon points="330,296 380,325 380,383 330,412 280,383 280,325" fill="none"
        stroke="#5cc2ff" stroke-width="4.5" stroke-dasharray="11 9"/>
      <g stroke="#5cc2ff" stroke-width="3.5" stroke-linecap="round" opacity=".8">
        <line x1="330" y1="344" x2="330" y2="364"/><line x1="320" y1="354" x2="340" y2="354"/>
      </g>
      <g stroke="#5cc2ff" stroke-width="3" stroke-linecap="round" opacity=".6">
        <line x1="360" y1="140" x2="374" y2="140"/><line x1="367" y1="133" x2="367" y2="147"/>
        <line x1="290" y1="452" x2="302" y2="452"/><line x1="296" y1="446" x2="296" y2="458"/>
      </g>
      <rect x="113" y="48" width="286" height="416" rx="25" fill="none" stroke="#3a7fb8" stroke-width="2" stroke-dasharray="8 8" opacity=".6"/>
      <rect x="106" y="41" width="300" height="430" rx="30" fill="none"
        stroke="#5cc2ff" stroke-width="7" stroke-dasharray="18 12"/>
    </g>
    <!-- the seam: the render line -->
    <line x1="406" y1="175" x2="215" y2="471" stroke="#c9b6ff" stroke-width="13" opacity=".55" filter="url(#soft)"/>
    <line x1="406" y1="175" x2="215" y2="471" stroke="#e4dbff" stroke-width="5"/>
    <path d="M311 318 l7 19 19 7 -19 7 -7 19 -7 -19 -19 -7 19 -7 Z" fill="#e4dbff"/>
    <path d="M396 190 l5 13 13 5 -13 5 -5 13 -5 -13 -13 -5 13 -5 Z" fill="#c9b6ff" opacity=".9"/>
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
