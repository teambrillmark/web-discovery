'use client';

import { useEffect, useState } from 'react';
import { Clock, ChevronRight } from 'lucide-react';
import clsx from 'clsx';

interface Query {
  id: string;
  raw: string;
  intent: string;
  industry: string | null;
  createdAt: string;
}

interface Props {
  onSelect: (id: string, text: string) => void;
  activeId: string | null;
}

const INTENT_COLORS: Record<string, string> = {
  competitor_analysis: 'bg-blue-900/50 text-blue-300',
  market_discovery: 'bg-purple-900/50 text-purple-300',
  agency_search: 'bg-green-900/50 text-green-300',
  local_business_search: 'bg-yellow-900/50 text-yellow-300',
  product_discovery: 'bg-pink-900/50 text-pink-300',
  general_search: 'bg-gray-800 text-gray-400',
};

export function QueryHistory({ onSelect, activeId }: Props) {
  const [queries, setQueries] = useState<Query[]>([]);
  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  useEffect(() => {
    const load = async () => {
      const data = await fetch(`${API}/api/queries`).then(r => r.json()).catch(() => []);
      setQueries(Array.isArray(data) ? data : []);
    };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [API]);

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-gray-400" />
        <h3 className="text-sm font-semibold text-white">Query History</h3>
      </div>
      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {queries.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-4">No queries yet</p>
        ) : (
          queries.map(q => (
            <button
              key={q.id}
              onClick={() => onSelect(q.id, q.raw)}
              className={clsx(
                'w-full text-left rounded-lg p-3 border transition-colors text-xs space-y-1.5',
                activeId === q.id
                  ? 'border-blue-600 bg-blue-900/20'
                  : 'border-gray-800 hover:border-gray-700 hover:bg-gray-800/50'
              )}
            >
              <div className="flex items-start justify-between gap-1">
                <p className="text-gray-200 font-medium leading-tight line-clamp-2">{q.raw}</p>
                <ChevronRight className="w-3 h-3 text-gray-500 flex-shrink-0 mt-0.5" />
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={clsx('badge', INTENT_COLORS[q.intent] ?? 'bg-gray-800 text-gray-400')}>
                  {q.intent.replace(/_/g, ' ')}
                </span>
                {q.industry && <span className="badge bg-gray-800 text-gray-400">{q.industry}</span>}
              </div>
              <p className="text-gray-600">{new Date(q.createdAt).toLocaleString()}</p>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
