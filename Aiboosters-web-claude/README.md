# AIBoosters Consulting — Website

Static marketing site for AIBoosters Consulting (aiboosters.guru).

## Pages
- `index.html` — Home (3D WebGL hero, live automation demo, nine principles, QR)
- `services.html` — All nine capabilities
- `approach.html` — Six-phase engagement method
- `work.html` — Engagement patterns
- `contact.html` — Briefing request form

## Stack
Plain HTML/CSS/JS. No build step. Three.js r128 loaded from CDN for the 3D hero.
Every page is self-contained; shared styling is inlined per page.

## Local preview
Open `index.html` directly in a browser, or serve the folder:

    python3 -m http.server 8000

Then visit http://localhost:8000

## Known TODOs before going live
- Contact form opens the user's mail client; wire to Formspree/Netlify Forms for real submissions
- Replace `work.html` engagement patterns with named, signed-off case studies
- Add favicon files and Open Graph preview image
- Decide on Tier 2 (live API-backed AI assistant) vs current scripted preview panel
