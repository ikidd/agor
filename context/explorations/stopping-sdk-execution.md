# Stopping SDK Execution - Implementation Plan

**Status:** ✅ Deep Research Complete - Ready for Implementation
**Created:** 2025-10-18
**Updated:** 2025-10-18 (Added comprehensive SDK research)
**Context:** Users need ability to stop long-running agent tasks (Stop button in UI)

---

## 🔍 RESEARCH SUMMARY - ✅ NATIVE CANCELLATION FOUND!

**CRITICAL UPDATE:** After examining the actual SDK type definitions, I found native cancellation support!

| SDK        | Cancellation Method                  | Complexity | Implementation                     |
| ---------- | ------------------------------------ | ---------- | ---------------------------------- |
| **Claude** | ✅ **`query.interrupt()`** (NATIVE!) | **EASY**   | Call `interrupt()` on Query object |
| **Gemini** | ✅ **AbortController** (built-in)    | **EASY**   | Already in code! Call `abort()`    |
| **Codex**  | ⚠️ Break async generator loop        | **MEDIUM** | No native cancel in public API     |

### Key Findings:

**1. Claude Agent SDK** ✅ **BEST SUPPORT**

- Has native `interrupt()` method on the Query interface!
- This is exactly what powers the "Escape key" in Claude Code CLI
- Also supports `abortController` in options
- Hooks receive `AbortSignal` for cancellation detection

**2. Google Gemini SDK** ✅ **ALREADY IMPLEMENTED**

- AbortController already in our code (line 102)
- Just need to store reference and call `abort()`

**3. OpenAI Codex SDK** ⚠️ **NO NATIVE SUPPORT**

- Thread class has `run()` and `runStreamed()`
- No public `cancel()` or `stop()` method exposed
- Must use break-loop pattern

---

## DETAILED SDK RESEARCH

## Problem Statement

When an agent is executing a task (responding to a prompt), users may need to stop execution for various reasons:

1. **Task taking too long** - Agent stuck in a loop or exploring wrong path
2. **Wrong prompt sent** - User realizes they made a mistake in the prompt
3. **Context changed** - User wants to pivot to different approach
4. **Resource management** - Agent consuming too many tokens/API calls
5. **Debugging/Testing** - Developer wants to test stop functionality

**Current State:**

- UI has stop button (disabled when not running, enabled when running)
- Stop button is noop with TODO comment
- No `stopTask()` method in ITool interface
- Session status tracks running state, but no way to interrupt execution

## Design Considerations

### 1. Stop Method Location

**Option A: Add to ITool interface (Recommended)**

```typescript
interface ITool {
  // ... existing methods ...

  /**
   * Stop currently executing task in session
   *
   * Gracefully terminates the agent's current execution.
   * Implementation varies by SDK:
   * - Claude Agent SDK: Send SIGINT to subprocess
   * - Codex SDK: Call abort() on SDK client
   * - Gemini SDK: Cancel streaming request
   *
   * @param sessionId - Session identifier
   * @param taskId - Optional task ID to stop (if multiple tasks running)
   * @returns Success status and partial results if available
   */
  stopTask?(
    sessionId: string,
    taskId?: string
  ): Promise<{
    success: boolean;
    partialResult?: Partial<TaskResult>;
    reason?: string;
  }>;
}
```

**Option B: Separate lifecycle management**

- Add SessionLifecycle interface with start/stop/pause/resume
- Overkill for MVP, consider for future

### 2. SDK-Specific Implementation Approaches

#### Claude Agent SDK (claude-code)

**Challenge:** SDK spawns subprocess, no built-in abort mechanism

**Approach 1: Process Signal (Recommended)**

