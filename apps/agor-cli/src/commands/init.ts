/**
 * `agor init` - Initialize Agor environment
 *
 * Creates directory structure and initializes database.
 * Safe to run multiple times (idempotent).
 */

import { access, constants, mkdir, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createDatabase, initializeDatabase, seedInitialData } from '@agor/core/db';
import { Command, Flags } from '@oclif/core';

export default class Init extends Command {
  static description = 'Initialize Agor environment (creates ~/.agor/ and database)';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --local',
  ];

  static flags = {
    local: Flags.boolean({
      char: 'l',
      description: 'Initialize local .agor/ directory in current working directory',
      default: false,
    }),
    force: Flags.boolean({
      char: 'f',
      description: 'Force re-initialization even if already initialized',
      default: false,
    }),
  };

  private async pathExists(path: string): Promise<boolean> {
    try {
      await access(path, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  private expandHome(path: string): string {
    if (path.startsWith('~/')) {
      return join(homedir(), path.slice(2));
    }
    return path;
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(Init);

    this.log('✨ Initializing Agor...\n');

    try {
      // Determine base directory
      const baseDir = flags.local ? join(process.cwd(), '.agor') : join(homedir(), '.agor');
      const dbPath = join(baseDir, 'agor.db');

      // Check if already initialized
      const alreadyExists = await this.pathExists(baseDir);
      if (alreadyExists && !flags.force) {
        this.log(`ℹ️  Agor already initialized at ${baseDir}`);
        this.log('   Use --force to re-initialize\n');
        return;
      }

      // If force flag is set and directory exists, delete the database
      if (flags.force && alreadyExists) {
        this.log(`🗑️  Force re-initialization: removing existing database...`);
        const dbExists = await this.pathExists(dbPath);
        if (dbExists) {
          await rm(dbPath, { force: true });
          this.log(`   ✓ Deleted ${dbPath}`);
        }
      }

      // Create directory structure
      this.log(`\n📁 Creating directory structure...`);
      const dirs = [
        baseDir,
        join(baseDir, 'worktrees'),
        join(baseDir, 'concepts'),
        join(baseDir, 'logs'),
      ];

      for (const dir of dirs) {
        await mkdir(dir, { recursive: true });
        this.log(`   ✓ ${dir}`);
      }

      // Initialize database
      this.log(`\n💾 Setting up database...`);
      const db = createDatabase({ url: `file:${dbPath}` });

      await initializeDatabase(db);
      this.log(`   ✓ Created ${dbPath}`);

      // Seed initial data
      this.log(`\n🌱 Seeding initial data...`);
      await seedInitialData(db);
      this.log(`   ✓ Created default board`);

      // Success summary
      this.log(`\n✅ Agor initialized successfully!`);
      this.log(`\n   Database: ${dbPath}`);
      this.log(`   Worktrees: ${join(baseDir, 'worktrees')}`);
      this.log(`   Concepts: ${join(baseDir, 'concepts')}`);
      this.log(`   Logs: ${join(baseDir, 'logs')}`);
      this.log(`\nNext steps:`);
      this.log(`   - Run 'agor session create' to start a new session`);
      this.log(`   - Run 'agor session list' to view all sessions\n`);
    } catch (error) {
      this.error(
        `Failed to initialize Agor: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
