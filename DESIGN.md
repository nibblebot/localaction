---
name: LocalAction
description: A local-first home for everything that matters — areas, projects, tasks, and notes you truly own.
colors:
  accent-iris: "#7c3aed"
  accent-iris-hover: "#6d28d9"
  accent-wash: "#ece6fb"
  accent-border: "#c4b5fd"
  accent-tint: "#e9e3fa"
  canvas-lavender-mist: "#f5f3fa"
  surface: "#ffffff"
  surface-hover: "#f1ecfa"
  surface-active: "#ece6fb"
  rail: "#f8f6fc"
  border: "#eae6f2"
  border-strong: "#d8d2e8"
  ink-heading: "#1f1b2e"
  ink-body: "#5b5670"
  ink-secondary: "#4a4458"
  ink-muted: "#6c6783"
  danger: "#be123c"
  danger-bg: "#ffe4e6"
  success: "#047857"
  success-bg: "#d1fae5"
  warning: "#ab4c08"
  warning-bg: "#fef3c7"
  area-purple: "#7c5cff"
  area-blue: "#3b82f6"
  area-green: "#22a06b"
  area-pink: "#ec4899"
  area-amber: "#f59e0b"
  area-gray: "#9aa3ad"
typography:
  display:
    fontFamily: "'DM Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.36rem"
    fontWeight: 600
    letterSpacing: "-0.005em"
  title:
    fontFamily: "'DM Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.07rem"
    fontWeight: 600
    letterSpacing: "-0.005em"
  body:
    fontFamily: "'DM Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'DM Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.79rem"
    fontWeight: 500
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
  pill: "999px"
spacing:
  space-1: "0.29rem"
  space-2: "0.57rem"
  space-3: "0.86rem"
  space-4: "1.14rem"
  space-5: "1.43rem"
  space-6: "1.71rem"
components:
  button-primary:
    backgroundColor: "{colors.accent-iris}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  button-primary-hover:
    backgroundColor: "{colors.accent-iris-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-heading}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.md}"
    padding: "4px 8px"
  chip-tag:
    backgroundColor: "{colors.accent-wash}"
    textColor: "{colors.accent-iris-hover}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  sidebar-row-active:
    backgroundColor: "{colors.accent-wash}"
    textColor: "{colors.accent-iris}"
    rounded: "{rounded.sm}"
    padding: "4px 6px"
  input-inline-add:
    backgroundColor: "transparent"
    textColor: "{colors.ink-heading}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
  modal:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-heading}"
    rounded: "{rounded.lg}"
    padding: "1.43rem"
---

# Design System: LocalAction

## 1. Overview

**Creative North Star: "The Quiet Instrument"**

LocalAction is a precision tool for a solo power user running their whole life through it. Like a well-made instrument, it is quiet at rest and exact in the hand: calm surfaces, one voice of color, type that stays out of the way — and the moment you touch it, it responds with energized momentum. Rows reorder under the cursor, counts roll up live, inline inputs appear exactly where the work is. The interface never performs; it works.

The system is built on restraint. One accent (Iris) carries every moment of emphasis across both themes; everything else is a violet-tinted neutral ladder. Depth comes from tonal layering, not drop shadows. Chrome is minimal by doctrine — the product's depth (areas, sub-areas, sections, nested sub-tasks, rollups) is demonstrated through polish and discoverability, never through stacked UI. Local-first ownership is visible, not hidden: the sync badge states its status in plain language at all times.

This system explicitly rejects the PRODUCT.md anti-references: no legacy enterprise PM feature walls or side-stripe banners (Asana/Jira), no consumer-cutesy gradients or over-rounded cards, no Evernote-era information clutter, and no soulless gray-spreadsheet utilitarianism. If a screen feels like any of those, it is off-system.

