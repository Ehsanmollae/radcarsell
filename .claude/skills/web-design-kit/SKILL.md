---
name: web-design-kit
description: Combined toolkit for designing and building a new website or landing page from scratch. Use whenever the user asks to design, build, or redesign a website, landing page, or marketing site for a new project — loads UI/UX data, art direction, craft/polish, and anti-slop guidance together instead of one at a time.
---

# Web Design Kit

Grouped entry point for the site-design skills chosen for this workflow. Load
the ones relevant to the current step with the Skill tool, in this order:

1. **ui-ux-pro-max** — always load first for new work. Gives searchable data:
   colors, font pairings, icons, UX guidelines, chart types, stack-specific
   patterns. Use it to pick the design system (palette, type, spacing) before
   writing markup.
2. **taste-skill** — load right after, before writing any code. Reads the
   brief and picks a non-templated direction (layout, vibe, references) so
   the output doesn't default to generic AI-landing-page look.
3. **frontend-design** — load while implementing. Governs typography choices,
   spacing, and visual decisions that read as intentional rather than default.
4. **emil-design-eng** — load for component-level and interaction polish:
   animation timing, hover/focus states, the small details that make the UI
   feel considered.
5. **impeccable** — load for the audit/polish pass once a working draft
   exists. Critiques hierarchy, accessibility, responsive behavior, and
   micro-interactions, then fixes what it finds.
6. **video-to-website** — not included in this repository (its upstream has no
   license). This project already has its own scroll engine: use
   `shared/js/scroll-engine.js`, `tools/extract-frames.sh` and `LESSONS.md` for
   the video-to-frames part, and the skills above for the visual direction.

## When to use this skill

Trigger on any "design a website / landing page / redesign this site" request
for a new project. Don't invoke every skill unconditionally — pick the ones
the current step needs per the order above. A quick one-page mockup may only
need ui-ux-pro-max + taste-skill + frontend-design; a full build with a
polish pass should walk through all of them in order.

## Project constraints to carry into every skill

- No external CDN — self-host fonts and JS libraries (Iranian hosting; CDNs
  are unreliable/blocked there). Vendor any library file into
  `shared/vendor/` and fonts into `shared/fonts/` instead of linking
  jsdelivr/cdnjs/Google Fonts.
- No build step assumed unless the project already has one.
