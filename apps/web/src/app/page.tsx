'use client';

import { useState, useCallback } from 'react';
import { SearchBar } from '@/components/SearchBar';
import { EntityTable } from '@/components/EntityTable';
import { StatsBar } from '@/components/StatsBar';
import { QueryHistory } from '@/components/QueryHistory';
import { ProgressPanel } from '@/components/ProgressPanel';
import { Header } from '@/components/Header';
import type { AgentEvent } from '@/components/ProgressPanel';

export default function Home() {
  const [activeQueryId, setActiveQueryId]   = useState<string | null>(null);
  const [activeQueryText, setActiveQueryText] = useState<string | null>(null);
  const [refreshKey, setRefreshKey]         = useState(0);
  const [isRunning, setIsRunning]           = useState(false);
  const [events, setEvents]                 = useState<AgentEvent[]>([]);
  const [isDone, setIsDone]                 = useState(false);
  const [entitiesFound, setEntitiesFound]   = useState(0);

  const handleQueryStart = (queryId: string, queryText: string) => {
    setActiveQueryId(queryId);
    setActiveQueryText(queryText);
    setIsRunning(true);
    setIsDone(false);
    setEntitiesFound(0);
    setEvents([]);           // reset log for new query
    setRefreshKey(k => k + 1);
  };

  const handleQuerySelect = (queryId: string, queryText: string) => {
    setActiveQueryId(queryId);
    setActiveQueryText(queryText);
    setRefreshKey(k => k + 1);
  };

  const handleProgressEvent = useCallback((event: AgentEvent) => {
    setEvents(prev => [...prev, event]);
  }, []);

  const handleDiscoveryDone = useCallback((found: number) => {
    setIsDone(true);
    setIsRunning(false);
    setEntitiesFound(found);
    setRefreshKey(k => k + 1);
  }, []);

  const showProgress = isRunning || (isDone && events.length > 0);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-[1600px] mx-auto w-full px-4 py-6 space-y-6">
        <SearchBar
          onQueryStart={handleQueryStart}
          setIsRunning={setIsRunning}
          onProgressEvent={handleProgressEvent}
          onDiscoveryDone={handleDiscoveryDone}
        />
        <StatsBar key={`stats-${refreshKey}`} />
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <QueryHistory key={`qh-${refreshKey}`} onSelect={handleQuerySelect} activeId={activeQueryId} />
            {showProgress && (
              <ProgressPanel
                events={events}
                isRunning={isRunning}
                isDone={isDone}
                entitiesFound={entitiesFound}
              />
            )}
          </div>
          <div className="lg:col-span-3">
            <EntityTable
              key={`table-${refreshKey}`}
              queryId={activeQueryId}
              queryText={activeQueryText}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
