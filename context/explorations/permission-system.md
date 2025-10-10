# Permission System for Agor

## Overview

This document explores how to implement a permission/approval system in Agor that recreates the Claude Code CLI experience using the Claude Agent SDK's hook system.

## Research: SDK Permission Mechanisms

### PreToolUse Hook

The Claude Agent SDK provides a `PreToolUse` hook that intercepts tool execution before it runs:

```typescript
type PreToolUseHookInput = BaseHookInput & {
  hook_event_name: 'PreToolUse';
  tool_name: string;
  tool_input: ToolInput;
};

type HookCallback = (
  input: HookInput,
  toolUseID: string | undefined,
  options: { signal: AbortSignal }
) => Promise<HookJSONOutput>;
```

**Hook Output:**

```typescript
hookSpecificOutput: {
  hookEventName: 'PreToolUse';
  permissionDecision?: 'allow' | 'deny' | 'ask';
  permissionDecisionReason?: string;
}
```

### Permission Modes (from Claude Code CLI)

1. **Normal Mode** - Requires user confirmation for each action
2. **Auto-Accept Mode** - Eliminates confirmation prompts (`shift+tab` to toggle, or `--dangerously-skip-permissions` flag)
3. **Per-Tool Configuration** - Allow/deny lists for specific tools

### Available Hook Types

- `PreToolUse` - Before tool execution (for permission checks)
- `PostToolUse` - After tool execution
- `UserPromptSubmit` - When user sends prompt
- `SessionStart` / `SessionEnd` - Session lifecycle
- `Notification` - For progress updates
- `Stop` / `SubagentStop` - Interruption handling
- `PreCompact` - Before context compaction

### SDK Configuration Options

- `allowedTools`: Explicitly permit specific tools
- `disallowedTools`: Block specific tools
- `permissionMode`: Set overall permission strategy

## Implementation Architecture

### Phase 1: Backend Hook Infrastructure

#### 1. Add Hook Support to ClaudePromptService

**File:** `packages/core/src/tools/claude/prompt-service.ts`

**Changes:**

- Add `hooks` option to `setupQuery()` method
- Create `PreToolUseHookCallback` type matching SDK signature
- Pass custom hook that emits WebSocket events when tools need approval

**Hook Implementation:**

```typescript
const preToolUseHook = async (
  input: PreToolUseHookInput,
  toolUseID: string | undefined,
  options: { signal: AbortSignal }
): Promise<HookJSONOutput> => {
  // Emit WebSocket event: permission:request
  const requestId = generateId();
  await permissionService.requestPermission(sessionId, {
    requestId,
    toolName: input.tool_name,
    toolInput: input.tool_input,
    toolUseID,
  });

  // Wait for UI response (Promise resolves when user decides)
  const decision = await permissionService.waitForDecision(requestId, options.signal);

  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision.allow ? 'allow' : 'deny',
      permissionDecisionReason: decision.reason,
    },
  };
};
```

#### 2. Create Permission Service

**File:** `packages/core/src/tools/claude/permission-service.ts`

**Responsibilities:**

- Manage pending permission requests (in-memory map)
- Emit WebSocket events for permission requests
- Wait for and resolve permission decisions
- Handle timeout/cancellation via AbortSignal

**Types:**

```typescript
interface PermissionRequest {
  requestId: string;
  sessionId: SessionID;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolUseID?: string;
  timestamp: string;
}

interface PermissionDecision {
  requestId: string;
  allow: boolean;
  reason?: string;
  remember: boolean;
  scope: 'once' | 'session' | 'global';
}
```

**API:**

```typescript
class PermissionService {
  // Emit request and return promise that resolves when user decides
  async requestPermission(
    sessionId: SessionID,
    request: Omit<PermissionRequest, 'sessionId' | 'timestamp'>
  ): Promise<void>;

  // Wait for decision (used by hook)
  async waitForDecision(requestId: string, signal: AbortSignal): Promise<PermissionDecision>;

  // Resolve pending request (called by daemon when UI responds)
  resolvePermission(decision: PermissionDecision): void;
}
```

#### 3. Wire Through Daemon

**File:** `apps/agor-daemon/src/services/sessions.ts`

**Custom Method:**

```typescript
// POST /sessions/:id/permission-decision
async permissionDecision(id: SessionID, data: PermissionDecision) {
  // Resolve the pending permission request
  permissionService.resolvePermission(data);
  return { success: true };
}
```

