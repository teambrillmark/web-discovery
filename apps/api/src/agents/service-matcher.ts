import type { Crawler } from '@discovery/crawler';
import type { EntityExtractor } from '@discovery/extraction';
import type { AIQueryEnhancer } from '../services/ai-query-enhancer';
import type { CompanyProfile, CandidateResult, CandidateAIProfile, EmitFn } from './types';

export class ServiceMatcher {
  async matchAll(
    profile: CompanyProfile | null,
    domains: string[],
    crawler: Crawler,
    extractor: EntityExtractor,
    blockedDomains: Set<string>,
    emit: EmitFn,
    onDirectoryLinks: (links: string[]) => void,
    aiEnhancer?: AIQueryEnhancer,
  ): Promise<CandidateResult[]> {
    const dirDomains = domains.filter(d => d.startsWith('__dir__'));
    const realDomains = domains.filter(d => !d.startsWith('__dir__'));

    emit(`Matching ${realDomains.length} candidates — building competitor profiles for deeper comparison...`);

    // ── Phase 1: Crawl all candidates and collect raw data ──────────────────
    type RawCandidate = {
      domain: string;
      name: string;
      description: string;
      services: string[];
      bodyText: string;
      businessModel: 'agency' | 'tool' | 'platform' | 'brand' | 'unknown';
      techStack: string[];
      rawPageData: any;
    };
    const rawCandidates: RawCandidate[] = [];

    for (let i = 0; i < realDomains.length; i++) {
      const domain = realDomains[i];
      const url = `https://${domain}`;
      emit(`Crawling ${domain} (${i + 1}/${realDomains.length})...`);

      try {
        const pageData = await crawler.crawlPage(url);

        if (!pageData.success || !pageData.html) {
          emit(`  ✗ ${domain}: unreachable`);
          continue;
        }

        const entity = extractor.extractCompany(pageData as any);

        // Crawl the services page for richer service signal
        let servicesBodyText = pageData.bodyText ?? '';
        const servicesPageUrl = this.findServicesPage(pageData.internalLinks ?? [], url);
        if (servicesPageUrl) {
          try {
            const svcPage = await crawler.crawlPage(servicesPageUrl);
            if (svcPage.success && svcPage.bodyText) {
              servicesBodyText = `${svcPage.bodyText}\n\n${pageData.bodyText ?? ''}`;
            }
          } catch {}
        }

        // AI extraction of what this company actively offers
        let offeredServices: string[] = entity.services ?? [];
        if (aiEnhancer && servicesBodyText) {
          try {
            const aiServices = await aiEnhancer.extractOfferedServices(
              entity.name || domain,
              servicesBodyText,
            );
            if (aiServices.offeredServices.length > 0) {
              offeredServices = aiServices.offeredServices;
            }
          } catch {}
        }

        const businessModel = this.detectBusinessModel(pageData.bodyText ?? '');

        // Collect external links for secondary URL discovery
        const externalLinks = (pageData.externalLinks ?? []).filter(link => {
          try {
            const d = new URL(link).hostname.replace(/^www\./, '');
            return !blockedDomains.has(d) && link !== url;
          } catch { return false; }
        });
        if (externalLinks.length > 0) onDirectoryLinks(externalLinks);

        rawCandidates.push({
          domain,
          name: entity.name || domain,
          description: entity.description || pageData.description || '',
          services: offeredServices,
          bodyText: servicesBodyText,
          businessModel,
          techStack: entity.technologies ?? [],
          rawPageData: pageData,
        });
      } catch (err) {
        emit(`  ✗ ${domain}: ${(err as Error).message}`);
      }

      // Crawl directory pages after the last real domain
      if (i === realDomains.length - 1 && dirDomains.length > 0) {
        emit(`Crawling ${dirDomains.length} industry directory pages for additional links...`);
        for (const dirEntry of dirDomains) {
          const dirUrl = dirEntry.replace('__dir__:', '');
          try {
            const pd = await crawler.crawlPage(dirUrl);
            if (pd.success && pd.externalLinks) onDirectoryLinks(pd.externalLinks);
            emit(`  📋 Extracted links from ${new URL(dirUrl).hostname}`);
          } catch {}
        }
      }
    }

    // ── Phase 2: Batch AI profiling of all crawled candidates ───────────────
    // One Groq call gives us structured profiles (industry, businessModel, primaryServices)
    // for all candidates so we can do profile-vs-profile comparison instead of keyword scanning.
    let candidateProfiles = new Map<string, CandidateAIProfile>();
    if (aiEnhancer && rawCandidates.length > 0) {
      emit(`Building AI profiles for ${rawCandidates.length} candidates...`);
      try {
        const profileInput = rawCandidates.map(c => ({
          domain: c.domain,
          name: c.name,
          description: c.description,
          services: c.services,
        }));
        candidateProfiles = await aiEnhancer.profileCandidatesBatch(profileInput, profile?.industry ?? null) as Map<string, CandidateAIProfile>;
        emit(`  ✓ Profiled ${candidateProfiles.size}/${rawCandidates.length} candidates`);
      } catch (err) {
        emit(`  AI profiling failed, using keyword fallback: ${(err as Error).message}`);
      }
    }

    // ── Phase 3: Score each candidate against the query profile ─────────────
    const results: CandidateResult[] = [];

    for (const raw of rawCandidates) {
      const candidateAIProfile = candidateProfiles.get(raw.domain) ?? null;
      const matchResult = this.matchProfiles(profile, candidateAIProfile, raw.services, raw.bodyText);

      const tierLabel = profile
        ? `match=${(matchResult.score * 100).toFixed(0)}% (${matchResult.matched.join(', ') || 'no direct overlap'})`
        : 'no profile — using validator scoring';

      const profileLabel = candidateAIProfile
        ? ` [${candidateAIProfile.businessModel}, ${candidateAIProfile.industry ?? 'unknown industry'}]`
        : '';

      emit(`  ✓ ${raw.name}: ${tierLabel}${profileLabel}`);

      results.push({
        domain: raw.domain,
        name: raw.name,
        description: raw.description,
        services: raw.services,
        matchedServices: matchResult.matched,
        matchScore: matchResult.score,
        businessModel: candidateAIProfile?.businessModel ?? raw.businessModel,
        techStack: raw.techStack,
        source: 'seed',
        rawPageData: raw.rawPageData,
      });
    }

    emit(`Match phase complete — ${results.length} candidates profiled and scored`);
    return results;
  }

