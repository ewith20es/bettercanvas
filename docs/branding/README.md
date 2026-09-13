# Better Canvas logo

The app uses an emerald tile, eight mint lobes and dots inspired by Canvas, and a white checkmark representing completed work. The production mark is drawn as SVG so the geometry stays crisp at small sizes.

- Editable production source: `apps/web/public/favicon.svg`
- Generated design reference: `logo-concept.png`
- Browser, Apple, and PWA icons: `apps/web/public/icons/`
- Regenerate icons: `node scripts/prepare-icons.mjs`

The favicon is also the logo shown in the sidebar, mobile header, loading screen, and sign-in screen. The maskable icon has an opaque background and keeps the complete mark inside the central safe area. The Apple touch icon has an opaque background for the operating system to round.

The concept was generated with the built-in image generation tool, then adapted into the repo's SVG icon format. Visual reference: [Canvas single mark from Instructure](https://www.instructure.com/sites/default/files/image/2021-12/Canvas_logo_single_mark.png).

## Concept prompt

Use case: logo-brand. Design a finished square app icon for a personal assignment dashboard called Better Canvas, a modern modification of the standard Instructure Canvas LMS logo. No text. Preserve the instantly recognizable Canvas circular sunburst construction: eight equally spaced curved solid semicircular lobes forming an outer ring, with eight small circular dots just inside the lobes, around an open center. Refine the geometry into a bold, clean contemporary mark and put a single decisive upward-sloping checkmark in the central opening to symbolize getting work done. Color palette suited to the app's existing forest green #23674c: full-bleed solid very dark emerald background #103E32, ring/lobes and dots in bright soft mint #80E8BE with an extremely restrained smooth mint-to-emerald tonal progression, central checkmark in warm white #F7FFF9. The outer ring and inner dots must be visibly distinct, not merged. Clean geometric vector-like execution, crisp flat shapes, consistent intentional spacing, generous empty space around entire symbol. Strong, confident, legible as an actual favicon and mobile home-screen app icon, not a decorative illustration. One centered symbol occupies about 68% of the square width and height, leaving background extending evenly to all four edges so an operating system can mask it. Square 1024x1024. Do not draw a rounded-square tile or border inside the image; the dark emerald background fills the whole image edge-to-edge. No labels, no wordmark, no mockup, no device, no lettering, no texture, no shadow, no glow, no 3D, no tiny details.
