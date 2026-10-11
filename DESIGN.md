---
name: Campus Pulse
description: Flyer and QR-scan tracking for UMN Twin Cities, styled after campus wayfinding signage.
colors:
  sign-maroon: "#7a0019"
  sign-maroon-deep: "#5e0013"
  maroon-wash: "#f6ebed"
  leader-gold: "#ffcc33"
  chart-gold: "#c99700"
  warm-ground: "#edebe8"
  work-surface: "#ffffff"
  quiet-surface: "#f3f1ee"
  charcoal-ink: "#2e2c2a"
  sign-charcoal: "#3b3b3b"
  muted-ink: "#66615c"
  hairline: "#d6d2cd"
  input-stroke: "#c9c4be"
  retired-fill: "#e4e0db"
  empty-stroke: "#8a847e"
  empty-ink: "#5f5a55"
  map-ground: "#e9e6e1"
  alert-red: "#b42318"
  success-green: "#1a6b33"
  dark-ground: "#1b1918"
  dark-surface: "#252220"
  dark-ink: "#ece9e5"
  dark-maroon: "#c43a52"
typography:
  display:
    fontFamily: "Overpass Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.025em"
    fontFeature: "\"tnum\" 1"
  headline:
    fontFamily: "Overpass Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.33
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Overpass Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.375
  body:
    fontFamily: "Overpass Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
    fontFeature: "\"tnum\" 1"
  label-panel:
    fontFamily: "Overpass Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    letterSpacing: "0.1em"
  label-tag:
    fontFamily: "Overpass Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.06em"
rounded:
  tag: "4px"
  sm: "0.3rem"
  md: "0.4rem"
  lg: "0.5rem"
  xl: "0.7rem"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.sign-maroon}"
    textColor: "{colors.work-surface}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-outline:
    backgroundColor: "{colors.warm-ground}"
    textColor: "{colors.charcoal-ink}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  input:
    backgroundColor: "{colors.work-surface}"
    textColor: "{colors.charcoal-ink}"
    rounded: "{rounded.lg}"
    padding: "4px 10px"
    height: "32px"
  card:
    backgroundColor: "{colors.work-surface}"
    textColor: "{colors.charcoal-ink}"
    rounded: "{rounded.xl}"
    padding: "16px"
  header-panel:
    backgroundColor: "{colors.sign-maroon}"
    textColor: "{colors.work-surface}"
    height: "56px"
  sign-tag-scanned:
    backgroundColor: "{colors.sign-maroon}"
    textColor: "{colors.work-surface}"
    typography: "{typography.label-tag}"
    rounded: "{rounded.tag}"
    height: "22px"
  sign-tag-top:
    backgroundColor: "{colors.leader-gold}"
    textColor: "{colors.sign-maroon}"
    typography: "{typography.label-tag}"
    rounded: "{rounded.tag}"
    height: "22px"
  sign-tag-idle:
    backgroundColor: "{colors.work-surface}"
    textColor: "{colors.sign-maroon}"
    typography: "{typography.label-tag}"
    rounded: "{rounded.tag}"
    height: "22px"
  sign-tag-empty:
    backgroundColor: "{colors.work-surface}"
    textColor: "{colors.empty-ink}"
    typography: "{typography.label-tag}"
    rounded: "{rounded.tag}"
    height: "22px"
  sign-tag-retired:
    backgroundColor: "{colors.retired-fill}"
    textColor: "{colors.empty-ink}"
    typography: "{typography.label-tag}"
    rounded: "{rounded.tag}"
    height: "22px"
  range-chip:
    backgroundColor: "{colors.quiet-surface}"
    textColor: "{colors.sign-charcoal}"
    rounded: "{rounded.full}"
    padding: "0 10px"
    height: "24px"
  top-boards-panel:
    backgroundColor: "{colors.sign-maroon}"
    textColor: "{colors.work-surface}"
    rounded: "{rounded.lg}"
    width: "384px"
---

# Design System: Campus Pulse

## Overview

**Creative North Star: "Campus Wayfinding Signage"**

Campus Pulse borrows the University of Minnesota's building signs: maroon enamel panels with white type, gold reserved for the thing you should look at first, charcoal ink on a warm light ground, and one sans (Overpass) for everything. The organizing idea is that every board reads like a sign. A board appears everywhere (map pins, lists, pickers, flyer pages, printed labels) as a short building tag such as "CMU" or "JON2", optionally with its scan count, on a small enamel-sign chip.

