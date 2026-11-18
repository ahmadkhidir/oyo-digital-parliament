# Assets

The asset ledger. One row per slot (`A-###`). The user is the sole authority on what already exists and where.
`Status` is `Done` when the file is on disk and `Pending` until then.

| Slot | File | Family / Variant | Status |
|---|---|---|---|
| A-001 | assets/brand/mark.svg | Brand mark / Master, mark only, transparent | Done |
| A-002 | assets/brand/mark-one-colour.svg | Brand mark / One-colour | Done |
| A-003 | assets/brand/mark-knockout.svg | Brand mark / Knockout | Done |
| A-004 | assets/brand/lockup-horizontal.svg | Brand mark / Horizontal lockup | Done |
| A-005 | assets/brand/favicon-16.png | Brand mark / Favicon 16 | Done |
| A-006 | assets/brand/favicon-32.png | Brand mark / Favicon 32 | Done |
| A-007 | assets/brand/app-icon-192.png | Brand mark / App icon 192 | Done |
| A-008 | assets/brand/app-icon-512.png | Brand mark / App icon 512 | Done |
| A-009 | assets/brand/app-icon-maskable-512.png | Brand mark / App icon maskable 512 | Done |
| A-010 | assets/brand/apple-touch-icon-180.png | Brand mark / Apple touch icon 180 | Done |
| A-011 | assets/icons/pillars/local-government-autonomy.svg | Pillar icon / Local government autonomy | Done |
| A-012 | assets/icons/pillars/infrastructure.svg | Pillar icon / Infrastructure | Done |
| A-013 | assets/icons/pillars/health.svg | Pillar icon / Health | Done |
| A-014 | assets/icons/pillars/education.svg | Pillar icon / Education | Done |
| A-015 | assets/icons/pillars/economy-and-jobs.svg | Pillar icon / Economy and jobs | Done |
| A-016 | assets/icons/pillars/agriculture-and-minerals.svg | Pillar icon / Agriculture and minerals | Done |
| A-017 | assets/icons/pillars/security.svg | Pillar icon / Security | Done |
| A-018 | assets/icons/ui/menu.svg | Interface icon / Menu | Done |
| A-019 | assets/icons/ui/chevron-down.svg | Interface icon / Chevron down | Done |
| A-020 | assets/icons/ui/chevron-left.svg | Interface icon / Chevron left | Done |
| A-021 | assets/icons/ui/chevron-right.svg | Interface icon / Chevron right | Done |
| A-022 | assets/icons/ui/x.svg | Interface icon / Close | Done |
| A-023 | assets/icons/ui/refresh.svg | Interface icon / Retry | Done |
| A-024 | assets/icons/ui/wifi-off.svg | Interface icon / Offline | Done |
| A-025 | assets/icons/ui/loader-2.svg | Interface icon / Pending work | Done |
| A-026 | assets/icons/ui/download.svg | Interface icon / Download | Done |
| A-027 | assets/icons/ui/trash.svg | Interface icon / Delete | Done |
| A-028 | assets/icons/ui/logout.svg | Interface icon / Sign out | Done |
| A-029 | assets/icons/ui/external-link.svg | Interface icon / Leaves the record | Done |
| A-030 | assets/status/marker-awaiting-decision.svg | Status marker / Awaiting decision | Done |
| A-031 | assets/status/marker-overdue.svg | Status marker / Overdue | Done |
| A-032 | assets/status/marker-committed.svg | Status marker / Committed | Done |
| A-033 | assets/status/marker-referred.svg | Status marker / Referred | Done |
| A-034 | assets/status/marker-delivered.svg | Status marker / Delivered | Done |
| A-035 | assets/status/marker-slipped.svg | Status marker / Slipped | Done |
| A-036 | assets/status/marker-dropped.svg | Status marker / Dropped | Done |
| A-037 | assets/status/marker-declined.svg | Status marker / Declined | Done |
| A-038 | assets/status/marker-withdrawn.svg | Status marker / Withdrawn | Done |
| A-039 | assets/status/marker-withheld.svg | Status marker / Withheld | Done |
| A-040 | assets/social/share-card-1200x630.png | Social share card / Landscape | Pending |
| A-041 | assets/social/share-card-1200x1200.png | Social share card / Square | Pending |
| A-042 | assets/fonts/noto-sans-latin-yoruba.woff2 | Font / Noto Sans | Done |
| A-043 | assets/fonts/noto-serif-latin-yoruba.woff2 | Font / Noto Serif | Done |

