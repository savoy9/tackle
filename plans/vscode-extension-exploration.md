# ChartRoom as VS Code Extension(s) — Design Exploration

## Research Summary

### The Key Insight: You Don't Need a Fork

The initial assumption was that swapping terminal↔editor positions requires forking VS Code. **This is wrong.** VS Code has had `TerminalLocation.Editor` since v1.64 (Jan 2022), which opens terminals as first-class tabs in the editor area. Combined with hiding the bottom panel, this achieves ChartRoom's "terminal in center" layout **entirely through the extension API**:

```
ChartRoom Layout (Electron MVP)        VS Code Extension Equivalent
┌──────┬──────────────┬───────┐        ┌──────┬──────────────┬───────┐
│ Task │  Terminal     │Review │  ===   │ Task │  Editor Area │Review │
│Panel │  (center)    │Panel  │        │ View │  (terminals  │ Side  │
│      │              │(code) │        │      │   as tabs)   │ Bar   │
└──────┴──────────────┴───────┘        └──────┴──────────────┴───────┘
                                              (bottom panel hidden)
```

### What the Extension API Provides

| ChartRoom Feature | VS Code API | Difficulty |
|---|---|---|
| Terminal in center | `TerminalLocation.Editor` | ✅ Trivial |
| Terminal multiplexer tabs | Multiple editor-area terminals | ✅ Trivial |
| Task list sidebar | `TreeDataProvider` + Activity Bar | ✅ Easy |
| Plan/phase timeline | `TreeDataProvider` or `WebviewView` | ✅ Easy |
| Code editor (collapsible side) | Secondary Sidebar (Auxiliary Bar) | ✅ Built-in |
| Task-scoped file filtering | `files.exclude` + custom TreeView | ✅ Moderate |
| Tab management on task switch | `window.tabGroups.close()` | ✅ Easy |
| Terminal lifecycle per task | `createTerminal()` / `dispose()` | ✅ Easy |
| Status bar (current task) | `createStatusBarItem()` | ✅ Trivial |
| Context-aware menus | `setContext` + `when` clauses | ✅ Easy |
| Editor group layout | `vscode.setEditorLayout` | ✅ Easy |
| Persistent state | `workspaceState` + SQLite | ✅ Easy |

### What You Lose vs. Standalone Electron

| Standalone Feature | Extension Limitation | Mitigation |
|---|---|---|
| Custom xterm.js rendering | Use VS Code's built-in terminal | Actually better — shell integration, links, GPU rendering for free |
| psmux session attachment | Can set terminal cwd/env but can't attach to existing tmux | Create VS Code terminals that run `tmux attach` |
| Monaco in review panel | Would need a WebviewView with Monaco | VS Code IS Monaco — just open files in the auxiliary sidebar |
| Full layout control | Can't move the Activity Bar or Title Bar | Don't need to — the layout maps naturally |
| Custom IPC | Use Extension API + `workspaceState` | Actually simpler |

### What You Gain

1. **All of VS Code for free** — IntelliSense, debugging, source control, extensions marketplace, keybindings, themes, settings sync
2. **No Electron maintenance** — no build system, no native module hell, no Electron version bumps
3. **Extension marketplace distribution** — install with one click
4. **User's existing workflow** — they keep their extensions, settings, keybindings
5. **Monaco IS the editor** — no need to embed it; VS Code's editor is Monaco
6. **Terminal is better** — VS Code's integrated terminal has shell integration, link detection, GPU rendering, command tracking

---

## Architecture: Extension-Based ChartRoom

### Extension Decomposition

One extension with multiple contribution points (not multiple extensions — they need shared state):

