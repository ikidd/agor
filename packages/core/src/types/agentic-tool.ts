// src/types/agentic-tool.ts

import type { AgenticToolID } from './id';

/**
 * Agentic coding tool names
 *
 * These are the external agentic CLI/IDE tools that connect to Agor:
 * - claude-code: Anthropic's Claude Code CLI
 * - cursor: Cursor IDE
 * - codex: OpenAI's Codex CLI
 * - gemini: Google's Gemini Code Assist
 *
 * Not to be confused with "execution tools" (Bash, Write, Read, etc.)
 * which are the primitives that agentic tools use to perform work.
 */
export type AgenticToolName = 'claude-code' | 'cursor' | 'codex' | 'gemini';

/**
 * Agentic tool metadata for UI display
 *
 * Represents a configured agentic coding tool with installation status,
 * version info, and UI metadata (icon, description).
 */
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
