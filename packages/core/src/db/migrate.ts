/**
 * Database Migration Runner
 *
 * DEPRECATED: This file contains manual SQL schema creation and is kept for backwards compatibility.
 *
 * **New Approach (Recommended):**
 * Use `drizzle-kit push` to automatically sync schema.ts to database:
 *   - Run: `pnpm db:push` from packages/core
 *   - Drizzle Kit reads schema.ts and generates SQL automatically
 *   - No need to maintain manual CREATE TABLE statements
 *   - Single source of truth: packages/core/src/db/schema.ts
 *
 * **This file is still used by:**
 * - setup-db.ts for programmatic database initialization
 * - Legacy code that calls initializeDatabase() directly
 *
 * **Migration Path:**
 * For fresh databases: Use `pnpm db:push`
 * For existing databases: Use `pnpm db:push` (will detect and apply schema changes)
 * For seed data: Still use seedInitialData() from this file
 */

import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/libsql/migrator';
import type { Database } from './client';

/**
 * Error thrown when migration fails
 */
export class MigrationError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'MigrationError';
  }
}

/**
 * Check if database tables exist
 */
async function tablesExist(db: Database): Promise<boolean> {
  try {
    const result = await db.run(sql`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name IN ('sessions', 'tasks', 'boards', 'repos', 'messages', 'users')
    `);
    return result.rows.length > 0;
  } catch (error) {
    throw new MigrationError(
      `Failed to check if tables exist: ${error instanceof Error ? error.message : String(error)}`,
      error
    );
  }
}

/**
 * Create initial database schema
 *
 * Creates all tables with indexes. This is the "migration-free" approach:
 * we define the schema once and avoid constant migrations by using JSON columns.
 */
async function createInitialSchema(db: Database): Promise<void> {
  try {
    // Sessions table
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER,
        created_by TEXT NOT NULL DEFAULT 'anonymous',
        status TEXT NOT NULL CHECK(status IN ('idle', 'running', 'completed', 'failed')),
        agent TEXT NOT NULL CHECK(agent IN ('claude-code', 'cursor', 'codex', 'gemini')),
        board_id TEXT,
        parent_session_id TEXT,
        forked_from_session_id TEXT,
        data TEXT NOT NULL
      )
    `);

    await db.run(sql`
      CREATE INDEX IF NOT EXISTS sessions_status_idx ON sessions(status)
    `);

    await db.run(sql`
      CREATE INDEX IF NOT EXISTS sessions_agent_idx ON sessions(agent)
    `);

    await db.run(sql`
      CREATE INDEX IF NOT EXISTS sessions_board_idx ON sessions(board_id)
    `);

    await db.run(sql`
      CREATE INDEX IF NOT EXISTS sessions_created_idx ON sessions(created_at)
    `);

    await db.run(sql`
      CREATE INDEX IF NOT EXISTS sessions_parent_idx ON sessions(parent_session_id)
    `);

    await db.run(sql`
      CREATE INDEX IF NOT EXISTS sessions_forked_idx ON sessions(forked_from_session_id)
    `);

    // Tasks table
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS tasks (
        task_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        completed_at INTEGER,
        status TEXT NOT NULL CHECK(status IN ('created', 'running', 'completed', 'failed')),
        created_by TEXT NOT NULL DEFAULT 'anonymous',
        data TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
      )
    `);

    await db.run(sql`
      CREATE INDEX IF NOT EXISTS tasks_session_idx ON tasks(session_id)
    `);

    await db.run(sql`
      CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks(status)
    `);

    await db.run(sql`
      CREATE INDEX IF NOT EXISTS tasks_created_idx ON tasks(created_at)
    `);

    // Boards table
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS boards (
        board_id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER,
        created_by TEXT NOT NULL DEFAULT 'anonymous',
        name TEXT NOT NULL,
        slug TEXT UNIQUE,
        data TEXT NOT NULL
      )
    `);

    await db.run(sql`
      CREATE INDEX IF NOT EXISTS boards_name_idx ON boards(name)
    `);

    await db.run(sql`
      CREATE INDEX IF NOT EXISTS boards_slug_idx ON boards(slug)
    `);

    // Repos table
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS repos (
        repo_id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER,
        slug TEXT NOT NULL UNIQUE,
        data TEXT NOT NULL
      )
    `);

    await db.run(sql`
      CREATE INDEX IF NOT EXISTS repos_slug_idx ON repos(slug)
    `);

    // Messages table
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS messages (
        message_id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        session_id TEXT NOT NULL,
        task_id TEXT,
        type TEXT NOT NULL CHECK(type IN ('user', 'assistant', 'system', 'file-history-snapshot')),
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
        "index" INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        content_preview TEXT,
        data TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE,
        FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE SET NULL
      )
    `);

    await db.run(sql`
      CREATE INDEX IF NOT EXISTS messages_session_id_idx ON messages(session_id)
    `);

    await db.run(sql`
      CREATE INDEX IF NOT EXISTS messages_task_id_idx ON messages(task_id)
    `);

    await db.run(sql`
      CREATE INDEX IF NOT EXISTS messages_session_index_idx ON messages(session_id, "index")
    `);

    // Users table
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT,
        role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner', 'admin', 'member', 'viewer')),
        data TEXT NOT NULL
      )
    `);

    await db.run(sql`
      CREATE INDEX IF NOT EXISTS users_email_idx ON users(email)
    `);
  } catch (error) {
    throw new MigrationError(
      `Failed to create initial schema: ${error instanceof Error ? error.message : String(error)}`,
      error
    );
  }
}

