/**
 * Claude Code Tool Implementation
 *
 * Current capabilities:
 * - ✅ Import sessions from transcript files
 * - ✅ Live execution via Anthropic SDK
 * - ❌ Create new sessions (waiting for SDK)
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk';
import { generateId } from '../../db/ids';
import type { MessagesRepository } from '../../db/repositories/messages';
import type { SessionMCPServerRepository } from '../../db/repositories/session-mcp-servers';
import type { SessionRepository } from '../../db/repositories/sessions';
import type { TaskRepository } from '../../db/repositories/tasks';
import type { PermissionService } from '../../permissions/permission-service';
import type { Message, MessageID, SessionID, TaskID, ToolUse } from '../../types';
import type { ImportOptions, ITool, SessionData, ToolCapabilities } from '../base';
import { loadClaudeSession } from './import/load-session';
import { transcriptsToMessages } from './import/message-converter';
import { ClaudePromptService } from './prompt-service';

/**
 * Service interface for creating messages via FeathersJS
 * This ensures WebSocket events are emitted when messages are created
 */
export interface MessagesService {
  create(data: Partial<Message>): Promise<Message>;
}

/**
 * Service interface for updating tasks via FeathersJS
 * This ensures WebSocket events are emitted when tasks are updated
 */
export interface TasksService {
  // biome-ignore lint/suspicious/noExplicitAny: FeathersJS service returns dynamic task data
  get(id: string): Promise<any>;
  // biome-ignore lint/suspicious/noExplicitAny: FeathersJS service accepts partial task updates
  patch(id: string, data: Partial<any>): Promise<any>;
}

/**
 * Service interface for updating sessions via FeathersJS
 * This ensures WebSocket events are emitted when sessions are updated (e.g., permission config)
 */
export interface SessionsService {
  // biome-ignore lint/suspicious/noExplicitAny: FeathersJS service accepts partial session updates
  patch(id: string, data: Partial<any>): Promise<any>;
}

export class ClaudeTool implements ITool {
  readonly toolType = 'claude-code' as const;
  readonly name = 'Claude Code';

  private promptService?: ClaudePromptService;

  constructor(
    private messagesRepo?: MessagesRepository,
    private sessionsRepo?: SessionRepository,
    private apiKey?: string,
    private messagesService?: MessagesService,
    private sessionMCPRepo?: SessionMCPServerRepository,
    private permissionService?: PermissionService,
    private tasksService?: TasksService,
    private sessionsService?: SessionsService
  ) {
    if (messagesRepo && sessionsRepo) {
      this.promptService = new ClaudePromptService(
        messagesRepo,
        sessionsRepo,
        apiKey,
        sessionMCPRepo,
        permissionService,
        tasksService,
        sessionsService
      );
    }
  }

  getCapabilities(): ToolCapabilities {
    return {
      supportsSessionImport: true, // ✅ We have transcript parsing
      supportsSessionCreate: false, // ❌ Waiting for SDK
      supportsLiveExecution: true, // ✅ Now supported via Anthropic SDK
      supportsSessionFork: false,
      supportsChildSpawn: false,
      supportsGitState: true, // Transcripts contain git state
      supportsStreaming: true, // ✅ Streaming via callbacks during message generation
    };
  }

