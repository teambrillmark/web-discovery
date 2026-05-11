'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ArrowUpDown, Download, RefreshCw, ExternalLink,
  ChevronLeft, ChevronRight, MousePointerClick, Layers,
  ChevronDown, ChevronUp, User, Mail, Phone, Sparkles, Info
} from 'lucide-react';
import clsx from 'clsx';

interface PersonInfo {
  name: string;
  role: string;
  linkedin?: string;
  twitter?: string;
}

interface Entity {
  id: string;
  name: string;
  domain: string;
  description: string | null;
  category: string | null;
  services: string[];
  technologies: string[];
  founders: PersonInfo[];
  linkedin: string | null;
  emails: string[];
  phones: string[];
  confidenceScore: number;
  relevanceScore: number;
  source: string | null;
  firstSeen: string;
  lastSeen: string;
  isNew: boolean | null;
  positioning: string | null;
  competitorTier: 'direct' | 'partial' | 'broader' | null;
}

const TIER_CONFIG: Record<string, { label: string; color: string; dot: string; description: string }> = {
  direct:  { label: 'Direct Competitors',  color: 'text-red-400 border-red-800/50 bg-red-900/20',    dot: 'bg-red-400',    description: 'Same business model · Same service niche' },
  partial: { label: 'Partial Overlap',     color: 'text-amber-400 border-amber-800/50 bg-amber-900/20', dot: 'bg-amber-400', description: 'Overlapping services · Different scope or model' },
  broader: { label: 'Broader Comparables', color: 'text-blue-400 border-blue-800/50 bg-blue-900/20',  dot: 'bg-blue-400',  description: 'Related space · Not a direct service competitor' },
};

interface Props {
  queryId: string | null;
  queryText?: string | null;
}

