import { homedir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'drizzle-kit';

// Expand ~ to home directory for SQLite path
const defaultDbPath = `file:${join(homedir(), '.agor', 'agor.db')}`;

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.AGOR_DB_PATH || defaultDbPath,
  },
});
