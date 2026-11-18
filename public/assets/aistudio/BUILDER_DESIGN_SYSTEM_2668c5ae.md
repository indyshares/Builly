# Builly Visual Builder — Design System Foundation

**Direction:** Calm Professional Creative IDE  
**Purpose:** Shared visual and interaction standards for all Builder workspace panels.

---

## 1. Design tokens

Treat these as initial design tokens. First audit the current theme/token setup and map existing tokens where possible. Avoid duplicating token systems.

### 1.1 Color

| Token | Suggested value | Usage |
|---|---|---|
| `--builder-canvas-bg` | `#F1F0F4` | Workspace around website canvas |
| `--builder-panel-bg` | `#FFFFFF` | Side panels |
| `--builder-surface-muted` | `#F7F6FA` | Subtle grouped areas |
| `--builder-text-primary` | `#211B2E` | Main text |
| `--builder-text-secondary` | `#6F687A` | Supporting labels |
| `--builder-text-muted` | `#918A9B` | Metadata only |
| `--builder-border` | `#E7E3EC` | Dividers and control borders |
| `--builder-primary` | `#6C2CEB` | Primary action and selected state |
| `--builder-primary-hover` | `#5B20D0` | Hover |
| `--builder-focus-ring` | `rgba(108,44,235,.24)` | Focus-visible |
| `--builder-success` | Existing semantic success token | Save/success |
| `--builder-warning` | Existing semantic warning token | Warnings |
| `--builder-danger` | Existing semantic danger token | Destructive/error |

Use existing semantic tokens if they already exist. Do not introduce inconsistent duplicate colors.

### 1.2 Typography

| Role | Target |
|---|---:|
| Panel title | 15–16px / semibold |
| Group title | 13–14px / semibold |
| Field label | 12–13px / medium |
| Input value | 14px / regular or medium |
| Body/help text | 12–13px |
| Technical metadata | 11–12px, muted |

Use the current font if it is legible and supports Thai and English. Inter is a candidate, not a mandate. Verify Thai glyph rendering before changing fonts.

### 1.3 Spacing

Use a consistent 4px base scale:
`4, 8, 12, 16, 20, 24, 32`

Suggested usage:
- Label to input: 6–8px
- Fields within a group: 10–12px
- Group separation: 18–24px
- Panel padding: 16px
- Compact list item padding: 8–10px
- Comfortable list item padding: 10–12px

### 1.4 Geometry

| Token | Target |
|---|---:|
| Small radius | 4–6px |
| Control radius | 6–8px |
| Panel/card radius | 8–10px |
| Standard input height | 40px |
| Compact control height | 32–36px |
| Icon button target | 32–36px |
| Focus ring | 2px visible ring |

Avoid excessive rounding and nested cards.

---

## 2. Component standards

### 2.1 NumericField

Required API concepts (adapt to current component architecture):
- `label`
- `value`
- `unit`
- `supportedUnits`
- `placeholder` only for guidance
- `min`, `max`, `step` where applicable
- `disabled`
- `error`
- `onValueChange`
- `onUnitChange`
- `onCommit`
- `onReset` if supported

Behavior:
- Never clip the visible value.
- Input gets flexible width; unit selector gets stable width.
- Keep intermediate string state while editing if required.
- Parse and validate on commit according to property semantics.
- Do not silently coerce invalid or empty values.
- Support keyboard-only interaction.
- Preserve undo/redo integration.

### 2.2 TextField / Select / Toggle

- Labels are always visible.
- Placeholder is not a substitute for label or current value.
- Select must expose selected value clearly.
- Toggle includes a readable label and state.
- Error text appears directly below its control.
- Disabled state must remain readable.

### 2.3 AccordionSection

- Clear title and optional short description
- Entire header has a practical click target
- Chevron indicates open/closed state
- Avoid nested accordion levels deeper than necessary
- Preserve expanded state when changing values or rerendering

### 2.4 Tabs

- Use concise labels
- Active state has both color and shape/underline cue
- Focus-visible state is distinct
- Do not overflow silently; support scroll or responsive adaptation

### 2.5 IconButton

- Tooltip for icon-only controls
- Accessible label required
- Minimum practical hit area 32px; prefer 36px
- Destructive actions visually distinguished and confirmed where appropriate

### 2.6 SearchField

- Visible search affordance
- Clear button when query exists
- Keyboard focus and shortcut behavior if already supported
- Empty results explain how to recover

### 2.7 EmptyState

- Explain what is empty
- Give one relevant next action
- Avoid decorative illustration that consumes excessive space

---

## 3. Layout rules

- Prefer spacing and typography over borders.
- Use borders only to separate meaningful regions or define editable controls.
- Avoid card nesting.
- Keep primary actions visually stronger than secondary actions.
- Use accent color sparingly.
- Technical CSS property names may appear as secondary metadata or in Advanced mode, not compete with user-facing labels.
- Maintain a consistent left edge for labels and controls.
- Use two-column property grids only when each control retains enough width.
- Automatically switch to one column when the panel is too narrow.

---

## 4. Motion

Motion is optional and should be restrained:
- 120–180ms for hover/focus/selection feedback
- 160–220ms for accordion/panel transitions
- Respect reduced-motion preferences
- No decorative animation in frequently used controls
- Do not animate layout in a way that disrupts precise editing

---

## 5. Density modes

If a density preference already exists, map it to these behaviors. Otherwise do not add a new preference unless user testing proves value.

- **Comfortable (default):** readable spacing and controls
- **Compact (optional):** reduced vertical spacing, never smaller numeric text or unusable hit targets

Compact mode must not recreate the current cramped interface.
