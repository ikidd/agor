# Board Objects (Canvas Annotations)

**Status:** ✅ Implemented (Phase 1 Complete)
**Related:** [models.md](./models.md), [architecture.md](./architecture.md), [design.md](./design.md)

---

## Overview

Board Objects are visual annotations for React Flow canvases that complement sessions with supporting context. Think of them as "sticky notes" or "zone markers" on a whiteboard.

**Current Features:**

- **Text Labels** - Inline-editable text annotations with font size and color controls
- **Zone Rectangles** - Resizable colored regions for organizing sessions visually
- **Real-time Sync** - WebSocket broadcasting keeps all clients in sync
- **Atomic Updates** - Concurrency-safe per-object operations

**Use Cases:**

- Document decisions and add notes
- Create headings and section labels
- Organize sessions into visual regions (Kanban columns, status zones, feature areas)
- Mark areas by phase, status, or team

---

## Implementation Summary

### What We Built

Board objects are stored in `board.objects` as a JSON dictionary with atomic backend operations to prevent concurrent write conflicts.

**Data Model** (`packages/core/src/types/board.ts`):

```typescript
export type BoardObjectType = 'text' | 'zone';

export interface TextBoardObject {
  type: 'text';
  x: number;
  y: number;
  content: string;
  fontSize?: number; // Default: 24px
  color?: string; // Text color
  background?: string;
}

export interface ZoneBoardObject {
  type: 'zone';
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  color?: string; // Border/background color
  status?: string; // Future: for Kanban workflows
}

export type BoardObject = TextBoardObject | ZoneBoardObject;

export interface Board {
  // ... other fields ...

  objects?: {
    [objectId: string]: BoardObject;
  };

  layout?: {
    [sessionId: string]: { x: number; y: number };
  };
}
```

**Key Design Decisions:**

1. **Object IDs**: Simple timestamp-based IDs (`text-{timestamp}`, `zone-{timestamp}`)
2. **Storage**: JSON blob in `boards.data` field (no schema migration needed)
3. **Updates**: Atomic per-object operations via `_action` parameter
4. **Concurrency**: Read-modify-write pattern with optimistic updates

---

## Backend Architecture

### Repository Layer

**File:** `packages/core/src/db/repositories/boards.ts`

```typescript
export class BoardRepository {
  /**
   * Atomically add or update a board object
   * Uses read-modify-write with SQLite's single-writer guarantee
   */
  async upsertBoardObject(
    boardId: string,
    objectId: string,
    objectData: BoardObject
  ): Promise<Board> {
    const fullId = await this.resolveId(boardId);
    const current = await this.findById(fullId);
    if (!current) {
      throw new EntityNotFoundError('Board', boardId);
    }

    // Merge new object into existing objects
    const updatedObjects = { ...(current.objects || {}), [objectId]: objectData };

    // Use standard update() for proper serialization
    return this.update(fullId, { objects: updatedObjects });
  }

  /**
   * Atomically remove a board object
   */
  async removeBoardObject(boardId: string, objectId: string): Promise<Board> {
    const fullId = await this.resolveId(boardId);
    const current = await this.findById(fullId);
    if (!current) {
      throw new EntityNotFoundError('Board', boardId);
    }

    const updatedObjects = { ...(current.objects || {}) };
    delete updatedObjects[objectId];

    return this.update(fullId, { objects: updatedObjects });
  }

  /**
   * Batch upsert multiple objects (sequential atomic updates)
   */
  async batchUpsertBoardObjects(
    boardId: string,
    objects: Record<string, BoardObject>
  ): Promise<Board> {
    const fullId = await this.resolveId(boardId);
    const current = await this.findById(fullId);
    if (!current) {
      throw new EntityNotFoundError('Board', boardId);
    }

    // Merge all object updates at once
    const updatedObjects = { ...(current.objects || {}), ...objects };

    return this.update(fullId, { objects: updatedObjects });
  }
}
```

**Concurrency Strategy:**

- SQLite's single-writer lock ensures atomic updates
- Each operation does read-modify-write with the lock held
- Optimistic updates in UI + server-side persistence
- WebSocket broadcasts keep all clients in sync

### Service Layer

**File:** `apps/agor-daemon/src/index.ts`

Custom `_action` parameter in patch hook routes to atomic methods:

