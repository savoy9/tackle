# Agency CC is the default Agent; agents are pluggable via a registry

Tackle's default Session Agent is `agency-cc` (a Microsoft-internal wrapper around Claude Code that injects access to the WorkIQ and ES Chat MCP servers). `claude` (vanilla Claude Code) is the second supported Agent. New Agents are added by registering an adapter that maps the Agent name to `{ command, resumeFlag }`.

## Considered options

- **Hardcode `claude` as the only Agent** — simplest; forecloses on the Microsoft-internal path that Tackle is initially built for.
- **Hardcode `agency-cc` as the only Agent** — matches the primary deployment context but ships a Microsoft-internal dependency as a hard requirement for all users, including any external fork or open-source variant.
- **Registry with configurable default (chosen)** — Agents are pluggable. `tackle.defaultAgent` setting selects the default; the registry holds the spawn adapter. MVP ships `agency-cc` and `claude`. Both support `-r <session-id>` / `--resume <session-id>`, so Restart semantics are uniform.

## Consequences

- External forks or non-Microsoft users flip `tackle.defaultAgent` to `claude` without code changes.
- Adding a new Agent is a one-entry change to the registry plus testing the resume flag. Adding Agents with incompatible resume semantics (e.g., a flag-space rename or a different session-id format) will require extending the adapter interface beyond `{ command, resumeFlag }`.
- `Session.agent` is per-session, so a workspace can mix Agents across Sessions. The default is only consulted at Session creation time.
- Sessions of kind `shell` skip Agent launch entirely regardless of `tackle.defaultAgent`.