/**
 * Run database migrations
 *
 * @param db Drizzle database instance
 * @param migrationsFolder Path to migrations folder (default: './migrations')
 *
 * @example
 * ```typescript
 * import { createDatabase } from './client';
 * import { runMigrations } from './migrate';
 *
 * const db = createDatabase({ url: 'file:~/.agor/sessions.db' });
 * await runMigrations(db);
 * ```
 */
export async function runMigrations(
  db: Database,
  migrationsFolder: string = './migrations'
): Promise<void> {
  try {
    // Check if tables exist
    const exists = await tablesExist(db);

    if (!exists) {
      // First run - create initial schema
      console.log('Creating initial database schema...');
      await createInitialSchema(db);
      console.log('Initial schema created successfully');
    } else {
      // Subsequent runs - apply migrations if any
      console.log('Running migrations...');
      await migrate(db, { migrationsFolder });
      console.log('Migrations applied successfully');
    }
  } catch (error) {
    throw new MigrationError(
      `Migration failed: ${error instanceof Error ? error.message : String(error)}`,
      error
    );
  }
}

/**
 * Initialize database (create schema if needed)
 *
 * Simpler alternative to runMigrations when you don't have migration files.
 * Always safe to call - creates tables only if they don't exist.
 */
export async function initializeDatabase(db: Database): Promise<void> {
  try {
    const exists = await tablesExist(db);

    if (!exists) {
      console.log('Initializing database schema...');
      await createInitialSchema(db);
      console.log('Database initialized successfully');
    } else {
      console.log('Database already initialized');
    }
  } catch (error) {
    throw new MigrationError(
      `Database initialization failed: ${error instanceof Error ? error.message : String(error)}`,
      error
    );
  }
}

/**
 * Seed initial data (default board)
 */
export async function seedInitialData(db: Database): Promise<void> {
  try {
    // Check if default board exists
    const result = await db.run(sql`
      SELECT board_id FROM boards WHERE name = 'Default'
    `);

    if (result.rows.length === 0) {
      // Create default board
      const { generateId } = await import('./ids');
      const boardId = generateId();
      const now = Date.now();

      await db.run(sql`
        INSERT INTO boards (board_id, name, slug, created_at, updated_at, created_by, data)
        VALUES (
          ${boardId},
          ${'Default'},
          ${'default'},
          ${now},
          ${now},
          ${'anonymous'},
          ${JSON.stringify({
            description: 'Default board for all sessions',
            sessions: [],
            color: '#1677ff',
            icon: 'star',
          })}
        )
      `);

      console.log('Default board created');
    }
  } catch (error) {
    throw new MigrationError(
      `Failed to seed initial data: ${error instanceof Error ? error.message : String(error)}`,
      error
    );
  }
}