```
chartroom (VS Code Extension)
├── extension.ts                 # Activation, command registration
├── task/
│   ├── TaskTreeProvider.ts      # TreeDataProvider for task list
│   ├── TaskService.ts           # CRUD, sync with GitHub/ADO
│   └── TaskStore.ts             # SQLite persistence
├── plan/
│   ├── PlanTreeProvider.ts      # TreeDataProvider for phase timeline
│   ├── PlanParser.ts            # Extract phases from markdown
│   └── PlanService.ts           # Plan lifecycle
├── scope/
│   ├── ScopeManager.ts          # Task/phase selection → scoping
│   ├── FileFilter.ts            # files.exclude management
│   ├── TabManager.ts            # Close/open tabs on task switch
│   └── TerminalManager.ts       # Terminal lifecycle per task/phase
├── terminal/
│   ├── TerminalOrchestrator.ts  # Create editor-area terminals
│   ├── PsmuxBridge.ts           # Spawn tmux-attached terminals
│   └── SessionTracker.ts        # Track agent sessions
├── pilot/
│   ├── PilotService.ts          # Pilot session management
│   └── PilotTerminal.ts         # Distinguished pilot terminal
├── review/
│   ├── ReviewWebviewProvider.ts # WebviewView for review sidebar
│   └── DiffService.ts           # Git diff integration
├── context/
│   ├── ContextInjector.ts       # CLAUDE.md generation per worktree
│   └── HookManager.ts          # Claude Code hook wiring
├── sync/
│   ├── GitHubSync.ts            # GitHub Issues
│   └── AdoSync.ts               # ADO Work Items
└── db/
    └── Database.ts              # SQLite via better-sqlite3 or WASM
```

### UI Contribution Points

```jsonc
// package.json (contributes)
{
  "viewsContainers": {
    "activitybar": [{
      "id": "chartroom",
      "title": "ChartRoom",
      "icon": "media/chartroom.svg"
    }]
  },
  "views": {
    "chartroom": [
      { "id": "chartroom.tasks",  "name": "Tasks" },
      { "id": "chartroom.plan",   "name": "Plan" },
      { "id": "chartroom.sessions", "name": "Sessions" }
    ]
  },
  "commands": [
    { "command": "chartroom.selectTask",     "title": "ChartRoom: Select Task" },
    { "command": "chartroom.selectPhase",    "title": "ChartRoom: Select Phase" },
    { "command": "chartroom.newSession",     "title": "ChartRoom: New Agent Session" },
    { "command": "chartroom.syncTasks",      "title": "ChartRoom: Sync Tasks" },
    { "command": "chartroom.openPilot",      "title": "ChartRoom: Open Pilot" },
    { "command": "chartroom.focusLayout",    "title": "ChartRoom: Terminal-Focused Layout" }
  ],
  "configuration": {
    "title": "ChartRoom",
    "properties": {
      "chartroom.defaultTerminalLocation": {
        "type": "string",
        "default": "editor",
        "enum": ["editor", "panel"]
      },
      "chartroom.github.repo": { "type": "string" },
      "chartroom.ado.project": { "type": "string" }
    }
  }
}
```

---

## Domain Model: VS Code Extension Variant

### Ubiquitous Language Changes from Standalone

| Standalone Term | VS Code Term | Reason |
|---|---|---|
| Terminal Panel (center) | Editor Area (terminals as tabs) | Terminals live in editor tab groups |
| Review Panel (right) | Auxiliary Sidebar / Editor Group | Use VS Code's secondary sidebar or a right editor group |
| Task Panel (left) | ChartRoom Activity Bar View | Custom Activity Bar icon + TreeViews |
| psmux Session | Terminal Group | VS Code manages terminal lifecycle; psmux optional for persistence |
| xterm.js instance | VS Code Terminal | Delegate rendering to VS Code |

### Entities