  async checkInstalled(): Promise<boolean> {
    try {
      // Check if ~/.claude directory exists
      const claudeDir = path.join(os.homedir(), '.claude');
      const stats = await fs.stat(claudeDir);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  async importSession(sessionId: string, options?: ImportOptions): Promise<SessionData> {
    // Load session using existing transcript parser
    const session = await loadClaudeSession(sessionId, options?.projectDir);

    // Convert messages to Agor format
    const messages = transcriptsToMessages(session.messages, session.sessionId as SessionID);

    // Extract metadata
    const metadata = {
      sessionId: session.sessionId,
      toolType: this.toolType,
      status: 'completed' as const, // Historical sessions are always completed
      createdAt: new Date(session.messages[0]?.timestamp || Date.now()),
      lastUpdatedAt: new Date(
        session.messages[session.messages.length - 1]?.timestamp || Date.now()
      ),
      workingDirectory: session.cwd || undefined,
      messageCount: session.messages.length,
    };

    return {
      sessionId: session.sessionId,
      toolType: this.toolType,
      messages,
      metadata,
      workingDirectory: session.cwd || undefined,
    };
  }

  /**
   * Execute a prompt against a session WITH real-time streaming
   *
   * Creates user message, streams response chunks from Claude, then creates complete assistant messages.
   * Calls streamingCallbacks during message generation for real-time UI updates.
   * Agent SDK may return multiple assistant messages (e.g., tool invocation, then response).
   *
   * @param sessionId - Session to execute prompt in
   * @param prompt - User prompt text
   * @param taskId - Optional task ID for linking messages
   * @param permissionMode - Optional permission mode for SDK
   * @param streamingCallbacks - Optional callbacks for real-time streaming (enables typewriter effect)
   * @returns User message ID and array of assistant message IDs
   */
  async executePromptWithStreaming(
    sessionId: SessionID,
    prompt: string,
    taskId?: TaskID,
    permissionMode?: PermissionMode,
    streamingCallbacks?: import('../base').StreamingCallbacks
  ): Promise<{ userMessageId: MessageID; assistantMessageIds: MessageID[] }> {
    if (!this.promptService || !this.messagesRepo) {
      throw new Error('ClaudeTool not initialized with repositories for live execution');
    }

    if (!this.messagesService) {
      throw new Error('ClaudeTool not initialized with messagesService for live execution');
    }

    // Get next message index
    const existingMessages = await this.messagesRepo.findBySessionId(sessionId);
    let nextIndex = existingMessages.length;

    // Create user message immediately via FeathersJS service (emits WebSocket event)
    const userMessage: Message = {
      message_id: generateId() as MessageID,
      session_id: sessionId,
      type: 'user',
      role: 'user',
      index: nextIndex++,
      timestamp: new Date().toISOString(),
      content_preview: prompt.substring(0, 200),
      content: prompt,
      task_id: taskId,
    };

    await this.messagesService.create(userMessage);

    // Execute prompt via Agent SDK with streaming
    const assistantMessageIds: MessageID[] = [];
    let capturedAgentSessionId: string | undefined;

    // Track current message being streamed
    let currentMessageId: MessageID | null = null;
    let streamStartTime = Date.now();
    let firstTokenTime: number | null = null;

    for await (const event of this.promptService.promptSessionStreaming(
      sessionId,
      prompt,
      taskId,
      permissionMode
    )) {
      // Capture Agent SDK session_id from first message
      if (!capturedAgentSessionId && event.agentSessionId) {
        capturedAgentSessionId = event.agentSessionId;
        console.log(
          `🔑 Captured Agent SDK session_id for Agor session ${sessionId}: ${capturedAgentSessionId}`
        );

        // Store it in the session for future prompts
        if (this.sessionsRepo) {
          await this.sessionsRepo.update(sessionId, { agent_session_id: capturedAgentSessionId });
          console.log(`💾 Stored Agent SDK session_id in Agor session`);
        }
      }

      // Handle partial streaming events (token-level chunks)
      if (event.type === 'partial' && event.textChunk) {
        // Start new message if needed
        if (!currentMessageId) {
          currentMessageId = generateId() as MessageID;
          firstTokenTime = Date.now();
          const ttfb = firstTokenTime - streamStartTime;
          console.debug(`⏱️ [SDK] TTFB: ${ttfb}ms`);

          if (streamingCallbacks) {
            streamingCallbacks.onStreamStart(currentMessageId, {
              session_id: sessionId,
              task_id: taskId,
              role: 'assistant',
              timestamp: new Date().toISOString(),
            });
          }
        }

        // Emit chunk immediately (no artificial delays - true streaming!)
        if (streamingCallbacks) {
          streamingCallbacks.onStreamChunk(currentMessageId, event.textChunk);
        }
      }
      // Handle complete message (save to database)
      else if (event.type === 'complete' && event.content) {
        // End streaming if active
        if (currentMessageId && streamingCallbacks) {
          const streamEndTime = Date.now();
          streamingCallbacks.onStreamEnd(currentMessageId);
          const totalTime = streamEndTime - streamStartTime;
          const streamingTime = firstTokenTime ? streamEndTime - firstTokenTime : 0;
          console.debug(
            `⏱️ [Streaming] Complete - TTFB: ${firstTokenTime ? firstTokenTime - streamStartTime : 0}ms, streaming: ${streamingTime}ms, total: ${totalTime}ms`
          );
        }

        // Use existing message ID or generate new one
        const assistantMessageId = currentMessageId || (generateId() as MessageID);

        // Extract text content for preview
        const textBlocks = event.content.filter(b => b.type === 'text').map(b => b.text || '');
        const fullTextContent = textBlocks.join('');
        const contentPreview = fullTextContent.substring(0, 200);

        // Create complete message in DB (triggers WebSocket broadcast)
        const message: Message = {
          message_id: assistantMessageId,
          session_id: sessionId,
          type: 'assistant',
          role: 'assistant',
          index: nextIndex++,
          timestamp: new Date().toISOString(),
          content_preview: contentPreview,
          content: event.content as Message['content'],
          tool_uses: event.toolUses,
          task_id: taskId,
          metadata: {
            model: 'claude-sonnet-4-5-20250929',
            tokens: {
              input: 0, // TODO: Extract from SDK
              output: 0,
            },
          },
        };

        await this.messagesService.create(message);
        assistantMessageIds.push(message.message_id);

        // Reset for next message
        currentMessageId = null;
        streamStartTime = Date.now();
        firstTokenTime = null;
      }
    }

    return {
      userMessageId: userMessage.message_id,
      assistantMessageIds,
    };
  }

  /**
   * Chunk text into 5-10 word segments for streaming
   * Flushes at sentence boundaries (., !, ?, \n\n) or word count threshold
   * @private
   */
  private chunkTextForStreaming(text: string): string[] {
    const chunks: string[] = [];
    let buffer = '';
    const words = text.split(/(\s+)/); // Keep whitespace

    for (const word of words) {
      buffer += word;

      // Count non-whitespace words in buffer
      const wordCount = buffer.split(/\s+/).filter(w => w.length > 0).length;

      // Flush if we hit a sentence boundary (with 3+ words) or 10 words
      const hasSentenceBoundary = /[.!?\n\n]\s*$/.test(buffer.trimEnd());
      if ((hasSentenceBoundary && wordCount >= 3) || wordCount >= 10) {
        chunks.push(buffer);
        buffer = '';
      }
    }

    // Flush remaining
    if (buffer.trim()) {
      chunks.push(buffer);
    }

    return chunks;
  }

  /**
   * Execute a prompt against a session (non-streaming version)
   *
   * Creates user message, streams response from Claude, creates assistant messages.
   * Agent SDK may return multiple assistant messages (e.g., tool invocation, then response).
   * Returns user message ID and array of assistant message IDs.
   *
   * Also captures and stores the Agent SDK session_id for conversation continuity.
   */
  async executePrompt(
    sessionId: SessionID,
    prompt: string,
    taskId?: TaskID,
    permissionMode?: PermissionMode
  ): Promise<{ userMessageId: MessageID; assistantMessageIds: MessageID[] }> {
    if (!this.promptService || !this.messagesRepo) {
      throw new Error('ClaudeTool not initialized with repositories for live execution');
    }

    if (!this.messagesService) {
      throw new Error('ClaudeTool not initialized with messagesService for live execution');
    }

    // Get next message index
    const existingMessages = await this.messagesRepo.findBySessionId(sessionId);
    let nextIndex = existingMessages.length;

    // Create user message immediately via FeathersJS service (emits WebSocket event)
    const userMessage: Message = {
      message_id: generateId() as MessageID,
      session_id: sessionId,
      type: 'user',
      role: 'user',
      index: nextIndex++,
      timestamp: new Date().toISOString(),
      content_preview: prompt.substring(0, 200),
      content: prompt,
      task_id: taskId, // Link to task immediately
    };

    await this.messagesService.create(userMessage);

    // Execute prompt via Agent SDK with progressive message creation
    // As each assistant message arrives, create it immediately (sends WebSocket event)
    const assistantMessageIds: MessageID[] = [];
    const inputTokens = 0;
    const outputTokens = 0;
    let capturedAgentSessionId: string | undefined;

    for await (const event of this.promptService.promptSessionStreaming(
      sessionId,
      prompt,
      taskId,
      permissionMode
    )) {
      // Capture Agent SDK session_id from first message
      if (!capturedAgentSessionId && event.agentSessionId) {
        capturedAgentSessionId = event.agentSessionId;
        console.log(
          `🔑 Captured Agent SDK session_id for Agor session ${sessionId}: ${capturedAgentSessionId}`
        );

        // Store it in the session for future prompts
        if (this.sessionsRepo) {
          await this.sessionsRepo.update(sessionId, { agent_session_id: capturedAgentSessionId });
          console.log(`💾 Stored Agent SDK session_id in Agor session`);
        }
      }

      // Skip partial events in non-streaming mode
      if (event.type === 'partial') {
        continue;
      }

      // Handle complete messages only
      if (event.type === 'complete' && event.content) {
        // Generate content preview from text blocks
        const textBlocks = event.content.filter(b => b.type === 'text').map(b => b.text);
        const contentPreview = textBlocks.join('').substring(0, 200);

        const message: Message = {
          message_id: generateId() as MessageID,
          session_id: sessionId,
          type: 'assistant',
          role: 'assistant',
          index: nextIndex++,
          timestamp: new Date().toISOString(),
          content_preview: contentPreview,
          content: event.content as Message['content'], // ContentBlock[] array
          tool_uses: event.toolUses,
          task_id: taskId, // Link to task immediately so UI can display progressively
          metadata: {
            model: 'claude-sonnet-4-5-20250929',
            tokens: {
              input: inputTokens,
              output: outputTokens,
            },
          },
        };

        await this.messagesService.create(message);
        assistantMessageIds.push(message.message_id);
      }
    }

    return {
      userMessageId: userMessage.message_id,
      assistantMessageIds,
    };
  }
}
