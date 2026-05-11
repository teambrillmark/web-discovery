'use client';

import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import clsx from 'clsx';

interface Log {
  id: string;
  url: string;
  status: string;
  entitiesFound: number;
  duration: number | null;
  error: string | null;
  createdAt: string;
}

interface Props {
  queryId: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  success: 'text-green-400',
  failed: 'text-red-400',
  crawling: 'text-yellow-400',
  pending: 'text-gray-400',
  skipped: 'text-gray-500',
};

export function LogPanel({ queryId }: Props) {
  const [logs, setLogs] = useState<Log[]>([]);
  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  useEffect(() => {
    const load = async () => {
      const params = queryId ? `?queryId=${queryId}` : '';
      const data = await fetch(`${API}/api/crawl/logs${params}`).then(r => r.json()).catch(() => []);
      setLogs(Array.isArray(data) ? data.slice(0, 20) : []);
    };
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [API, queryId]);

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 text-green-400 animate-pulse" />
        <h3 className="text-sm font-semibold text-white">Crawl Activity</h3>
      </div>
      <div className="space-y-1.5 max-h-[300px] overflow-y-auto font-mono text-xs">
        {logs.length === 0 ? (
          <p className="text-gray-500 text-center py-4">Waiting for crawl activity...</p>
        ) : (
          logs.map(log => (
            <div key={log.id} className="flex items-start gap-2 py-1 border-b border-gray-800/50">
              <span className={clsx('flex-shrink-0 font-bold', STATUS_COLOR[log.status] ?? 'text-gray-400')}>
                {log.status === 'success' ? '✓' : log.status === 'failed' ? '✗' : log.status === 'crawling' ? '⟳' : '○'}
              </span>
              <div className="min-w-0">
                <p className="text-gray-400 truncate" title={log.url}>
                  {log.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 35)}
                </p>
                {log.entitiesFound > 0 && (
                  <p className="text-green-400">+{log.entitiesFound} entity found</p>
                )}
                {log.duration && <p className="text-gray-600">{log.duration}ms</p>}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
