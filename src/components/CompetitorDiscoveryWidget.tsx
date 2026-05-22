'use client';

import { useEffect, useState } from 'react';
import type { QueryEngineOutput } from '@/modules/query-engine/types';

// ── API types ─────────────────────────────────────────────────────────────────

interface BusinessContext {
  companyType: string;
  industry: string;
  niche: string;
  services: string[];
  targetAudience: string[];
  positioningSummary: string;
  confidence: 'high' | 'medium' | 'low';
}

interface DiscoveredCompetitor {
  domain: string;
  source: string;
  discoveryMethod: string;
  discoveredAt: string;
  queryId: string;
}

interface ProcessedCompetitor {
  normalizedDomain: string;
  competitorId: string;
  source: string;
  discoveryMethod: string;
  queryId: string;
  discoveredAt: string;
}

interface DeduplicationStats {
  totalProcessed: number;
  newCount: number;
  existingCount: number;
  duplicateCount: number;
}

interface DiscoveryOutput {
  competitors: DiscoveredCompetitor[];
  newCompetitors: ProcessedCompetitor[];
  existingCompetitors: ProcessedCompetitor[];
  discoveredCount: number;
  queryId: string;
  providersActive: string[];
  deduplicationStats: DeduplicationStats;
}

// ── Component state ───────────────────────────────────────────────────────────

type StepStatus = 'idle' | 'running' | 'done' | 'error';

interface PipelineState {
  queryEngine:      { status: StepStatus; data: QueryEngineOutput | null; error: string | null };
  contextExtractor: { status: StepStatus; data: BusinessContext | null;   error: string | null };
  discovery:        { status: StepStatus; data: DiscoveryOutput | null;   error: string | null };
}

const INITIAL_STATE: PipelineState = {
  queryEngine:      { status: 'idle', data: null, error: null },
  contextExtractor: { status: 'idle', data: null, error: null },
  discovery:        { status: 'idle', data: null, error: null },
};

// ── Styles ────────────────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = { fontFamily: 'system-ui, sans-serif', maxWidth: 700 };
const inputRowStyle: React.CSSProperties  = { display: 'flex', gap: 8, marginBottom: 32 };

const inputStyle: React.CSSProperties = {
  flex: 1, padding: '10px 14px', fontSize: 15,
  border: '1px solid #d0d0d0', borderRadius: 6, outline: 'none',
};

const buttonStyle: React.CSSProperties = {
  padding: '10px 24px', fontSize: 15, fontWeight: 600,
  background: '#0070f3', color: '#fff', border: 'none',
  borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap',
};

function stepCardStyle(status: StepStatus): React.CSSProperties {
  const borderColor = status === 'done' ? '#86efac' : status === 'error' ? '#fca5a5' : '#e0e0e0';
  const bg          = status === 'done' ? '#f0fdf4' : status === 'error' ? '#fef2f2' : '#fafafa';
  return { border: `1px solid ${borderColor}`, borderRadius: 8, padding: '16px 20px', background: bg, marginBottom: 8 };
}

const stepHeaderStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
};

const stepTitleStyle: React.CSSProperties = { fontWeight: 700, fontSize: 15, color: '#111' };
const stepDescStyle:  React.CSSProperties = { fontSize: 13, color: '#555', marginBottom: 12, lineHeight: 1.5 };

