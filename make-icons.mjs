// Dev-only: regenerates icon-180/192/512.png — a fanned Snap deck cropped
// full-bleed, the front card still on the drafting table.
// node make-icons.mjs (renders via Playwright).
import { chromium } from 'playwright';

const SVG = (px) => `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="30%" cy="25%" r="90%">
      <stop offset="0%" stop-color="#31185e"/>
      <stop offset="55%" stop-color="#1a0d33"/>
      <stop offset="100%" stop-color="#0e0820"/>
    </radialGradient>
    <linearGradient id="backMid" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2f1a58"/><stop offset="100%" stop-color="#1b0f34"/>
    </linearGradient>
    <linearGradient id="backFar" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#241344"/><stop offset="100%" stop-color="#150b28"/>
    </linearGradient>
    <filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="24"/></filter>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <ellipse cx="150" cy="120" rx="200" ry="170" fill="#8f6bff" opacity=".30" filter="url(#glow)"/>
  <!-- the deck, fanned from a wrist below the frame: back card peeks left, the
       finished card shows BOTH side edges (cropped top+bottom), and the blueprint
       card is being dealt on top — its rounded corner visible in-frame -->
  <g transform="rotate(-16 256 860)">
    <rect x="76" y="-40" width="300" height="570" rx="34" fill="url(#backFar)" stroke="#8f6bff" stroke-width="8"/>
  </g>
  <g transform="rotate(-3 256 860)">
    <rect x="106" y="-40" width="300" height="570" rx="34" fill="url(#backMid)" stroke="#c9b6ff" stroke-width="9"/>
    <line x1="150" y1="-30" x2="150" y2="170" stroke="#c9b6ff" stroke-width="9" opacity=".4" stroke-linecap="round"/>
    <line x1="196" y1="-30" x2="196" y2="250" stroke="#c9b6ff" stroke-width="12" opacity=".5" stroke-linecap="round"/>
    <line x1="244" y1="-30" x2="244" y2="140" stroke="#c9b6ff" stroke-width="8" opacity=".35" stroke-linecap="round"/>
    <ellipse cx="215" cy="225" rx="135" ry="128" fill="#8f6bff" opacity=".5" filter="url(#glow)"/>
    <polygon points="215,132 295,178 295,272 215,318 135,272 135,178" fill="rgba(169,132,255,.16)"
      stroke="#a984ff" stroke-width="15" stroke-linejoin="round" opacity=".8" filter="url(#glow)"/>
    <polygon points="215,132 295,178 295,272 215,318 135,272 135,178" fill="none"
      stroke="#efe9ff" stroke-width="8" stroke-linejoin="round"/>
    <circle cx="150" cy="392" r="6" fill="#c9b6ff" opacity=".4"/>
    <circle cx="196" cy="342" r="4.5" fill="#e4dbff" opacity=".45"/>
  </g>
  <!-- the front card: still on the drafting table, mid-deal -->
  <g transform="rotate(12 256 860)">
    <rect x="150" y="60" width="300" height="560" rx="34" fill="#0d1f38"/>
    <g stroke="#5cc2ff" stroke-width="2.5" opacity=".22">
      <line x1="156" y1="130" x2="444" y2="130"/><line x1="156" y1="200" x2="444" y2="200"/>
      <line x1="156" y1="270" x2="444" y2="270"/><line x1="156" y1="340" x2="444" y2="340"/>
      <line x1="156" y1="410" x2="444" y2="410"/><line x1="156" y1="480" x2="444" y2="480"/>
      <line x1="214" y1="66" x2="214" y2="614"/><line x1="284" y1="66" x2="284" y2="614"/>
      <line x1="354" y1="66" x2="354" y2="614"/><line x1="424" y1="66" x2="424" y2="614"/>
    </g>
    <polygon points="300,172 376,216 376,304 300,348 224,304 224,216" fill="none"
      stroke="#7fd4ff" stroke-width="8" stroke-dasharray="15 12" stroke-linejoin="round"/>
    <g stroke="#5cc2ff" stroke-width="4.5" stroke-linecap="round" opacity=".75">
      <line x1="300" y1="246" x2="300" y2="274"/><line x1="286" y1="260" x2="314" y2="260"/>
    </g>
    <g stroke="#5cc2ff" stroke-width="4" stroke-linecap="round" opacity=".6">
      <line x1="386" y1="430" x2="404" y2="430"/><line x1="395" y1="421" x2="395" y2="439"/>
      <line x1="196" y1="470" x2="212" y2="470"/><line x1="204" y1="462" x2="204" y2="478"/>
    </g>
    <rect x="150" y="60" width="300" height="560" rx="34" fill="none" stroke="#5cc2ff" stroke-width="10" stroke-dasharray="24 16"/>
  </g>
  <path d="M330 66 l8 22 22 8 -22 8 -8 22 -8 -22 -22 -8 22 -8 Z" fill="#e4dbff"/>
  <path d="M60 330 l6 16 16 6 -16 6 -6 16 -6 -16 -16 -6 16 -6 Z" fill="#c9b6ff" opacity=".9"/>
</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 600, height: 600 }, deviceScaleFactor: 1 });
for (const px of [512, 192, 180]) {
  await page.setContent(`<body style="margin:0">${SVG(px)}</body>`);
  await page.locator('svg').screenshot({ path: `icon-${px}.png` });
  console.log(`icon-${px}.png written`);
}
await browser.close();
