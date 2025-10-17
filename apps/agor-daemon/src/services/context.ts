/**
 * Context Service
 *
 * Provides read-only REST + WebSocket API for browsing markdown files in context/.
 * Does not use database - reads directly from filesystem.
 *
 * Configuration:
 * - Currently reads from: <project-root>/context/
 * - Future: May move to ~/.agor/context/
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { ContextFileDetail, ContextFileListItem } from '@agor/core/types';
import type { Id, Params, ServiceMethods } from '@feathersjs/feathers';

/**
 * Context service params (read-only, no create/update/delete)
 */
export interface ContextParams extends Params {
  query?: {
    $limit?: number;
    $skip?: number;
  };
}

/**
 * Context service - read-only filesystem browser for context/ folder
 */
export class ContextService
  implements
    Pick<
      ServiceMethods<ContextFileListItem | ContextFileDetail>,
      'find' | 'get' | 'setup' | 'teardown'
    >
{
  private contextPath: string;

  constructor(contextPath: string) {
    this.contextPath = contextPath;
  }

  /**
   * Find all markdown files (GET /context)
   * Returns lightweight list items without content
   */
  async find(_params?: ContextParams): Promise<ContextFileListItem[]> {
    const files: ContextFileListItem[] = [];

    // Read all markdown files recursively from context/
    await this.scanDirectory(this.contextPath, '', files);

    return files;
  }

  /**
   * Get specific markdown file (GET /context/:path)
   * Returns full details with content
   *
   * @param id - Relative path from context/ (e.g., "concepts/core.md", "README.md")
   */
  async get(id: Id, _params?: ContextParams): Promise<ContextFileDetail> {
    const relativePath = id.toString();
    const fullPath = join(this.contextPath, relativePath);

    try {
      // Read file content
      const content = await readFile(fullPath, 'utf-8');

      // Get file stats
      const stats = await stat(fullPath);

      // Extract title from first H1 or filename
      const title = this.extractTitle(content, relativePath);

      return {
        path: relativePath,
        title,
        size: stats.size,
        lastModified: stats.mtime.toISOString(),
        content,
      };
    } catch (error) {
      throw new Error(`Failed to read context file: ${error}`);
    }
  }

  /**
   * Recursively scan directory for markdown files
   */
  private async scanDirectory(
    basePath: string,
    relativePath: string,
    files: ContextFileListItem[]
  ): Promise<void> {
    const dirPath = join(basePath, relativePath);

    try {
      const entries = await readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const entryRelPath = relativePath ? join(relativePath, entry.name) : entry.name;

        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          await this.scanDirectory(basePath, entryRelPath, files);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          // Read markdown file metadata
          const fullPath = join(dirPath, entry.name);
          const stats = await stat(fullPath);
          const content = await readFile(fullPath, 'utf-8');
          const title = this.extractTitle(content, entryRelPath);

          files.push({
            path: entryRelPath,
            title,
            size: stats.size,
            lastModified: stats.mtime.toISOString(),
          });
        }
      }
    } catch (error) {
      console.error(`Failed to scan directory ${dirPath}:`, error);
    }
  }

  /**
   * Extract title from markdown content (first H1) or fallback to filename
   */
  private extractTitle(content: string, relativePath: string): string {
    // Try to extract first H1 heading
    const h1Match = content.match(/^#\s+(.+)$/m);
    if (h1Match) {
      return h1Match[1].trim();
    }

    // Fallback to filename without extension
    const filename = relativePath.split('/').pop() || relativePath;
    return filename.replace(/\.md$/, '');
  }

  async setup(): Promise<void> {
    // No setup needed
  }

  async teardown(): Promise<void> {
    // No teardown needed
  }
}

/**
 * Service factory function
 */
export function createContextService(contextPath: string): ContextService {
  return new ContextService(contextPath);
}