```
┌─────────────────────────────────────────────────────────────────┐
│                        ChartRoom Extension                       │
│                                                                   │
│  ┌──────────┐  1    *  ┌──────────┐  1    *  ┌───────────────┐  │
│  │   Task   │─────────│  Phase   │─────────│ AgentSession  │  │
│  │          │          │          │          │               │  │
│  │ extId    │          │ name     │          │ kind          │  │
│  │ source   │          │ status   │          │ terminal      │  │
│  │ title    │          │ sortOrder│          │ worktree      │  │
│  │ status   │          │          │          │ claudeSessionId│ │
│  └────┬─────┘          └──────────┘          └───────┬───────┘  │
│       │                                               │          │
│       │ 1                                             │ 1        │
│       │                                               │          │
│  ┌────┴─────┐                                   ┌─────┴───────┐  │
│  │   Plan   │                                   │  Terminal    │  │
│  │          │                                   │  (VS Code)  │  │
│  │ markdown │                                   │             │  │
│  │ phases[] │                                   │ location:   │  │
│  └──────────┘                                   │  Editor     │  │
│                                                   └─────────────┘  │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐    │
│  │                     ScopeManager                           │    │
│  │                                                             │    │
│  │  activeTask: Task | null                                    │    │
│  │  activePhase: Phase | null                                  │    │
│  │                                                             │    │
│  │  on task change:                                            │    │
│  │    1. Close irrelevant editor tabs (tabGroups.close)        │    │
│  │    2. Dispose non-task terminals                            │    │
│  │    3. Create/show task terminals in editor area             │    │
│  │    4. Update files.exclude for task-relevant files          │    │
│  │    5. Refresh TreeViews (tasks, plan, sessions)             │    │
│  │    6. Update status bar                                     │    │
│  │    7. Set 'when' context for menus                          │    │
│  │                                                             │    │
│  │  on phase change:                                           │    │
│  │    1. Filter terminals to phase's sessions                  │    │
│  │    2. Narrow files.exclude to phase worktree                │    │
│  │    3. Refresh session TreeView                              │    │
│  └───────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐    │
│  │                  TerminalOrchestrator                       │    │
│  │                                                             │    │
│  │  createSession(task, phase?, kind):                         │    │
│  │    1. Determine cwd (worktree or repo root)                 │    │
│  │    2. vscode.window.createTerminal({                        │    │
│  │         name: `${task.title} / ${phase?.name ?? 'pilot'}`,  │    │
│  │         location: TerminalLocation.Editor,                  │    │
│  │         cwd: worktreePath,                                  │    │
│  │         env: { CHARTROOM_TASK: task.id, ... }               │    │
│  │       })                                                    │    │
│  │    3. If psmux: terminal.sendText(`psmux attach ...`)       │    │
│  │    4. Track terminal → session mapping                      │    │
│  │    5. Register onDidCloseTerminal for cleanup               │    │
│  │                                                             │    │
│  │  Pilot terminals are pinned (never auto-closed on phase     │    │
│  │  switch, only on task switch)                               │    │
│  └───────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐    │
│  │                    LayoutManager                            │    │
│  │                                                             │    │
│  │  applyChartroomLayout():                                    │    │
│  │    1. Hide bottom panel: workbench.action.closePanel        │    │
│  │    2. Set editor layout: 70/30 split (terminals | review)   │    │
│  │    3. Open terminals in left editor group                   │    │
│  │    4. Open review files in right editor group               │    │
│  │    5. Show ChartRoom Activity Bar view                      │    │
│  │                                                             │    │
│  │  OR: use Auxiliary Bar (secondary sidebar) for review       │    │
│  └───────────────────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────────────────┘
```

### Interaction Flows

#### Task Selection Flow
```
User clicks Task in TreeView
  → ScopeManager.setActiveTask(task)
    → TerminalOrchestrator.switchToTask(task)
      → dispose all current terminals
      → create terminals for task's active sessions (TerminalLocation.Editor)
      → if task has pilot session: create pilot terminal, pin it
    → FileFilter.scopeToTask(task)
      → update workspace files.exclude
      → or: switch multi-root workspace folders
    → TabManager.closeIrrelevantTabs()
    → PlanTreeProvider.refresh()
    → SessionTreeProvider.refresh()
    → StatusBar.update(`⚓ ${task.title}`)
    → setContext('chartroom.activeTask', task.id)
```

#### New Agent Session Flow
```
User: "ChartRoom: New Agent Session" command
  → Pick phase (QuickPick from plan phases)
  → Pick kind: implement | review | test | debug | pilot
  → TerminalOrchestrator.createSession(task, phase, kind)
    → create git worktree if needed (phase impl session)
    → generate CLAUDE.md in worktree with context
    → createTerminal({
        name: `[impl] Phase 2: Auth`,
        location: TerminalLocation.Editor,
        cwd: worktreePath
      })
    → terminal.sendText('claude') // or whatever agent command
    → persist session to SQLite
    → refresh TreeViews
```

#### Terminal-Focused Layout Activation
```
User: "ChartRoom: Terminal-Focused Layout" command
  → LayoutManager.applyChartroomLayout()
    → executeCommand('workbench.action.closePanel')        // hide bottom panel
    → executeCommand('vscode.setEditorLayout', {
        orientation: 0,
        groups: [{ size: 0.7 }, { size: 0.3 }]            // 70% terminals, 30% code
      })
    → executeCommand('workbench.action.focusFirstEditorGroup')
    → if no terminals open: create default terminal in editor area
```

