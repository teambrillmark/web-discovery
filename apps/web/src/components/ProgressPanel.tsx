'use client';

import { useEffect, useRef } from 'react';
import { CheckCircle2, Loader2, Circle, AlertCircle, User, Search, GitCompare, Filter, Save } from 'lucide-react';
import clsx from 'clsx';

export interface AgentEvent {
  type: 'log' | 'stage_start' | 'stage_done' | 'done' | 'error';
  stage: 'profile' | 'search' | 'match' | 'filter' | 'save' | 'complete';
  agent: string;
  message: string;
  progress: number;
  data?: Record<string, unknown>;
}

interface Props {
  events: AgentEvent[];
  isRunning: boolean;
  isDone: boolean;
  entitiesFound: number;
}

// Pipeline stages shown in the visual header
const STAGES = [
  { id: 'profile', label: '1. Profile',  icon: User,       desc: 'Build company profile' },
  { id: 'search',  label: '2. Search',   icon: Search,     desc: 'Find candidates' },
  { id: 'match',   label: '3. Match',    icon: GitCompare, desc: 'Compare services' },
  { id: 'filter',  label: '4. Filter',   icon: Filter,     desc: 'Rank & filter' },
  { id: 'save',    label: '5. Save',     icon: Save,       desc: 'Store results' },
] as const;

type StageId = typeof STAGES[number]['id'];

const AGENT_COLORS: Record<string, string> = {
  CompanyProfiler:    'text-violet-400',
  CompetitorSearcher: 'text-blue-400',
  ServiceMatcher:     'text-amber-400',
  RelevancyFilter:    'text-orange-400',
  Orchestrator:       'text-gray-400',
};

const AGENT_BG: Record<string, string> = {
  CompanyProfiler:    'bg-violet-900/30',
  CompetitorSearcher: 'bg-blue-900/30',
  ServiceMatcher:     'bg-amber-900/30',
  RelevancyFilter:    'bg-orange-900/30',
  Orchestrator:       'bg-gray-800/50',
};