## Family blocks

### Family: Brand mark

**Medium:** Vector — one canonical drawing, authored deterministically as editable SVG. No image model is used, because the mark is a closed silhouette that must survive 16px and one ink.

**Palette:**
- Ink `#1B1815` (neutral-900, light column)
- Reversed ink `#F3F0EC` (neutral-900, dark column, the lightest step of the dark neutral family)
- Paper field `#F5F2EE` (neutral-100, light column)
- Deep neutral field `#221E1B` (neutral-100, dark column)

**Invariants:** A pictorial mark of a bound register whose torn page stays attached at the spine. The tear is the one move and reads first as damage, then as deliberate, because the page does not come away. Compact and weighty, a firm outer edge, no interior detail beyond the spine, handled rather than new. One closed silhouette that reads at 16px with no interior line work. One tone only, never dependent on colour. Never rotated, never given a drop shadow, never outlined, never placed inside another shape. No lettering inside the mark, and no modification to the name's type.

**Prompt:**
```text
A pictorial brand mark of a bound register. A thick, closed book seen face-on: one firm outer mass
with the proportions of a small ledger, a narrow raised band down the left where the binding sits,
and no interior line work at all, so the spine reads as a step in the silhouette.

The single move is the tear. The top sheet is torn across its outer edge and stays held at the
spine: the ragged edge runs in from the right, stops short of the binding, and the torn leaf sits
a little proud of the block, lifted at its free corner. The tear reads first as damage and then as
deliberate, because the page never comes away.

Solid single tone in ink #1B1815, flat, crisp edges, no gradient, no highlight, no shadow. Compact
and weighty, the outer edge firm and only slightly eased, the torn edge the one sharp irregular
gesture. Handled rather than new: a plain object that has been used, not a decorated one. No
lettering anywhere in the mark. Centred, the longest side of the silhouette at 76% of a square
canvas, on a transparent background.
```

**Settings:**
- Artboard 100×100 units. The silhouette is centred on the optical centre, its longest side 76 units, with at least 12 units clear on every side.
- Drawn as filled paths only, with no stroke. The minimum feature is 2 units, so nothing dissolves when the mark renders at 16px.
- The spine is a 14-unit band expressed as a 2-unit step in the top and bottom contour, never as an interior line.
- The tear enters the contour 8 units below the top-right corner and runs 76 units inboard in four uneven steps of 18, 16, 22 and 20 units, stopping 10 units clear of the spine. The torn leaf rises 3 units above the top edge at its free corner.
- The four outer corners are eased by 2 units. The tear edge carries no radius.
- Output is editable SVG with no embedded raster, no filters, and no background rectangle. A 1024×1024 PNG reference is exported from it for review only.
- One-colour behaviour: a single flat ink, no tint, no overprint, no transparency-dependent edge, so the form survives one-ink print, embroidery and a monochrome screen.
- The name is set in Noto Sans at weight 600, sentence case, converted to outlines from the shipped font file so the lockup renders without the font. The name is never shortened by the layout.
- Every file is checked at 16×16 and at 100 % zoom on both the paper `#F5F2EE` and the deep neutral `#221E1B` before it is marked `Done`.

**Variants:**
| Variant | Target | Execution Delta |
|---|---|---|
| Master — mark only, transparent | assets/brand/mark.svg | None. The canonical drawing: ink `#1B1815` on a transparent field, no background rect. This file is both the mark-only form and the transparent form. |
| One-colour | assets/brand/mark-one-colour.svg | Ink only: a single flat `#1B1815`, the paper field removed, and no edge that depends on transparency. Geometry unchanged. |
| Knockout | assets/brand/mark-knockout.svg | Ink → `#F3F0EC`, field transparent, for the deep neutral surface `#221E1B`. Geometry unchanged. |
| Horizontal lockup | assets/brand/lockup-horizontal.svg | Mark at the left at full lockup height; name to its right at 0.5× the mark's width as the gap, set in Noto Sans 600, sentence case, converted to outlines; no rule, no box, no second element. |
| Favicon 16 | assets/brand/favicon-16.png | Uniform scale of the master to 16×16, transparent field, no wordmark; the tear notch held at no less than 2px so it survives the pixel grid. |
| Favicon 32 | assets/brand/favicon-32.png | Uniform scale of the master to 32×32, transparent field, no wordmark. |
| App icon 192 | assets/brand/app-icon-192.png | Field → `#F5F2EE`, full bleed; mark at 72% of the field height, centred; no baked corner radius, no shadow, no border. |
| App icon 512 | assets/brand/app-icon-512.png | Same as the 192 icon at 512×512. |
| App icon maskable 512 | assets/brand/app-icon-maskable-512.png | Field → `#F5F2EE`, full bleed to every edge; mark inside the central safe circle of 80% diameter, so a circular, squircle or rounded-square mask clips only the field. |
| Apple touch icon 180 | assets/brand/apple-touch-icon-180.png | Opaque `#F5F2EE` field, no alpha; mark at 72% of the field height, centred; corners left square because the platform rounds them. |