export function EntityTable({ queryId, queryText }: Props) {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('confidenceScore');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [search, setSearch] = useState('');
  const [minScore, setMinScore] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const limit = 15;

  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  // Reset to page 1 when query changes
  useEffect(() => {
    setPage(1);
    setSearch('');
  }, [queryId, showAll]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        sort,
        order,
        minScore: String(minScore),
        ...(search ? { search } : {}),
        // Pass queryId only when NOT in "show all" mode
        ...(!showAll && queryId ? { queryId } : {}),
      });
      const res = await fetch(`${API}/api/entities?${params}`);
      const data = await res.json();
      setEntities(data.entities ?? []);
      setTotal(data.pagination?.total ?? 0);
    } catch (e) {
      console.error('Failed to load entities:', e);
    } finally {
      setLoading(false);
    }
  }, [API, page, sort, order, search, minScore, queryId, showAll]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 6s to pick up live crawl results
  useEffect(() => {
    const interval = setInterval(load, 6000);
    return () => clearInterval(interval);
  }, [load]);

  const toggleSort = (col: string) => {
    if (sort === col) setOrder(o => o === 'desc' ? 'asc' : 'desc');
    else { setSort(col); setOrder('desc'); }
    setPage(1);
  };

  const exportCSV = () => {
    const params = new URLSearchParams();
    if (!showAll && queryId) params.set('queryId', queryId);
    window.open(`${API}/api/export/csv?${params}`, '_blank');
  };

  const scoreBar = (score: number) => (
    <div className="flex items-center gap-2">
      <div className="w-14 bg-gray-700 rounded-full h-1.5">
        <div
          className={clsx('h-1.5 rounded-full transition-all', {
            'bg-green-500': score >= 0.8,
            'bg-yellow-500': score >= 0.6 && score < 0.8,
            'bg-orange-500': score >= 0.4 && score < 0.6,
            'bg-red-500': score < 0.4,
          })}
          style={{ width: `${Math.round(score * 100)}%` }}
        />
      </div>
      <span className={clsx('text-xs font-mono tabular-nums', {
        'text-green-400': score >= 0.8,
        'text-yellow-400': score >= 0.6 && score < 0.8,
        'text-orange-400': score >= 0.4 && score < 0.6,
        'text-red-400': score < 0.4,
      })}>
        {Math.round(score * 100)}%
      </span>
    </div>
  );

  const pages = Math.ceil(total / limit);

  // When results have tier data, group them for display
  const tieredGroups = useMemo(() => {
    const hasTiers = entities.some(e => e.competitorTier != null);
    if (!hasTiers || showAll) return null;
    const order: Array<'direct' | 'partial' | 'broader'> = ['direct', 'partial', 'broader'];
    const groups = order
      .map(tier => ({ tier, items: entities.filter(e => e.competitorTier === tier) }))
      .filter(g => g.items.length > 0);
    const untiered = entities.filter(e => e.competitorTier == null);
    return { groups, untiered };
  }, [entities, showAll]);

  // True when queryId mode AND we have results but none are marked new
  const allKnown = useMemo(
    () => !showAll && queryId && entities.length > 0 && entities.every(e => e.isNew === false),
    [showAll, queryId, entities],
  );

  const renderEntityRow = (entity: Entity) => {
    const isExpanded = expandedId === entity.id;
    const hasPeople = entity.founders?.length > 0;
    const tierCfg = entity.competitorTier ? TIER_CONFIG[entity.competitorTier] : null;
    return (
      <React.Fragment key={entity.id}>
        <tr
          className={clsx('table-row-hover cursor-pointer select-none', isExpanded && 'bg-gray-800/40')}
          onClick={() => setExpandedId(isExpanded ? null : entity.id)}
        >
          {/* Company */}
          <td className="px-4 py-3 max-w-[180px]">
            <div className="flex items-center gap-1.5">
              {isExpanded
                ? <ChevronUp className="w-3 h-3 text-gray-500 flex-shrink-0" />
                : <ChevronDown className="w-3 h-3 text-gray-500 flex-shrink-0" />}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="font-medium text-white truncate" title={entity.name}>{entity.name}</p>
                  {entity.isNew === true && (
                    <span className="flex-shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold bg-emerald-900/50 text-emerald-400 border border-emerald-700/50 rounded px-1 py-0.5">
                      <Sparkles className="w-2.5 h-2.5" />NEW
                    </span>
                  )}
                </div>
                {tierCfg && !tieredGroups && (
                  <span className={clsx('text-[10px] font-medium capitalize', tierCfg.color.split(' ')[0])}>
                    {entity.competitorTier}
                  </span>
                )}
                {!tierCfg && entity.category && (
                  <span className="text-xs text-gray-500 capitalize">{entity.category}</span>
                )}
              </div>
            </div>
            {hasPeople && (
              <div className="flex items-center gap-1 mt-1 ml-5">
                <User className="w-3 h-3 text-purple-400" />
                <span className="text-xs text-purple-400">{entity.founders.length} person{entity.founders.length > 1 ? 's' : ''}</span>
              </div>
            )}
          </td>

          {/* Domain */}
          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
            <span className="font-mono text-blue-400 text-xs">{entity.domain}</span>
          </td>

          {/* Services */}
          <td className="px-4 py-3">
            <div className="flex flex-wrap gap-1 max-w-[160px]">
              {entity.services?.slice(0, 3).map(s => (
                <span key={s} className="badge bg-gray-800 text-gray-300">{s}</span>
              ))}
              {entity.services?.length > 3 && (
                <span className="badge bg-gray-800 text-gray-500">+{entity.services.length - 3}</span>
              )}
              {entity.services?.length === 0 && (
                <span className="text-xs text-gray-700">—</span>
              )}
            </div>
          </td>

          {/* Tech */}
          <td className="px-4 py-3">
            <div className="flex flex-wrap gap-1 max-w-[140px]">
              {entity.technologies?.slice(0, 2).map(t => (
                <span key={t} className="badge bg-indigo-900/40 text-indigo-300">{t}</span>
              ))}
              {entity.technologies?.length > 2 && (
                <span className="badge bg-gray-800 text-gray-500">+{entity.technologies.length - 2}</span>
              )}
              {entity.technologies?.length === 0 && (
                <span className="text-xs text-gray-700">—</span>
              )}
            </div>
          </td>

          {/* Confidence */}
          <td className="px-4 py-3">{scoreBar(entity.confidenceScore)}</td>

          {/* Relevance */}
          <td className="px-4 py-3">{scoreBar(entity.relevanceScore)}</td>

          {/* Last Seen */}
          <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
            {new Date(entity.lastSeen).toLocaleDateString()}
          </td>

          {/* Links */}
          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <a href={`https://${entity.domain}`} target="_blank" rel="noopener noreferrer"
                className="text-gray-500 hover:text-blue-400 transition-colors" title="Open website">
                <ExternalLink className="w-4 h-4" />
              </a>
              {entity.linkedin && (
                <a href={entity.linkedin} target="_blank" rel="noopener noreferrer"
                  className="text-gray-500 hover:text-blue-400 transition-colors" title="LinkedIn">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                  </svg>
                </a>
              )}
            </div>
          </td>
        </tr>

        {/* Expanded detail row */}
        {isExpanded && (
          <tr className="bg-gray-900/60 border-t border-gray-700/50">
            <td colSpan={8} className="px-6 py-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Key People */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" /> Key People
                  </p>
                  {entity.founders?.length > 0 ? (
                    <div className="space-y-2">
                      {entity.founders.map((person, i) => (
                        <div key={i} className="flex items-center gap-2 flex-wrap">
                          <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-medium text-gray-300">
                              {person.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white font-medium">{person.name}</p>
                            <span className="text-xs text-purple-400">{person.role}</span>
                          </div>
                          {person.linkedin && (
                            <a href={person.linkedin} target="_blank" rel="noopener noreferrer"
                              className="text-gray-500 hover:text-blue-400 transition-colors flex-shrink-0"
                              title={`${person.name} on LinkedIn`}>
                              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                              </svg>
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-600">No key people found</p>
                  )}
                </div>

                {/* Description + all services */}
                <div className="space-y-3">
                  {entity.positioning && (
                    <div className="bg-blue-950/40 border border-blue-800/40 rounded-md px-2.5 py-2">
                      <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-1">Why relevant</p>
                      <p className="text-xs text-blue-200 leading-relaxed italic">{entity.positioning}</p>
                    </div>
                  )}
                  {entity.description && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">About</p>
                      <p className="text-xs text-gray-400 leading-relaxed line-clamp-4">{entity.description}</p>
                    </div>
                  )}
                  {entity.services?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">All Services</p>
                      <div className="flex flex-wrap gap-1">
                        {entity.services.map(s => (
                          <span key={s} className="badge bg-gray-800 text-gray-300">{s}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Contact info + all tech */}
                <div className="space-y-3">
                  {(entity.emails?.length > 0 || entity.phones?.length > 0) && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Contact</p>
                      <div className="space-y-1">
                        {entity.emails?.map(e => (
                          <a key={e} href={`mailto:${e}`}
                            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-blue-400 transition-colors">
                            <Mail className="w-3 h-3 flex-shrink-0" />{e}
                          </a>
                        ))}
                        {entity.phones?.map(p => (
                          <div key={p} className="flex items-center gap-1.5 text-xs text-gray-400">
                            <Phone className="w-3 h-3 flex-shrink-0" />{p}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {entity.technologies?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Full Tech Stack</p>
                      <div className="flex flex-wrap gap-1">
                        {entity.technologies.map(t => (
                          <span key={t} className="badge bg-indigo-900/40 text-indigo-300">{t}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </td>
          </tr>
        )}
      </React.Fragment>
    );
  };

  // ── No query selected yet ──────────────────────────────────────────────
  if (!queryId && !showAll) {
    return (
      <div className="card flex flex-col items-center justify-center py-20 text-center space-y-4">
        <div className="bg-gray-800 rounded-full p-4">
          <MousePointerClick className="w-8 h-8 text-gray-500" />
        </div>
        <div>
          <p className="text-white font-medium text-lg">No query selected</p>
          <p className="text-gray-500 text-sm mt-1 max-w-sm">
            Enter a discovery query above, or pick one from the Query History panel to see its results here.
          </p>
        </div>
        <button
          onClick={() => setShowAll(true)}
          className="btn-secondary text-sm flex items-center gap-2"
        >
          <Layers className="w-4 h-4" />
          Show all discovered entities
        </button>
      </div>
    );
  }

  const tableTitle = showAll
    ? 'All Discovered Entities'
    : queryText
      ? `Results for "${queryText}"`
      : 'Query Results';

  return (
    <div className="card space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-white">{tableTitle}</h2>
            <span className="badge bg-blue-900/50 text-blue-300 tabular-nums">
              {loading && total === 0 ? '…' : total} {total === 1 ? 'entity' : 'entities'}
            </span>
            {queryId && !showAll && (
              <button
                onClick={() => setShowAll(true)}
                className="text-xs text-gray-500 hover:text-gray-300 underline underline-offset-2 transition-colors"
              >
                view all
              </button>
            )}
            {showAll && queryId && (
              <button
                onClick={() => setShowAll(false)}
                className="text-xs text-gray-500 hover:text-gray-300 underline underline-offset-2 transition-colors"
              >
                ← back to query
              </button>
            )}
          </div>
          {!showAll && queryText && (
            <p className="text-xs text-gray-500 font-mono truncate max-w-md">{queryText}</p>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <input
            className="input text-sm py-1.5 w-44"
            placeholder="Search name, domain…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
          <select
            className="input text-sm py-1.5"
            value={minScore}
            onChange={e => { setMinScore(Number(e.target.value)); setPage(1); }}
          >
            <option value={0}>All scores</option>
            <option value={0.4}>≥ 40%</option>
            <option value={0.6}>≥ 60%</option>
            <option value={0.8}>≥ 80%</option>
          </select>
          <button onClick={load} className="btn-secondary p-2" title="Refresh">
            <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
          </button>
          <button onClick={exportCSV} className="btn-secondary flex items-center gap-2 py-1.5 text-sm">
            <Download className="w-4 h-4" />
            CSV
          </button>
        </div>
      </div>

      {/* All-known banner (re-run with no new discoveries) */}
      {allKnown && (
        <div className="flex items-start gap-2 text-sky-400 text-sm bg-sky-900/20 border border-sky-700 rounded-lg px-3 py-2.5">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p>All results below were already discovered in a previous run. Try a different query to find new entities.</p>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-800/80 text-gray-400 text-xs uppercase tracking-wide">
              {([
                { key: 'name',            label: 'Company'    },
                { key: 'domain',          label: 'Domain'     },
                { key: null,              label: 'Services'   },
                { key: null,              label: 'Tech Stack' },
                { key: 'confidenceScore', label: 'Confidence' },
                { key: 'relevanceScore',  label: 'Relevance'  },
                { key: 'lastSeen',        label: 'Last Seen'  },
                { key: null,              label: 'Links'      },
              ] as { key: string | null; label: string }[]).map(({ key, label }) => (
                <th key={label} className="px-4 py-3 text-left whitespace-nowrap">
                  {key ? (
                    <button
                      onClick={() => toggleSort(key)}
                      className="flex items-center gap-1 hover:text-white transition-colors"
                    >
                      {label}
                      <ArrowUpDown className={clsx('w-3 h-3', sort === key && 'text-blue-400')} />
                    </button>
                  ) : label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {loading && entities.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-14 text-gray-500">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-gray-600" />
                  Loading results…
                </td>
              </tr>
            ) : entities.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-14">
                  <div className="text-gray-500 space-y-2">
                    <p className="text-base">No results yet</p>
                    <p className="text-sm text-gray-600">
                      {search
                        ? 'No entities match your search filter.'
                        : 'Discovery is still running — results appear automatically.'}
                    </p>
                  </div>
                </td>
              </tr>
            ) : tieredGroups ? (
              // ── Grouped by competitor tier ──────────────────────────────
              <>
                {tieredGroups.groups.map(({ tier, items }) => {
                  const cfg = TIER_CONFIG[tier];
                  return (
                    <React.Fragment key={tier}>
                      <tr>
                        <td colSpan={8} className="px-4 pt-4 pb-1.5">
                          <div className={clsx('inline-flex items-center gap-2 text-xs font-semibold rounded-full border px-3 py-1', cfg.color)}>
                            <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', cfg.dot)} />
                            {cfg.label}
                            <span className="font-normal opacity-60">— {cfg.description}</span>
                            <span className="ml-1 opacity-80">({items.length})</span>
                          </div>
                        </td>
                      </tr>
                      {items.map(entity => renderEntityRow(entity))}
                    </React.Fragment>
                  );
                })}
                {tieredGroups.untiered.map(entity => renderEntityRow(entity))}
              </>
            ) : (
              entities.map(entity => renderEntityRow(entity))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500 tabular-nums">
            Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => p - 1)}
              disabled={page === 1}
              className="btn-secondary p-2 disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-gray-400 tabular-nums">Page {page} of {pages}</span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page === pages}
              className="btn-secondary p-2 disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