export function ProgressPanel({ events, isRunning, isDone, entitiesFound }: Props) {
  const logRef = useRef<HTMLDivElement>(null);

  // Auto-scroll log to bottom on new events
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [events.length]);

  // Determine each stage's status based on events
  const getStageStatus = (stageId: StageId): 'pending' | 'running' | 'done' | 'error' => {
    const stageEvents = events.filter(e => e.stage === stageId);
    if (stageEvents.some(e => e.type === 'error')) return 'error';
    if (stageEvents.some(e => e.type === 'stage_done')) return 'done';
    if (stageEvents.some(e => e.type === 'stage_start' || e.type === 'log')) return 'running';
    return 'pending';
  };

  // Overall progress from most recent event
  const currentProgress = events.length > 0
    ? Math.max(...events.map(e => e.progress ?? 0))
    : 0;

  const hasError = events.some(e => e.type === 'error');

  if (events.length === 0 && !isRunning) return null;

  return (
    <div className="card space-y-0 overflow-hidden p-0">
      {/* ── Pipeline header ──────────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-800 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse inline-block" />
            Discovery Pipeline
          </h3>
          {isDone && !hasError && (
            <span className="text-xs text-green-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {entitiesFound} result{entitiesFound !== 1 ? 's' : ''} saved
            </span>
          )}
          {hasError && (
            <span className="text-xs text-red-400 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              Error
            </span>
          )}
        </div>

        {/* Stage pipeline */}
        <div className="flex items-center gap-1">
          {STAGES.map((stage, i) => {
            const status = isDone ? 'done' : getStageStatus(stage.id as StageId);
            const Icon = stage.icon;
            return (
              <div key={stage.id} className="flex items-center gap-1 flex-1 min-w-0">
                <div
                  className={clsx(
                    'flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg flex-1 min-w-0 transition-all text-center',
                    status === 'done'    && 'bg-green-900/30 border border-green-800/50',
                    status === 'running' && 'bg-blue-900/40 border border-blue-700/60 ring-1 ring-blue-500/30',
                    status === 'error'   && 'bg-red-900/30 border border-red-800/50',
                    status === 'pending' && 'bg-gray-800/50 border border-gray-700/30',
                  )}
                >
                  <div className={clsx(
                    'flex items-center gap-1',
                    status === 'done'    && 'text-green-400',
                    status === 'running' && 'text-blue-300',
                    status === 'error'   && 'text-red-400',
                    status === 'pending' && 'text-gray-600',
                  )}>
                    {status === 'done'    && <CheckCircle2 className="w-3 h-3 flex-shrink-0" />}
                    {status === 'running' && <Loader2 className="w-3 h-3 flex-shrink-0 animate-spin" />}
                    {status === 'error'   && <AlertCircle className="w-3 h-3 flex-shrink-0" />}
                    {status === 'pending' && <Circle className="w-3 h-3 flex-shrink-0" />}
                    <span className="text-[10px] font-medium truncate">{stage.label}</span>
                  </div>
                </div>
                {i < STAGES.length - 1 && (
                  <div className={clsx(
                    'w-3 h-px flex-shrink-0',
                    getStageStatus(STAGES[i + 1].id as StageId) !== 'pending' || isDone
                      ? 'bg-green-700' : 'bg-gray-700',
                  )} />
                )}
              </div>
            );
          })}
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
            <div
              className={clsx(
                'h-1.5 rounded-full transition-all duration-500',
                hasError ? 'bg-red-500' : isDone ? 'bg-green-500' : 'bg-blue-500',
              )}
              style={{ width: `${isDone ? 100 : currentProgress}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-gray-500">
            <span>{isDone ? 'Complete' : isRunning ? 'Running...' : 'Waiting'}</span>
            <span>{isDone ? '100' : currentProgress}%</span>
          </div>
        </div>
      </div>

      {/* ── Live log stream ───────────────────────────────────────────────── */}
      <div
        ref={logRef}
        className="max-h-[280px] overflow-y-auto font-mono text-[11px] leading-relaxed px-3 py-2 space-y-0.5"
      >
        {events.filter(e => e.type === 'log' || e.type === 'stage_start' || e.type === 'stage_done' || e.type === 'done' || e.type === 'error').map((event, i) => (
          <div
            key={i}
            className={clsx(
              'flex items-start gap-2 py-0.5 rounded px-1.5',
              event.type === 'stage_start' && 'mt-1 opacity-90',
              event.type === 'stage_done'  && 'opacity-90',
              event.type === 'done'        && 'text-green-400 font-medium',
              event.type === 'error'       && 'text-red-400',
              event.type === 'log'         && (AGENT_BG[event.agent] ?? ''),
            )}
          >
            {/* Agent badge */}
            <span className={clsx(
              'flex-shrink-0 font-bold text-[9px] uppercase tracking-wider mt-0.5 w-[82px] text-right truncate',
              AGENT_COLORS[event.agent] ?? 'text-gray-500',
            )}>
              {event.agent}
            </span>

            {/* Icon prefix */}
            <span className="flex-shrink-0 text-gray-600 mt-0.5">
              {event.type === 'stage_start' && '▶'}
              {event.type === 'stage_done'  && '✓'}
              {event.type === 'done'        && '✅'}
              {event.type === 'error'       && '✗'}
              {event.type === 'log'         && '·'}
            </span>

            {/* Message */}
            <span className={clsx(
              'flex-1 min-w-0 break-words',
              event.type === 'stage_start' && 'text-white font-medium',
              event.type === 'stage_done'  && 'text-green-400/80',
              event.type === 'log'         && 'text-gray-300',
            )}>
              {event.message}
            </span>
          </div>
        ))}

        {isRunning && events.length === 0 && (
          <div className="text-gray-500 py-4 text-center">Initializing agents...</div>
        )}

        {isDone && !hasError && (
          <div className="text-green-400 text-center py-2 font-medium border-t border-gray-800 mt-1">
            ✅ Discovery complete — {entitiesFound} result{entitiesFound !== 1 ? 's' : ''} found
          </div>
        )}
      </div>
    </div>
  );
}
