// src/types/agentic-tool.ts
import type { AgenticToolID } from './id';

export type AgenticToolName = 'claude-code' | 'cursor' | 'codex' | 'gemini';

export interface AgenticTool {
  /** Unique agentic tool configuration identifier (UUIDv7) */
  id: AgenticToolID;

  name: AgenticToolName;
  icon: string;
  installed: boolean;
  version?: string;
  description?: string;
  installable: boolean;
}