```typescript
app.service('boards').hooks({
  before: {
    patch: [
      async context => {
        const { _action, objectId, objectData, objects } = context.data || {};

        if (_action === 'upsertObject' && objectId && objectData) {
          const result = await boardsService.upsertBoardObject(context.id, objectId, objectData);
          context.result = result;
          // Manually emit 'patched' event for WebSocket broadcasting
          app.service('boards').emit('patched', result);
          return context;
        }

        if (_action === 'removeObject' && objectId) {
          const result = await boardsService.removeBoardObject(context.id, objectId);
          context.result = result;
          app.service('boards').emit('patched', result);
          return context;
        }

        if (_action === 'batchUpsertObjects' && objects) {
          const result = await boardsService.batchUpsertBoardObjects(context.id, objects);
          context.result = result;
          app.service('boards').emit('patched', result);
          return context;
        }

        return context;
      },
    ],
  },
});
```

**Key Pattern:** Manual event emission is critical! Setting `context.result` in a before hook bypasses normal FeathersJS event flow, so we must explicitly emit 'patched' for WebSocket broadcasting.

---

## Frontend Architecture

### React Flow Integration

**File:** `apps/agor-ui/src/components/SessionCanvas/SessionCanvas.tsx`

Custom node types for board objects:

```typescript
const nodeTypes = {
  sessionNode: SessionNode,
  text: TextNode,
  zone: ZoneNode,
};
```

### Text Node Component

**File:** `apps/agor-ui/src/components/SessionCanvas/canvas/BoardObjectNodes.tsx`

Features:

- Double-click to edit content inline
- Font size picker (16, 20, 24, 32, 48px)
- Color picker with predefined palette
- NodeToolbar for settings when selected

```typescript
export const TextNode = ({ data, selected }: { data: TextNodeData; selected?: boolean }) => {
  const { token } = theme.useToken();
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(data.content);

  // Helper to create full object data with current values
  const createObjectData = (
    overrides: Partial<Omit<BoardObject, 'type' | 'x' | 'y'>>
  ): BoardObject => ({
    type: 'text',
    x: data.x,
    y: data.y,
    content: data.content,
    fontSize: data.fontSize,
    color: data.color,
    background: data.background,
    ...overrides,
  });

  const handleColorChange = (color: string) => {
    if (data.onUpdate) {
      data.onUpdate(data.objectId, createObjectData({ color }));
    }
  };

  // ... render with NodeToolbar for controls
};
```

**DRY Pattern:** `createObjectData()` helper ensures all updates preserve existing values (especially position) while allowing property-specific overrides.

### Zone Node Component

Features:

- Resizable with NodeResizer component
- Double-click label to edit
- Color picker for border/background
- Backdrop blur effect for visual hierarchy
- `pointerEvents: 'none'` on main area (sessions behind are clickable)
- `zIndex: -1` (zones always render behind sessions)

```typescript
export const ZoneNode = ({ data, selected }: { data: ZoneNodeData; selected?: boolean }) => {
  const { token } = theme.useToken();

  const createObjectData = (overrides: Partial<Omit<BoardObject, 'type' | 'x' | 'y'>>): BoardObject => ({
    type: 'zone',
    x: data.x,
    y: data.y,
    width: data.width,
    height: data.height,
    label: data.label,
    color: data.color,
    status: data.status,
    ...overrides,
  });

  return (
    <>
      <NodeToolbar isVisible={selected} position="top">
        {/* Color picker */}
      </NodeToolbar>
      <NodeResizer
        isVisible={selected}
        minWidth={200}
        minHeight={200}
        handleStyle={{...}}
        lineStyle={{...}}
      />
      <div style={{
        width: '100%',
        height: '100%',
        border: `2px solid ${borderColor}`,
        background: backgroundColor,
        pointerEvents: 'none', // Let sessions behind be clickable
        zIndex: -1,
        backdropFilter: 'blur(4px)',
      }}>
        {/* Label (editable on double-click) */}
      </div>
    </>
  );
};
```

### Floating Toolbox

**File:** `apps/agor-ui/src/components/SessionCanvas/SessionCanvas.tsx`

Extended React Flow's `<Controls>` component with custom tools:

```typescript
const [activeTool, setActiveTool] = useState<'select' | 'text' | 'zone' | 'eraser'>('select');

<Controls position="top-left">
  <ControlButton
    onClick={() => setActiveTool('select')}
    title="Select (Esc)"
    style={{ borderLeft: activeTool === 'select' ? '3px solid #1677ff' : 'none' }}
  >
    <SelectOutlined />
  </ControlButton>
  <ControlButton onClick={() => setActiveTool('text')} title="Add Text (T)">
    <FontSizeOutlined />
  </ControlButton>
  <ControlButton onClick={() => setActiveTool('zone')} title="Add Zone (Z)">
    <BorderOutlined />
  </ControlButton>
  <ControlButton onClick={() => setActiveTool('eraser')} title="Eraser (E)">
    <DeleteOutlined />
  </ControlButton>
</Controls>
```

**Interaction Patterns:**

1. **Text Tool**: Click canvas → places text node → returns to select mode
2. **Zone Tool**: Click-drag canvas → draws zone preview → creates zone on release
3. **Eraser Tool**: Click text/zone nodes → deletes them
4. **Select Tool**: Normal canvas interaction (drag, select, pan)

**Keyboard Shortcuts:**

- `T` - Text tool
- `Z` - Zone tool
- `E` - Eraser tool
- `Esc` - Select tool
- `Delete/Backspace` - Delete selected objects

**Cursor Feedback:** CSS classes change cursor based on active tool:

```css
.react-flow.tool-mode-text .react-flow__pane {
  cursor: text !important;
}

.react-flow.tool-mode-zone .react-flow__pane {
  cursor: crosshair !important;
}

.react-flow.tool-mode-eraser .react-flow__pane {
  cursor: pointer !important;
}
```

### Resize Handling

**Challenge:** React Flow's `onNodeResizeStop` callback doesn't exist! We need to intercept `onNodesChange` to detect dimension changes.

**Solution:**

```typescript
// Intercept onNodesChange to detect resize events
const onNodesChange = useCallback(
  changes => {
    changes.forEach(change => {
      if (change.type === 'dimensions' && change.dimensions) {
        // Skip if we're syncing from WebSocket (prevent feedback loop)
        if (isSyncingRef.current) return;

        const node = nodes.find(n => n.id === change.id);
        if (node?.type === 'zone') {
          // Accumulate resize updates
          pendingResizeUpdatesRef.current[change.id] = {
            width: change.dimensions.width,
            height: change.dimensions.height,
          };

          // Clear existing timer
          if (resizeTimerRef.current) {
            clearTimeout(resizeTimerRef.current);
          }

          // Debounce: wait 500ms after last resize before persisting
          resizeTimerRef.current = setTimeout(async () => {
            const updates = pendingResizeUpdatesRef.current;
            pendingResizeUpdatesRef.current = {};

            // Persist all resize changes
            for (const [nodeId, dimensions] of Object.entries(updates)) {
              const objectData = board.objects?.[nodeId];
              if (objectData && objectData.type === 'zone') {
                const updatedObject = { ...objectData, ...dimensions };
                await client.service('boards').patch(board.board_id, {
                  _action: 'upsertObject',
                  objectId: nodeId,
                  objectData: updatedObject,
                });
              }
            }
          }, 500);
        }
      }
    });

    onNodesChangeInternal(changes);
  },
  [nodes, board, client, onNodesChangeInternal]
);
```

**Key Patterns:**

- **Debouncing**: 500ms delay after last resize event before persisting
- **Sync flag**: `isSyncingRef.current` prevents feedback loop when WebSocket updates come in
- **Batching**: Multiple resizes accumulate, single batch update when done

### Deletion Flow

**Challenge:** Deleted objects reappeared after WebSocket updates.

**Root Cause:** Race condition between deletion and position updates:

1. User deletes object → removes from UI + sends delete to backend
2. Backend broadcasts 'patched' event
3. Position debounce timer fires → tries to update deleted object's position
4. Object reappears because position update re-adds it

**Solution:** Track locally deleted objects and skip updates:

```typescript
const deletedObjectsRef = useRef<Set<string>>(new Set());

const deleteObject = async (objectId: string) => {
  // Mark as deleted to prevent re-appearance
  deletedObjectsRef.current.add(objectId);

  // Optimistic removal
  setNodes(nodes => nodes.filter(n => n.id !== objectId));

  // Persist deletion
  await client.service('boards').patch(board.board_id, {
    _action: 'removeObject',
    objectId,
  });

  // Clear tracking after backend confirms
  setTimeout(() => {
    deletedObjectsRef.current.delete(objectId);
  }, 1000);
};

// In position batch update:
const batchUpdateObjectPositions = async updates => {
  const objects = {};

  for (const [objectId, position] of Object.entries(updates)) {
    // Skip objects that have been deleted locally
    if (deletedObjectsRef.current.has(objectId)) {
      continue;
    }

    const existingObject = board.objects?.[objectId];
    if (!existingObject) continue;

    objects[objectId] = { ...existingObject, ...position };
  }

  await client.service('boards').patch(board.board_id, {
    _action: 'batchUpsertObjects',
    objects,
  });
};
```

---

## Lessons Learned

### 1. Position Data Must Be in Node Data

**Problem:** When changing color/label, rectangles moved to (0, 0).

**Root Cause:** Update handlers had hardcoded `x: 0, y: 0`:

```typescript
// ❌ WRONG
const handleColorChange = (color: string) => {
  data.onUpdate(data.objectId, {
    type: 'zone',
    x: 0, // OOPS! Hardcoded
    y: 0,
    width: data.width,
    height: data.height,
    label: data.label,
    color,
  });
};
```

**Solution:** Pass position as part of node data, use in all updates:

```typescript
// ✅ CORRECT
const node = {
  id: objectId,
  type: 'zone',
  position: { x: objectData.x, y: objectData.y },
  data: {
    objectId,
    x: objectData.x, // Include in data!
    y: objectData.y,
    width: objectData.width,
    // ...
  },
};

const createObjectData = overrides => ({
  type: 'zone',
  x: data.x, // Use from data
  y: data.y,
  // ...
  ...overrides,
});
```

### 2. DRY Helpers Prevent Bugs

Creating `createObjectData()` helper functions in each node component:

- Centralizes object structure
- Impossible to forget a field
- Makes updates one-liners
- Type-safe with TypeScript

### 3. WebSocket Event Emission is Manual

When using `_action` pattern with custom methods in FeathersJS hooks:

- Setting `context.result` bypasses normal patch flow
- Must manually emit 'patched' event: `app.service('boards').emit('patched', result)`
- Otherwise WebSocket clients don't receive updates

### 4. Sync Flag Prevents Feedback Loops

When WebSocket updates trigger node changes, those changes trigger more updates → infinite loop.

**Solution:** Set flag during sync, skip event handling:

```typescript
// In sync effect:
isSyncingRef.current = true;
setNodes(...);  // Updates from WebSocket
setTimeout(() => {
  isSyncingRef.current = false;
}, 100);

// In resize handler:
if (isSyncingRef.current) return;  // Skip during sync
```

### 5. React Flow Resize Events Don't Exist

`onNodeResizeStop` is not a real callback. Must intercept `onNodesChange` and look for `type: 'dimensions'` changes.

---

## Future Improvements

### 1. Parent-Child Locking (Pinning to Zones)

**Goal:** Pin sessions to zones so they move together as a group.

**How It Works:**

React Flow has native support via the `parentId` property:

```typescript
// Session pinned to zone
const node = {
  id: sessionId,
  type: 'sessionNode',
  position: { x: 100, y: 100 },  // Position relative to parent zone
  parentId: 'zone-123',           // Pinned to this zone
  extent: 'parent',                // Optional: can't drag outside zone bounds
  data: { ... },
};
```

**Features:**

- When zone moves, all pinned sessions move automatically
- Sessions maintain their relative position within the zone
- Optional: `extent: "parent"` constrains sessions to stay within zone bounds
- Optional: `expandParent: true` makes zone grow if session dragged to edge

**User Interface:**

**Drop Detection (Automatic Pinning)**

When a session is dropped into a zone:

1. On `handleNodeDragStop`, check if session overlaps with zone using `reactFlowInstance.getIntersectingNodes()`
2. If session center is inside zone bounds, automatically set `parentId`
3. Show visual feedback (pin icon appears in session card header)
4. Session positions become relative to zone's top-left corner

**Pin Icon Toggle**

- **Location:** Session card header (replaces drag handle when pinned)
- **Icon:** `PushpinOutlined` / `PushpinFilled` from `@ant-design/icons`
- **Behavior:**
  - When **unpinned**: Show drag handle button as normal
  - When **pinned**: Replace drag handle with pin icon (filled)
  - Click pin icon → unpins session (removes `parentId`, converts position back to absolute coordinates)