  /**
   * Profile-to-profile match scoring.
   *
   * Weights:
   *   60% — service overlap (query primaryServices vs candidate primaryServices)
   *   20% — business model alignment (agency vs agency, tool vs tool, etc.)
   *   20% — industry alignment
   *
   * Falls back to keyword scanning when candidateAIProfile is unavailable.
   */
  private matchProfiles(
    queryProfile: CompanyProfile | null,
    candidateProfile: CandidateAIProfile | null,
    candidateServices: string[],
    bodyText: string,
  ): { score: number; matched: string[] } {
    if (!queryProfile || queryProfile.primaryServices.length === 0) {
      return { score: 0.5, matched: [] };
    }

    // Best available service list for this candidate
    const profiledServices = candidateProfile?.primaryServices.length
      ? candidateProfile.primaryServices
      : candidateServices;

    // Service overlap (60%)
    const { matched, serviceScore } = this.computeServiceOverlap(
      queryProfile.primaryServices,
      profiledServices,
      bodyText,
    );

    // Business model alignment (20%)
    const qModel = queryProfile.businessModel;
    const cModel = candidateProfile?.businessModel ?? 'unknown';
    const modelScore =
      qModel === 'unknown' || cModel === 'unknown' ? 0.5 :
      qModel === cModel ? 1.0 : 0.0;

    // Industry alignment (20%)
    const qIndustry = queryProfile.industry;
    const cIndustry = candidateProfile?.industry ?? null;
    const industryScore =
      !qIndustry || !cIndustry ? 0.5 :
      qIndustry === cIndustry ? 1.0 : 0.0;

    const total = serviceScore * 0.6 + modelScore * 0.2 + industryScore * 0.2;
    return { score: total, matched };
  }

