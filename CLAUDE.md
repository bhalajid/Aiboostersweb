# AIBoosters Consulting — Website

Static marketing site for AIBoosters Consulting. Owner: Balaji "Guru" Durai,
founder & principal consultant. Domain: aiboosters.guru. Market: Europe + global remote.

## Positioning

Enterprise AI transformation consultancy. Three pillars:
Platform Engineering → AI Integration → Deployment & Development.
Core line: **"We don't do it for you. We clear the way."**

Philosophy: a booster never replaces the thing — it attaches to what is already
moving and multiplies it. Engagements are designed to END, with the client's team
running the system without us. Never write copy that implies permanent dependency.

## Stack

Plain HTML/CSS/JS. **No build step, no framework, no bundler.**
Every page is fully self-contained — CSS in a `<style>` block, JS in a `<script>` block.
Three.js **r128** from cdnjs for the 3D hero (note: `MeshPhysicalMaterial.thickness`
does NOT exist in r128 — it was added in r129, and using it floods the console).
The signal-flow network on the homepage is plain 2D canvas, not WebGL.

Deployed on Vercel. `vercel.json` forces static serving (`framework: null`,
no build command, output `.`) — the repo still contains Create React App leftovers
that Vercel would otherwise try to build.

## Pages

| File | Contents |
|---|---|
| `index.html` | 3D hero, signal-flow network, automation demo, nine principles, QR |
| `services.html` | Nine capabilities in detail |
| `products.html` | Five products/frameworks with build-status badges |
| `approach.html` | Six-phase engagement method, four non-negotiables |
| `work.html` | Engagement patterns (NOT named clients — see below) |
| `contact.html` | Briefing form (mailto-based, no backend yet) |

## Brand constants — do not change without asking

```
--ink      #05070F   near-black ground
--copper   #C97A3C   primary accent (chosen deliberately; not blue)
--copper-lt #E9A063
--white    #F8FAFC
--grey     #949CB0
fonts: Inter (UI), JetBrains Mono (labels, kickers, numbers)
```

Copper was chosen over blue on purpose — most European AI firms are blue, and the
choice was cross-checked against the founder's preferences. **Do not "modernise" it to blue.**

## The nine-circle mark

The logo is nine circles on a 90° arc, growing 9× from first to last.
Circle 9 is pushed +14 units off the pure arc — a deliberate distinctiveness break.
Exact coordinates (viewBox `0 0 187.71 174.29`) are hardcoded in the `#mark9` SVG
symbol on every page and in the Three.js hero. **These must stay identical everywhere.**

The nine circles map to nine values, in order:
Trustworthy, Human, Confident, Elegant, Timeless, Enterprise, Premium, Innovative, Intelligent.

**Never put text inside the mark.** "AI" lettering was tried and rejected — it fails at
small sizes and violates the original brief.

## Editorial rules

- **No fabricated clients, logos, or case studies.** `work.html` deliberately shows
  engagement *patterns* and says so in plain text. Replace only with signed-off, named studies.
- **The AI assistant panel is a scripted front-end simulation**, labelled "Preview assistant".
  It must never be presented as a live model unless it's actually wired to an API.
- **Product status badges are honest** — only "AI Readiness Assessment" is marked available.
  Don't promote items to "available" without the owner's say-so.
- Automation demo timings are illustrative; the owner may want them adjusted to be
  more conservative (current savings read ~99%, which can strain credibility).

## Accessibility / performance

- All animation respects `prefers-reduced-motion`.
- 3D hero reframes the camera at 700px and 1000px breakpoints; spheres respond to
  touch (tap to reveal value) as well as hover.
- Signal-flow canvas only animates while in viewport (IntersectionObserver).
- Enterprise buyers often browse on locked-down machines with weak GPUs — keep new
  animation cheap and always degrade gracefully.

## Known TODO

- Contact form opens a mail client; needs Formspree or similar for real submissions
- No favicon files or Open Graph preview image yet
- Decide: live API-backed assistant vs current scripted panel
- Remove leftover CRA files (`src/`, `public/`, `package.json`) if React isn't needed
- A private SSL key was committed and pushed publicly (`www_aiboosters_guru.key`) —
  that certificate must be revoked and reissued; never re-add keys to this repo