The system is dense and working, not decorative. White work surfaces sit on the warm ground; numbers are tabular everywhere; every block of numbers names the period it covers. Maroon carries structure (the header panel, primary actions, the Top boards panel, scanned tags); gold is scarce and always means "this one". The street map underneath is muted so the tags own the view.

The world refuses the generic grey analytics dashboard with a blue accent. Depth is mostly flat; the only real lift belongs to things that float over the map.

**Key Characteristics:**
- Maroon sign panels with white type for chrome and the ranked board list.
- Every board is a sign tag; tag state reads by fill and border, never colour alone.
- Gold has one data meaning (the busiest board) and otherwise marks the active state.
- Overpass throughout, tabular figures globally, tracked caps only on panel headers.
- Every number block names its period with a range chip.

## Colors

A two-colour institutional palette (maroon and gold) on warm neutrals, with charcoal ink.

### Primary
- **Sign Maroon** (sign-maroon): the header panel, primary buttons, focus ring, text selection, scanned tags, the Top boards panel, and the first chart series. The structural colour of the world.
- **Deep Maroon** (sign-maroon-deep): the leader row inside the Top boards panel and the header panel in dark mode; a recessed tone within a maroon sign.
- **Maroon Wash** (maroon-wash): hover and accent backgrounds (mobile nav hover, menu highlight) where a full maroon fill would shout.

### Secondary
- **Leader Gold** (leader-gold): the busiest board's tag, the active nav underline, selected boards in the picker, the NEW draft pin, the selected-tag outline and the focus outline on map pins, the leader's arrow. Text on gold is maroon.
- **Chart Gold** (chart-gold): the second chart series only; a gold dark enough to hold as a line on white.

### Neutral
- **Warm Ground** (warm-ground): the page background behind every work surface.
- **Work Surface** (work-surface): cards, popovers, inputs, the stat strip, map overlays.
- **Quiet Surface** (quiet-surface): secondary buttons, range chips, muted fills, selected-board chips in the picker.
- **Charcoal Ink** (charcoal-ink): body text and headings. **Sign Charcoal** (sign-charcoal) is the secondary-foreground and the third chart series.
- **Muted Ink** (muted-ink): labels, hints, captions, sort icons at rest.
- **Hairline** (hairline) and **Input Stroke** (input-stroke): dividers and field borders.
- **Retired Fill**, **Empty Stroke**, **Empty Ink** (retired-fill, empty-stroke, empty-ink): reserved for the no-flyers and retired tag states.
- **Map Ground** (map-ground): the Leaflet container behind tiles.
- **Alert Red** and **Success Green**: destructive and confirmed states only.
- Dark mode swaps to **Dark Ground**, **Dark Surface**, **Dark Ink**, and a lifted **Dark Maroon** for primary; the focus ring turns gold there.

### Named Rules
**The One Gold Meaning Rule.** In data, gold means exactly one thing: the busiest board (the board whose scans equal the maximum). Its other uses are the active state (current nav item, selected boards, the draft pin, selection and focus outlines). Never use gold for a second data category, a warning, or decoration.

**The Maroon Is Structure Rule.** Maroon fills belong to signs: the header, the Top boards panel, primary actions, scanned tags. Content surfaces stay white on the warm ground.

## Typography

**Display Font:** Overpass Variable (self-hosted, with ui-sans-serif, system-ui fallback)
**Body Font:** Overpass Variable
**Label/Mono Font:** ui-monospace, SF Mono, Menlo (code-like strings only)

**Character:** Overpass is the highway-signage face, so a single family carries the whole world from header to sign tag. Weight does the hierarchy work; extrabold numerals read like sign numerals.

### Hierarchy
- **Display** (800, 1.75rem, line-height 1, tight tracking): headline numbers in the stat strip.
- **Headline** (600, 1.5rem): page titles in the page header.
- **Title** (700, 1rem): card titles (CardTitle is bold). Large counts in phone stacked rows use 800 at 1.25rem.
- **Body** (400, 0.875rem): the default UI text; tables, descriptions, popups (13px, 1.45 in map popups).
- **Label, panel** (700 to 800, 0.75 to 0.875rem, 0.08 to 0.12em tracking, uppercase): panel headers only ("Totals", "Top boards", "Legend") and the campus line under the wordmark.
- **Label, tag** (800 code / 600 count, 11.5px, 0.06em tracking): inside sign tags.

