import type { DynamicDiscovery } from '@discovery/crawler';
import type { QueryObject } from '@discovery/shared';
import type { AIQueryEnhancer } from '../services/ai-query-enhancer';
import type { CompanyProfile, EmitFn } from './types';

export interface SearchResult {
  domains: string[];
  industry: string | null;
}

export class CompetitorSearcher {
  async search(
    profile: CompanyProfile | null,
    rawQuery: string,
    queryObj: QueryObject,
    aiEnhancer: AIQueryEnhancer | null,
    dynamicDiscovery: DynamicDiscovery,
    blockedDomains: Set<string>,
    emit: EmitFn,
  ): Promise<SearchResult> {
    const domains = new Set<string>();
    let industry = queryObj.industry;

    const addDomain = (d: string) => {
      const clean = d.toLowerCase().replace(/^www\./, '').replace(/\/$/, '');
      if (clean.includes('.') && !blockedDomains.has(clean)) domains.add(clean);
    };

    // ── Layer 1: Groq competitor search ────────────────────────────────────
    // Uses Groq's world knowledge to surface real, known competitors.
    // Passes full profile context so Groq returns the RIGHT TYPE of competitor.
    if (aiEnhancer) {
      const searchQuery = profile
        ? `${profile.name} competitor`
        : rawQuery;

      emit(profile
        ? `Searching for competitors of "${profile.name}" (${profile.industry ?? 'detected company'})...`
        : 'Querying AI to identify industry and competitors...'
      );

      try {
        const insight = await aiEnhancer.enhance(searchQuery, profile
          ? { industry: profile.industry, businessModel: profile.businessModel, primaryServices: profile.primaryServices }
          : undefined);
        if (insight.confidence >= 0.5) {
          emit(`AI found ${insight.competitors.length} competitor domains`);
          insight.competitors.forEach(addDomain);
          if (insight.company) addDomain(insight.company);
          if (!industry && !profile?.industry && insight.industry) {
            industry = insight.industry;
          }
        }
      } catch (err) {
        emit(`Groq unavailable: ${(err as Error).message}`);
      }
    }

    // ── Layer 2: Dynamic multi-query web search ─────────────────────────────
    // Build several targeted queries from profile context so we search like a
    // human researcher would — not just one generic "{company} competitor" query.
    // All queries hit live web (DDG HTML scraping + Wikipedia) in parallel.
    const webQueries: string[] = [rawQuery];

    if (profile) {
      // Alternative framing of the same search
      webQueries.push(`${profile.name} alternative`);

      // Industry-specific "best X agency" searches — these find companies that
      // explicitly market themselves to the same audience
      if (profile.primaryServices.length > 0) {
        const svc = profile.primaryServices[0].toLowerCase();
        webQueries.push(`top ${svc} companies 2025`);
        webQueries.push(`best ${svc} agency`);
      }

      // If industry is known, search that space directly
      if (profile.industry) {
        const industryLabel = profile.industry.replace(/_/g, ' ');
        webQueries.push(`top ${industryLabel} companies`);
      }
    }

    // Deduplicate queries (may overlap for sparse profiles)
    const uniqueQueries = [...new Set(webQueries)].slice(0, 5);

    emit(`Running ${uniqueQueries.length} parallel web searches for dynamic discovery...`);
    try {
      const dynResult = await dynamicDiscovery.discoverFromMultipleQueries(uniqueQueries);
      if (dynResult.domains.length > 0) {
        emit(`Web discovery found ${dynResult.domains.length} candidate domains across ${uniqueQueries.length} searches`);
        dynResult.domains.slice(0, 25).forEach(addDomain);
        if (!industry && dynResult.industry) industry = dynResult.industry;
      }
    } catch (err) {
      emit(`Dynamic discovery error: ${(err as Error).message}`);
    }

    // ── Layer 3: Profile-based service search (if profile has primary services) ─
    // Log this for transparency — the queries above already target these
    if (profile && profile.primaryServices.length > 0) {
      emit(`Profile context: finding "${profile.primaryServices.slice(0, 2).join(' + ')}" specialists via web search`);
    }

    // ── Fallback: if nothing found at all, broaden the search ──────────────
    if (domains.size === 0) {
      emit('No results from primary search — trying broader web search...');
      try {
        const broader = await dynamicDiscovery.searchByKeyword(
          profile
            ? `${profile.industry ?? 'marketing'} agency companies`
            : rawQuery,
        );
        broader.forEach(addDomain);
      } catch {}
    }

    const allDomains = [...domains];
    emit(`Search complete — ${allDomains.length} candidates (all from live web search, no static lists)`);

    return { domains: allDomains, industry };
  }
}