- **Tooltip:** "Pinned to {zone.label}" (or "Unpin from zone" on hover)

**Session Card Changes:**

```typescript
// In SessionCard component
{isPinned ? (
  <Button
    type="text"
    size="small"
    icon={<PushpinFilled />}
    onClick={handleUnpin}
    title={`Pinned to ${zoneName} (click to unpin)`}
  />
) : (
  <Button
    type="text"
    size="small"
    icon={<DragOutlined />}
    className="drag-handle"
    title="Drag to move"
  />
)}
```

**Data Storage:**

Store `parentId` in `board.layout`:

```typescript
layout: {
  [sessionId]: {
    x: number;        // Absolute coordinates when unpinned, relative when pinned
    y: number;
    parentId?: string;  // Zone ID if pinned, undefined if unpinned
  }
}
```

**Implementation Details:**

1. **Pinning Logic (`SessionCanvas.tsx`):**

```typescript
const handleNodeDragStop = useCallback(
  async (event, node) => {
    if (node.type !== 'sessionNode') return;

    // Check if session dropped inside a zone
    const intersections = reactFlowInstance.getIntersectingNodes(node);
    const zone = intersections.find(n => n.type === 'zone');

    const currentParentId = board.layout?.[node.id]?.parentId;

    if (zone && !currentParentId) {
      // Pin to zone: convert absolute position to relative
      const relativeX = node.position.x - zone.position.x;
      const relativeY = node.position.y - zone.position.y;

      await client.service('boards').patch(board.board_id, {
        layout: {
          ...board.layout,
          [node.id]: { x: relativeX, y: relativeY, parentId: zone.id },
        },
      });
    } else if (!zone && currentParentId) {
      // Dragged outside zone: auto-unpin and convert to absolute position
      await handleUnpin(node.id);
    } else {
      // Normal position update
      await updatePosition(node.id, node.position.x, node.position.y);
    }
  },
  [board, reactFlowInstance, client]
);
```

2. **Unpinning Logic:**

```typescript
const handleUnpin = useCallback(
  async (sessionId: string) => {
    const node = nodes.find(n => n.id === sessionId);
    const layout = board.layout?.[sessionId];
    if (!node || !layout?.parentId) return;

    // Convert relative position to absolute
    const parentZone = nodes.find(n => n.id === layout.parentId);
    const absoluteX = parentZone ? node.position.x + parentZone.position.x : node.position.x;
    const absoluteY = parentZone ? node.position.y + parentZone.position.y : node.position.y;

    await client.service('boards').patch(board.board_id, {
      layout: {
        ...board.layout,
        [sessionId]: { x: absoluteX, y: absoluteY, parentId: undefined },
      },
    });
  },
  [nodes, board, client]
);
```

3. **Node Construction:**

```typescript
// When building React Flow nodes from sessions
const sessionNodes = sessions.map(session => {
  const layout = board.layout?.[session.session_id];
  return {
    id: session.session_id,
    type: 'sessionNode',
    position: { x: layout?.x ?? 0, y: layout?.y ?? 0 },
    parentId: layout?.parentId, // Set parent if pinned
    extent: layout?.parentId ? 'parent' : undefined, // Optional: constrain to zone
    data: {
      session,
      isPinned: !!layout?.parentId,
      zoneName: layout?.parentId ? findZoneName(layout.parentId) : undefined,
      onUnpin: () => handleUnpin(session.session_id),
    },
  };
});
```

**Visual Feedback:**

- Pinned sessions show pin icon instead of drag handle
- Optional: Add subtle border color change when pinned
- Optional: Show zone label in session card subtitle when pinned

**Effort:** ~2-3 hours

- Drop detection logic: 30 min
- Coordinate conversion (relative ↔ absolute): 45 min
- Pin icon UI in SessionCard: 30 min
- Unpin handler: 30 min
- Testing & edge cases: 45 min

### 2. Prompt Triggers (Kanban Automation)

**Goal:** Trigger actions when a session is dropped into a zone.

**Use Cases:**

1. **Status Zones** - Moving session to "In Progress" zone updates its status
2. **Automated Prompts** - Dropping into "Code Review" zone spawns a review subtask
3. **Kanban Workflows** - Visual organization with automatic state management

