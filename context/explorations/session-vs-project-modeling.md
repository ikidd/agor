# Session vs Project Modeling

**Status:** Exploration / Design Discussion
**Created:** 2025-10-18
**Related:** [[models]], [[core]], [[worktree-ux-design]]

## The Problem

As Agor evolves, we're seeing that sessions need to contain metadata that feels "project-like":

- `issue_url` - GitHub/Linear issue link
- `pull_request_url` - Associated PR
- Genealogy tree (forks + subtasks) - Collection of related sessions
- Project name - Friendly label for a family of sessions

**The core tension:** A Session currently feels like both:

1. A **single conversation** with an agent (ephemeral, focused)
2. A **project container** for related work (persistent, branching)

This exploration evaluates whether we should:

- Keep Session as the only primitive (with "root session" pattern), OR
- Introduce a new Project primitive

---

## Option 1: Introduce Project as New Primitive

### Data Model

```typescript
Project {
  project_id: ProjectID
  name: string                   // "Auth System Redesign"
  description?: string

  // External References
  issue_url?: string             // GitHub issue
  pull_request_url?: string      // GitHub PR
  epic_id?: string               // For Jira/Linear

  // Git Context (shared across sessions)
  repo_id?: string               // Optional: default repo
  default_branch?: string        // e.g., "main"

  // Root Session
  root_session_id: SessionID     // Entry point

  // Cached Genealogy Stats (denormalized)
  session_count: number
  fork_count: number
  subtask_count: number

  // Status
  status: 'active' | 'completed' | 'archived'

  created_at: string
  last_updated: string
}

Session {
  session_id: SessionID

  // OPTIONAL: Project membership
  project_id?: ProjectID         // null for one-off sessions

  // Rest stays the same...
  agent: AgenticToolName
  genealogy: {
    forked_from_session_id?: SessionID
    parent_session_id?: SessionID
    children: SessionID[]
  }
}
```

### User Flows

**Creating a project:**

```
User: [+ New Project]
  → Name: "Auth System"
  → Issue URL: github.com/org/repo/issues/123
  → [Create]
Result:
  - Project created
  - Root session auto-created
  - Links: project.root_session_id ↔ session.project_id
```

**Creating a one-off session:**

```
User: [+ New Session]
  → Select agent
  → Start working
Result:
  - Session created with project_id = null
  - Can be promoted to project later if forks emerge
```

### Canvas Visualization

**Show Projects as "super cards":**

```
┌─ Project: Auth System ─────────────────┐
│  Issue: #123, PR: #456                  │
│  6 sessions                             │
│                                         │
│  ┌─ Root Session (Claude) ─┐           │
│  │  3 tasks completed       │           │
│  │  [Open]                  │           │
│  └──────────────────────────┘           │
│                                         │
│  🌳 2 forks, 3 subtasks                 │
│  ├─ OAuth impl (fork)                   │
│  └─ DB schema (subtask)                 │
└─────────────────────────────────────────┘
```

### Pros

✅ Clear separation: Project = collection, Session = conversation
✅ Natural place for issue/PR URLs (project-level metadata)
✅ Can visualize entire project tree easily
✅ User mental model: "I'm working on project X, in session Y"
✅ Can enforce structure (every session must have a project)

### Cons

❌ Adds complexity (new primitive + new table)
❌ What about "one-off sessions" not in a project? Nullable project_id feels awkward
❌ Requires migration of existing data model
❌ UI now needs "Create Project" vs "Create Session" distinction (cognitive overhead)
❌ Two-step process for simple work (create project → create session)

---

## Option 2: Root Session Pattern (Keep Session Only)

### Data Model

```typescript
Session {
  session_id: SessionID

  // NEW: Root session identification
  is_root: boolean               // Computed: true if no parent/fork_from

  // NEW: Root session metadata (only set if is_root)
  session_metadata?: {           // Only on root sessions
    name?: string                // Optional friendly name
    description?: string
    issue_url?: string           // GitHub/Linear/Jira issue
    pull_request_url?: string
  }

  // Genealogy
  genealogy: {
    forked_from_session_id?: SessionID
    fork_point_task_id?: TaskID
    parent_session_id?: SessionID   // for subtasks
    spawn_point_task_id?: TaskID
    children: SessionID[]

    // NEW: Quick reference to root
    root_session_id: SessionID      // Points to self if is_root
  }

  // NEW: Cached genealogy stats (only on root sessions)
  genealogy_stats?: {
    total_sessions: number         // Including self
    fork_count: number
    subtask_count: number
    max_depth: number
    last_updated: string
  }

  // Rest stays the same
  agent: AgenticToolName
  status: 'idle' | 'running' | 'completed' | 'failed'
  repo: { /* ... */ }
  tasks: TaskID[]
}
```

