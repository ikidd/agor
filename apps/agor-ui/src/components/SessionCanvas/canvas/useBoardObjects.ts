/**
 * Hook for managing board objects (text labels, zones, etc.)
 */

import type { AgorClient } from '@agor/core/api';
import { useCallback } from 'react';
import type { Node } from 'reactflow';
import type { Board, BoardObject } from '../../../types';

interface UseBoardObjectsProps {
  board: Board | null;
  client: AgorClient | null;
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  deletedObjectsRef: React.MutableRefObject<Set<string>>;
  eraserMode?: boolean;
}

export const useBoardObjects = ({
  board,
  client,
  setNodes,
  deletedObjectsRef,
  eraserMode = false,
}: UseBoardObjectsProps) => {
  /**
   * Update an existing board object
   */
  const handleUpdateObject = useCallback(
    async (objectId: string, objectData: BoardObject) => {
      if (!board || !client) return;

      try {
        await client.service('boards').patch(board.board_id, {
          _action: 'upsertObject',
          objectId,
          objectData,
        });
      } catch (error) {
        console.error('Failed to update object:', error);
      }
    },
    [board, client]
  );

  /**
   * Convert board.objects to React Flow nodes
   */
  const getBoardObjectNodes = useCallback((): Node[] => {
    if (!board?.objects) return [];

    return Object.entries(board.objects).map(([objectId, objectData]) => {
      // Zone node
      return {
        id: objectId,
        type: 'zone',
        position: { x: objectData.x, y: objectData.y },
        draggable: true,
        className: eraserMode ? 'eraser-mode' : undefined,
        style: {
          width: objectData.width,
          height: objectData.height,
          zIndex: -1, // Zones behind everything
        },
        data: {
          objectId,
          label: objectData.label,
          width: objectData.width,
          height: objectData.height,
          color: objectData.color,
          status: objectData.status,
          x: objectData.x, // Include position in data for updates
          y: objectData.y,
          onUpdate: handleUpdateObject,
        },
      };
    });
  }, [board?.objects, handleUpdateObject, eraserMode]);

  /**
   * Add a zone node at the specified position
   */
  const addZoneNode = useCallback(
    async (x: number, y: number) => {
      if (!board || !client) return;

      const objectId = `zone-${Date.now()}`;
      const width = 400;
      const height = 600;

      // Optimistic update
      setNodes(nodes => [
        ...nodes,
        {
          id: objectId,
          type: 'zone',
          position: { x, y },
          draggable: true,
          style: {
            width,
            height,
            zIndex: -1,
          },
          data: {
            objectId,
            label: 'New Zone',
            width,
            height,
            color: undefined, // Will use theme default (colorBorder)
            onUpdate: handleUpdateObject,
          },
        },
      ]);

      // Persist atomically
      try {
        await client.service('boards').patch(board.board_id, {
          _action: 'upsertObject',
          objectId,
          objectData: {
            type: 'zone',
            x,
            y,
            width,
            height,
            label: 'New Zone',
            // No color specified - will use theme default
          },
        });
      } catch (error) {
        console.error('Failed to add zone node:', error);
        // Rollback
        setNodes(nodes => nodes.filter(n => n.id !== objectId));
      }
    },
    [board, client, setNodes, handleUpdateObject]
  );

  /**
   * Delete a board object
   */
  const deleteObject = useCallback(
    async (objectId: string) => {
      if (!board || !client) return;

      // Mark as deleted to prevent re-appearance during WebSocket updates
      deletedObjectsRef.current.add(objectId);

      // Optimistic removal
      setNodes(nodes => nodes.filter(n => n.id !== objectId));

      try {
        await client.service('boards').patch(board.board_id, {
          _action: 'removeObject',
          objectId,
        });

        // After successful deletion, we can remove from the tracking set
        // (the object will no longer exist in board.objects)
        setTimeout(() => {
          deletedObjectsRef.current.delete(objectId);
        }, 1000);
      } catch (error) {
        console.error('Failed to delete object:', error);
        // Rollback: remove from deleted set
        deletedObjectsRef.current.delete(objectId);
      }
    },
    [board, client, setNodes, deletedObjectsRef]
  );

  /**
   * Batch update positions for board objects after drag
   */
  const batchUpdateObjectPositions = useCallback(
    async (updates: Record<string, { x: number; y: number }>) => {
      if (!board || !client || Object.keys(updates).length === 0) return;

      try {
        // Build objects payload with full object data + new positions
        const objects: Record<string, BoardObject> = {};

        for (const [objectId, position] of Object.entries(updates)) {
          // Skip objects that have been deleted locally
          if (deletedObjectsRef.current.has(objectId)) {
            continue;
          }

          const existingObject = board.objects?.[objectId];
          if (!existingObject) continue;

          objects[objectId] = {
            ...existingObject,
            x: position.x,
            y: position.y,
          };
        }

        if (Object.keys(objects).length === 0) {
          return;
        }

        await client.service('boards').patch(board.board_id, {
          _action: 'batchUpsertObjects',
          objects,
        });
      } catch (error) {
        console.error('Failed to persist object positions:', error);
      }
    },
    [board, client, deletedObjectsRef]
  );

  return {
    getBoardObjectNodes,
    addZoneNode,
    deleteObject,
    batchUpdateObjectPositions,
  };
};
