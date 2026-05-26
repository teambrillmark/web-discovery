'use client';

import { useEffect, useState } from 'react';
import type { QueryEngineOutput } from '@/modules/query-engine/types';

// ── API types ─────────────────────────────────────────────────────────────────

interface BusinessContext {
  companyType: string;
  category: string;
  industry: string;
  niche: string;
  primaryCompetitiveIdentity: string;
  primarySpecialties: string[];
  secondaryCapabilities: string[];
  coreServices: string[];
  competitiveSurfaces: string[];
  competitorSearchQueries: string[];
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

interface QualificationStats {
  totalInput: number;
  accepted: number;
  rejected: number;
  rejectedByRules: number;
  rejectedByAI: number;
  rejectionReasons: Record<string, number>;
}

interface MatchedSignals {
  businessTypeMatch: boolean;
  industryMatch: boolean;
  specialtyOverlap: number;
  audienceOverlap: number;
  serviceOverlap: number;
  identitySimilarity: number;
}

interface CompetitorProfileSummary {
  companyType: string | null;
  industry: string | null;
  niche: string | null;
  primaryCompetitiveIdentity: string | null;
  primarySpecialties: string[];
  targetAudience: string[];
  aiConfidence: 'high' | 'medium' | 'low';
}

interface RankedCompetitor {
  domain: string;
  source: string;
  discoveryMethod: string;
  discoveredAt: string;
  queryId: string;
  relevanceScore: number;
  scoreConfidence: 'high' | 'medium' | 'low';
  matchedSignals: MatchedSignals;
  scoringReasoning: string[];
  profile: CompetitorProfileSummary;
}

interface ProfilingStats {
  totalInput: number;
  highRelevance: number;
  mediumRelevance: number;
  lowRelevance: number;
  averageScore: number;
  cacheHits?: number;
  cacheMisses?: number;
}

interface FilterStats {
  totalInput: number;
  passed: number;
  filtered: number;
  filterRate: number;
}

interface DiscoveryOutput {
  rankedCompetitors: RankedCompetitor[];
  competitors: DiscoveredCompetitor[];
  newCompetitors: ProcessedCompetitor[];
  existingCompetitors: ProcessedCompetitor[];
  discoveredCount: number;
  queryId: string;
  providersActive: string[];
  deduplicationStats: DeduplicationStats;
  filterStats?: FilterStats;
  qualificationStats?: QualificationStats;
  profilingStats?: ProfilingStats;
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

// ── Score badge with bar ──────────────────────────────────────────────────────

function ScoreBadge({ score, confidence }: { score: number; confidence: string }) {
  const color = confidence === 'high' ? '#15803d'
    : confidence === 'medium' ? '#b45309'
    : '#6b7280';
  const bg = confidence === 'high' ? '#f0fdf4'
    : confidence === 'medium' ? '#fffbeb'
    : '#f4f4f5';
  const border = confidence === 'high' ? '#86efac'
    : confidence === 'medium' ? '#fcd34d'
    : '#d4d4d8';
  const barColor = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#d1d5db';
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '4px 10px', borderRadius: 6,
      border: `1px solid ${border}`, background: bg, minWidth: 58,
    }}>
      <span style={{ fontSize: 17, fontWeight: 700, color, fontFamily: 'monospace', lineHeight: 1.2 }}>{score}</span>
      {/* Score bar */}
      <div style={{ width: '100%', height: 3, background: '#e5e7eb', borderRadius: 2, margin: '2px 0 1px' }}>
        <div style={{ height: '100%', width: `${score}%`, background: barColor, borderRadius: 2, transition: 'width 0.3s ease' }} />
      </div>
      <span style={{ fontSize: 9, fontWeight: 600, color, textTransform: 'uppercase', letterSpacing: 0.3 }}>{confidence}</span>
    </div>
  );
}

// Profile completeness 0–1 — used for the completeness badge
function profileCompletenessRatio(profile: CompetitorProfileSummary): number {
  let filled = 0;
  if (profile.companyType) filled += 1;
  if (profile.industry) filled += 1;
  if (profile.niche) filled += 1;
  if (profile.primaryCompetitiveIdentity) filled += 2;
  if (profile.primarySpecialties.length >= 2) filled += 2;
  if (profile.targetAudience.length >= 1) filled += 1;
  return filled / 8;
}

