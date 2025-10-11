/**
 * useAuthConfig - Fetch daemon authentication configuration
 *
 * Retrieves whether authentication is required from the daemon's health endpoint.
 * Used on app startup to determine if login page should be shown.
 */

import { useEffect, useState } from 'react';

interface AuthConfig {
  requireAuth: boolean;
  allowAnonymous: boolean;
}

interface HealthResponse {
  status: string;
  timestamp: number;
  version: string;
  database: string;
  auth: AuthConfig;
}

export function useAuthConfig() {
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchAuthConfig() {
      try {
        const response = await fetch('http://localhost:3030/health');
        if (!response.ok) {
          throw new Error(`Failed to fetch auth config: ${response.statusText}`);
        }

        const health: HealthResponse = await response.json();
        setConfig(health.auth);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        // Default to requiring auth on error (secure by default)
        setConfig({ requireAuth: true, allowAnonymous: false });
      } finally {
        setLoading(false);
      }
    }

    fetchAuthConfig();
  }, []);

  return { config, loading, error };
}
