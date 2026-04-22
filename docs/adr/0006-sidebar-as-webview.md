# Tackle Sidebar is a WebviewView, not TreeViews

The Tackle Sidebar is a single `WebviewView` rendering HTML/CSS, replacing the three prior TreeViews (Tasks, Plan, Sessions). The goal is a dense 3-line Task Card design, an in-sidebar List Mode ↔ Detail Mode transition, and a Task Footer quick-switcher — none of which are achievable in a `TreeView` primitive.

## Considered options

- **Stay on TreeView, maximize richness** — use markdown tooltips, FileDecorations for active tint, glyph-based rollup in `description`. Native behavior for free (keyboard nav, context menus, drag-drop, list-hoverBackground). Ceiling: one line per item, one icon slot, no multi-line density, no in-place mode transition. Not enough for the Detail Mode / plan tracker direction.
- **WebviewView for the sidebar (chosen)** — full HTML/CSS rendering. Cards are 2–3 lines with activity glyphs, rollups, inline actions, a subtly-accented Active Task, and a Task Footer in Detail Mode. A secondary detail pane is explicitly rejected: Detail Mode is a mutation of the same sidebar, not a new editor-area tab.
- **Hybrid: WebviewView in sidebar + WebviewView in editor area for detail** — most flexibility but pays webview cost twice and spreads the task-centric UI across two surfaces. Rejected for coherence.

## Consequences

- Keyboard navigation, selection state, context menus, and drag-and-drop must be rebuilt inside the webview — none are free. Keyboard bindings are deferred until the full action set is known.
- The webview is a pure function of state: the extension host computes full view state on every relevant event and pushes it once; the webview renders. Simple, snapshot-testable, and trivial to keep correct.
- `retainContextWhenHidden: true` keeps scroll and other in-memory UI state intact when the sidebar is collapsed/expanded.
- Code is split into sidebar-view-provider / sidebar-controller / sidebar-state (pure reducer) / render.ts / messages.ts / webview/main.ts for unit-testability of the pure layers.