### Family: Pillar icon

**Medium:** Vector — seven custom glyphs, authored deterministically as editable SVG on the same 24-unit grid and 2-unit stroke as the interface set. Nothing here is sourced from an icon library and no image model is used, because the seven objects are fixed by `branding.md` and must sit unaltered beside an interface glyph at 20px.

**Palette:** One tone per glyph, carried by the file as ink `#1B1815` and resolved at render to the interface role: default `#6B635C` (neutral-500), active `#9A4A26` (primary-500), disabled at 40% opacity. No pillar gets its own colour.

**Invariants:** Seven objects and seven files, one object each, and the mapping never moves: a boundary post for local government autonomy, a bridge for infrastructure, a stethoscope for health, a graduation cap for education, a market stall for economy and jobs, a seed bag for agriculture and minerals, a whistle for security. 24-unit grid, 2-unit stroke, round caps and joins, outlined single weight only. No filled weight, no shading, no combining two objects into one glyph, and no decorative detail added. No pillar borrows another's glyph, none is replaced by a library object drawn to the same subject, and none is used as a generic interface icon. An active state is carried by colour, never by a filled or second glyph. The pillar name is always available as text or as an accessible name, so a glyph never carries the category alone. Rendered at 20px, 22px and 24px per the `icon-size` token, on the same grid position as an interface glyph, so a pillar sits in the set without a visible seam.

**Prompt:**
```text
Seven outlined pictograms, one object to a file, drawn on a 24-unit square grid in a single 2-unit
stroke with round caps and round joins: a boundary post, a bridge, a stethoscope, a graduation cap, a
market stall, a seed bag and a whistle.

Each is drawn in the same hand as a 24-pixel outline interface set, so a pillar sits in a row of menu,
chevron and close glyphs without a visible seam: same grid, same stroke, same rounded terminal, one
weight only, no fill and no shading.

Each object makes one reading. The boundary post stands on the ground with a domed crown and a painted
band crossing it, the way a survey post marks a line. The bridge is a flat deck carried over a single
arch on two short legs, seen side on. The stethoscope is two earpiece ticks above a wide U-tube that
turns down into a round chest piece. The graduation cap is a diamond board with a band hanging from its
two lower edges and a tassel from its right point. The market stall is a gabled canopy over two posts,
with the counter as one line across them. The seed bag is a bulging sack standing upright, with a
cinched neck and a folded collar. The whistle is a flat mouthpiece running into a round chamber.

Stroke in ink #1B1815, no fill, no gradient, no shadow, no background rectangle, no text, no second
object, no person. Every glyph keeps its counters open at 20 pixels and its silhouette distinct from
the other six in a row.
```