```typescript
// In ClaudeTool class
private activeProcesses = new Map<string, ChildProcess>();

async executeTask(sessionId, prompt, taskId, callbacks) {
  const process = spawn('npx', ['@anthropic-ai/agent-sdk', ...]);
  this.activeProcesses.set(sessionId, process);

  try {
    // ... execution logic ...
  } finally {
    this.activeProcesses.delete(sessionId);
  }
}

async stopTask(sessionId: string) {
  const process = this.activeProcesses.get(sessionId);
  if (!process) {
    return { success: false, reason: 'No active process found' };
  }

  // Send SIGINT (Ctrl+C equivalent)
  process.kill('SIGINT');

  // Wait for graceful shutdown (max 5s)
  await Promise.race([
    new Promise(resolve => process.on('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 5000))
  ]);

  // Force kill if still running
  if (!process.killed) {
    process.kill('SIGKILL');
  }

  return { success: true };
}
```

**Approach 2: Stdin Command**

- Check if SDK accepts stop command via stdin
- Research: Does Claude Agent SDK have interactive mode with commands?

**Approach 3: SDK Enhancement Request**

- File issue with Anthropic to add abort() method to SDK
- Long-term solution, not viable for MVP

#### OpenAI Codex SDK

**Challenge:** Need to verify abort mechanism in Codex SDK

**Research Needed:**

- Does Codex SDK expose abort/cancel methods?
- Is execution async with AbortController support?
- Can we interrupt streaming responses?

**Possible Implementation:**

```typescript
// If SDK supports AbortController
private abortControllers = new Map<string, AbortController>();

async executeTask(sessionId, prompt, taskId, callbacks) {
  const controller = new AbortController();
  this.abortControllers.set(sessionId, controller);

  try {
    await codexClient.executeTask({
      prompt,
      signal: controller.signal // Pass abort signal
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      // Expected cancellation
    }
  } finally {
    this.abortControllers.delete(sessionId);
  }
}

async stopTask(sessionId: string) {
  const controller = this.abortControllers.get(sessionId);
  if (!controller) {
    return { success: false, reason: 'No active task found' };
  }

  controller.abort();
  return { success: true };
}
```

#### Google Gemini SDK

**Challenge:** Streaming API cancellation

**Research Needed:**

- Does Gemini SDK support request cancellation?
- Can we abort streaming responses mid-generation?

**Possible Implementation:**

```typescript
// If using fetch with AbortController
async executeTask(sessionId, prompt, taskId, callbacks) {
  const controller = new AbortController();
  this.abortControllers.set(sessionId, controller);

  try {
    const response = await fetch(GEMINI_ENDPOINT, {
      signal: controller.signal,
      // ... other options
    });

    // Stream handling
    for await (const chunk of response.body) {
      // ... process chunks
    }
  } finally {
    this.abortControllers.delete(sessionId);
  }
}
```

### 3. Task Status After Stop

**Question:** What should task status be after stopping?

**Option A: New Status 'stopped'**

```typescript
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'stopped'; // NEW
```

**Option B: Use 'failed' with reason**

```typescript
// Mark task as failed with specific reason
await tasksService.patch(taskId, {
  status: 'failed',
  error: 'Stopped by user',
  stop_reason: 'user_requested',
});
```

**Option C: Use 'completed' with partial flag**

```typescript
await tasksService.patch(taskId, {
  status: 'completed',
  partial: true,
  stop_reason: 'user_requested',
});
```

**Recommendation:** Option A - explicit 'stopped' status

- Clear semantic meaning
- Allows filtering stopped vs failed tasks
- UI can show different badge color (orange?)

### 4. Partial Results Handling

**Question:** What to do with partial execution results?

**Scenarios:**

1. **No messages created yet** - Task just started
2. **User message created** - Agent hasn't responded
3. **Partial assistant message** - Agent in middle of streaming response
4. **Complete assistant message** - Agent finished one turn, working on second

**Recommendation:**

```typescript
// Save partial results if any messages were created
const partialResult = {
  userMessageId: existingUserMessageId,
  assistantMessageIds: completedAssistantMessages,
  partialContent: streamingBuffer, // If stopped mid-stream
};

// Update task with partial data
await tasksService.patch(taskId, {
  status: 'stopped',
  message_range: {
    start_index: messageStartIndex,
    end_index: messageStartIndex + completedMessages.length,
    start_timestamp,
    end_timestamp: new Date().toISOString(),
  },
  tool_use_count: countToolsFromMessages(completedMessages),
  partial: true,
});
```