// ── Ranked competitor card ────────────────────────────────────────────────────

function RankedCompetitorCard({ rank, competitor, isNew }: {
  rank: number;
  competitor: RankedCompetitor;
  isNew: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const { profile, matchedSignals, scoringReasoning } = competitor;
  const completeness = profileCompletenessRatio(profile);

  return (
    <div style={{
      border: '1px solid #e5e7eb', borderRadius: 8,
      background: '#fff', overflow: 'hidden',
    }}>
      {/* Header row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', cursor: 'pointer',
      }} onClick={() => setExpanded((v) => !v)}>
        <span style={{
          fontSize: 11, fontWeight: 700, color: '#9ca3af',
          minWidth: 20, textAlign: 'right',
        }}>#{rank}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 14, color: '#111' }}>
            {competitor.domain}
          </span>
          {profile.niche && (
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {profile.niche}
            </div>
          )}
        </div>
        {isNew && <span style={badgeStyle('green')}>NEW</span>}
        {profile.companyType && <span style={badgeStyle('gray')}>{profile.companyType}</span>}
        <ScoreBadge score={competitor.relevanceScore} confidence={competitor.scoreConfidence} />
        <span style={{ fontSize: 14, color: '#9ca3af', marginLeft: 4 }}>{expanded ? '▾' : '▸'}</span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ borderTop: '1px solid #f3f4f6', padding: '10px 14px 12px', background: '#fafafa' }}>
          {/* Profile summary */}
          {profile.primaryCompetitiveIdentity && (
            <div style={{ fontSize: 12, color: '#7e22ce', fontWeight: 600, marginBottom: 6 }}>
              {profile.primaryCompetitiveIdentity}
            </div>
          )}
          {profile.primarySpecialties.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              {profile.primarySpecialties.map((s) => (
                <span key={s} style={{ ...badgeStyle('purple'), fontSize: 10 }}>{s}</span>
              ))}
            </div>
          )}

          {/* Match signals — only show non-zero signals */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
            {matchedSignals.specialtyOverlap > 0 && (
              <span style={{
                ...badgeStyle(matchedSignals.specialtyOverlap >= 0.5 ? 'teal' : 'gray'),
                fontSize: 10,
              }}>
                specialty {Math.round(matchedSignals.specialtyOverlap * 100)}%
              </span>
            )}
            {matchedSignals.identitySimilarity > 0 && (
              <span style={{
                ...badgeStyle(matchedSignals.identitySimilarity >= 0.4 ? 'teal' : 'gray'),
                fontSize: 10,
              }}>
                identity {Math.round(matchedSignals.identitySimilarity * 100)}%
              </span>
            )}
            {matchedSignals.audienceOverlap > 0 && (
              <span style={{ ...badgeStyle('blue'), fontSize: 10 }}>
                audience {Math.round(matchedSignals.audienceOverlap * 100)}%
              </span>
            )}
            {matchedSignals.businessTypeMatch && (
              <span style={{ ...badgeStyle('green'), fontSize: 10 }}>type ✓</span>
            )}
            {matchedSignals.industryMatch && (
              <span style={{ ...badgeStyle('green'), fontSize: 10 }}>industry ✓</span>
            )}
          </div>

          {/* Reasoning */}
          {scoringReasoning.length > 0 && (
            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 8, marginBottom: 6 }}>
              {scoringReasoning.map((r, i) => (
                <div key={i} style={{ fontSize: 11, color: '#444', marginBottom: 3, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <span style={{ color: '#6ee7b7', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>›</span>
                  <span>{r}</span>
                </div>
              ))}
            </div>
          )}

          {/* Source + profile quality metadata */}
          <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={badgeStyle('gray')}>{competitor.source}</span>
            <span style={badgeStyle('purple')}>{competitor.discoveryMethod}</span>
            <span style={{
              ...badgeStyle(completeness >= 0.75 ? 'green' : completeness >= 0.5 ? 'orange' : 'gray'),
              fontSize: 10,
            }}>
              profile {Math.round(completeness * 100)}%
            </span>
          </div>
        </div>
      )}
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

  const { newCompetitors, existingCompetitors, deduplicationStats, providersActive,
          filterStats, qualificationStats, profilingStats, rankedCompetitors } = data;
  const [showRejected, setShowRejected] = useState(false);

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

  // Top rejection reasons for display (max 4)
  const topRejectionReasons = qualificationStats
    ? Object.entries(qualificationStats.rejectionReasons)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 4)
    : [];

  return (
    <div>
      {/* Stat chips */}
      {fieldRow(
        'Active providers',
        <span>{providersActive.map((p) => <span key={p} style={badgeStyle('blue')}>{p}</span>)}</span>,
      )}

      {/* Candidate filter stats — shown when the lightweight filter ran */}
      {filterStats && filterStats.totalInput > 0 && (
        <div style={{
          margin: '12px 0', padding: '12px 14px', borderRadius: 8,
          border: '1px solid #fde68a', background: '#fffbeb',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#b45309', marginBottom: 8 }}>
            CANDIDATE FILTER
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <StatChip label="DISCOVERED" value={filterStats.totalInput}  color="gray" />
            <span style={{ fontSize: 16, color: '#d1d5db', fontWeight: 700 }}>→</span>
            <StatChip label="FILTERED"   value={filterStats.filtered}    color="orange" />
            <span style={{ fontSize: 16, color: '#d1d5db', fontWeight: 700 }}>→</span>
            <StatChip label="ANALYSED"   value={filterStats.passed}      color="green" />
          </div>
          {filterStats.filtered > 0 && (
            <div style={{ fontSize: 11, color: '#92400e' }}>
              {filterStats.filterRate}% of candidates filtered before deep analysis
              {(profilingStats?.cacheHits ?? 0) > 0 && (
                <span style={{ marginLeft: 8 }}>
                  · {profilingStats!.cacheHits} profile cache hit{profilingStats!.cacheHits !== 1 ? 's' : ''} (Groq skipped)
                </span>
              )}
            </div>
          )}
          {filterStats.filtered === 0 && (
            <div style={{ fontSize: 11, color: '#92400e' }}>
              All candidates passed — no early filtering applied
            </div>
          )}
        </div>
      )}

      {/* Qualification stats — shown when qualification ran */}
      {qualificationStats && qualificationStats.totalInput > 0 && (
        <div style={{
          margin: '12px 0', padding: '12px 14px', borderRadius: 8,
          border: '1px solid #e0e7ff', background: '#f5f3ff',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#4f46e5', marginBottom: 8 }}>
            QUALIFICATION FILTER
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <StatChip label="RETRIEVED"  value={qualificationStats.totalInput}    color="gray" />
            <StatChip label="QUALIFIED"  value={qualificationStats.accepted}      color="green" />
            <StatChip label="REJECTED"   value={qualificationStats.rejected}      color="orange" />
          </div>
          {qualificationStats.rejected > 0 && (
            <div>
              <div style={{ fontSize: 12, color: '#6d28d9', marginBottom: 4 }}>
                {qualificationStats.rejectedByRules} by rules · {qualificationStats.rejectedByAI} by AI
              </div>
              {topRejectionReasons.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowRejected((v) => !v)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 11, fontWeight: 600, color: '#7c3aed', padding: '2px 0',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    <span>{showRejected ? '▾' : '▸'}</span>
                    <span>Top rejection reasons</span>
                  </button>
                  {showRejected && (
                    <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {topRejectionReasons.map(([reason, count]) => (
                        <span key={reason} style={{ ...badgeStyle('orange'), fontSize: 10 }}>
                          {reason} ×{count}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, margin: '14px 0 16px' }}>
        <StatChip label="NEW"      value={deduplicationStats.newCount}      color="green" />
        <StatChip label="EXISTING" value={deduplicationStats.existingCount} color="blue" />
        <StatChip label="TOTAL DB" value={allKnown.length}                  color="gray" />
      </div>

      {/* Ranked competitors — profiling + scoring output */}
      {rankedCompetitors && rankedCompetitors.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          {/* Profiling stats header */}
          {profilingStats && (() => {
            const topScore = rankedCompetitors[0]?.relevanceScore ?? 0;
            const bottomScore = rankedCompetitors[rankedCompetitors.length - 1]?.relevanceScore ?? 0;
            return (
              <div style={{
                margin: '0 0 10px', padding: '10px 14px', borderRadius: 8,
                border: '1px solid #d1fae5', background: '#ecfdf5',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#065f46' }}>RELEVANCE RANKING</span>
                  <span style={{ fontSize: 11, color: '#059669', fontFamily: 'monospace' }}>
                    {bottomScore}–{topScore} / 100
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                  <StatChip label="HIGH"   value={profilingStats.highRelevance}   color="green" />
                  <StatChip label="MEDIUM" value={profilingStats.mediumRelevance} color="orange" />
                  <StatChip label="LOW"    value={profilingStats.lowRelevance}    color="gray" />
                </div>
                <div style={{ height: 4, background: '#d1fae5', borderRadius: 2, marginBottom: 6 }}>
                  <div style={{
                    height: '100%', borderRadius: 2,
                    width: `${profilingStats.averageScore}%`,
                    background: profilingStats.averageScore >= 60 ? '#16a34a' : profilingStats.averageScore >= 35 ? '#d97706' : '#9ca3af',
                    transition: 'width 0.4s ease',
                  }} />
                </div>
                <div style={{ fontSize: 11, color: '#047857' }}>
                  avg {profilingStats.averageScore}/100 · {rankedCompetitors.length} competitor{rankedCompetitors.length !== 1 ? 's' : ''} ranked
                </div>
              </div>
            );
          })()}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rankedCompetitors.map((c, i) => (
              <RankedCompetitorCard
                key={c.domain}
                rank={i + 1}
                competitor={c}
                isNew={newDomains.has(c.domain)}
              />
            ))}
          </div>
        </div>
      )}

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

  const isButtonDisabled = running || !query.trim();

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
        <button
          style={{
            ...buttonStyle,
            ...(isButtonDisabled ? { background: '#94a3b8', cursor: 'not-allowed', opacity: 0.85 } : {}),
          }}
          type="submit"
          disabled={isButtonDisabled}
        >
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
              Crawls the target website and uses Groq AI to extract the company&apos;s primary
              competitive identity — what it most directly competes on, not just every service listed.
              Discovery providers are anchored to this identity to prevent topic drift.
            </p>
            {contextExtractor.status === 'error' && (
              <div style={{ color: '#b45309', fontSize: 13 }}>
                ⚠ {contextExtractor.error} — discovery will continue without website context.
              </div>
            )}
            {contextExtractor.status === 'running' && (
              <div style={{ fontSize: 13, color: '#555' }}>Crawling website and extracting competitive identity…</div>
            )}
            {contextExtractor.data && (() => {
              const ctx = contextExtractor.data;
              const hasIdentity = ctx.primaryCompetitiveIdentity && ctx.primaryCompetitiveIdentity !== 'Unknown';
              return (
                <div>
                  {/* Competitive identity — the most important new fields */}
                  {hasIdentity && fieldRow(
                    'Competitive identity',
                    <span style={{ fontWeight: 600, color: '#7e22ce', fontFamily: 'system-ui' }}>
                      {ctx.primaryCompetitiveIdentity}
                    </span>,
                  )}
                  {ctx.primarySpecialties.length > 0 && fieldRow(
                    'Primary specialties',
                    <span>{ctx.primarySpecialties.map((s) => <span key={s} style={badgeStyle('purple')}>{s}</span>)}</span>,
                  )}
                  {ctx.secondaryCapabilities.length > 0 && fieldRow(
                    'Secondary capabilities',
                    <span>{ctx.secondaryCapabilities.map((s) => <span key={s} style={badgeStyle('gray')}>{s}</span>)}</span>,
                  )}
                  {ctx.competitorSearchQueries.length > 0 && fieldRow(
                    'Discovery queries',
                    <span>{ctx.competitorSearchQueries.map((q) => <span key={q} style={badgeStyle('teal')}>{q}</span>)}</span>,
                  )}
                  <div style={{ borderTop: '1px solid #e5e7eb', margin: '10px 0 8px' }} />
                  {fieldRow('Industry',     ctx.industry)}
                  {fieldRow('Niche',        ctx.niche)}
                  {fieldRow('Confidence',   <span style={badgeStyle(confidenceBadgeColor(ctx.confidence))}>{ctx.confidence}</span>)}
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
              Runs all active providers in parallel (AI + web search). Results are filtered by
              the qualification layer, then each competitor profile is extracted and scored for
              relevance against the target. Competitors are ranked 0–100 by similarity.
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
