# AIBoosters Consulting — Website

Static marketing site for AIBoosters Consulting (aiboosters.guru).

## Pages

- `index.html` — Home: 3D WebGL hero, AI signal-flow network, live automation demo, nine principles, QR
- `services.html` — All nine capabilities
- `products.html` — Products and frameworks, with build-status labels
- `approach.html` — Six-phase engagement method
- `work.html` — Engagement patterns
- `contact.html` — Briefing request form

## Stack

Plain HTML/CSS/JS. No build step, no framework.
Three.js r128 from CDN for the 3D hero and sub-page orb fields.
Signal-flow network is 2D canvas. Every page is self-contained.

## Local preview

Open `index.html` directly, or serve the folder:

    python3 -m http.server 8000

Then visit http://localhost:8000

## Deployment

Static hosting. Cloudflare Pages recommended (unlimited bandwidth on the free tier).
Build command: none. Output directory: `/`.
`.nojekyll` is present so GitHub Pages serves all files untouched.

## TODO before going live

- Contact form opens the user's mail client — wire to Formspree or similar
- Replace `work.html` engagement patterns with named, signed-off case studies
- Add favicon files and an Open Graph preview image
- Decide on a live API-backed AI assistant vs the current scripted preview panel
- Confirm the automation demo timings are figures you're happy to defend

## Do not commit

Private keys, certificates, `.env` files. See `.gitignore`.
