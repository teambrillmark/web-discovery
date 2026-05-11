import type { Crawler } from '@discovery/crawler';
import type { EntityExtractor } from '@discovery/extraction';
import type { AIQueryEnhancer } from '../services/ai-query-enhancer';
import type { CompanyProfile, EmitFn } from './types';

const ENGAGEMENT_PATTERNS = {
  caseStudies:  /case stud(?:y|ies)|client success|success stor(?:y|ies)/i,
  teamPage:     /our team|meet the team|our experts|our consultants|our specialists/i,
  portfolio:    /our work|past projects|client work|portfolio/i,
  testimonials: /testimonial|what (?:our )?clients say|trusted by|clients include/i,
};

export class CompanyProfiler {
  /**
   * Build a company profile using two sources, merged together:
   * 1. Groq world knowledge  — works even when the site is down or name is misspelled
   * 2. Live website crawl     — enriches with real page text and tech stack
   *
   * Groq profile is authoritative for industry/services; crawl enriches tech and founders.
   */
  async profile(
    companyName: string,
    aiEnhancer: AIQueryEnhancer,
    crawler: Crawler,
    extractor: EntityExtractor,
    emit: EmitFn,
  ): Promise<CompanyProfile | null> {

    // ── Step 1: Ask Groq to identify and profile the company ────────────────
    emit(`Asking AI to identify "${companyName}" (corrects typos, uses world knowledge)...`);
    const aiProfile = await aiEnhancer.buildCompanyProfile(companyName);

    if (aiProfile) {
      emit(`AI identified: "${aiProfile.correctName}" (${aiProfile.correctDomain})`);
      emit(`Industry: ${aiProfile.industry ?? 'unknown'} | Model: ${aiProfile.businessModel}`);
      if (aiProfile.primaryServices.length > 0) {
        emit(`Primary services: ${aiProfile.primaryServices.join(', ')}`);
      }
      if (aiProfile.secondaryServices.length > 0) {
        emit(`Secondary services: ${aiProfile.secondaryServices.join(', ')}`);
      }
    } else {
      emit(`AI has no knowledge of "${companyName}" — will rely on website crawl`);
    }

    // ── Step 2: Crawl the website to enrich with real page data ─────────────
    const domain = aiProfile?.correctDomain ?? this.guessDomain(companyName);
    emit(`Crawling ${domain} for additional signals...`);

    let webProfile: Partial<CompanyProfile> | null = null;
    try {
      const url = `https://${domain}`;
      const pageData = await crawler.crawlPage(url);

      if (pageData.success && pageData.html) {
        emit('Extracting services and engagement signals from website...');
        const entity  = extractor.extractCompany(pageData as any);
        const bodyText = pageData.bodyText ?? '';
        const html     = pageData.html ?? '';

        const headingText = this.extractHeadings(html).join(' ').toLowerCase();
        const metaText    = `${pageData.description ?? ''} ${pageData.title ?? ''}`.toLowerCase();
        const heroText    = bodyText.slice(0, 1400).toLowerCase();

        const webServices = entity.services ?? [];
        const { primary: webPrimary, secondary: webSecondary } = this.classifyServices(
          webServices, headingText, metaText, heroText, bodyText,
        );

        const bodyLower = bodyText.toLowerCase();
        const engagement = {
          hasCaseStudies:  ENGAGEMENT_PATTERNS.caseStudies.test(bodyLower),
          hasTeamPage:     ENGAGEMENT_PATTERNS.teamPage.test(bodyLower),
          hasPortfolio:    ENGAGEMENT_PATTERNS.portfolio.test(bodyLower),
          hasTestimonials: ENGAGEMENT_PATTERNS.testimonials.test(bodyLower),
        };

        emit(`Website found ${webPrimary.length} primary + ${webSecondary.length} secondary services`);

        const engagementTags = [
          engagement.hasCaseStudies  ? 'case studies'  : '',
          engagement.hasTeamPage     ? 'team page'     : '',
          engagement.hasTestimonials ? 'testimonials'  : '',
        ].filter(Boolean);
        if (engagementTags.length > 0) emit(`Engagement signals: ${engagementTags.join(', ')}`);

        webProfile = {
          name:              entity.name || aiProfile?.correctName || domain,
          domain,
          description:       entity.description || pageData.description || '',
          primaryServices:   webPrimary,
          secondaryServices: webSecondary,
          techStack:         entity.technologies ?? [],
          businessModel:     this.inferBusinessModel(bodyText, engagement),
          engagement,
        };
      } else {
        emit(`Could not load ${domain} — relying on AI profile only`);
      }
    } catch (err) {
      emit(`Crawl error: ${(err as Error).message} — relying on AI profile only`);
    }

    // ── Step 3: Merge AI profile + web profile ───────────────────────────────
    // AI is authoritative for industry/services identity; web enriches with tech + real text
    if (!aiProfile && !webProfile) {
      emit('No profile data available — proceeding with industry-wide search');
      return null;
    }

    // Decide which primary services to use:
    // - Prefer AI services if they're more specific (AI has broader knowledge than scraped text)
    // - Fall back to web services, then empty
    const primaryServices = aiProfile?.primaryServices.length
      ? aiProfile.primaryServices
      : webProfile?.primaryServices ?? [];

    const secondaryServices = [
      ...new Set([
        ...(aiProfile?.secondaryServices ?? []),
        ...(webProfile?.secondaryServices ?? []),
      ]),
    ].filter(s => !primaryServices.includes(s));

    const merged: CompanyProfile = {
      name:             aiProfile?.correctName   ?? webProfile?.name   ?? companyName,
      domain,
      description:      aiProfile?.description   ?? webProfile?.description ?? '',
      industry:         aiProfile?.industry      ?? null,   // AI-identified; orchestrator maps to seed key
      primaryServices,
      secondaryServices,
      techStack:        webProfile?.techStack     ?? [],
      businessModel:    aiProfile?.businessModel  ?? webProfile?.businessModel ?? 'unknown',
      engagement:       webProfile?.engagement    ?? {
        hasCaseStudies: false, hasTeamPage: false, hasPortfolio: false, hasTestimonials: false,
      },
    };

    emit(`Profile ready: "${merged.name}" | ${merged.primaryServices.length} primary services | model=${merged.businessModel}`);
    return merged;
  }

