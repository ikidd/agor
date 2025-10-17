/**
 * Codex Model Constants
 *
 * OpenAI Codex model identifiers and defaults
 */

/** Default Codex model (GPT-5-Codex optimized for software engineering) */
export const DEFAULT_CODEX_MODEL = 'gpt-5-codex';

/** Codex Mini model (o4-mini based, for CLI) */
export const CODEX_MINI_MODEL = 'codex-mini-latest';

/** Model aliases for Codex */
export const CODEX_MODELS = {
  'gpt-5-codex': 'gpt-5-codex',
  'codex-mini': 'codex-mini-latest',
  'gpt-4o': 'gpt-4o',
  'gpt-4o-mini': 'gpt-4o-mini',
} as const;