### SQLite in VS Code Extension

Two options:
1. **better-sqlite3** — works if extension runs in Node.js extension host (standard). Same as Electron MVP.
2. **sql.js (WASM)** — works in web extension host too. Slightly slower but more portable.

Recommendation: **better-sqlite3** for desktop VS Code (same as MVP), with sql.js as fallback for web.

### psmux/tmux Integration

The standalone app attaches xterm.js directly to psmux. In VS Code, terminals are managed by VS Code itself. Two strategies:

**Option A: VS Code-native terminals (recommended for MVP)**
- Each agent session = one VS Code terminal opened in editor area
- No psmux dependency
- Sessions don't survive VS Code restart (but can be re-created from SQLite state)
- Simpler, works everywhere

**Option B: psmux-backed terminals**
- Terminal runs `tmux attach -t session_name` or `psmux attach ...`
- Sessions survive VS Code restart
- Requires psmux/tmux installed
- Slightly worse UX (tmux keybindings conflict with VS Code)

Recommendation: **Start with Option A**, add Option B as opt-in for power users.

---

## Comparison: Standalone Electron vs. VS Code Extension

| Dimension | Standalone Electron | VS Code Extension |
|---|---|---|
| **Lines of code** | ~5,000+ (and growing) | ~2,000 estimated |
| **Terminal quality** | Custom xterm.js (must maintain) | VS Code terminal (free, better) |
| **Code editor** | Custom Monaco embed (must maintain) | IS Monaco (free, complete) |
| **Distribution** | Download + install binary | `ext install chartroom` |
| **User adoption friction** | New app to learn | Works in their existing IDE |
| **File explorer** | Must build from scratch | Built-in + custom TreeViews |
| **Debugging support** | None | Full VS Code debugger |
| **Source control** | None | Full VS Code git integration |
| **Extension ecosystem** | None | Entire VS Code marketplace |
| **Maintenance burden** | Electron + React + xterm + Monaco | VS Code API only |
| **Layout flexibility** | Total control | Constrained but sufficient |
| **Crash resilience** | psmux sessions survive | VS Code terminal restore built-in |
| **Multi-window** | Complex | VS Code handles it |

### Verdict

The VS Code extension approach is **strictly superior** for everything except total layout control — and the layout gap is closed by `TerminalLocation.Editor`. The standalone Electron app was essentially rebuilding VS Code's shell, terminal, and editor from scratch, poorly.

---

## Migration Path from MVP

### What to Keep
- `shared/` types (Task, Phase, Session) — reuse as-is
- `task-repository.ts`, `plan-parser.ts`, `phase-repository.ts` — reuse logic
- `github-sync.ts` — reuse
- `db.ts` — reuse (better-sqlite3 works in VS Code extensions)
- `CONTEXT.md` — ubiquitous language still applies
- `cr` CLI — still works (reads same SQLite)

### What to Replace
- Electron shell → VS Code extension activation
- React panels → TreeDataProvider + WebviewView
- xterm.js rendering → `TerminalLocation.Editor`
- Custom IPC �� VS Code Extension API
- electron-vite build → vsce packaging
- psmux-manager → TerminalOrchestrator (VS Code terminals)

### What's New
- `ScopeManager` — the novel piece: task selection drives files.exclude, tabs, terminals
- `LayoutManager` — one-command layout switch
- VS Code `when` clause contexts — dynamic menu/command visibility

---

## Open Questions

1. **Home Page**: ChartRoom has a task selection "home page". In VS Code, this would be the Activity Bar view. Is a TreeView sufficient, or does it need a Webview for richer presentation?

2. **Review Panel as Auxiliary Sidebar vs. Editor Group**: Should the code review panel be the Auxiliary Bar (secondary sidebar) or a right-side editor group? Auxiliary Bar is collapsible and persistent; editor group is more flexible but mixes with terminals.

3. **psmux necessity**: If VS Code terminals suffice (with terminal restore on restart), is psmux still needed? Main value was crash resilience, which VS Code already provides.

4. **Multi-instance**: Standalone ChartRoom was per-repo. VS Code extensions are per-window. Multi-root workspaces complicate this. Stick with per-workspace-folder?

5. **CLI (`cr`) coexistence**: The CLI reads the same SQLite DB. This still works — the extension and CLI are peers. But should the extension also expose commands that the CLI does?
