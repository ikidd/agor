<img src="https://github.com/user-attachments/assets/e34f3d25-71dd-4084-8f3e-4f1c73381c66" alt="Agor Logo" width="320" />

# Agor

**Agent orchestration for AI-assisted development.** The platform layer that sits above all agentic coding tools, providing one interface to manage Claude Code, Codex, and [coming soon] Gemini and more.

[Installation](#installation) · [Documentation](CLAUDE.md) · [Architecture](context/)

---

## What It Does

**Agor manages sessions, tasks, and context as first-class composable primitives stored in a session tree.**

Think of it as git's companion: **git tracks code, Agor tracks the conversations that produced the code.**

- Import sessions from Claude Code (Codex coming soon)
- Visualize conversation history on a drag-and-drop canvas
- Fork sessions to try alternative approaches
- Spawn subtasks to delegate work to different agents
- Track which sessions produced which code (git state per task)
- Coordinate parallel agent work with isolated git worktrees
- Real-time multiplayer collaboration with cursor broadcasting

```
Your Project:
├── .git/          # Code repository (git)
│   └── Version history
│
└── .agor/         # Session tree (agor)
    ├── sessions/  # Conversation history
    ├── tasks/     # Granular checkpoints
    └── Metadata linking sessions ↔ code
```

---

## The Five Primitives

Everything in Agor is built from five fundamental building blocks:

### 1. Session - The Universal Container

**Everything is a session.** A session represents a conversation with an agentic coding tool.

**Two relationship types:**

- **Fork** - Try alternative approaches (divergent exploration, inherits full history)
- **Spawn** - Delegate subtasks (new context window, focused work)

```
Session A: "Build auth system"
├─ Fork B: "Try OAuth instead of JWT"
└─ Spawn C: "Design user table schema"
```

### 2. Task - User Prompts as Checkpoints

**Every user prompt creates a task.** Tasks are contiguous message ranges within a session, tracked with git state.

```
Task 1: "Implement auth"
├─ Start: a4f2e91 (clean)
├─ Agent makes changes → a4f2e91-dirty
└─ Complete: b3e4d12
```

### 3. Worktree - Isolated Git Workspaces

**Parallel sessions without conflicts.** Each session can get its own git worktree for complete isolation.

```
Main: ~/my-project (main branch)
Session A → ~/my-project-auth (feature/auth)
Session B → ~/my-project-graphql (feature/graphql)
```

### 4. Report - Structured Learning Capture

**Post-task hooks generate reports.** After each task completes, Agor automatically extracts learnings using customizable templates (bug fixes, features, research findings).

### 5. Concept - Modular Context

**Self-referencing knowledge modules.** Wiki-style markdown files that compose into session-specific context. Load only what's needed, evolve with version control.

```
context/
├── auth.md         # References [[security]], [[api-design]]
├── security.md
└── database.md
```

---

## What You Can Do Today

**Import and visualize sessions:**

```bash
pnpm agor session load-claude 34e94925-f4cc-4685-8869-83c77062ad14
```

- Parses Claude Code JSONL transcripts
- Extracts tasks from user prompts
- Indexes full conversation history in SQLite
- Displays on visual canvas with drag-and-drop zones

**Coordinate with your team:**

- Real-time multiplayer with cursor broadcasting
- Facepile showing active users
- WebSocket sync for instant board updates
- Pin sessions to zones for spatial organization

**Execute agents directly:**

- Claude Code integration via Agent SDK
- Codex integration via OpenAI SDK (beta)
- Token-level streaming responses
- Per-session permission modes

**Git worktree management:**

```bash
pnpm agor repo add https://github.com/user/repo
pnpm agor repo worktree add repo-name feature-branch
```

- Each session gets isolated working directory
- Parallel agent work without conflicts

---

## Installation

**Requirements:**

- Node.js 18+, pnpm, git
- Claude Code 2.0+ (optional, for import)

```bash
git clone https://github.com/mistercrunch/agor
cd agor
pnpm install
pnpm agor init
```

**Run the stack:**

```bash
# Terminal 1: Daemon (REST + WebSocket)
cd apps/agor-daemon && pnpm dev  # :3030

# Terminal 2: UI (React + Vite)
cd apps/agor-ui && pnpm dev      # :5173
```

The daemon auto-rebuilds and restarts when you edit `packages/core` or `apps/agor-daemon`.

---

## Quick Start

**Import a Claude Code session:**

```bash
# Find your session IDs
ls -la ~/.claude/projects/

# Import with automatic task extraction
pnpm agor session load-claude 34e94925-f4cc-4685-8869-83c77062ad14 --board Default
```

**CLI reference:**

```bash
# Sessions
pnpm agor session list                      # Table view
pnpm agor session show <id>                 # Full details

# Boards
pnpm agor board list                        # List boards
pnpm agor board add-session <board> <sess>  # Organize sessions

# Repos (git worktrees)
pnpm agor repo add <url>                    # Clone repository
pnpm agor repo worktree add <repo> <name>   # Create worktree

# Users (multi-user mode)
pnpm agor user create                       # Add user
pnpm agor user list                         # Show all users

# Config
pnpm agor config                            # Show config
pnpm agor config set <key> <value>          # Update config
```

---

## How it works

**Stack:**

- **Backend:** FeathersJS (REST + Socket.io), Drizzle ORM, LibSQL (SQLite)
- **Frontend:** React 18, TypeScript, Ant Design, React Flow
- **CLI:** oclif with chalk and cli-table3
- **Real-time:** WebSocket broadcasting via Socket.io transport

**Data model:**

- Sessions, Tasks, Messages, Boards, Repos, Users stored in SQLite
- UUIDv7 for time-ordered IDs with short display format (first 8 chars)
- Hybrid storage: materialized columns for queries + JSON blobs for nested data
- B-tree indexes on frequently queried fields

**File locations:**

```
~/.agor/
├── agor.db          # SQLite database
├── config.json      # Global config
└── context.json     # CLI active context

~/.claude/projects/  # Claude Code session transcripts (JSONL)
```

**Monorepo:**

```
agor/
├── apps/
│   ├── agor-daemon/    # FeathersJS backend
│   ├── agor-cli/       # oclif CLI
│   └── agor-ui/        # React UI
├── packages/
│   └── core/           # Shared types, DB, git utils
└── context/            # Architecture docs
```

See [CLAUDE.md](CLAUDE.md) for development guide and [context/](context/) for architecture deep-dives.

---

## Example: How The Primitives Compose

**Scenario: Building an authentication feature**

**Phase 1 - Main session:**

```bash
agor session start \
  --agent claude-code \
  --concepts auth,security,api-design \
  --worktree feature-auth
```

- Session A created with loaded context
- Worktree `~/my-project-auth` created
- Task 1: "Design JWT flow" → Completes, report generated
- Task 2: "Implement endpoints" → Completes, report generated

**Phase 2 - Fork to try alternative:**

```bash
agor session fork <session-a> --from-task 1
```

- Session B created (forked from design phase)
- Inherits full history up to Task 1
- Task 3: "Implement OAuth instead" → Different approach, same context

**Phase 3 - Spawn subtask to different agent:**

```bash
agor session spawn <session-a> \
  --agent gemini \
  --concepts database,security
```

- Session C created (child of A)
- New context window (no API design context)
- Task 4: "Design user table" → Focused DB work

**Result - Session tree:**

```
Session A (Claude Code, feature-auth worktree)
│ Concepts: [auth, security, api-design]
│
├─ Task 1: "Design JWT auth" ✓
├─ Task 2: "Implement JWT" ✓
│
├─ Session B (fork from Task 1)
│   └─ Task 3: "Implement OAuth" ✓
│
└─ Session C (spawn from Task 2, Gemini)
    └─ Task 4: "Design user table" ✓
```

---

## Why The Session Tree Matters

The session tree is Agor's fundamental artifact - a complete, versioned record of all agentic coding sessions.

**Observable:**

- Visualize entire tree of explorations
- See which paths succeeded, which failed
- Understand decision points and branches

**Interactive:**

- Manage multiple sessions in parallel
- Fork any session at any task
- Navigate between related sessions

**Shareable:**

- Push/pull like git (future: federated)
- Learn from others' successful patterns

**Versioned:**

- Track evolution over time
- Audit trail of AI-assisted development

---

## Implementation Status

**Phase 2 Complete - Multi-User Foundation:**

✅ Session import (Claude Code transcripts → SQLite)
✅ Task extraction with message ranges
✅ Visual canvas (React Flow with zones, pins, drag-and-drop)
✅ Real-time multiplayer (cursor swarm, facepile, WebSocket sync)
✅ Agent SDK integration (Claude Code + Codex with streaming)
✅ Git worktree management
✅ User authentication (JWT + anonymous mode)
✅ Full CLI (oclif) and REST API (FeathersJS)

**Phase 3 Next - Orchestration:**

🔄 Session forking UI and genealogy visualization
🔄 Automated report generation (post-task hooks)
🔄 Concept management (modular context loading)
🔄 MCP server integration (UI + SDK hookup)

See [PROJECT.md](PROJECT.md) for detailed roadmap.

---

## Contributing

**Code standards:**

- TypeScript strict mode with branded types (SessionID, TaskID, etc.)
- Repository pattern for database access
- Drizzle ORM for schema and queries
- oclif conventions for CLI
- Ant Design token-based styling

**Before contributing:**

1. Read [CLAUDE.md](CLAUDE.md) - Development workflow and patterns
2. Check [context/concepts/architecture.md](context/concepts/architecture.md) - System design
3. Review [PROJECT.md](PROJECT.md) - Current priorities

**Testing:**

```bash
cd packages/core && pnpm test       # Core unit tests
cd apps/agor-ui && pnpm test        # UI tests
cd apps/agor-ui && pnpm storybook   # Component dev
```

---

## Documentation

- **[CLAUDE.md](CLAUDE.md)** - Developer guide, patterns, troubleshooting
- **[PROJECT.md](PROJECT.md)** - Implementation roadmap and phase status
- **[context/](context/)** - Architecture deep-dives and design decisions

---

## Troubleshooting

```bash
# Port conflicts
lsof -ti:3030 | xargs kill -9  # Kill daemon
lsof -ti:5173 | xargs kill -9  # Kill UI

# Database reset
pnpm agor init --force

# Health check
curl http://localhost:3030/health
```

---

## Links

**GitHub:** [mistercrunch/agor](https://github.com/mistercrunch/agor)
**Issues:** [github.com/mistercrunch/agor/issues](https://github.com/mistercrunch/agor/issues)
**Discussions:** [github.com/mistercrunch/agor/discussions](https://github.com/mistercrunch/agor/discussions)