### 5. Session Status After Stop

**Current behavior:**

- Session status = 'running' when task starts
- Session status = 'idle' when task completes/fails

**After stop:**

- Session status should return to 'idle'
- User can immediately send new prompt or retry

### 6. UI/UX Considerations

#### Stop Button Behavior

```typescript
// In SessionDrawer.tsx
const handleStop = async () => {
  if (!session || !client) return;

  try {
    setIsStopping(true);

    await client.service(`sessions/${session.session_id}/stop`).create({});

    message.success('Task stopped successfully');
  } catch (error) {
    message.error(`Failed to stop task: ${error.message}`);
  } finally {
    setIsStopping(false);
  }
};

// Button UI
<Tooltip title={isStopping ? "Stopping..." : "Stop Execution"}>
  <Button
    danger
    icon={<StopOutlined />}
    onClick={handleStop}
    disabled={!isRunning}
    loading={isStopping}
  />
</Tooltip>
```

#### Confirmation Dialog

**Question:** Should we confirm before stopping?

**Option A: Always confirm (Recommended for MVP)**

```typescript
Modal.confirm({
  title: 'Stop Task Execution?',
  content: 'This will interrupt the agent mid-task. Any partial progress will be saved.',
  onOk: async () => {
    await handleStop();
  },
});
```

**Option B: No confirmation (faster UX)**

- Trust user knows what they're doing
- Can always resume/retry

**Option C: Setting-based**

- Add preference in session settings
- "Confirm before stopping tasks"

### 7. WebSocket Events

**New events to broadcast:**

```typescript
// When stop requested
app.service('tasks').emit('task:stop-requested', {
  session_id: sessionId,
  task_id: taskId,
  requested_by: userId,
  timestamp: new Date().toISOString(),
});

// When stop completed
app.service('tasks').emit('task:stopped', {
  session_id: sessionId,
  task_id: taskId,
  partial_result: partialResult,
  timestamp: new Date().toISOString(),
});
```

**UI subscribes and updates:**

```typescript
client.service('tasks').on('task:stopped', data => {
  // Update UI to show stopped state
  // Re-enable input, show partial results
});
```

## Implementation Plan

### Phase 1: Core Infrastructure (MVP)

1. Add `stopTask()` method to ITool interface
2. Add 'stopped' status to TaskStatus enum
3. Add `/sessions/:id/stop` endpoint in daemon
4. Implement ClaudeTool.stopTask() with process signals
5. Update session status handling for stop events
6. Wire up stop button in UI to call endpoint
7. Add confirmation dialog

### Phase 2: Enhanced Stop Handling

1. Save partial streaming content when stopped
2. Add stop reason tracking to task records
3. Implement Codex SDK stop (research needed)
4. Implement Gemini SDK stop (research needed)

### Phase 3: Advanced Features

1. Stop multiple tasks in session (if concurrent execution added)
2. Stop all tasks in board/zone
3. Stop with retry option (stop and auto-restart with modified prompt)
4. Analytics: track stop frequency, common stop points

## Research Questions

1. **Claude Agent SDK:**
   - Does SDK handle SIGINT gracefully?
   - Does it flush partial output before exiting?
   - Any built-in stop mechanism we're missing?

2. **Codex SDK:**
   - AbortController support?
   - Built-in cancel/abort methods?
   - Streaming response cancellation?

3. **Gemini SDK:**
   - Request cancellation mechanism?
   - Streaming interruption handling?

4. **General:**
   - Should we support pause/resume in addition to stop?
   - How to handle stop during tool execution (file writes, git commits)?
   - Should stopped tasks be resumable?

## Testing Strategy

