# Local-first database with future remote hosting in mind

The MVP uses SQLite on disk, local to the developer. However, the schema and data access patterns should not assume local-only access. A future "team Chartroom" mode would host the database remotely so multiple developers can see each other's session history for a task. We are not designing for multi-player now, but we avoid decisions that would make it impossible — e.g., no local file paths as primary identifiers, no assumptions about single-writer access in the schema design.