**Zone Configuration:**

```typescript
interface ZoneBoardObject {
  type: 'zone';
  // ... existing fields ...

  // NEW: Trigger configuration
  trigger?: {
    action: 'prompt' | 'fork' | 'spawn' | 'status';

    // For action: 'prompt'
    prompt?: string; // E.g., "Review this code for security issues"

    // For action: 'status'
    status?: 'idle' | 'running' | 'completed' | 'failed';

    // For action: 'fork' | 'spawn'
    promptTemplate?: string; // E.g., "Create subtask: {zone.label}"
  };
}
```

**Implementation:**

```typescript
const handleNodeDragStop = async (event, node) => {
  if (node.type !== 'sessionNode') return;

  // Check if session dropped in a zone
  const intersections = reactFlowInstance.getIntersectingNodes(node);
  const zone = intersections.find(n => n.type === 'zone');

  if (zone?.data.trigger) {
    const { action, prompt, status, promptTemplate } = zone.data.trigger;

    switch (action) {
      case 'status':
        // Update session status
        await client.service('sessions').patch(node.id, { status });
        message.success(`Session moved to ${status}`);
        break;

      case 'prompt':
        // Execute prompt on session
        await client.service('sessions').patch(node.id, {
          _action: 'executePrompt',
          prompt,
        });
        message.success('Prompt triggered');
        break;

      case 'fork':
        // Fork session with prompt
        const forkedSession = await client.service('sessions').create({
          _action: 'fork',
          parentId: node.id,
          prompt: promptTemplate?.replace('{zone.label}', zone.data.label),
        });
        message.success('Session forked');
        break;

      case 'spawn':
        // Spawn subtask
        const spawnedSession = await client.service('sessions').create({
          _action: 'spawn',
          parentId: node.id,
          prompt: promptTemplate?.replace('{zone.label}', zone.data.label),
        });
        message.success('Subtask spawned');
        break;
    }
  }

  // Persist position (existing logic)
  // ...
};
```

**UI for Configuration:**

Add "Zone Settings" modal with:

- Trigger enable toggle
- Action type dropdown (status, prompt, fork, spawn)
- Prompt input field (for prompt action)
- Status dropdown (for status action)
- Template editor (for fork/spawn actions)

**Effort:** ~3-4 hours

- Zone settings modal: 1 hour
- Drop detection: 30 min
- Action handlers: 1 hour
- Testing & polish: 1-2 hours

**Kanban Workflow Example:**

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   Backlog   │  │ In Progress │  │   Review    │  │  Complete   │
│             │  │             │  │             │  │             │
│ trigger:    │  │ trigger:    │  │ trigger:    │  │ trigger:    │
│ status=idle │  │ status=     │  │ action=     │  │ status=     │
│             │  │ running     │  │ spawn       │  │ completed   │
│             │  │             │  │ prompt=     │  │             │
│ [Session A] │→ │             │→ │ "Review..." │→ │             │
│ [Session B] │  │             │  │             │  │             │
└─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘
```

Dragging a session through this workflow:

1. Backlog → sets status to 'idle'
2. In Progress → sets status to 'running'
3. Review → spawns a review subtask with prompt
4. Complete → sets status to 'completed'

### 3. Other Future Enhancements

**Rich Text Support:**

- Use `@tiptap/react` for formatted text
- Support markdown rendering
- Inline images

**Additional Object Types:**

- **Arrows** - Custom edges with labels
- **Shapes** - Circles, triangles, icons
- **Links** - External URLs with preview cards
- **Embedded Files** - Images, code snippets

**Collaboration Features:**

- Real-time collaborative editing
- Comments on objects
- Object permissions
- Version history

**Visual Enhancements:**

- Custom backgrounds for zones
- Gradients and patterns
- Icons and emojis
- Snap-to-grid for alignment
- Guides and rulers

---

## References

- **React Flow Docs:** https://reactflow.dev/
- **React Flow Examples:** https://reactflow.dev/examples
- **Parent-Child Nodes:** https://reactflow.dev/examples/nodes/sub-flows
- **Node Resizer:** https://reactflow.dev/api-reference/components/node-resizer
- **Collision Detection:** https://reactflow.dev/examples/interaction/collision-detection
- **SQLite Concurrency:** https://www.sqlite.org/lockingv3.html