function badgeStyle(color: string): React.CSSProperties {
  const palette: Record<string, { bg: string; text: string; border: string }> = {
    blue:   { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
    green:  { bg: '#f0fdf4', text: '#15803d', border: '#86efac' },
    orange: { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' },
    gray:   { bg: '#f4f4f5', text: '#3f3f46', border: '#d4d4d8' },
    purple: { bg: '#faf5ff', text: '#7e22ce', border: '#d8b4fe' },
    teal:   { bg: '#f0fdfa', text: '#0f766e', border: '#99f6e4' },
  };
  const p = palette[color] ?? palette['gray']!;
  return {
    display: 'inline-block', padding: '2px 8px', borderRadius: 4,
    fontSize: 11, fontWeight: 600, background: p.bg, color: p.text,
    border: `1px solid ${p.border}`, fontFamily: 'monospace', marginRight: 4,
  };
}

function fieldRow(label: string, value: React.ReactNode) {
  return (
    <div key={label} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'baseline' }}>
      <span style={{ fontSize: 12, color: '#777', width: 180, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, fontFamily: 'monospace', color: '#222', wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
}

function confidenceBadgeColor(c: string) {
  if (c === 'high')   return 'green';
  if (c === 'medium') return 'orange';
  return 'gray';
}

function StatusBadge({ status }: { status: StepStatus }) {
  if (status === 'idle')    return <span style={{ fontSize: 12, color: '#999' }}>waiting</span>;
  if (status === 'running') return <span style={{ fontSize: 12, color: '#2563eb', fontWeight: 600, letterSpacing: 0.3 }}>running…</span>;
  if (status === 'done')    return <span style={{ fontSize: 12, color: '#15803d', fontWeight: 600 }}>✓ done</span>;
  return <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 600 }}>✗ error</span>;
}

function ConnectorArrow() {
  return (
    <div style={{ textAlign: 'center', fontSize: 18, color: '#9ca3af', margin: '4px 0', lineHeight: 1 }}>↓</div>
  );
}

// ── Stat chip ─────────────────────────────────────────────────────────────────

function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  const palette: Record<string, { bg: string; text: string; border: string }> = {
    green:  { bg: '#f0fdf4', text: '#15803d', border: '#86efac' },
    blue:   { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
    gray:   { bg: '#f4f4f5', text: '#3f3f46', border: '#d4d4d8' },
    orange: { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' },
  };
  const p = palette[color] ?? palette['gray']!;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '8px 20px', borderRadius: 8, border: `1px solid ${p.border}`,
      background: p.bg, minWidth: 72,
    }}>
      <span style={{ fontSize: 22, fontWeight: 700, color: p.text }}>{value}</span>
      <span style={{ fontSize: 11, color: p.text, fontWeight: 600, marginTop: 2 }}>{label}</span>
    </div>
  );
}

// ── Competitor row ────────────────────────────────────────────────────────────

function CompetitorRow({
  domain, tag, tagColor, method, source,
}: {
  domain: string;
  tag?: string;
  tagColor?: string;
  method?: string;
  source?: string;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '7px 12px', background: '#fff',
      border: '1px solid #e5e7eb', borderRadius: 6,
    }}>
      <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 13, flex: 1, color: '#111' }}>
        {domain}
      </span>
      {tag && <span style={badgeStyle(tagColor ?? 'gray')}>{tag}</span>}
      {method && <span style={badgeStyle('purple')}>{method}</span>}
      {source && <span style={badgeStyle('gray')}>{source}</span>}
    </div>
  );
}

// ── Discovery results section ─────────────────────────────────────────────────

