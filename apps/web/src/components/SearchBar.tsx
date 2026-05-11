'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Loader2, ChevronRight, CheckCircle2, AlertCircle } from 'lucide-react';
import type { AgentEvent } from './ProgressPanel';

const EXAMPLE_QUERIES = [
  'Find competitors of brillmark.com',
  'Best Shopify CRO agencies',
  'Sports jersey manufacturers in Delhi',
  'notion competitor',
  'figma competitor',
  'CRO companies using Optimizely',
];

interface Props {
  onQueryStart: (queryId: string, queryText: string) => void;
  setIsRunning: (v: boolean) => void;
  onProgressEvent: (event: AgentEvent) => void;
  onDiscoveryDone: (entitiesFound: number) => void;
}

interface QueryMeta {
  intent: string;
  industry: string | null;
  queryId: string;
}

export function SearchBar({ onQueryStart, setIsRunning, onProgressEvent, onDiscoveryDone }: Props) {
  const [query, setQuery]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [meta, setMeta]           = useState<QueryMeta | null>(null);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isDone, setIsDone]       = useState(false);
  const [unsupportedError, setUnsupportedError] = useState<string | null>(null);
  const [noNewResults, setNoNewResults] = useState(false);
  const sseRef = useRef<EventSource | null>(null);

  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  // Close SSE on unmount
  useEffect(() => () => { sseRef.current?.close(); }, []);

  const openSSEStream = (jobId: string) => {
    if (sseRef.current) sseRef.current.close();

    const es = new EventSource(`${API}/api/crawl/stream/${jobId}`);
    sseRef.current = es;

    es.onmessage = (e) => {
      try {
        const event: AgentEvent & { data?: any } = JSON.parse(e.data);
        onProgressEvent(event);

        if (event.type === 'done') {
          setIsDiscovering(false);
          setIsDone(true);
          setIsRunning(false);
          const found = (event.data as any)?.entitiesFound ?? 0;
          onDiscoveryDone(found);
          es.close();
        }

        if (event.type === 'error') {
          setIsDiscovering(false);
          setIsRunning(false);
          // Check if this is the unsupported-query sentinel
          if (event.message?.includes('could not be mapped') || event.message?.includes('out of scope')) {
            setUnsupportedError(event.message);
          } else {
            setError(event.message || 'Discovery failed');
          }
          es.close();
        }

        // Check for no-new-results via log messages
        if (event.type === 'log' && event.message?.includes('No new companies')) {
          setNoNewResults(true);
        }
      } catch {}
    };

    es.onerror = () => {
      // SSE closed by server (normal after done/error)
      if (isDiscovering) {
        setIsDiscovering(false);
        setIsRunning(false);
      }
      es.close();
    };
  };

  const handleSubmit = async (e: React.FormEvent | null, override?: string) => {
    e?.preventDefault();
    const q = (override ?? query).trim();
    if (!q) return;

    // Reset state
    setLoading(true);
    setError(null);
    setMeta(null);
    setIsDiscovering(false);
    setIsDone(false);
    setUnsupportedError(null);
    setNoNewResults(false);
    sseRef.current?.close();

    try {
      // 1. Analyze query and create DB record
      const qRes = await fetch(`${API}/api/queries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: q }),
      });
      const qData = await qRes.json();
      if (!qRes.ok) throw new Error(qData.error || 'Failed to create query');

      const queryId = qData.query.id;
      setMeta({
        intent:   qData.analyzed?.intent ?? 'general_search',
        industry: qData.analyzed?.industry ?? null,
        queryId,
      });

      // 2. Open SSE stream BEFORE starting the crawl so we catch all events
      openSSEStream(await startCrawl(q, queryId));

      setIsDiscovering(true);
      setIsRunning(true);
      onQueryStart(queryId, q);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Is the API running on port 3001?');
      setIsRunning(false);
    } finally {
      setLoading(false);
    }
  };

  const startCrawl = async (raw: string, queryId: string): Promise<string> => {
    const res = await fetch(`${API}/api/crawl/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queryId, raw }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to start crawl');
    return data.jobId;
  };

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Search className="w-5 h-5 text-blue-400" />
        <h2 className="font-semibold text-white">Discovery Query</h2>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-3">
        <input
          className="input flex-1 text-base"
          placeholder="e.g. Find competitors of brillmark.com, notion competitor, Best CRO agencies..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          disabled={loading}
        />
        <button
          type="submit"
          className="btn-primary flex items-center gap-2 min-w-[140px] justify-center"
          disabled={loading || !query.trim()}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          {loading ? 'Analyzing...' : 'Discover'}
        </button>
      </form>

      {/* Errors */}
      {error && (
        <div className="flex items-start gap-2 text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {unsupportedError && (
        <div className="flex items-start gap-2 text-amber-400 text-sm bg-amber-900/20 border border-amber-700 rounded-lg px-3 py-2.5">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Query not supported</p>
            <p className="text-amber-500 mt-0.5">{unsupportedError}</p>
          </div>
        </div>
      )}

      {noNewResults && (
        <div className="flex items-start gap-2 text-sky-400 text-sm bg-sky-900/20 border border-sky-700 rounded-lg px-3 py-2.5">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">No new results found</p>
            <p className="text-sky-500 mt-0.5">All discovered companies were already known from a previous run.</p>
          </div>
        </div>
      )}

      {/* Query metadata badges */}
      {meta && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="badge bg-blue-900/50 text-blue-300">
            Intent: {meta.intent.replace(/_/g, ' ')}
          </span>
          {meta.industry && (
            <span className="badge bg-purple-900/50 text-purple-300">
              Industry: {meta.industry.replace(/_/g, ' ')}
            </span>
          )}
          {isDiscovering && (
            <span className="badge bg-yellow-900/40 text-yellow-300 flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" />
              Agents running...
            </span>
          )}
          {isDone && (
            <span className="badge bg-green-900/40 text-green-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3" />
              Discovery complete
            </span>
          )}
        </div>
      )}

      {/* Example chips */}
      <div className="space-y-2">
        <p className="text-xs text-gray-500 font-medium">Try an example:</p>
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_QUERIES.map(eq => (
            <button
              key={eq}
              onClick={() => { setQuery(eq); handleSubmit(null, eq); }}
              disabled={loading}
              className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 rounded-full px-3 py-1 transition-colors flex items-center gap-1 disabled:opacity-50"
            >
              <ChevronRight className="w-3 h-3" />
              {eq}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