### Computed Properties

```typescript
// is_root is derived, not stored
is_root = !genealogy.forked_from_session_id && !genealogy.parent_session_id;

// root_session_id is set on creation:
// - If creating new session (no parent/fork): root_session_id = session_id
// - If forking/spawning: root_session_id = parent.root_session_id
```

### User Flows

**Creating a session (implicitly becomes root):**

```
User: [+ New Session]
  → Select agent
  → (Optional) Add name, issue URL
  → Start working
Result:
  - Session created with is_root = true
  - session_metadata can be added now or later
```

**Forking creates child session:**

```
User: [Fork] on Session A
Result:
  - Session B created with:
    - genealogy.forked_from_session_id = A
    - genealogy.root_session_id = A.root_session_id
    - is_root = false (computed)
  - Session A.genealogy_stats updated
```

**Promoting session to "named project":**

```
User has Session A with 2 forks
UI suggests: "🌳 Add project details?"
User clicks → Modal: Name + Issue URL
Result:
  - Session A.session_metadata updated
  - Now shows as "Auth System" instead of "Session 0199b856"
```

### Canvas Visualization

**Show only root sessions:**

```
Board displays:
  - Session A (root, has children) ← Show genealogy summary
  - Session B (root, no children)  ← Simple card
  - Session C (child of A)         ← NOT shown on canvas
```

**SessionCard for root with children:**

```
┌─ Session: Auth System ──────────────────────┐
│  Claude Code • Running • 3 tasks             │
│  Issue: #123  PR: #456                       │
│                                              │
│  🌳 5 sessions (2 forks, 3 subtasks)         │
│  ├─ OAuth Implementation (fork)              │
│  ├─ JWT Implementation (fork) → 1 fork       │
│  └─ DB Schema Design (subtask) → 1 fork      │
│                                              │
│  [View Full Tree] [Fork] [Subtask]           │
└──────────────────────────────────────────────┘
```

### Pros

✅ No new primitive (simpler data model)
✅ Root sessions are just "special sessions" (no artificial distinction)
✅ Natural progressive disclosure (start simple → add metadata later)
✅ Canvas filtering simple: `WHERE is_root = true`
✅ Flexible: Sessions can be "promoted" to have project metadata when needed
✅ One creation flow: "New Session" (less cognitive overhead)

### Cons

❌ Overloads Session concept (now has dual personality)
❌ Need to differentiate "root session metadata" vs "session metadata" in code
❌ Querying "all sessions in a project" = recursive tree traversal (performance?)
❌ Less clear conceptual boundary between "project" and "session"
❌ `session_metadata` field is nullable and only valid when `is_root = true` (code smell?)

---

## Option 3: Hybrid - Project as Lightweight Metadata Layer

### Data Model

```typescript
Project {
  project_id: ProjectID
  name: string

  // External References
  issue_url?: string
  pull_request_url?: string

  // Root session reference (single source of truth)
  root_session_id: SessionID

  // Computed/cached data (denormalized for performance)
  session_count: number          // Cached from genealogy
  status: 'active' | 'completed'

  created_at: string
}

Session {
  session_id: SessionID

  // NO direct project_id reference
  // Project relationship is inferred via genealogy

  genealogy: {
    forked_from_session_id?: SessionID
    parent_session_id?: SessionID
    children: SessionID[]
  }

  // ... rest stays the same
}
```

### Relationship Model

```
Project (metadata layer)
  ↓ (points to)
Session (root)
  ↓ (has children)
Session (fork) + Session (subtask)

Query: "Get all sessions for project X"
  1. Load project.root_session_id
  2. Recursively traverse session.genealogy.children
```

### Pros

