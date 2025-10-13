## Implementation Status

### Social features

See [context/explorations/social-features.md](context/explorations/social-features.md) for detailed implementation plan.

**Goal:** Add presence indicators so teammates can see what each other is doing in real-time.

- [ ] **Facepile** - Show active users on board (1-2 days)
  - PresenceManager service in daemon
  - `board:join` / `board:leave` WebSocket events
  - `usePresence()` hook in UI
  - Ant Design `Avatar.Group` component in canvas header

- [ ] **Cursor swarm** - Real-time cursor positions (2-3 days)
  - `cursor:move` / `cursor:update` events (throttled to 50ms)
  - `useCursorBroadcast()` and `useRemoteCursors()` hooks
  - CursorOverlay component with smooth interpolation
  - Use React Flow project() for coordinate mapping

- [ ] **Presence indicators** - Who's viewing which sessions (1 day)
  - `viewing:session` events
  - Mini avatar badges on session cards
  - Tooltip showing viewer names

- [ ] **Typing indicators** - Who's prompting (1 day)
  - `typing:start` / `typing:stop` events
  - "User is typing..." below prompt input

### Phase 3c: Session Orchestration (2-3 weeks)

**Goal:** Complete the core fork/spawn workflow for parallel session management.

- [ ] **Session forking UI** - Fork sessions at decision points
  - Wire fork button to `/sessions/:id/fork` API
  - Display fork genealogy on canvas (React Flow edges)
  - Show fork point in conversation view

- [ ] **Genealogy visualization** - Show session relationships
  - React Flow edges between parent/child/forked sessions
  - Different edge styles (solid spawn, dashed fork)
  - Click edge to see fork/spawn context

### Future (Phase 4+)

See [context/explorations/](context/explorations/) for detailed designs:

- **OAuth & organizations** ([multiplayer-auth.md](context/explorations/multiplayer-auth.md)) - GitHub/Google login, team workspaces, RBAC
- **Desktop app** - Electron/Tauri packaging with bundled daemon
- **Multi-agent support** ([agent-interface.md](context/concepts/agent-integration.md)) - Cursor, Codex, Gemini
- **Cloud deployment** - PostgreSQL migration, Turso/Supabase

# Critical path

- [ ] wrap up permissions-handling in Claude Code (currently, "allow for this session" doesn't session)
- [ ] attach proper git sha to tasks: what was the latest commit when the task was created, mark whether -dirty or not
- [ ] integrate concepts and reports in the information architecture
- [ ] Finish MCP server integrations (3a): sort out the scoping stuff
- [ ] stream answers in blocks

# Nice to have

- [ ] get Codex/Gemini to work
- [ ] allow attaching a PR link to the session metadata, add a text field to the "session settings"
- [ ] show token count and $ (if it applies) per task/session
- [ ] concept management (CRUD/CLI) shows as readonly - many-to-many per session
- [ ] report management + production system