**Settings:**
- Every file is `viewBox="0 0 24 24"` with its drawing inside the live area, `x` from 2 to 22 and `y` from 2 to 22, so a pillar aligns optically with an interface glyph on the same baseline.
- Stroke attributes only: `fill="none"`, `stroke="#1B1815"`, `stroke-width="2"`, `stroke-linecap="round"`, `stroke-linejoin="round"`. No `stroke-dasharray`, no second stroke width, no fill, no filter, no gradient, no shadow, no embedded raster, no background rectangle, no text.
- Each file holds one stroked path, which may carry several subpaths, plus at most one stroked circle. No glyph needs a third element.
- Coordinates are whole or half units on the 24-unit grid; a curve's radius and control points follow the drawn curve where the geometry needs it, and nothing is scaled to fit.
- Keep at least 2 clear units between two opposing strokes of the same glyph, so no counter closes up at a 20px render, where 2 units is 1.7px.
- Every stroke is 2 units, arcs included. A curve that would need a thinner stroke is redrawn closer to the grid, never thinned.
- The stroke list in each variant row below is the drawing: its coordinates are the file, reproduced exactly and not reinterpreted.
- Each object is the one `branding.md` names for its pillar. A different object is a branding amendment first and a ledger change second, never a drawing decision taken here.
- The seven glyphs are original work for this product and carry no third-party licence; `assets/icons/LICENSE` covers the interface glyphs only.
- Verify each file at 20px, 22px and 24px: counters stay open, nothing fills in, and the seven are still separable as a row of 20px glyphs. Set each beside the interface glyphs at the same size and check weight, cap and join. Check the row once in greyscale.

**Variants:**
| Variant | Target | Execution Delta |
|---|---|---|
| Local government autonomy | assets/icons/pillars/local-government-autonomy.svg | A boundary post: a domed post outline `M9 21 V9 A3 3 0 0 1 15 9 V21 Z`, its crown rising 3 units above the shoulders, crossed by a painted band `M6.5 13 H17.5` that stands 2.5 units proud of each side. |
| Infrastructure | assets/icons/pillars/infrastructure.svg | A bridge: a deck `M3 5 H21` carried over one arch `M5 20 V16 A7 7 0 0 1 19 16 V20`, its crown peaking 2 units below the deck, on two short legs. |
| Health | assets/icons/pillars/health.svg | A stethoscope: two earpiece ticks `M5 3 L7 6` and `M19 3 L17 6`, a U-tube `M7 6 A5 5 0 0 0 17 6` that turns down at its centre into a stem `M12 11 V14`, and a chest piece as a circle of radius 3 at (12,18), whose top edge meets the stem. |
| Education | assets/icons/pillars/education.svg | A graduation cap: a diamond board `M12 3 L21 7.5 L12 12 L3 7.5 Z`, a band hanging from its two lower edges `M7 9.5 V14 A5 5 0 0 0 17 14 V9.5`, and a tassel `M21 7.5 V13` dropped from the right point. |
| Economy and jobs | assets/icons/pillars/economy-and-jobs.svg | A market stall: a gabled canopy `M3 9 L12 3.5 L21 9 Z`, a post at each eave corner `M3 9 V20` and `M21 9 V20`, and the counter as one line `M3 15 H21` across them. |
| Agriculture and minerals | assets/icons/pillars/agriculture-and-minerals.svg | A seed bag: a body `M9 10 C6.5 12 5.5 16 6 20 H18 C18.5 16 17.5 12 15 10 Z` that swells about 3 units beyond the neck on each side and is closed across the neck by its own closing segment, with a folded collar `M7.5 6 H16.5 M7.5 6 L9 10 M16.5 6 L15 10`. |
| Security | assets/icons/pillars/security.svg | A whistle: a mouthpiece `M12.5 10 H5 A2 2 0 0 0 5 14 H10.5` whose rounded left end closes the tube and whose two edges run into the wall of a round chamber, drawn as a circle of radius 5 at (15.5,14). |

### Family: Interface icon

**Medium:** Sourced — Tabler Icons 3.52.0, outline set, MIT. Files are the set's own glyphs, unmodified.

**Palette:** One tone per glyph, carried by the file as ink `#1B1815` and resolved at render to the interface role: default `#6B635C` (neutral-500), active `#9A4A26` (primary-500), disabled at 40% opacity. No icon is recoloured per feature.

**Invariants:** 24×24 grid, 2px stroke, round caps and joins, outlined single weight only. An active state is carried by colour, never by swapping the glyph for a filled one. No icon is redrawn or combined. Every icon carries its action as visible text or an accessible name; no icon stands alone as the only label. Rendered at 20px, 22px and 24px per the `icon-size` token.

**Prompt:** None. Sourced files, not generated.