  private guessDomain(companyName: string): string {
    const KNOWN: Record<string, string> = {
      notion: 'notion.so', linear: 'linear.app', figma: 'figma.com',
      slack: 'slack.com', zoom: 'zoom.us', miro: 'miro.com',
      airtable: 'airtable.com', clickup: 'clickup.com',
      discord: 'discord.com', dropbox: 'dropbox.com',
    };
    const slug = companyName.toLowerCase().replace(/[^a-z0-9-]/g, '');
    return KNOWN[slug] ?? `${slug}.com`;
  }

  private extractHeadings(html: string): string[] {
    return (html.match(/<h[12][^>]*>([^<]+)<\/h[12]>/gi) ?? [])
      .map(h => h.replace(/<[^>]+>/g, '').trim());
  }

  private classifyServices(
    services: string[],
    headingText: string,
    metaText: string,
    heroText: string,
    bodyText: string,
  ): { primary: string[]; secondary: string[] } {
    const primary: string[] = [];
    const secondary: string[] = [];

    for (const service of services) {
      const key = service.toLowerCase().split(' ').slice(0, 2).join(' ').replace(/[^a-z0-9 ]/g, '');
      const token = key.split(' ')[0];
      const inHeading = headingText.includes(token);
      const inMeta    = metaText.includes(token);
      const inHero    = heroText.includes(token);
      const count     = (bodyText.toLowerCase().match(new RegExp(token, 'gi')) ?? []).length;

      if (inHeading || inMeta || (inHero && count >= 2) || count >= 4) {
        primary.push(service);
      } else {
        secondary.push(service);
      }
    }

    if (primary.length === 0 && services.length > 0) {
      primary.push(...services.slice(0, Math.min(3, services.length)));
    }

    return { primary, secondary };
  }

  private inferBusinessModel(
    bodyText: string,
    engagement: { hasCaseStudies: boolean; hasTeamPage: boolean; hasPortfolio: boolean; hasTestimonials: boolean },
  ): 'agency' | 'tool' | 'platform' | 'brand' | 'unknown' {
    const toolSignals = [
      /free\s*trial/i, /sign\s*up.*free/i, /\$\d+\s*\/\s*mo/i,
      /pricing\s*plan/i, /per\s*(?:user|seat|month)\b/i,
    ].filter(p => p.test(bodyText)).length;

    const agencyScore =
      (engagement.hasCaseStudies  ? 2 : 0) +
      (engagement.hasTeamPage     ? 1 : 0) +
      (engagement.hasTestimonials ? 1 : 0) +
      (/our\s+(?:team|clients|experts)/i.test(bodyText) ? 1 : 0) +
      (/we\s+(?:help|work\s+with|partner)/i.test(bodyText) ? 1 : 0);

    if (toolSignals >= 2)  return 'tool';
    if (agencyScore >= 3)  return 'agency';
    if (/marketplace|buy\s+and\s+sell/i.test(bodyText)) return 'platform';
    if (/shop\s*now|add\s*to\s*cart/i.test(bodyText))   return 'brand';
    return 'unknown';
  }
}
