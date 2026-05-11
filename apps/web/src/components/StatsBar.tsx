'use client';

import { useEffect, useState } from 'react';
import { Building2, Globe, CheckCircle, TrendingUp } from 'lucide-react';

interface Stats {
  total: number;
  success: number;
  failed: number;
  pending: number;
}

export function StatsBar() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [entityCount, setEntityCount] = useState(0);

  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  useEffect(() => {
    const load = async () => {
      const [s, e] = await Promise.all([
        fetch(`${API}/api/crawl/status`).then(r => r.json()).catch(() => null),
        fetch(`${API}/api/entities?limit=1`).then(r => r.json()).catch(() => ({ pagination: { total: 0 } })),
      ]);
      if (s) setStats(s);
      if (e?.pagination) setEntityCount(e.pagination.total);
    };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [API]);

  const items = [
    { label: 'Entities Discovered', value: entityCount, icon: Building2, color: 'text-blue-400' },
    { label: 'URLs Crawled', value: stats?.total ?? 0, icon: Globe, color: 'text-purple-400' },
    { label: 'Successful Crawls', value: stats?.success ?? 0, icon: CheckCircle, color: 'text-green-400' },
    { label: 'Success Rate', value: stats && stats.total > 0 ? `${Math.round((stats.success / stats.total) * 100)}%` : '—', icon: TrendingUp, color: 'text-yellow-400' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {items.map(({ label, value, icon: Icon, color }) => (
        <div key={label} className="card flex items-center gap-4 py-4">
          <div className={`${color} bg-gray-800 rounded-lg p-2`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