  private computeServiceOverlap(
    queryServices: string[],
    candidateServices: string[],
    bodyText: string,
  ): { matched: string[]; serviceScore: number } {
    const STOP_WORDS = new Set([
      'software', 'platform', 'tool', 'service', 'services', 'solution', 'solutions',
      'management', 'analytics', 'system', 'app', 'application', 'product', 'products',
      'and', 'the', 'for', 'with', 'your', 'our', 'their', 'web', 'data', 'digital',
      'business', 'company', 'enterprise', 'team', 'teams',
      'testing', 'test', 'tests',
    ]);

    const keyPhrases = (svc: string): string[] => {
      const words = svc.toLowerCase()
        .replace(/[^a-z0-9/ ]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2 && !STOP_WORDS.has(w));
      if (words.length === 0) return [];
      const phrases: string[] = [];
      for (let i = 0; i < words.length - 1; i++) {
        phrases.push(`${words[i]} ${words[i + 1]}`);
      }
      phrases.push(...words);
      return phrases;
    };

    // Search against AI-profiled services + raw body text
    const candidateCorpus = [
      ...candidateServices.map(s => s.toLowerCase()),
      bodyText.slice(0, 3000).toLowerCase(),
    ].join(' ');

    const matched: string[] = [];
    for (const svc of queryServices) {
      const phrases = keyPhrases(svc);
      if (phrases.length === 0) continue;

      const hit = phrases.some(p =>
        p.includes(' ')
          ? candidateCorpus.includes(p)
          : new RegExp(`\\b${p}\\b`, 'i').test(candidateCorpus)
      );
      if (hit) matched.push(svc);
    }

    return {
      matched,
      serviceScore: matched.length / queryServices.length,
    };
  }

  private findServicesPage(internalLinks: string[], baseUrl: string): string | null {
    const SERVICE_SLUGS = [
      '/services', '/our-services', '/what-we-do', '/what-we-offer',
      '/solutions', '/capabilities', '/expertise', '/offerings',
      '/our-work', '/work', '/how-we-help',
    ];
    try {
      const baseHost = new URL(baseUrl).hostname;
      for (const link of internalLinks) {
        try {
          const u = new URL(link, baseUrl);
          if (u.hostname !== baseHost) continue;
          const path = u.pathname.toLowerCase().replace(/\/$/, '');
          if (SERVICE_SLUGS.includes(path)) return u.href;
        } catch {}
      }
      for (const link of internalLinks) {
        try {
          const u = new URL(link, baseUrl);
          if (u.hostname !== baseHost) continue;
          const path = u.pathname.toLowerCase();
          if (
            (path.includes('service') || path.includes('solution') ||
             path.includes('capabilities') || path.includes('what-we') ||
             path.includes('expertise')) &&
            !path.includes('blog') && !path.includes('news') &&
            !path.includes('case-stud') && !path.includes('career')
          ) return u.href;
        } catch {}
      }
    } catch {}
    return null;
  }

  private detectBusinessModel(bodyText: string): 'agency' | 'tool' | 'platform' | 'brand' | 'unknown' {
    const toolSignals = [
      /free\s*trial/i, /\$\d+\s*\/\s*mo/i, /pricing\s*plan/i, /per\s*(?:user|seat|month)\b/i,
    ].filter(p => p.test(bodyText)).length;

    if (toolSignals >= 2) return 'tool';
    if (/our\s+team|case\s+stud/i.test(bodyText)) return 'agency';
    if (/shop\s*now|add\s*to\s*cart/i.test(bodyText)) return 'brand';
    return 'unknown';
  }
}
