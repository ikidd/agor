/**
 * FeathersJS Type Declarations for Agor Daemon
 *
 * Provides proper TypeScript types for:
 * - Hook contexts with authentication
 * - Service implementations with custom methods
 * - Application instance
 */

import type { Board, Message, Repo, Session, Task } from '@agor/core/types';
import type { Application as ExpressFeathers } from '@feathersjs/express';
import type {
  HookContext as FeathersHookContext,
  Params as FeathersParams,
  Paginated,
  Service,
} from '@feathersjs/feathers';

/**
 * Authenticated user from JWT/Local strategy
 */
export interface AuthenticatedUser {
  user_id: string;
  email: string;
}

/**
 * Extended params with authentication
 */
export interface AuthenticatedParams extends FeathersParams {
  user?: AuthenticatedUser;
}

/**
 * Hook context for create operations
 * Supports both single objects and arrays for bulk operations
 *
 * Note: This extends FeathersHookContext with stricter types, but FeathersJS
 * expects the looser type. Use type assertions when defining hooks.
 */
// biome-ignore lint/suspicious/noExplicitAny: Generic type parameter for flexibility with any entity type
export interface CreateHookContext<T = any> extends FeathersHookContext {
  params: AuthenticatedParams;
  data: T | T[];
}

/**
 * Hook context for other operations
 */
// biome-ignore lint/suspicious/noExplicitAny: Generic type parameter for flexibility with any entity type
export interface HookContext<T = any> extends FeathersHookContext {
  params: AuthenticatedParams;
  data?: Partial<T> | Partial<T>[];
}

/**
 * Application type for the daemon
 */
export type Application = ExpressFeathers;

/**
 * Sessions service with custom methods (server-side implementation)
 * This matches the SessionRepository methods exposed via the service adapter
 */
export interface SessionsServiceImpl extends Service<Session, Partial<Session>, FeathersParams> {
  fork(
    id: string,
    data: { prompt: string; task_id?: string },
    params?: FeathersParams
  ): Promise<Session>;
  spawn(
    id: string,
    data: { prompt: string; agent?: string; task_id?: string },
    params?: FeathersParams
  ): Promise<Session>;
  getGenealogy(id: string, params?: FeathersParams): Promise<unknown>; // GenealogyTree type would go here
  // Event emitter methods (FeathersJS EventEmitter interface - any[] for event args flexibility)
  // biome-ignore lint/suspicious/noExplicitAny: FeathersJS event handlers accept variable arguments
  on(event: string, handler: (...args: any[]) => void): this;
  // biome-ignore lint/suspicious/noExplicitAny: FeathersJS event handlers accept variable arguments
  removeListener(event: string, handler: (...args: any[]) => void): this;
}

/**
 * Tasks service with custom methods (server-side implementation)
 */
export interface TasksServiceImpl extends Service<Task, Partial<Task>, FeathersParams> {
  createMany(data: Array<Partial<Task>>): Promise<Task[]>;
  complete(
    id: string,
    data: { git_state?: { sha_at_end?: string; commit_message?: string } },
    params?: FeathersParams
  ): Promise<Task>;
  fail(id: string, data: { error?: string }, params?: FeathersParams): Promise<Task>;
}

/**
 * Repos service with custom methods (server-side implementation)
 */
export interface ReposServiceImpl extends Service<Repo, Partial<Repo>, FeathersParams> {
  cloneRepository(
    data: { url: string; name?: string; destination?: string },
    params?: FeathersParams
  ): Promise<Repo>;
  createWorktree(
    id: string,
    data: { name: string; ref: string; createBranch?: boolean },
    params?: FeathersParams
  ): Promise<Repo>;
  removeWorktree(id: string, name: string, params?: FeathersParams): Promise<Repo>;
}

/**
 * Boards service with custom methods (server-side implementation)
 */
export interface BoardsServiceImpl extends Service<Board, Partial<Board>, FeathersParams> {
  addSession(boardId: string, sessionId: string, params?: FeathersParams): Promise<Board>;
  removeSession(boardId: string, sessionId: string, params?: FeathersParams): Promise<Board>;
  upsertBoardObject(
    boardId: string,
    objectId: string,
    objectData: unknown,
    params?: FeathersParams
  ): Promise<Board>;
  removeBoardObject(boardId: string, objectId: string, params?: FeathersParams): Promise<Board>;
  batchUpsertBoardObjects(
    boardId: string,
    objects: unknown[],
    params?: FeathersParams
  ): Promise<Board>;
  deleteZone(
    boardId: string,
    zoneId: string,
    deleteAssociatedSessions: boolean,
    params?: FeathersParams
  ): Promise<{ board: Board; affectedSessions: string[] }>;
}

/**
 * Messages service with custom methods (server-side implementation)
 */
export interface MessagesServiceImpl extends Service<Message, Partial<Message>, FeathersParams> {
  createMany(data: Array<Partial<Message>>): Promise<Message[]>;
}