1. **Unit Tests:**
   - Mock process spawning and test SIGINT
   - Test AbortController cancellation
   - Verify status transitions

2. **Integration Tests:**
   - Stop task during streaming
   - Stop task before first message
   - Stop task after partial execution
   - Multiple rapid start/stop cycles

3. **Manual Testing:**
   - Stop during long file read
   - Stop during git operation
   - Stop during multi-turn conversation
   - Stop with different permission modes

## References

- Node.js Process Signals: https://nodejs.org/api/process.html#process_signal_events
- AbortController API: https://developer.mozilla.org/en-US/docs/Web/API/AbortController
- Claude Agent SDK Docs: https://docs.claude.com/en/api/agent-sdk/python
- OpenAI Codex SDK Docs: https://developers.openai.com/codex/sdk
- Vercel AI SDK - Stopping Streams: https://ai-sdk.dev/docs/advanced/stopping-streams

---

## APPENDIX: DETAILED SDK FINDINGS (2025-10-18)

### Claude Agent SDK - ✅ NATIVE `interrupt()` Method!

**SDK Method:** `query()` returns `Query` interface extending `AsyncGenerator<SDKMessage>`

**Research Findings:**

- ✅ **Has native `interrupt()` method!** (This is what Escape key uses!)
- ✅ **Has `abortController` option** in query options
- ✅ PreToolUse hooks receive `{ signal: AbortSignal }` parameter
- ✅ SDK emits `Stop` and `SubagentStop` hook events when execution stops
- ✅ Can also be stopped by breaking the `for await` loop

**TypeScript Definition:**

```typescript:node_modules/@anthropic-ai/claude-agent-sdk/sdkTypes.d.ts
export interface Query extends AsyncGenerator<SDKMessage, void> {
    /**
     * Control Requests
     * The following methods are control requests, and are only supported when
     * streaming input/output is used.
     */
    interrupt(): Promise<void>;  // ← THIS IS IT!
    setPermissionMode(mode: PermissionMode): Promise<void>;
    setModel(model?: string): Promise<void>;
    // ... other control methods
}

export type Options = {
    abortController?: AbortController;  // ← ALSO SUPPORTED!
    // ... other options
}
```

**Current Agor Code:**

```typescript:packages/core/src/tools/claude/prompt-service.ts
// Line 611: query() returns Query interface
const result = query({
  prompt,
  options: options as any,
});

// Line 756: Consuming async generator
for await (const msg of result) {
  // Process messages
}
```

**Stop Mechanism (NATIVE!):**

1. Store reference to the `Query` object (NOT just generator!) per task
2. Call `await query.interrupt()` when user clicks stop
3. SDK gracefully stops execution (preserves context like Escape key)
4. Optionally: Pass `abortController` in options for even more control

### OpenAI Codex SDK - Event Streaming Cancellation

**SDK Method:** `thread.runStreamed(prompt)` returns `{ events: AsyncGenerator }`

**Research Findings:**