✅ Project is just a "view" over session tree (minimal overhead)
✅ Sessions remain independent (no back-reference)
✅ Can create projects retroactively (point to existing root session)
✅ Single source of truth (genealogy)
✅ Clear separation: Project = metadata, Session = data

### Cons

❌ Querying all sessions = recursive tree traversal (no index)
❌ Deleting a project = orphaned sessions? Or cascade delete?
❌ No way to query "sessions without project" (since there's no project_id)
❌ Feels like indirection: why not just put metadata on root session?

---

## Genealogy Tree Visualization Patterns

Regardless of which option we choose, we need to visualize genealogy. Here are design patterns:

### Pattern A: Collapsible Tree Inline in SessionCard

```
┌─ Session: Auth System ─────────────────────────────┐
│  Claude Code • Running • 3 tasks                    │
│  Issue: #123  PR: #456                              │
│                                                     │
│  🌳 Genealogy Tree                                  │
│  ▼ Root: Auth System (this session)                │
│    ├─ ▶ Fork: OAuth Implementation                 │
│    ├─ ▼ Fork: JWT Implementation                   │
│    │   └─ ▶ Fork: JWT + Refresh Tokens             │
│    └─ ▼ Subtask: DB Schema Design                  │
│        └─ ▶ Fork: Postgres vs MySQL                │
│                                                     │
│  [Open Drawer] [Fork] [Subtask]                     │
└─────────────────────────────────────────────────────┘
```

**Interaction:**

- Click ▶ to expand child sessions inline
- Shows entire tree in card (can get very tall!)

**Pros:** Full genealogy at a glance
**Cons:** Cards become very tall, cluttered canvas

---

### Pattern B: Summary in Card + Full Tree in Drawer

**SessionCard (compact summary):**

```
┌─ Session: Auth System ──────────────────────┐
│  Claude Code • Running • 3 tasks             │
│  Issue: #123  PR: #456                       │
│                                              │
│  🌳 5 sessions (2 forks, 3 subtasks)         │
│  ├─ OAuth Implementation (fork)              │
│  ├─ JWT Implementation (fork) → 1 fork       │
│  └─ DB Schema Design (subtask) → 1 fork      │
│                                              │
│  [View Full Tree] [Fork] [Subtask]           │
└──────────────────────────────────────────────┘
```

**SessionDrawer (full recursive tree):**

```
┌─ Session Tree: Auth System ──────────────────────┐
│  [Tree Tab] [Conversation Tab] [Tasks Tab]       │
│                                                   │
│  ◉ Root: Auth System (Claude Code)               │
│  │  Running • 3 tasks • Issue #123               │
│  │  [Open Conversation →]                        │
│  │                                                │
│  ├─ Fork: OAuth Implementation (Codex)           │
│  │  Completed • 2 tasks                          │
│  │  Forked from: Task 1 "Design auth flow"       │
│  │  [Open →]                                      │
│  │                                                │
│  ├─ Fork: JWT Implementation (Claude Code)       │
│  │  Running • 4 tasks                            │
│  │  [Open →] [Fork] [Subtask]                    │
│  │                                                │
│  │  └─ Fork: JWT + Refresh Tokens (Gemini)       │
│  │     Completed • 1 task                        │
│  │     Forked from: Task 2 "Implement JWT"       │
│  │     [Open →]                                   │
│  │                                                │
│  └─ Subtask: DB Schema Design (Claude Code)      │
│     Completed • 2 tasks                          │
│     [Open →]                                      │
│                                                   │
│     └─ Fork: Postgres vs MySQL (Gemini)          │
│        Completed • 1 task                        │
│        [Open →]                                   │
└───────────────────────────────────────────────────┘
```

**Interaction:**

- Card shows summary (max 3 direct children)
- "View Full Tree" opens drawer with full recursive tree
- Tree is interactive (click session → drawer switches to that session)

**Pros:** Compact card, full detail in drawer
**Cons:** Requires click to see full tree

---

### Pattern C: Leverage Zones for Projects

```
Board has zones:
  - Zone: "Auth Project" (colored, labeled)
  - Pin root session + forks inside zone
  - Zone metadata contains issue_url, PR URL
  - Spatial clustering shows relationships
```

**Pros:** Uses existing zone system, visual clustering
**Cons:** Requires manual zone management, less structured

---

## Recursive Tree Implementation Considerations

### How Deep Should Recursion Display Go?

**Option 1: Show all levels in card preview**

- Risk: Card becomes 50+ lines tall

**Option 2: Show only direct children (depth = 1) in card**

- Summary: "OAuth (fork), JWT (fork) → 1 fork, DB Schema (subtask) → 1 fork"
- Full tree only in drawer

**Option 3: Show 2 levels in card, "+ N more" badge**

```
🌳 Genealogy
├─ OAuth impl (fork)
├─ JWT impl (fork)
│  └─ JWT + Refresh (fork)
└─ DB schema (subtask)
   └─ + 2 more sessions... [Expand]
```

### How to Handle Deep Nesting?

**Example: 10 levels of forks**

```
Session A
└─ Fork B
   └─ Fork C
      └─ Fork D
         └─ Fork E
            └─ Fork F (depth = 5!)
```

**Options:**

1. **Limit display depth** - Show first 3 levels, "+ N more at deeper levels"
2. **Virtual scrolling** - Only render visible tree nodes
3. **Collapse by default** - All children start collapsed, user expands

---

## Performance Considerations

### Query: "Get all sessions in genealogy tree"

**Naive approach (recursive):**

```typescript
function getAllSessions(rootId: SessionID): Session[] {
  const root = getSession(rootId);
  const children = root.genealogy.children.flatMap(childId => getAllSessions(childId));
  return [root, ...children];
}
// O(n) where n = total sessions in tree
// Requires n database queries (inefficient!)
```

**Optimized approach (denormalized cache):**

```typescript
// On root session, cache all descendant IDs
Session {
  genealogy_stats: {
    all_descendant_ids: SessionID[]  // Flat list of all children/grandchildren/etc.
    total_sessions: number
    last_updated: string
  }
}

// Query is now O(1):
function getAllSessions(rootId: SessionID): Session[] {
  const root = getSession(rootId);
  return getBulk(root.genealogy_stats.all_descendant_ids);
}
```

**Trade-off:** Update complexity when fork/subtask created

- Must update root session's `all_descendant_ids` array
- Propagate upwards if this is a nested fork

---

## Migration Considerations

### From Current Model to Option 1 (Project)

1. Create `projects` table
2. Add `project_id` to `sessions` table (nullable)
3. Migration script:
   - Find all root sessions (no parent/fork_from)
   - For each root with children → create Project
   - Link all descendants to project_id

### From Current Model to Option 2 (Root Session)

1. Add `session_metadata` JSONB column to `sessions` (nullable)
2. Add `genealogy_stats` JSONB column to `sessions` (nullable)
3. Add `root_session_id` to `genealogy` JSONB
4. Migration script:
   - Compute `root_session_id` for all sessions
   - Compute `genealogy_stats` for all root sessions
   - Existing sessions continue working (metadata optional)

---

## Open Questions

1. **Should non-root sessions ever appear on canvas?**
   - Recommendation: No, only via tree view in drawer

2. **How to handle "orphaned sessions"?**
   - If parent deleted but children exist → promote oldest child to root?

3. **What if user deletes root session?**
   - Cascade delete all children? Or promote first child to root?

4. **Should issue_url be required for roots, or optional?**
   - Recommendation: Optional (supports ad-hoc sessions)

5. **Can a session change from non-root to root?**
   - Example: Detach from parent, making it independent
   - Recommendation: Support via "Detach Session" action

6. **How to show session relationships across boards?**
   - If Session A (root) on Board X, but Fork B on Board Y → visualize link?

---

## Recommendation (As of 2025-10-18)

**Preference: Option 2 (Root Session Pattern)**

Based on user feedback:

- Simpler model (no new primitive)
- Less disruptive to existing architecture
- Natural progressive disclosure (start simple, add metadata later)
- Canvas filtering: Show only root sessions
- Genealogy tree: Summary in card + full tree in drawer

**Next steps:**

1. Prototype SessionCard genealogy summary UI
2. Design SessionDrawer recursive tree component
3. Update data model docs with `session_metadata` and `genealogy_stats`
4. Implement root session detection logic

---

## References

- [[models]] - Current Session data model
- [[core]] - Session primitive definition
- [[worktree-ux-design]] - Related worktree UX patterns
- [[board-objects]] - Zone system (alternative for project clustering)
