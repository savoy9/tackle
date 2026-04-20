# psmux as the terminal multiplexer backend

Chartroom uses psmux (a native Windows tmux implementation in Rust) rather than building its own terminal tiling. psmux provides crash resilience (sessions survive Electron crashes), Claude Code agent team integration (automatic teammate pane spawning), external attach capability, and a mature tmux command API — all of which would be substantial to build from scratch. The dependency cost is low (single binary, winget installable). For future macOS/Linux support, native tmux is the natural equivalent — the tmux API is the same.

Each Task gets its own psmux session. Phases are organized as tmux windows within that session. Switching tasks = detach/attach session (one swap). Switching phases = select tmux window (instant). Chartroom maps psmux pane IDs to its session/phase model in the database. xterm.js renders the active psmux window — one xterm.js instance connected to the current task's psmux session.
