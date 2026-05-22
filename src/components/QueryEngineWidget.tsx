'use client';

import { useEffect, useState } from 'react';
import { isClient } from '@/lib/environment';
import type { QueryEngineOutput } from '@/modules/query-engine/types';

interface ApiSuccess {
  success: true;
  data: QueryEngineOutput;
}

interface ApiError {
  success: false;
  error: string;
  code?: string;
  issues?: unknown[];
}

type ApiResponse = ApiSuccess | ApiError;

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 16,
  border: '1px solid #ccc',
  borderRadius: 4,
  width: 360,
  marginRight: 8,
};

const buttonStyle: React.CSSProperties = {
  padding: '8px 20px',
  fontSize: 16,
  background: '#0070f3',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
};

export function QueryEngineWidget() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<QueryEngineOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Defer environment detection to after hydration to avoid SSR/client mismatch.
  // During SSR, typeof window === 'undefined' is true even for client components.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const componentEnv = mounted ? (isClient() ? 'client' : 'server') : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/v1/query-engine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() }),
      });

      const response = (await res.json()) as ApiResponse;

      if (!response.success) {
        setError(response.error);
        return;
      }

      setResult(response.data);
    } catch {
      setError('Network error — could not reach the API.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {mounted && (
        <div
          style={{
            display: 'inline-block',
            padding: '4px 10px',
            borderRadius: 4,
            fontSize: 13,
            fontFamily: 'monospace',
            marginBottom: 20,
            background: '#e8f5e9',
            color: '#2e7d32',
            border: '1px solid #a5d6a7',
          }}
        >
          Component running in: <strong>{componentEnv}</strong>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ marginBottom: 24 }}>
        <input
          style={inputStyle}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. https://www.shopify.com"
          disabled={loading}
        />
        <button style={buttonStyle} type="submit" disabled={loading || !query.trim()}>
          {loading ? 'Running…' : 'Analyze'}
        </button>
      </form>

      {error && (
        <div
          style={{
            padding: '12px 16px',
            background: '#ffebee',
            border: '1px solid #ef9a9a',
            borderRadius: 4,
            color: '#c62828',
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {result && (
        <div
          style={{
            padding: '16px 20px',
            background: '#f5f5f5',
            border: '1px solid #e0e0e0',
            borderRadius: 4,
          }}
        >
          <div style={{ marginBottom: 8 }}>
            <span style={{ color: '#666', fontSize: 13 }}>Normalized domain: </span>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{result.normalizedDomain}</span>
          </div>

          <div style={{ marginBottom: 8 }}>
            <span style={{ color: '#666', fontSize: 13 }}>Known competitors excluded: </span>
            <span style={{ fontWeight: 600 }}>{result.excludedCount}</span>
          </div>

          <div style={{ marginBottom: 8 }}>
            <span style={{ color: '#666', fontSize: 13 }}>Query ID: </span>
            <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#555' }}>{result.queryId}</span>
          </div>

          <div style={{ marginBottom: result.exclusions.length > 0 ? 12 : 0 }}>
            <span style={{ color: '#666', fontSize: 13 }}>Requested at: </span>
            <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#555' }}>{result.requestedAt}</span>
          </div>

          {result.exclusions.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14 }}>
              {result.exclusions.slice(0, 20).map((domain) => (
                <li key={domain} style={{ fontFamily: 'monospace', lineHeight: 1.8 }}>
                  {domain}
                </li>
              ))}
              {result.exclusions.length > 20 && (
                <li style={{ color: '#666' }}>…and {result.exclusions.length - 20} more</li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
