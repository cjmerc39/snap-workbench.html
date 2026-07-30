// Dev-only: regenerates icon-180/192/512.png — full-bleed card-back surface,
// half still on the drafting table. node make-icons.mjs (renders via Playwright).
// App-icon rules honored: art to the corners (the OS rounds them), one centered
// focal element in the safe zone, bold shapes only.
// snap-logo.png is the OFFICIAL logo as published on marvelsnap.com's public
// homepage (not extracted from game files) — composited per the owner's call.
import { chromium } from 'playwright';
import fs from 'fs';

const LOGO = fs.readFileSync('snap-logo.png').toString('base64');

const SVG = (px) => `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="46%" cy="44%" r="85%">
      <stop offset="0%" stop-color="#31185e"/>
      <stop offset="55%" stop-color="#1d0e3a"/>
      <stop offset="100%" stop-color="#120826"/>
    </radialGradient>
    <filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="26"/></filter>
    <filter id="soft" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="7"/></filter>
    <!-- the drafting filter: the official logo as a blueprint x-ray (same PNG, no redraw) -->
    <filter id="draft" x="-20%" y="-20%" width="140%" height="140%">
      <feFlood flood-color="#2a6ea8" flood-opacity="0.28" result="fill"/>
      <feComposite in="fill" in2="SourceAlpha" operator="in" result="sil"/>
      <feColorMatrix in="SourceGraphic" type="matrix"
        values="0 0 0 0 0.45  0 0 0 0 0.83  0 0 0 0 1  0.19 0.36 0.14 0 0" result="xray"/>
      <feMerge><feMergeNode in="sil"/><feMergeNode in="xray"/></feMerge>
    </filter>
    <clipPath id="doneClip"><polygon points="0,0 400,0 112,512 0,512"/></clipPath>
    <clipPath id="printClip"><polygon points="400,0 512,0 512,512 112,512"/></clipPath>
  </defs>
  <!-- done side: the card-back surface itself, edge to edge -->
  <g clip-path="url(#doneClip)">
    <rect width="512" height="512" fill="url(#bg)"/>
    <g stroke="#c9b6ff" stroke-linecap="round">
      <line x1="96" y1="0" x2="96" y2="250" stroke-width="26" opacity=".10"/>
      <line x1="196" y1="0" x2="196" y2="330" stroke-width="38" opacity=".13"/>
      <line x1="300" y1="0" x2="300" y2="260" stroke-width="26" opacity=".10"/>
      <line x1="56" y1="0" x2="56" y2="160" stroke-width="6" opacity=".35"/>
      <line x1="140" y1="0" x2="140" y2="290" stroke-width="7" opacity=".5"/>
      <line x1="172" y1="0" x2="172" y2="380" stroke-width="9" opacity=".45"/>
      <line x1="236" y1="0" x2="236" y2="330" stroke-width="7" opacity=".55"/>
      <line x1="272" y1="0" x2="272" y2="250" stroke-width="8" opacity=".4"/>
      <line x1="342" y1="0" x2="342" y2="190" stroke-width="6" opacity=".35"/>
    </g>
    <circle cx="80" cy="360" r="9" fill="#c9b6ff" opacity=".35"/>
    <circle cx="120" cy="248" r="6" fill="#e4dbff" opacity=".45"/>
    <circle cx="330" cy="300" r="7" fill="#e4dbff" opacity=".4"/>
    <circle cx="150" cy="452" r="6" fill="#c9b6ff" opacity=".3"/>
    <ellipse cx="256" cy="256" rx="170" ry="160" fill="#8f6bff" opacity=".45" filter="url(#glow)"/>
    <polygon points="256,122 372,189 372,323 256,390 140,323 140,189" fill="rgba(169,132,255,.14)"
      stroke="#a984ff" stroke-width="16" stroke-linejoin="round" opacity=".8" filter="url(#soft)"/>
    <polygon points="256,122 372,189 372,323 256,390 140,323 140,189" fill="none"
      stroke="#efe9ff" stroke-width="7" stroke-linejoin="round"/>
    <image href="data:image/png;base64,${LOGO}" x="106" y="159" width="300" height="194" preserveAspectRatio="xMidYMid meet"/>
  </g>
  <!-- blueprint side: the same surface, still being drawn -->
  <g clip-path="url(#printClip)">
    <rect width="512" height="512" fill="#0d1f38"/>
    <g stroke="#5cc2ff" stroke-width="2.5" opacity=".2">
      <line x1="0" y1="56" x2="512" y2="56"/><line x1="0" y1="120" x2="512" y2="120"/>
      <line x1="0" y1="184" x2="512" y2="184"/><line x1="0" y1="248" x2="512" y2="248"/>
      <line x1="0" y1="312" x2="512" y2="312"/><line x1="0" y1="376" x2="512" y2="376"/>
      <line x1="0" y1="440" x2="512" y2="440"/>
      <line x1="120" y1="0" x2="120" y2="512"/><line x1="184" y1="0" x2="184" y2="512"/>
      <line x1="248" y1="0" x2="248" y2="512"/><line x1="312" y1="0" x2="312" y2="512"/>
      <line x1="376" y1="0" x2="376" y2="512"/><line x1="440" y1="0" x2="440" y2="512"/>
    </g>
    <polygon points="256,122 372,189 372,323 256,390 140,323 140,189" fill="none"
      stroke="#7fd4ff" stroke-width="7" stroke-dasharray="14 11" stroke-linejoin="round"/>
    <image href="data:image/png;base64,${LOGO}" x="106" y="159" width="300" height="194"
      preserveAspectRatio="xMidYMid meet" filter="url(#draft)"/>
    <g stroke="#5cc2ff" stroke-width="4" stroke-linecap="round" opacity=".65">
      <line x1="432" y1="88" x2="452" y2="88"/><line x1="442" y1="78" x2="442" y2="98"/>
      <line x1="420" y1="420" x2="438" y2="420"/><line x1="429" y1="411" x2="429" y2="429"/>
      <line x1="300" y1="462" x2="316" y2="462"/><line x1="308" y1="454" x2="308" y2="470"/>
    </g>
  </g>
  <!-- the render line, corner to corner -->
  <line x1="400" y1="0" x2="112" y2="512" stroke="#c9b6ff" stroke-width="18" opacity=".55" filter="url(#soft)"/>
  <line x1="400" y1="0" x2="112" y2="512" stroke="#e4dbff" stroke-width="6"/>
  <path d="M330 108 l8 22 22 8 -22 8 -8 22 -8 -22 -22 -8 22 -8 Z" fill="#e4dbff"/>
  <path d="M178 386 l6 16 16 6 -16 6 -6 16 -6 -16 -16 -6 16 -6 Z" fill="#c9b6ff" opacity=".9"/>
</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 600, height: 600 }, deviceScaleFactor: 1 });
for (const px of [512, 192, 180]) {
  await page.setContent(`<body style="margin:0">${SVG(px)}</body>`);
  await page.locator('svg').screenshot({ path: `icon-${px}.png` });
  console.log(`icon-${px}.png written`);
}
await browser.close();