**Settings:**
- Source: `@tabler/icons` 3.52.0, outline set, MIT. Each file is taken from `https://cdn.jsdelivr.net/npm/@tabler/icons@3.52.0/icons/outline/`, one glyph file per slot, named in the variant table below.
- Ship the upstream MIT licence text at `assets/icons/LICENSE`. No attribution appears in the interface.
- Take the SVG unmodified: 24×24 `viewBox`, `stroke-width="2"`, `stroke-linecap="round"`, `stroke-linejoin="round"`, `fill="none"`. File names keep the upstream glyph name so provenance stays traceable.
- Only glyphs for actions a screen declares are slotted. `NFR-009` requires in-product search but no screen declares a search field, so no search glyph is slotted; a search affordance is a screen change first, then a new slot.
- Verify each file renders at 20px inside a 48px touch target without the stroke collapsing.

**Variants:**
| Variant | Target | Execution Delta |
|---|---|---|
| Menu | assets/icons/ui/menu.svg | Tabler `menu`. Opens the record destinations from the Record Header on every device class. |
| Chevron down | assets/icons/ui/chevron-down.svg | Tabler `chevron-down`. Opens and closes every accordion: How the record works, Consent records, What is held about me, the published session record, and the privacy notice sections. |
| Chevron left | assets/icons/ui/chevron-left.svg | Tabler `chevron-left`. The previous control of every pagination: the commitment register, the public ledger and the decision queue. |
| Chevron right | assets/icons/ui/chevron-right.svg | Tabler `chevron-right`. The next control of the same pagination. |
| Close | assets/icons/ui/x.svg | Tabler `x`. The corner control that dismisses a bottom sheet or dialog. |
| Retry | assets/icons/ui/refresh.svg | Tabler `refresh`. The retry action inside every declared error state. |
| Offline | assets/icons/ui/wifi-off.svg | Tabler `wifi-off`. The offline banner that keeps the last successful state readable. |
| Pending work | assets/icons/ui/loader-2.svg | Tabler `loader-2`. The spinner beside a write that has been accepted and not yet confirmed. |
| Download | assets/icons/ui/download.svg | Tabler `download`. Download my data in My Record. |
| Delete | assets/icons/ui/trash.svg | Tabler `trash`. Delete my account in My Record. |
| Sign out | assets/icons/ui/logout.svg | Tabler `logout`. Sign out in My Record. |
| Leaves the record | assets/icons/ui/external-link.svg | Tabler `external-link`. The contact address and any link that leaves the platform. |

### Family: Status marker

**Medium:** Vector — ten tiny glyphs authored deterministically as editable SVG, one per status in the status label table.

**Palette:** One tone per file, carried as ink `#1B1815` and resolved at render to the label's own text colour: `#1B1815` (neutral-900) for Awaiting decision and Declined, `#3D3733` (neutral-700) for Withdrawn, `#3A2504` (warning-900) for Overdue and Slipped, `#122334` (info-900) for Committed and Referred, `#1E2C13` (success-900) for Delivered, `#3D0B0B` (error-900) for Dropped and Withheld.

**Invariants:** Shape carries the status second, after the word, so the marker never stands alone and colour is never the encoding. Geometry is built from a square, a circle, an equilateral triangle, a diamond and a bar — five primitives, no sixth. Outline forms are 2-unit strokes with mitred joins; filled forms are solid to the same extents. No shadow, no gradient, no rounding on the primitives.

**Prompt:**
```text
Ten small geometric status markers, one per file, on a 16-unit square artboard: an outlined dot, an outlined
equilateral triangle, a filled circle, a filled diamond, a filled square, a filled equilateral
triangle, a filled horizontal bar, an outlined circle, an outlined horizontal bar and an outlined
square. Each shape occupies 10 of the 16 units and is centred, leaving 3 units clear on every
side. Outlined forms carry a 2-unit stroke with mitred joins and no rounding; filled forms are
solid to the same extents. One flat tone per file, no gradient, no shadow, no second colour, no
text. Crisp edges, drawn to survive a 16px render.
```

**Settings:**
- Artboard 16×16 units per file, exported at 16px and 32px. The shape occupies a 10×10 box centred, so it optically centres against `caption` text at 12px.
- The bar forms are 10 units wide and 3 units high, horizontally set, filled in one file and outlined in the other.
- The triangle is 10 units wide and 9 units tall, flat edge down, so it reads as a marker and not an arrow.
- The diamond is a 10×10 square turned 45°, so its width matches the circle's diameter.
- Filled and outline counterparts of the same primitive share identical extents, so swapping `Delivered` for `Withheld` never shifts the label.
- Each file is a single flat tone with no baked background. The presentation applies the label's text colour; the file itself is never edited per status.
- Verify each marker against its own word at `caption` size and in a greyscale screenshot, where shape alone must still separate the ten.