**WebSocket Event:**

```typescript
// Emitted when permission is requested
{
  type: 'permission:request',
  sessionId: string,
  requestId: string,
  toolName: string,
  toolInput: Record<string, unknown>,
  timestamp: string
}
```

### Phase 2: UI Permission Prompt Component

#### 4. Create PermissionModal Component

**File:** `apps/agor-ui/src/components/PermissionModal/PermissionModal.tsx`

**UI Elements:**

- **Header:** "🛡️ Permission Required"
- **Session Context:** Which session is requesting (session ID, agent icon)
- **Tool Info:** Tool name displayed prominently
- **Tool Input:** Formatted JSON/code display of parameters
- **Action Buttons:**
  - **Allow Once** (primary button)
  - **Always Allow This Tool** (with scope dropdown: session/global)
  - **Deny** (danger button)
- **Remember Checkbox:** "Remember my decision for this session"
- **Reason Field:** Optional text input if denying

**Example:**

```
┌─────────────────────────────────────────┐
│ 🛡️ Permission Required                  │
├─────────────────────────────────────────┤
│ Session: claude-code (0199b856)         │
│                                          │
│ Tool: Bash                               │
│                                          │
│ Command:                                 │
│ ┌─────────────────────────────────────┐ │
│ │ git commit -m "Add feature X"       │ │
│ │                                     │ │
│ │ Working Directory: /path/to/repo   │ │
│ └─────────────────────────────────────┘ │
│                                          │
│ ☐ Remember for this session             │
│                                          │
│ [ Deny ]  [ Always Allow ]  [ Allow ] │
└─────────────────────────────────────────┘
```

#### 5. Add Permission State Management

**File:** `apps/agor-ui/src/hooks/usePermissions.ts`

**Hook API:**

```typescript
function usePermissions(client: AgorClient | null) {
  // Current pending request (null if none)
  const [pendingRequest, setPendingRequest] = useState<PermissionRequest | null>(null);

  // Queue of pending requests (handle multiple sessions)
  const [requestQueue, setRequestQueue] = useState<PermissionRequest[]>([]);

  // User preferences (auto-allow lists)
  const [autoAllowList, setAutoAllowList] = useState<Set<string>>(new Set());

  // Listen for permission:request WebSocket events
  useEffect(() => {
    if (!client) return;

    const handleRequest = (request: PermissionRequest) => {
      // Check auto-allow list first
      if (autoAllowList.has(request.toolName)) {
        sendDecision(request.requestId, true, false, 'once');
        return;
      }

      // Add to queue
      setRequestQueue(prev => [...prev, request]);
    };

    client.on('permission:request', handleRequest);
    return () => client.off('permission:request', handleRequest);
  }, [client, autoAllowList]);

  // Send decision to backend
  const sendDecision = async (
    requestId: string,
    allow: boolean,
    remember: boolean,
    scope: 'once' | 'session' | 'global',
    reason?: string
  ) => {
    await client.service(`sessions/${request.sessionId}/permission-decision`).create({
      requestId,
      allow,
      remember,
      scope,
      reason,
    });

    // Update auto-allow list if remembering
    if (remember && allow) {
      if (scope === 'global') {
        setAutoAllowList(prev => new Set([...prev, request.toolName]));
      }
      // TODO: Store per-session rules
    }

    // Remove from queue
    setRequestQueue(prev => prev.filter(r => r.requestId !== requestId));
  };

  return { pendingRequest, requestQueue, sendDecision };
}
```

#### 6. Integrate with SessionDrawer

**File:** `apps/agor-ui/src/components/SessionDrawer/SessionDrawer.tsx`

**Changes:**

- Add `usePermissions()` hook
- Show `PermissionModal` when `pendingRequest` exists
- Display "⚠️ Waiting for permission..." indicator in conversation view
- Auto-scroll to show blocked tool use with pending state

### Phase 3: Permission Configuration

#### 7. Add Permission Settings UI (Future)

**Location:** Settings Modal > Permissions Tab

**Features:**

- **Global Allow List:** Table of tools that never require approval
- **Global Deny List:** Tools that are always blocked
- **Per-Session Overrides:** View and edit session-specific rules
- **Permission Mode Toggle:** Normal / Auto-Accept (with warning)
- **Reset Rules:** Clear all permission preferences

