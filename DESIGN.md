# Design System: LocalAction

## 1. Overview

**Creative North Star: "The Quiet Instrument"**

LocalAction is a precision tool for a solo power user running their whole life through it. Like a
well-made instrument, it is quiet at rest and exact in the hand: calm surfaces, one voice of color,
type that stays out of the way — and the moment you touch it, it responds with energized momentum.
Rows reorder under the cursor, counts roll up live, inline inputs appear exactly where the work is.
The interface never performs; it works.

The system is built on restraint. One accent (Iris) carries every moment of emphasis across both
themes; everything else is a violet-tinted neutral ladder. Depth comes from tonal layering, not drop
shadows. Chrome is minimal by doctrine — the product's depth (areas, sub-areas, sections, nested
sub-tasks, rollups) is demonstrated through polish and discoverability, never through stacked UI.
Local-first ownership is visible, not hidden: the sync badge states its status in plain language at
all times.

This system explicitly rejects the PRODUCT.md anti-references: no legacy enterprise PM feature walls
or side-stripe banners (Asana/Jira), no consumer-cutesy gradients or over-rounded cards, no
Evernote-era information clutter, and no soulless gray-spreadsheet utilitarianism. If a screen feels
like any of those, it is off-system.

**Key Characteristics:**

- One accent, used sparingly — Iris appears on ≤10% of any screen
- Tonal layering over shadows; surfaces are flat at rest
- Quiet controls that wake on hover and focus
- Inline-first editing — titles, inputs, and dates edit in place, not in dialogs
- Density as a user knob (compact / normal / cozy), not a breakpoint strategy

## 2. Colors

Values live in `src/index.css` and `src/data/colors.ts`; intent only: one violet ladder, one accent,
semantic tints, user hues for areas.

### Named Rules

**The One Voice Rule.** Iris is the only accent in the system, and it speaks on ≤10% of any given
screen — one active row, one focused input, one primary action. Its rarity is the point. If two
elements on a screen are competing in Iris, one of them is wrong.

**The Single Hue Family Rule.** Every neutral — canvas, surface, border, ink — is tinted toward
~293° violet. Never introduce warm grays or blue-grays; they read as dirt on this canvas.

**The User's Hues Rule.** Saturated non-violet hues exist only in the area palette, applied by the
user, at dot scale. Never borrow them for system chrome.

## 3. Typography

Values live in `src/index.css` and `src/App.css`; intent only: one grotesque, weight-based
hierarchy, mono for code, tabular counts, user-chosen density.

### Named Rules

**The One Family Rule.** One of five self-hosted grotesques — Plus Jakarta Sans, IBM Plex Sans,
General Sans, Manrope, DM Sans — plays at any moment; the choice is the user's via the appearance
menu. A second typeface in chrome is always a bug. **The Small Display Rule.** Display type caps at
1.36rem. Big hero type is for landing pages; this is a workspace. Emphasis comes from weight and the
One Voice accent, never from shouting size.

## 4. Elevation

Values live in `src/index.css`; intent only: elevation-by-tone; two shadows — whisper at rest, lift
while dragging.

### Named Rules

**The Flat-by-Default Rule.** No shadow appears on a static surface — not on cards, rows, buttons,
or inputs. Depth is tonal. If a surface needs to stand out, step it up the ladder or give it a
hairline, never a drop shadow.

**The Lift-Only-in-Motion Rule.** The 8px lift shadow exists only while dragging. When the drag
ends, the shadow ends. Persistent lift is off-system.

## 5. Components

Values live in `src/App.css` and `src/index.css`; contracts only here.

Quiet controls that wake under the hand: icon chrome stays always visible and ramps to full ink on
hover/focus; inputs look like text until focused; the dashed inline-add input invites creation.
Collapsible sections carry eyebrow headers with live counts; root task rows carry progress and
done/total counts with nested sub-tasks beneath (drag right to nest, left to unnest). Status groups
(Active / Backlog / Done) are collapsible label rows with live counts. The sync badge states
local-first status in plain words; completions and cascade deletes offer an undo window through a
single live-region toast. Destructive actions always confirm — modal or armed two-step, never
instant delete. Schema note: tables are areas, tasks, notes, tombstones — no projects table. A
former "project" is a root task with nested sub-tasks under Active / Backlog / Done; read surviving
"project row" language as the root-task row.

## 6. Do's and Don'ts

### Do:

- **Do** keep Iris on ≤10% of any screen (The One Voice Rule) — one active state, one primary
  action, one focused field.
- **Do** express depth by stepping the neutral ladder (canvas → rail → surface → hover → active),
  never with shadows on static surfaces.
- **Do** use tabular figures for any number that updates live — rollups, counts, progress.
- **Do** make creation feel lightweight: dashed inline-add inputs at the point of work, not "New…"
  buttons that open dialogs.
- **Do** keep the sync badge visible and plain-spoken — local-first ownership is a feature users can
  see.
- **Do** preserve the 2px accent `:focus-visible` outline everywhere; the keyboard is a first-class
  surface.
- **Do** size in rem so the density knob rescales everything.
- **Do** size icons with the four `--icon-*` tokens (button icons use `--icon-button-size` /
  `--icon-button-control`); a new size outside the scale needs a new token, not a one-off px.

### Don't:

- **Don't** build legacy enterprise PM feature walls or side-stripe banners (Asana/Jira) — no
  colored left borders on rows or callouts, no stacked chrome to advertise capability.
- **Don't** go consumer cutesy: no gradients (and no gradient text), no radii beyond 14px on
  containers, no mascots or playful illustration.
- **Don't** recreate Evernote-era clutter — density comes from the user's content, never from
  competing chrome; every view keeps one clear hierarchy.
- **Don't** ship gray-spreadsheet utilitarianism — flat #808080-family grays, default browser
  controls, and unstyled tables are all off-system; the violet tint is the personality.
- **Don't** introduce a second accent hue into chrome; non-violet hues belong only to the user's
  area dots.
- **Don't** put drop shadows on cards, rows, or buttons at rest (The Flat-by-Default Rule); lift
  exists only while dragging.
- **Don't** hide controls behind ellipsis menus when a quiet always-visible icon or inline edit
  would do — but never make a control keyboard-inaccessible.
- **Don't** use display type above 1.43rem in the app shell (The Small Display Rule); the workspace
  never shouts.