**Variants:**
| Variant | Target | Execution Delta |
|---|---|---|
| Awaiting decision | assets/status/marker-awaiting-decision.svg | Outline dot, 2-unit stroke. |
| Overdue | assets/status/marker-overdue.svg | Outline triangle, 2-unit stroke. |
| Committed | assets/status/marker-committed.svg | Filled circle. |
| Referred | assets/status/marker-referred.svg | Filled diamond. |
| Delivered | assets/status/marker-delivered.svg | Filled square. |
| Slipped | assets/status/marker-slipped.svg | Filled triangle. |
| Dropped | assets/status/marker-dropped.svg | Filled bar. |
| Declined | assets/status/marker-declined.svg | Outline circle, 2-unit stroke. |
| Withdrawn | assets/status/marker-withdrawn.svg | Outline bar, 2-unit stroke. |
| Withheld | assets/status/marker-withheld.svg | Outline square, 2-unit stroke. |

### Family: Social share card

**Medium:** Raster — a flat composed plate, laid out from the vector mark and the shipped font files and then rasterised. No image model is used, because every element is type or the mark, and both must be exact.

**Palette:**
- Field `#F5F2EE` (neutral-100, light column)
- Ink `#1B1815` (neutral-900, light column)
- Secondary `#6B635C` (neutral-500, light column)
- Hairline `#DCD5CE` (neutral-300, light column)

**Invariants:** The plate carries the mark, the product name, the tagline and the campaign disclosure, and nothing else. It carries no figure, no ward, no date, no count, and no surface title, because every one of those changes and a baked plate would then contradict the record it previews. No photograph, no people, no flag, no party or government emblem, no map, no chart. Type is set from the shipped Noto files, never approximated. The plate is flat and unlit: no gradient, no shadow, no rounded corner, no border. The mark is not shadowed, rotated, outlined or enclosed, and it sits on paper rather than on an image.

**Prompt:**
```text
A flat composed share plate for a public record. No scene, no photograph, no lit surface.

Field: warm paper #F5F2EE, edge to edge, evenly flat, no vignette, no texture, no grain.

At the top left of the safe area, the register mark at 96 px tall in ink #1B1815. To its right,
on the mark's vertical centre, the name "Oyo Digital Parliament" set in Noto Sans semibold,
36 px, ink #1B1815.

Below, from the left safe edge, the line "Your ward, on the record." set in Noto Serif semibold,
64 px, ink #1B1815, kept to one line and never hyphenated.

One hairline rule in #DCD5CE across the safe width, 40 px below the tagline's baseline.

At the foot, from the left safe edge, "A campaign instrument, not a government body." set in
Noto Sans regular, 22 px, #6B635C.

Everything sits inside a 64 px margin on all four sides, and the outer 64 px carries no content.
Flat and unlit: no gradient, no shadow, no border, no rounded corner. No numerals, no wards, no
dates, no map, no chart, no photograph, no people, no flag, no emblem, no watermark, no second
mark, and no text beyond the three lines above.
```

**Settings:**
- Landscape: 1200×630 px, 1.91:1, sRGB. Square: 1200×1200 px, 1:1, sRGB.
- Safe area: 64 px on every side in both formats. The disclosure baseline sits 64 px above the bottom edge; nothing enters the outer margin, because a share scraper may crop or overlay a caption there.
- Composed at 1× from the vector layout, with the mark and type placed, not generated. Rasterised as PNG with no alpha.
- Square format reflows only: mark 112 px tall, name 40 px, tagline 72 px over no more than two lines, rule 48 px below the tagline, disclosure 24 px on the same 64 px foot.
- Type is set from `assets/fonts/noto-sans-latin-yoruba.woff2` and `assets/fonts/noto-serif-latin-yoruba.woff2`; the tagline stays in English on both formats, because the plate does not switch locale.
- Verify each plate at 300 px wide, the size a timeline preview renders, where the mark and the name must still read and the tagline may not.

**Variants:**
| Variant | Target | Execution Delta |
|---|---|---|
| Landscape | assets/social/share-card-1200x630.png | Canonical composition: mark 96 px, name 36 px, tagline 64 px, one hairline rule, disclosure 22 px. |
| Square | assets/social/share-card-1200x1200.png | Same four elements and same 64 px safe area, reflowed to 1:1: mark 112 px, name 40 px, tagline 72 px over no more than two lines, rule 48 px below the tagline, disclosure 24 px. |