**Storage:**

- Global rules → `~/.agor/config.json` (`permissions` section)
- Session rules → Session metadata in database

### Phase 4: Enhanced UX

#### 8. Tool Preview in Conversation

**File:** `apps/agor-ui/src/components/ToolUseRenderer/ToolUseRenderer.tsx`

**States:**

- **Pending Approval:** Badge "⏸️ Awaiting Permission" (yellow)
- **Approved:** Badge "✓ Allowed" (green, auto-hide after 2s)
- **Denied:** Badge "✗ Blocked" (red) + denial reason tooltip
- **Running:** Badge "⚡ Executing..." (blue)
- **Completed:** Normal tool result display

#### 9. Permission History

**Future Enhancement:**

- Store all permission decisions in database
- Add `permission_history` table:
  ```typescript
  {
    permission_id: UUID,
    session_id: SessionID,
    tool_name: string,
    tool_input: Record<string, unknown>,
    decision: 'allow' | 'deny',
    reason?: string,
    scope: 'once' | 'session' | 'global',
    timestamp: string,
  }
  ```
- Display in SessionDrawer sidebar tab
- Allow "Undo" for auto-allow rules

## Benefits

✅ **Recreates Claude Code CLI Experience** - Uses same PreToolUse hook mechanism
✅ **Better Control** - Visual approval with full context
✅ **Safety** - Prevents dangerous operations (bash, file writes, network)
✅ **Flexibility** - Per-session, per-tool, or global rules
✅ **Real-time** - WebSocket-based, instant UI updates
✅ **Multi-session Support** - Handle multiple sessions requesting permissions simultaneously
✅ **User-Friendly** - Clear UI with formatted tool inputs, not just JSON
✅ **Auditable** - Complete permission history for compliance/debugging

## Security Considerations

### High-Risk Tools

Tools that should default to requiring approval:

- **Bash** - Arbitrary command execution
- **Write** - File system modifications
- **Edit** - Code changes
- **WebFetch** - Network requests (potential data exfiltration)
- **Git** - Version control operations (especially push/commit)

### Low-Risk Tools

Tools that could be auto-allowed by default:

- **Read** - File reading (read-only)
- **Glob** - File pattern matching (read-only)
- **Grep** - Content search (read-only)

### Dangerous Operations

Special handling for:

- **`rm -rf`** - Always require confirmation with warning
- **`git push`** - Show diff and require explicit approval
- **Network writes** - Show destination URL
- **`sudo` commands** - Show clear warning about elevated privileges

## Technical Implementation Notes

### WebSocket Event Flow

1. **Agent attempts tool use** → SDK calls `PreToolUse` hook
2. **Hook emits WebSocket event** → `permission:request` sent to UI
3. **UI shows modal** → User makes decision
4. **UI sends decision** → `POST /sessions/:id/permission-decision`
5. **Hook resolves promise** → Returns `allow`/`deny` to SDK
6. **SDK continues/blocks** → Based on decision

### Timeout Handling

- Default timeout: 60 seconds
- If timeout expires → Deny by default (fail-safe)
- Use `AbortSignal` to cancel pending requests if session closes

### Race Conditions

- Use request ID to track specific requests
- Queue multiple requests if they arrive simultaneously
- Show count indicator: "3 pending permissions"

### Performance

- In-memory map for pending requests (no database overhead)
- WebSocket events for instant updates (no polling)
- Automatic cleanup of resolved requests

## Future Enhancements

### Smart Defaults

- Learn from user decisions (ML-based recommendations)
- Suggest auto-allow for frequently approved tools
- Warn about unusual tool patterns

### Team Policies

- Company-wide permission rules (V2 - Cloud)
- Enforce deny lists across organization
- Audit trail for compliance

### Context-Aware Permissions

- Different rules for different repos
- Branch-specific permissions (allow write on feature/, deny on main/)
- Time-based rules (restrict after-hours operations)

## References

- [Claude Agent SDK TypeScript Reference](https://docs.claude.com/en/api/agent-sdk/typescript)
- [Claude Code Permissions Guide](https://docs.claude.com/en/docs/claude-code/security)
- [Building Agents with Claude SDK](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk)

---

**Status:** Exploration
**Next Steps:** Add to PROJECT.md roadmap after fork/spawn implementation
**Dependencies:** Current live execution via Agent SDK (already implemented)