### Named Rules
**The Tabular Everywhere Rule.** Tabular figures are on at the root (`font-feature-settings: "tnum" 1`), so every column of numbers aligns without per-component work.

**The One Decimal Rule.** Rates always show exactly one decimal (formatRate): "2.0 per flyer per day", never "2" beside "1.7".

**The Middle Dot Patch Rule.** Overpass's middle dot (U+00B7) has zero advance width. A second `@font-face` for "Overpass Variable" covering only U+00B7, weight 100 to 900, sourced from local system sans faces, must stay declared after the Overpass import so "Floor 1 · West Bank" never collapses.

## Layout

Logged-in pages sit under a sticky 56px maroon header and inside a centred container (max-w-7xl, 16px gutters, 24px from md). Map pages are full-bleed: the header spans edge to edge and the map fills the remaining viewport height. Spacing follows a 4px rhythm, with 12px and 16px as the working steps (card padding 16px, compact cards 12px, page header bottom margin 24px).

Headline numbers live in one stat strip per page: a single panel whose cells are divided by 1px rules rather than separate cards, two columns on phones and two to four on large screens; an odd last cell spans the row on phones.

Tables collapse below md into stacked rows: each row is one list item with the board tag and name on the left and the count in large extrabold type on the right, with a sort select above the list.

Map overlays (the Top boards panel at top right, the legend at bottom left, banners) sit at z-index 1000 inside an isolated map container, so they clear Leaflet's panes without escaping above the app header or dialogs.

### Named Rules
**The Named Period Rule.** Every block of numbers names its period with a range chip ("Last 30 days", "Lifetime", "Since posted"), so figures from different ranges on one screen never look like they disagree.

## Elevation & Depth

Flat by default. Cards and the stat strip are white planes separated from the ground by a 1px ring at 10% ink, not by shadow. The header carries only a 1px bottom keyline. Shadows belong to things that float over the map: pins, overlays, popups.

### Shadow Vocabulary
- **Header keyline** (`box-shadow: 0 1px 0 rgb(0 0 0 / 0.15)`): under the maroon header.
- **Pin lift** (`box-shadow: 0 1px 0 rgb(0 0 0 / 0.18), 0 4px 10px rgb(60 0 10 / 0.18)`): a sign tag standing on the map as a pin.
- **Legend float** (`box-shadow: 0 4px 14px rgb(46 44 42 / 0.16)`): small map overlays.
- **Popup float** (`box-shadow: 0 10px 28px rgb(46 44 42 / 0.2)`): map popups and centred map dialogs.
- **Sign panel float** (`box-shadow: 0 12px 32px rgb(60 0 10 / 0.28)`): the maroon Top boards panel; the shadow is maroon-tinted.

### Named Rules
**The Only Over The Map Rule.** Diffuse shadows are for elements floating above the map. Page content separates with rings and rules.

## Shapes

Gently rounded. The base radius is 8px (0.5rem); buttons and inputs use it, cards and the stat strip use about 11px, sign tags use a tight 4px to stay sign-like, and range chips are fully round. A sign tag on the map becomes a pin by gaining a small downward triangular pointer and lifting so the pointer tip marks the location. Logo tiles carry a 2px white keyline so they read on the maroon panel.

## Components

### Buttons
Plain and compact; maroon is the commitment.
- **Shape:** gently rounded (8px), 32px default height, 36px large, 13 to 14px medium weight.
- **Primary:** maroon fill, white text; hover softens to 80% maroon.
- **Hover / Focus:** a 3px focus ring at 50% of the ring colour (maroon in light, gold in dark); presses nudge down 1px.
- **Outline / Secondary / Ghost:** outline on the ground colour with a hairline border; secondary on the quiet surface; ghost shows a muted fill on hover. Destructive is a 10% red wash, not a solid red slab.

### Chips
- **Range chip:** fully round, 24px tall, quiet surface fill with a hairline border, semibold 12px text and a calendar icon (an infinity icon for "Lifetime"). It names a period and nothing else.
- **Selected-board chip (picker):** quiet surface, 6px radius, the board's tag, its name, and a remove button.