### Family: Font

**Medium:** Sourced — variable OpenType web fonts, subset and self-hosted as WOFF2. SIL Open Font License 1.1.

**Palette:** The files carry no colour. Glyphs render in `#1B1815` on `#F5F2EE` and in `#F3F0EC` on `#221E1B`; the display and body roles are distinguished by family and weight, never by hue.

**Invariants:** Two families only, and no monospace role. Noto Serif carries display and headings at weight 600; Noto Sans carries body, small and caption at weights 400, 500 and 600. No synthetic bold or italic is generated. Direction is LTR only, and every label allows 35% growth over English for Yoruba. Coverage of the sub-dotted vowels and the tone marks is the reason these families were chosen, so a subset that drops them is a defect, not a size saving.

**Prompt:** None. Sourced files, not generated.

**Settings:**
- Source: Google Fonts, `fonts.google.com/noto`, with the upstream at `https://github.com/notofonts/latin-greek-cyrillic`. Licence SIL OFL 1.1, confirmed in the upstream `OFL.txt`. Ship that licence text beside the files at `assets/fonts/OFL.txt`; it is a licence copy, not a visual slot.
- Version pin: Noto Sans as served at `v42`, Noto Serif as served at `v33` (`https://fonts.gstatic.com/s/notosans/v42/…`, `https://fonts.gstatic.com/s/notoserif/v33/…`). Pin the downloaded files by version and record the checksum in the commit that adds them.
- Obtain the Latin, Latin Extended and Yoruba ranges and merge them into one variable WOFF2 per family. Google Fonts splits these across three subset files, and the split is the trap: the `latin-ext` file alone carries `U+1E00-1E9F` (the ẹ ọ ṣ letters) but not the combining tone marks, which sit in the file Google labels `vietnamese`. A subset built from `latin-ext` only loses the accents silently.
- Required ranges: `U+0000-00FF`, `U+0131`, `U+0152-0153`, `U+02BB-02BC`, `U+02C6`, `U+02DA`, `U+02DC`, `U+2000-206F`, `U+20AC`, `U+2122`, `U+2191`, `U+2193`, `U+2212`, `U+2215`, `U+FEFF`, `U+FFFD`; `U+0100-02BA`, `U+02BD-02C5`, `U+02C7-02CC`, `U+02CE-02D7`, `U+02DD-02FF`, `U+1D00-1DBF`, `U+1E00-1E9F`, `U+1EF2-1EFF`, `U+2020`, `U+20A0-20AB`, `U+20AD-20C4`, `U+2113`, `U+2C60-2C7F`, `U+A720-A7FF`; and the combining marks `U+0300-0304`, `U+0308-0309`, `U+0323`, `U+0329`.
- Named glyphs that must be present and checked individually: `Ẹ` `U+1EB8`, `ẹ` `U+1EB9`, `Ọ` `U+1ECC`, `ọ` `U+1ECD`, `Ṣ` `U+1E62`, `ṣ` `U+1E63`, plus the combining acute `U+0301`, grave `U+0300` and dot below `U+0323`.
- Noto Sans is a variable font on the weight axis; keep the `wght` axis covering 400 to 600 so `body`, `body-strong` and `caption` come from one file. Noto Serif is requested at 600 only.
- Acceptance test: render the string `Ẹ kú ọjọ́, ṣé àlàáfíà ni?` and the ten status words in both families and both locales, and confirm no glyph falls back to another face and no accent sits on the wrong vowel.
- Budget: the two files are sized so the heaviest public page still meets the page-weight target of `NFR-001`, 500 KB, with room for the mark, the icons and the page itself. Compare the uncompressed WOFF2 sizes before shipping.

**Variants:**
| Variant | Target | Execution Delta |
|---|---|---|
| Noto Sans | assets/fonts/noto-sans-latin-yoruba.woff2 | Body family: variable `wght` 400 to 600, Latin plus Latin Extended plus the Yoruba combining marks, WOFF2, `font-display: swap`. |
| Noto Serif | assets/fonts/noto-serif-latin-yoruba.woff2 | Display family: `wght` 600 only, the same three ranges, WOFF2, `font-display: swap`. |