- ❌ No official `AbortController` support documented
- ✅ Returns async generator of events (`turn.started`, `item.updated`, etc.)
- ⚠️ Community reports: Stop/cancel is a requested feature (#1215, #3836)
- ✅ Can be stopped by breaking the `for await` loop

**Current Agor Code:**

```typescript:packages/core/src/tools/codex/prompt-service.ts
// Line 326: Get events generator
const { events } = await thread.runStreamed(prompt);

// Line 343: Consume events
for await (const event of events) {
  // Process events
}
```

**Stop Mechanism:**

1. Store reference to `events` generator per task
2. Set `stopRequested` flag when stop is called
3. Check flag in loop and `break` if true
4. Future: Investigate if `thread.cancel()` method exists

### Google Gemini SDK - AbortController Support ✅

**SDK Method:** `client.sendMessageStream(parts, signal, promptId)`

**Research Findings:**

- ✅ **Built-in AbortController support!** (2nd parameter)
- ✅ Already implemented in our code at line 102!
- ⚠️ GitHub issues mention cancellation token is requested but not fully stable
- ✅ Standard JavaScript pattern for stream cancellation

**Current Agor Code:**

```typescript:packages/core/src/tools/gemini/prompt-service.ts
// Line 102: AbortController ALREADY CREATED!
const abortController = new AbortController();

// Line 109: Signal passed to SDK!
const stream = client.sendMessageStream(parts, abortController.signal, promptId);
```

**Stop Mechanism:**

1. ✅ Infrastructure already in place!
2. Store reference to `abortController` per task
3. Call `abortController.abort()` when stop is requested
4. SDK automatically throws `AbortError` and stops streaming

### AbortController Best Practices (2025 Standards)

From JavaScript community research:

**Basic Pattern:**

```typescript
const controller = new AbortController();

try {
  for await (const chunk of streamingAPI(controller.signal)) {
    // Process chunk
    if (shouldStop) {
      controller.abort();
      break;
    }
  }
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('✅ Stream cancelled gracefully');
  } else {
    throw error;
  }
}
```

**Event Listener Approach:**

```typescript
controller.signal.addEventListener('abort', () => {
  console.log('Abort signal received');
  // Cleanup resources
});
```

**Timeout with Abort:**

```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

try {
  await operation(controller.signal);
} finally {
  clearTimeout(timeout);
}
```

### Unified Implementation Pattern

**Recommended Architecture:**

```typescript
// 1. Active execution tracking (all SDKs)
interface ActiveExecution {
  taskId: TaskID;
  sessionId: SessionID;
  startedAt: number;
  stopRequested: boolean;

  // SDK-specific abort mechanisms
  abortController?: AbortController; // For Gemini
  generator?: AsyncGenerator;        // For Claude/Codex
}

private activeExecutions = new Map<TaskID, ActiveExecution>();

// 2. Track at execution start
this.activeExecutions.set(taskId, {
  taskId,
  sessionId,
  startedAt: Date.now(),
  stopRequested: false,
  abortController, // Gemini
  // OR
  generator: result, // Claude/Codex
});

// 3. Check in loop
for await (const event of stream) {
  if (this.shouldStop(taskId)) {
    console.log(`🛑 Stop requested for ${taskId}`);
    break;
  }
  // Process event
}

// 4. Cleanup
finally {
  this.activeExecutions.delete(taskId);
}

// 5. Stop method
async stopTask(taskId: TaskID): Promise<boolean> {
  const execution = this.activeExecutions.get(taskId);
  if (!execution) return false;

  execution.stopRequested = true;

  if (execution.abortController) {
    execution.abortController.abort(); // Gemini
  }

  return true;
}
```

---

## IMPLEMENTATION TIMELINE

**Estimated Effort:** 8-12 hours (1-1.5 days)

**Breakdown:**

1. **Core Infrastructure** (1-2h)
   - Add `stopTask()` to ITool interface
   - Add active execution tracking to base classes

2. **Gemini Implementation** (1h) ✅ EASIEST
   - Store AbortController reference
   - Add stopTask() method
   - Test abort functionality

3. **Claude Implementation** (2h)
   - Add generator tracking
   - Add stop flag checking in loop
   - Test break behavior

4. **Codex Implementation** (2h)
   - Add event generator tracking
   - Add stop flag checking
   - Research thread.cancel() if available

5. **Daemon Service** (1h)
   - Add `/tasks/:id/stop` endpoint
   - WebSocket event handling
   - Status update logic

6. **UI Integration** (1-2h)
   - Wire stop button to API
   - Add cancelled/cancelling states
   - Update status badges

7. **Testing** (2-3h)
   - Test each SDK separately
   - Test edge cases (stop during permission, etc.)
   - Test multiplayer scenarios

---

## NEXT STEPS

1. ✅ Review this research with team
2. Start with **Gemini** (already has AbortController!)
3. Apply learnings to Claude and Codex
4. Add comprehensive logging for debugging
5. Document any SDK quirks discovered during implementation