function DiscoveryResults({
  data,
  knownBeforeRun,
}: {
  data: DiscoveryOutput;
  knownBeforeRun: string[];
}) {
  const [showAll, setShowAll] = useState(false);

  const { newCompetitors, existingCompetitors, deduplicationStats, providersActive } = data;

  const newDomains    = new Set(newCompetitors.map((c) => c.normalizedDomain));
  const existingDomains = new Set(existingCompetitors.map((c) => c.normalizedDomain));

  // Full known list: domains from DB before this run + any new ones added this run
  const allKnown: string[] = [
    ...newCompetitors.map((c) => c.normalizedDomain),
    ...knownBeforeRun.filter((d) => !newDomains.has(d)),
  ];

  const groqActive = providersActive.includes('groq');
  const hasNewThisRun = deduplicationStats.newCount > 0;
  const hasAnyKnown = allKnown.length > 0;

  return (
    <div>
      {/* Stat chips */}
      {fieldRow(
        'Active providers',
        <span>{providersActive.map((p) => <span key={p} style={badgeStyle('blue')}>{p}</span>)}</span>,
      )}

      <div style={{ display: 'flex', gap: 10, margin: '14px 0 16px' }}>
        <StatChip label="NEW"      value={deduplicationStats.newCount}      color="green" />
        <StatChip label="EXISTING" value={deduplicationStats.existingCount} color="blue" />
        <StatChip label="TOTAL DB" value={allKnown.length}                  color="gray" />
      </div>

      {/* This run: newly discovered */}
      {newCompetitors.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#15803d', marginBottom: 6 }}>
            NEW this run — {newCompetitors.length} competitor{newCompetitors.length !== 1 ? 's' : ''}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {newCompetitors.map((c) => (
              <CompetitorRow
                key={c.normalizedDomain}
                domain={c.normalizedDomain}
                tag="NEW"
                tagColor="green"
                method={c.discoveryMethod}
                source={c.source}
              />
            ))}
          </div>
        </div>
      )}

      {/* This run: re-discovered existing */}
      {existingCompetitors.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#1d4ed8', marginBottom: 6 }}>
            Re-discovered this run — {existingCompetitors.length} already known
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {existingCompetitors.map((c) => (
              <CompetitorRow
                key={c.normalizedDomain}
                domain={c.normalizedDomain}
                tag="EXISTING"
                tagColor="blue"
                method={c.discoveryMethod}
                source={c.source}
              />
            ))}
          </div>
        </div>
      )}

      {/* No new discoveries message */}
      {!hasNewThisRun && (
        <div style={{
          padding: '10px 14px', borderRadius: 6, fontSize: 13,
          background: hasAnyKnown ? '#f0f9ff' : '#fefce8',
          border: `1px solid ${hasAnyKnown ? '#bae6fd' : '#fde68a'}`,
          color: hasAnyKnown ? '#075985' : '#92400e',
          marginBottom: 14,
        }}>
          {hasAnyKnown
            ? `No new competitors found this run. ${allKnown.length} known competitor${allKnown.length !== 1 ? 's' : ''} already in database.`
            : 'No competitors discovered yet.'
          }
          {!groqActive && (
            <div style={{ marginTop: 6, color: '#92400e' }}>
              Add a <code style={{ fontFamily: 'monospace' }}>GROQ_API_KEY</code> to{' '}
              <code style={{ fontFamily: 'monospace' }}>.env</code> to enable AI discovery.
            </div>
          )}
        </div>
      )}

      {/* All known competitors — collapsible */}
      {hasAnyKnown && (
        <div>
          <button
            onClick={() => setShowAll((v) => !v)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, color: '#6b7280', padding: '4px 0',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <span>{showAll ? '▾' : '▸'}</span>
            <span>All known competitors ({allKnown.length})</span>
          </button>

          {showAll && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
              {allKnown.map((domain) => (
                <CompetitorRow
                  key={domain}
                  domain={domain}
                  tag={newDomains.has(domain) ? 'NEW' : existingDomains.has(domain) ? 'SEEN' : undefined}
                  tagColor={newDomains.has(domain) ? 'green' : existingDomains.has(domain) ? 'blue' : undefined}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function CompetitorDiscoveryWidget() {
  const [query,    setQuery]    = useState('');
  const [pipeline, setPipeline] = useState<PipelineState>(INITIAL_STATE);
  const [running,  setRunning]  = useState(false);
  const [mounted,  setMounted]  = useState(false);

  useEffect(() => { setMounted(true); }, []);

  function updateStep<K extends keyof PipelineState>(step: K, patch: Partial<PipelineState[K]>) {
    setPipeline((prev) => ({ ...prev, [step]: { ...prev[step], ...patch } }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setRunning(true);
    setPipeline(INITIAL_STATE);

    // ── Step 1: Query Engine ───────────────────────────────────────────────
    updateStep('queryEngine', { status: 'running' });

    let qeData: QueryEngineOutput | null = null;
    try {
      const res  = await fetch('/api/v1/query-engine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmed }),
      });
      const json = await res.json() as { success: true; data: QueryEngineOutput } | { success: false; error: string };
      if (!json.success) { updateStep('queryEngine', { status: 'error', error: json.error }); setRunning(false); return; }
      qeData = json.data;
      updateStep('queryEngine', { status: 'done', data: qeData });
    } catch {
      updateStep('queryEngine', { status: 'error', error: 'Network error — could not reach the API.' });
      setRunning(false);
      return;
    }

    // ── Step 2: Context Extractor ──────────────────────────────────────────
    updateStep('contextExtractor', { status: 'running' });

    let businessContext: BusinessContext | null = null;
    try {
      const res  = await fetch('/api/v1/context-extractor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: qeData.normalizedDomain, queryId: qeData.queryId }),
      });
      const json = await res.json() as { success: true; data: BusinessContext } | { success: false; error: string };
      if (!json.success) {
        updateStep('contextExtractor', { status: 'error', error: json.error });
      } else {
        businessContext = json.data;
        updateStep('contextExtractor', { status: 'done', data: businessContext });
      }
    } catch {
      updateStep('contextExtractor', { status: 'error', error: 'Network error — context extraction skipped.' });
    }

    // ── Step 3: Discovery ──────────────────────────────────────────────────
    updateStep('discovery', { status: 'running' });

    try {
      const res  = await fetch('/api/v1/discovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          normalizedDomain: qeData.normalizedDomain,
          exclusions:       qeData.exclusions,
          queryId:          qeData.queryId,
          ...(businessContext ? { businessContext } : {}),
        }),
      });
      const json = await res.json() as { success: true; data: DiscoveryOutput } | { success: false; error: string };
      if (!json.success) {
        updateStep('discovery', { status: 'error', error: json.error });
      } else {
        updateStep('discovery', { status: 'done', data: json.data });
      }
    } catch {
      updateStep('discovery', { status: 'error', error: 'Network error — could not reach the API.' });
    } finally {
      setRunning(false);
    }
  }

  const { queryEngine, contextExtractor, discovery } = pipeline;
  const hasStarted = queryEngine.status !== 'idle';

  return (
    <div style={containerStyle}>
      {/* Input */}
      <form onSubmit={handleSubmit} style={inputRowStyle}>
        <input
          style={inputStyle}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. https://www.brillmark.com"
          disabled={running}
        />
        <button style={buttonStyle} type="submit" disabled={running || !query.trim()}>
          {running ? 'Analyzing…' : 'Analyze'}
        </button>
      </form>

      {/* Pipeline */}
      {mounted && hasStarted && (
        <>
          {/* Step 1: Query Engine */}
          <div style={stepCardStyle(queryEngine.status)}>
            <div style={stepHeaderStyle}>
              <span style={stepTitleStyle}>Step 1 — Query Engine</span>
              <StatusBadge status={queryEngine.status} />
            </div>
            <p style={stepDescStyle}>
              Parses the raw input, strips protocol / path / www prefix, validates it is a public
              domain, and loads all known competitors from the database as an exclusion list.
            </p>
            {queryEngine.error && <div style={{ color: '#dc2626', fontSize: 13 }}>{queryEngine.error}</div>}
            {queryEngine.data && (
              <div>
                {fieldRow('Normalized domain', queryEngine.data.normalizedDomain)}
                {fieldRow('Known in DB',       String(queryEngine.data.excludedCount))}
                {fieldRow('Query ID',          queryEngine.data.queryId)}
                {fieldRow('Requested at',      queryEngine.data.requestedAt)}
              </div>
            )}
          </div>

          <ConnectorArrow />

          {/* Step 2: Context Extractor */}
          <div style={stepCardStyle(contextExtractor.status)}>
            <div style={stepHeaderStyle}>
              <span style={stepTitleStyle}>Step 2 — Context Extractor</span>
              <StatusBadge status={contextExtractor.status} />
            </div>
            <p style={stepDescStyle}>
              Crawls the target website, extracts visible content, then uses Groq AI to identify
              the company&apos;s industry, niche, and services. This context is fed into competitor
              discovery to prevent hallucinated results.
            </p>
            {contextExtractor.status === 'error' && (
              <div style={{ color: '#b45309', fontSize: 13 }}>
                ⚠ {contextExtractor.error} — discovery will continue without website context.
              </div>
            )}
            {contextExtractor.status === 'running' && (
              <div style={{ fontSize: 13, color: '#555' }}>Crawling website and analyzing content…</div>
            )}
            {contextExtractor.data && (() => {
              const ctx = contextExtractor.data;
              return (
                <div>
                  {fieldRow('Company type', ctx.companyType)}
                  {fieldRow('Industry',     ctx.industry)}
                  {fieldRow('Niche',        ctx.niche)}
                  {fieldRow('Confidence',   <span style={badgeStyle(confidenceBadgeColor(ctx.confidence))}>{ctx.confidence}</span>)}
                  {ctx.services.length > 0 && fieldRow(
                    'Services',
                    <span>{ctx.services.map((s) => <span key={s} style={badgeStyle('teal')}>{s}</span>)}</span>,
                  )}
                  {ctx.targetAudience.length > 0 && fieldRow(
                    'Target audience',
                    <span>{ctx.targetAudience.map((a) => <span key={a} style={badgeStyle('blue')}>{a}</span>)}</span>,
                  )}
                  {ctx.positioningSummary && fieldRow('Positioning', ctx.positioningSummary)}
                </div>
              );
            })()}
          </div>

          <ConnectorArrow />

          {/* Step 3: Discovery Engine */}
          <div style={stepCardStyle(discovery.status)}>
            <div style={stepHeaderStyle}>
              <span style={stepTitleStyle}>Step 3 — Discovery Engine</span>
              <StatusBadge status={discovery.status} />
            </div>
            <p style={stepDescStyle}>
              Runs all active providers in parallel (AI + web search). Results are normalized,
              validated, and classified as new or existing by the deduplication engine.
              Known competitors are shown below with their discovery history.
            </p>
            {discovery.error && <div style={{ color: '#dc2626', fontSize: 13 }}>{discovery.error}</div>}
            {discovery.status === 'running' && (
              <div style={{ fontSize: 13, color: '#555' }}>Querying providers…</div>
            )}
            {discovery.data && queryEngine.data && (
              <DiscoveryResults
                data={discovery.data}
                knownBeforeRun={queryEngine.data.exclusions}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