**Key Characteristics:**
- One accent, used sparingly — Iris appears on ≤10% of any screen
- Tonal layering over shadows; surfaces are flat at rest
- Quiet controls that wake on hover and focus
- Inline-first editing — titles, inputs, and dates edit in place, not in dialogs
- Density as a user knob (compact / normal / cozy), not a breakpoint strategy

## 2. Colors

A violet-tinted neutral ladder with a single vivid accent; the whole system sits on one hue family (~293° OKLCH) so every surface, border, and ink reads as one material.

### Primary
- **Iris** (#7c3aed · oklch(54% 0.247 293)): The single voice of emphasis. Active sidebar rows and tabs, primary buttons, focused input borders, drag-target outlines, progress fills, selected states. Dark theme lifts it to #a78bfa (oklch(71% 0.159 294)) to hold contrast on the near-black canvas.
- **Iris Deep** (#6d28d9 · oklch(49% 0.241 293)): Hover state of Iris and tag-chip text on the accent wash.

### Neutral
- **Lavender Mist** (#f5f3fa · oklch(97% 0.009 299)): The app canvas in light theme. Cool, faintly violet — a tinted neutral toward the brand's own hue, not a warm paper.
- **Rail** (#f8f6fc): The sidebar surface — one step lighter than the canvas so the navigation column reads as a distinct instrument panel.
- **Surface** (#ffffff): Rows, cards, inputs, modals — the working layer above the canvas.
- **Surface Hover / Active** (#f1ecfa / #ece6fb): Lavender tints for row hover and pressed/selected neutral states. These do the work shadows would do elsewhere.
- **Border / Border Strong** (#eae6f2 / #d8d2e8): Hairlines and emphasized dividers, same violet family.
- **Ink Heading** (#1f1b2e): Titles and primary text — near-black with a violet undertone.
- **Ink Body** (#5b5670): Default reading text.
- **Ink Secondary** (#4a4458): Supporting text that must carry more weight than body (messages, ghost-button labels).
- **Ink Muted** (#6c6783): Placeholders, counts, metadata. Reserved for short, non-critical text — never long-form body. Meets WCAG AA (≥4.5:1) on every light surface.

### Semantic
- **Success** (#047857 · dark #4caf50): Completed progress fills, *Synced* badge. Deepened from #10b981 so badge text meets AA on the success tint.
- **Warning** (#ab4c08 · dark #d4a72c): *Syncing… / Retry* badge states. Deepened from #d97706 for AA on the warning tint.
- **Danger** (#be123c · dark #f2635f): Destructive actions, *Sync error* badge. Deepened from #e11d48 for AA on the danger tint. The armed two-step confirm fills with `--danger-armed` (#be123c · dark #d32f2f), which holds white text at AA where the text-grade danger cannot.

### Area palette (user-facing hue carriers)
Areas are the user's own color dimension — the only place hues other than violet appear by design: **Purple** (#7c5cff), **Blue** (#3b82f6), **Green** (#22a06b), **Pink** (#ec4899), **Amber** (#f59e0b), **Gray** (#9aa3ad). Rendered as sidebar dots and header markers only; an unknown id falls back to Gray.

### Dark theme
The dark theme is a true inversion, not a tint: near-black canvas (#0f1115), surfaces stepped up from it (#14171c rail, #181b21 surface), borders as translucent white (10% / 18%), and the accent lifted to #a78bfa. Semantic colors move to translucent tints so badges glow rather than shout.

### Named Rules
**The One Voice Rule.** Iris is the only accent in the system, and it speaks on ≤10% of any given screen — one active row, one focused input, one primary action. Its rarity is the point. If two elements on a screen are competing in Iris, one of them is wrong.

**The Single Hue Family Rule.** Every neutral — canvas, surface, border, ink — is tinted toward ~293° violet. Never introduce warm grays or blue-grays; they read as dirt on this canvas.

**The User's Hues Rule.** Saturated non-violet hues exist only in the area palette, applied by the user, at dot scale. Never borrow them for system chrome.

## 3. Typography

**Display Font:** DM Sans (self-hosted variable woff2, weights 100–1000, `font-display: swap`), falling back to system-ui. The appearance menu lets the user pick any of five self-hosted grotesques (Plus Jakarta Sans, IBM Plex Sans, General Sans, Manrope, DM Sans) — DM Sans is the default.
**Body Font:** Same as Display — the active family plays for everything.
**Label/Mono Font:** ui-monospace stack (`ui-monospace, 'SF Mono', Consolas, 'Liberation Mono', monospace`) for code, including markdown code spans and fenced blocks. Numeric readouts are the active sans with `font-variant-numeric: tabular-nums` — mono is reserved for code, never for live counts.
**Character:** One family, many weights. Hierarchy comes from weight and the four sans sizes below, never from a second face. The user picks which family plays, but only one plays at a time.
- **Display** (600, 1.36rem, -0.005em, line-height 1.2, text-wrap balance): Page-level headings — area and project headers. The largest text in the app, kept small by design.
- **Title** (600, 1.07rem, -0.005em, line-height 1.2, text-wrap balance): Section and modal headings, project name inside the Projects tab (the project card) and Tasks tab, sub-area headings, sidebar app name.
- **Body** (400, 1rem, line-height 1.5): Default reading text. Buttons, inputs, row content, placeholders, undo toast.
- **Label** (500, 0.79rem, often 600 for headings, uppercase + 0.06em tracking on eyebrows): Section titles (uppercase, tracked), count pills, tag chips, badges, segmented controls, *-sm button variants, inline-add inputs in compact rows. The sync badge in the sidebar footer sits at 500 weight.
- **Mono** (400, 0.89rem, separate family): Code spans and fenced code blocks.

Every heading-tier element (Display + Title) uses `line-height: 1.2` and `text-wrap: balance` — heading rows breathe tighter than body and wrap evenly when long. Body keeps the 1.5 default. Nested row titles (section rows inside a project card) stay at body size with 500 weight so the project header retains the heaviest title until the card expands.

### Density
The root font-size is the density knob: **13px compact / 15px normal / 17px cozy**. Every component sizes in rem, so one attribute rescales the whole app. Never hardcode px text sizes in components; never add breakpoint-based type changes — density is the user's choice, not the viewport's.

### Named Rules
**The One Family Rule.** One of five self-hosted grotesques — Plus Jakarta Sans, IBM Plex Sans, General Sans, Manrope, DM Sans — plays at any moment; the choice is the user's via the appearance menu. A second typeface in chrome is always a bug.
**The Small Display Rule.** Display type caps at 1.36rem. Big hero type is for landing pages; this is a workspace. Emphasis comes from weight and the One Voice accent, never from shouting size.

## 4. Elevation

Elevation-by-tone, not by shadow. Surfaces are flat at rest; layering is expressed by stepping through the neutral ladder — canvas → rail → surface → surface-hover → surface-active. Borders are 1px hairlines from the same violet family. The system ships exactly two shadows: a whisper at rest (0 1px 2px, 6% black) reserved for modals, and a lift shadow (0 8px 24px, 18% black) under the drag overlay — the one moment an object physically leaves the surface. Dark theme keeps the same doctrine with darker ambient values.

### Shadow Vocabulary
- **Rest** (`0 1px 2px rgba(31,27,46,0.06)` · dark `rgba(0,0,0,0.4)`): Modals and popovers only. Barely there — a separation cue, not an elevation statement. Tinted toward the violet ink family, never warm.
- **Lift** (`0 8px 24px rgba(15,17,21,0.18)`): The drag-overlay preview exclusively. An object in the hand casts a shadow; an object at rest does not.

### Named Rules
**The Flat-by-Default Rule.** No shadow appears on a static surface — not on cards, rows, buttons, or inputs. Depth is tonal. If a surface needs to stand out, step it up the ladder or give it a hairline, never a drop shadow.

**The Lift-Only-in-Motion Rule.** The 8px lift shadow exists only while dragging. When the drag ends, the shadow ends. Persistent lift is off-system.

## 5. Components

Quiet controls that wake on hover. Chrome hides until needed — row actions appear on hover, inputs look like text until focused, and the dashed inline-add input is the recurring invitation to create.

### Buttons
- **Shape:** Gently rounded (10px radius; 6px padding rhythm `6px 12px`).
- **Primary:** Iris fill, white text (1rem). Hover deepens to Iris Deep. The single most emphatic element on any screen — use one per view.
- **Secondary:** Surface fill, hairline border, heading-ink text. Hover steps the surface up and the border to strong.
- **Ghost:** Transparent at rest, secondary-ink text, tight padding (4px 8px). Hover washes the surface-hover tint. The workhorse for row-level and header actions.
- **Danger:** Surface fill with danger border and text at rest; hover fills the danger tint. An "armed" confirmation state flips to a solid danger fill — destructive intent is always explicit before it executes.
- **Focus:** Every interactive element shows a 2px outline in accent-border with 1px offset on `:focus-visible`. Mouse focus stays clean; keyboard focus is always visible.

### Chips
- **Tag chip:** Accent wash background, Iris Deep text, accent hairline border, full pill radius (2px 8px padding, 0.79rem/500). Reserved for tags and metadata.
- **Count pill:** Bare surface (or accent tint inside an active row), muted text, pill radius, tabular figures. Carries the live rollups — sidebar totals, section counts.
- **Sync badge:** A pill that tells the local-first story in plain words: *Local only* (neutral), *Syncing… / Retry #n…* (warning tint), *Synced* (success tint), *Sync error* (danger tint). Always visible at the foot of the sidebar; never a transient toast.

### Rows and lists
- **Sidebar row:** Transparent at rest; hover washes surface-hover; active fills the accent wash with Iris text and a tinted count pill. Top-level areas run 600 weight. Dimmed rows (empty areas) drop to 40% opacity, recovering on hover.
- **Task row:** A 14px native checkbox (accent-colored), an inline-editable title that looks like plain text, and hover-revealed 22px icon actions. Done state: strikethrough, muted ink, 60% opacity on the row.
- **Project row:** Name, a 90px × 6px pill progress bar (Iris fill, flips to success green at 100%), and a tabular done/total count. On phone-width viewports the row is a navigation path, not an action bar: caret, name, count, and the stateful due-date chip stay; every other action (notes, rename, delete, empty-sections) lives on the project detail pane the row opens, and long names wrap instead of truncating.
- **Drag interaction:** Source row dims to 35% and holds its place in the list; the drop target gets a 2px dashed Iris outline; insertion shows a 2px solid Iris line above or below; the floating preview is a surface card under the Lift shadow. Dragging right nests, left unnests — horizontal intent, vertical position.

### Sections
The working pane divides into collapsible sections — Projects, Area tasks, Notes — each headed by a small eyebrow (uppercase, 0.06em tracking) with a muted tabular count, and a caret toggle. Trailing header actions (search, sort, collapse-all) sit at the right edge. Inside Projects, the same pattern repeats one register down: status groups (Active / Backlog / Done) at label-tier size, collapsible, each carrying its live count. Hierarchy comes from the two eyebrow registers, never from chrome.

### Inputs / Fields
- **Inline-add input (signature):** A dashed hairline border on transparent background with italic muted placeholder — visually an invitation, not a form control. Hover strengthens the border; focus turns it solid Iris on a surface fill. This is how every list says "add one here."
- **Quick-add / modal input:** Solid hairline on canvas background, 6px radius; focus border turns Iris. Placeholders are italic muted.
- **Editable title:** No chrome at all until focus, when it gains a canvas background and an inset accent hairline. Editing in place is the default posture of the whole app.

### Modals
A surface card at 14px radius with the Rest shadow, centered over a 50% black backdrop, max-width 420px. Title (headline), message (secondary ink), actions right-aligned in a row. Confirmation for destructive actions always goes through a modal or an armed two-step button — never an instant delete.

### Undo toast
Every completion and every cascade delete offers a 6-second undo window: a quiet surface pill pinned bottom-center (strong hairline, Rest shadow, above the modal layer in the z-scale), a plain past-tense label — *Completed “Draft themes”*, *Deleted area “Work”* — and a single accent-text Undo action. The toast is a `role="status"` live region, so the action is announced without stealing focus; its timer pauses while the pointer or keyboard focus is inside. One toast at a time — the latest action replaces the last. Restoring an area or project navigates back to it; once the window expires the deletion stands (the tombstone is permanent).

### Navigation
The sidebar is the instrument panel: Rail surface, section titles in small caps-weight labels, area rows with user-colored dots and live count pills, the sync badge pinned at the foot. The main pane holds the working view — area or project — with a breadcrumb chain for parent context. There is no top-level chrome beyond this: no app bar, no toolbar strip.

### Icons
One sprite (`public/icons.svg`), one 20×20 grid, one 1.5px stroke with round caps and joins. Artwork covers ~60–70% of the canvas so every glyph reads at the same optical size; `close-icon` is the one exception, keeping wider margins so it reads as dismiss, not slash. Four render sizes, token-based: `--icon-xs` (12/14rem — carets, row-level actions), `--icon-sm` (1rem — default chrome and drag grips), `--icon-md` (18/14rem — header and FAB actions), `--icon-lg` (fixed 24px — the decorative project-header glyph only). All but `--icon-lg` are rem-based, so the density knob rescales icons with everything else. The drag affordance is a 2×3 dot grip, symmetric on both axes. New icons join the sprite on the same grid and stroke — never inline SVG, never a second grid.

## 6. Do's and Don'ts

### Do:
- **Do** keep Iris on ≤10% of any screen (The One Voice Rule) — one active state, one primary action, one focused field.
- **Do** express depth by stepping the neutral ladder (canvas → rail → surface → hover → active), never with shadows on static surfaces.
- **Do** use tabular figures for any number that updates live — rollups, counts, progress.
- **Do** make creation feel lightweight: dashed inline-add inputs at the point of work, not "New…" buttons that open dialogs.
- **Do** keep the sync badge visible and plain-spoken — local-first ownership is a feature users can see.
- **Do** preserve the 2px accent `:focus-visible` outline everywhere; the keyboard is a first-class surface.
- **Do** size in rem so the density knob rescales everything.
- **Do** size icons with the four `--icon-*` tokens; a new size outside the scale needs a new token, not a one-off px.

### Don't:
- **Don't** build legacy enterprise PM feature walls or side-stripe banners (Asana/Jira) — no colored left borders on rows or callouts, no stacked chrome to advertise capability.
- **Don't** go consumer cutesy: no gradients (and no gradient text), no radii beyond 14px on containers, no mascots or playful illustration.
- **Don't** recreate Evernote-era clutter — density comes from the user's content, never from competing chrome; every view keeps one clear hierarchy.
- **Don't** ship gray-spreadsheet utilitarianism — flat #808080-family grays, default browser controls, and unstyled tables are all off-system; the violet tint is the personality.
- **Don't** introduce a second accent hue into chrome; non-violet hues belong only to the user's area dots.
- **Don't** put drop shadows on cards, rows, or buttons at rest (The Flat-by-Default Rule); lift exists only while dragging.
- **Don't** hide controls behind ellipsis menus when a hover-revealed icon or inline edit would do — but never reveal on hover what a keyboard user cannot reach.
- **Don't** use display type above 1.43rem in the app shell (The Small Display Rule); the workspace never shouts.