### Cards / Containers
- **Corner Style:** about 11px.
- **Background:** white work surface on the warm ground.
- **Shadow Strategy:** none; a 1px ring at 10% ink (see Elevation).
- **Internal Padding:** 16px, 12px for compact cards. Card titles are bold.

### Inputs / Fields
- **Style:** 1px input-stroke border, transparent fill, 8px radius, 32px tall (pickers and form triggers use 40px).
- **Focus:** border turns to the ring colour plus a 3px ring at 50%.
- **Error / Disabled:** destructive border and 20% destructive ring; disabled fades to 50%.

### Navigation
The header is a maroon sign panel, 56px tall: logo tile with a white keyline, "Campus Pulse" in extrabold, the campus short name in tracked caps beneath, then nav links in semibold 14px white at 80%. The active link turns full white with a 3px gold underline; hover brightens to white. On phones the links move into a left sheet, where the active item is a solid maroon pill and hover uses the maroon wash. The profile button is a white circle with maroon initials and a gold ring on hover and focus.

### Sign Tag (signature component)
How a board appears everywhere. A 22px chip with a 1.5px border and 4px radius, holding the board's tag in extrabold tracked type and, optionally, a count after a 30%-opacity divider. Tags are generated server-side from building names (initials or a leading abbreviation, lengthened on collision, numbered within a building) and are unique per board.
- **Scanned:** filled maroon, white text.
- **Busiest:** filled gold, maroon text.
- **Flyers up, no scans:** white with a maroon border and maroon text.
- **No flyers:** white with a dashed grey border and grey text.
- **Retired / taken down:** grey fill, grey border, the code struck through.
- **Selected:** a 2px gold outline offset 2px.
- **Code-only tags** share one minimum width (3.25rem) and centre the code so the names beside them line up in lists.
- **On the map** the tag becomes a pin (pointer plus pin lift). Clusters show their busiest board's tag plus "+N"; in the picker a cluster leads with a selected board, in gold, so a selection is never hidden.

### Stat Strip (signature component)
One white panel per page for headline numbers. Its header row holds a tracked-caps title and a range chip; cells below are separated by 1px rules, each with a muted label, an extrabold 1.75rem value, and an optional one-line hint.

### Top Boards Panel (signature component)
A maroon sign panel floating at the top right of the map. A white header strip holds "Top boards" in maroon tracked caps and the range. Rows are a grid of tag, name, count in extrabold, and an up-right arrow: the leader row sits on deep maroon with a gold tag and gold arrow; the other rows show white tags with maroon text. Rows divide with 15% white rules and brighten to 10% white on hover.

### Map
OpenStreetMap tiles are muted by a filter on the tile pane (`grayscale(0.9) sepia(0.12) brightness(1.04) contrast(0.88)`) over a warm map ground, so maroon and gold tags own the view. A compact, collapsible legend at bottom left shows each tag state with a sample tag. Popups use the app font at 13px with 8px radius and the popup float shadow.

## Do's and Don'ts

### Do:
- **Do** show every board as its sign tag wherever it appears, with state carried by fill and border (filled, gold, outlined, dashed, struck through).
- **Do** keep gold to the busiest board in data and to the active or selected state in UI.
- **Do** put a range chip on every number block ("Last 30 days", "Lifetime", "Since posted").
- **Do** format rates with exactly one decimal and keep tabular figures on.
- **Do** give tables a stacked phone row with the count in large extrabold type.
- **Do** keep map overlays at z-index 1000 inside an isolated map container.
- **Do** keep the U+00B7 patch face declared after the Overpass import.

### Don't:
- **Don't** signal tag state by colour alone; every state has a distinct fill or border treatment.
- **Don't** use gold for a second data category, a warning, or decoration.
- **Don't** drift toward the grey analytics dashboard with a blue accent.
- **Don't** split headline numbers into separate floating cards; use the one stat strip with rules between cells.
- **Don't** add drop shadows to page content; diffuse shadows are for things floating over the map.
- **Don't** use tracked caps outside panel headers and the wordmark's campus line.
- **Don't** show unfiltered street tiles; the tile pane is always muted.
