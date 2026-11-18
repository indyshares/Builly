# Builly Visual Builder — Redesign Implementation Plan

## Guiding rule

Audit → Map → Plan → Implement incrementally → Validate → Review.

Do not start with a wholesale rewrite. The existing Builder is a functioning product with important behavior and integrations.

---

## Phase 0 — Codebase audit (mandatory, no code changes)

Inspect the actual project and report:

1. Workspace root component and layout structure
2. Left panel components and their feature entry points
3. Canvas and selection architecture
4. Right Property Inspector and tab/group structure
5. Numeric input components used for width, height, min/max, spacing, flex, typography, etc.
6. Design tokens, CSS variables, Tailwind config, component library and theme
7. State management and property update flow
8. Undo/redo integration
9. Responsive breakpoint model
10. Save/autosave/persistence flow
11. Existing tests and build commands
12. Known runtime warnings/errors

For each finding provide exact file paths, relevant component names, dependencies and risk.

Deliver:
- `REDESIGN_AUDIT.md`
- current workspace component map
- current numeric input inventory
- regression test baseline

Stop and request approval before implementation.

## Phase 1 — Design foundation

- Map proposed tokens to existing theme.
- Establish shared typography, spacing, control heights and focus styles.
- Build or refine reusable controls only where a real duplication/problem exists.
- Do not replace the entire UI library.
- Verify Thai and English font rendering.
- Add visual regression snapshots if infrastructure supports it.

Exit criteria:
- Shared tokens are consistent.
- Existing screens render without layout regressions.
- Focus and contrast states are usable.

## Phase 2 — Fix Numeric Inputs first

Prioritize the sizing defect shown in the reference screenshot.

Audit all numeric controls and create a shared control only if it fits existing architecture.

Implement:
- sufficient input width
- readable 14px value
- 38–42px height
- distinct unit selector/suffix
- correct Auto/Unset/None handling
- keyboard editing
- stable intermediate input state
- validation
- undo/redo integration
- no unit reinterpretation

Test:
- 0, positive, negative where allowed
- decimals
- large values
- empty/intermediate values
- px, %, rem, em, viewport units where supported
- Auto/Unset/Inherited
- unit changes
- undo/redo
- narrow panel

Exit criteria:
- No clipping or invisible values.
- No regression in stored CSS/property output.

## Phase 3 — Right Property Inspector

- Improve header and tab hierarchy.
- Group properties by user task.
- Add progressive disclosure with clear section names.
- Reduce nested borders and unnecessary cards.
- Keep every existing property discoverable.
- Adapt two-column/one-column field layouts to available width.
- Preserve responsive override semantics.

Exit criteria:
- Users can find common properties quickly.
- Advanced properties remain accessible.
- Editing does not change underlying data semantics.

## Phase 4 — Left Library and Canvas workspace

- Reorganize categories and search.
- Reduce repetitive card actions and long descriptions.
- Improve Layers/Pages/Assets hierarchy.
- Give Canvas more room.
- Simplify toolbar grouping.
- Add/fix panel collapse and focus mode only if safe.

Exit criteria:
- All existing entry points remain accessible.
- Canvas and selection behavior unchanged.
- Panel changes do not reset editor state.

## Phase 5 — Polish and consistency

- Align spacing, typography, icons, tooltips, empty/error/loading states.
- Validate Thai and English.
- Check keyboard and focus navigation.
- Add reduced-motion support.
- Remove obsolete styles only after confirming no other screens depend on them.

## Phase 6 — Regression and release

Run:
- typecheck
- lint
- unit tests
- component tests
- integration tests
- production build
- manual workflow test
- visual regression where available

Record exact commands and outcomes. Do not report a test as passed if it was not run.

---

## Critical regression matrix

| Area | Test |
|---|---|
| Insert | Add each representative element category |
| Drag/drop | Reorder and nest elements |
| Selection | Select via canvas and layer tree |
| Inspector | Edit Content, Style, Responsive, Advanced |
| Sizing | Width/height/min/max and unit changes |
| Spacing | Margin/padding sides, linked/unlinked |
| Responsive | Base, Tablet, Mobile overrides and inheritance |
| History | Undo/redo after multiple property changes |
| Pages | Switch, add, rename and delete where supported |
| Persistence | Save, reload and verify values |
| Preview | Preview current draft |
| Publish | Publish and verify output |
| CMS/Form | Existing connection/configuration workflows |
| Versions | History preview and rollback where implemented |
| Localization | Thai and English text fit |
| Runtime | No hook-order errors or console-breaking exceptions |

## Risk controls

- Use small, reviewable changes.
- Avoid changing state shape or business logic.
- Keep old component path available until replacement is validated.
- Do not migrate all controls in one pass.
- Do not remove old CSS/classes until usage is audited.
- Use feature flags only if existing infrastructure supports them; do not add a feature-flag platform for this redesign.
- Keep rollback path for each phase.
