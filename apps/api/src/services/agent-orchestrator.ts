import { Crawler, DynamicDiscovery } from '@discovery/crawler';
import { QueryAnalyzer, EntityExtractor } from '@discovery/extraction';
import { Validator, DuplicateDetector, ChangeDetector } from '@discovery/validation';
import { db } from '@discovery/database';
import { CompanyProfiler } from '../agents/company-profiler';
import { CompetitorSearcher } from '../agents/competitor-searcher';
import { ServiceMatcher } from '../agents/service-matcher';
import { RelevancyFilter } from '../agents/relevancy-filter';
import { AIQueryEnhancer } from './ai-query-enhancer';
import { jobRegistry } from './job-registry';
import type { AgentEvent } from '../agents/types';

// ── Seed data (same sets as discovery-orchestrator) ────────────────────────
export const INDUSTRY_SEEDS: Record<string, string[]> = {
  cro_agency: [
    // Full-service CRO agencies
    'cxl.com', 'speero.com', 'getuplift.co', 'experimentzone.com',
    'conversionadvocates.com', 'invesp.com', 'widerfunnel.com',
    'conversion.com', 'splitbase.com', 'growthrock.co', 'six.agency',
    'conversion-rate-experts.com', 'thegood.com', 'northpeak.co',
    'webprofits.com.au', 'proclivity.digital', 'together.agency',
    'objeqt.com', 'conversioner.com', 'goodconversion.com',
    'conversionista.se', 'optimizationgroup.com', 'klientboost.com', 'apexure.com',
    // A/B test development specialists (same niche as Brillmark — build/implement tests)
    'echologyx.com', 'teamcroco.com', 'prismfly.com', 'creativethirst.com',
    'roboboogie.com', 'conversionratestore.com', 'nogood.io',
    'rtresult.com', 'conversionbuddha.com', 'splitbase.com',
    'visualwebsiteoptimizer.com', 'abtestingexperts.com',
    'growthhit.com', 'conversionfanatics.com', 'testingtime.com',
    // Growth/CRO agencies with strong A/B testing practice
    'singlegrain.com', 'rocketmill.co.uk', 'growthhackers.com',
    'iamota.com', 'usabilitygeek.com', 'cro.media', 'fresh-egg.co.uk',
  ],
  ecommerce_platform: [
    'shopify.com', 'bigcommerce.com', 'volusion.com', 'woocommerce.com',
    'squarespace.com', 'wix.com', 'prestashop.com', 'opencart.com',
    'magento.com', 'ecwid.com',
  ],
  ecommerce: [
    'gymshark.com', 'allbirds.com', 'mvmt.com', 'ruggable.com',
    'casper.com', 'away.com', 'warbyparker.com', 'glossier.com',
    'bombas.com', 'brooklinen.com', 'rothys.com', 'vuori.com',
  ],
  ai: [
    'openai.com', 'anthropic.com', 'cohere.com', 'mistral.ai',
    'huggingface.co', 'replicate.com', 'perplexity.ai', 'jasper.ai',
  ],
  digital_marketing: [
    'hubspot.com', 'semrush.com', 'ahrefs.com', 'moz.com',
    'hootsuite.com', 'sproutsocial.com', 'mailchimp.com', 'klaviyo.com',
    'marketo.com', 'activecampaign.com',
  ],
  software: [
    'atlassian.com', 'notion.so', 'linear.app', 'asana.com',
    'monday.com', 'clickup.com', 'basecamp.com', 'trello.com',
    'gitlab.com', 'figma.com', 'miro.com', 'airtable.com',
  ],
  productivity: [
    'notion.so', 'obsidian.md', 'roamresearch.com', 'evernote.com',
    'todoist.com', 'ticktick.com', 'things.app', 'craft.do',
    'coda.io', 'clickup.com', 'asana.com', 'monday.com',
  ],
  project_management: [
    'asana.com', 'monday.com', 'clickup.com', 'linear.app',
    'basecamp.com', 'trello.com', 'jira.atlassian.com', 'notion.so',
    'teamwork.com', 'smartsheet.com', 'wrike.com', 'airtable.com',
  ],
  notes_app: [
    'notion.so', 'obsidian.md', 'evernote.com', 'roamresearch.com',
    'craft.do', 'bear.app', 'logseq.com', 'joplinapp.org', 'coda.io',
    'confluence.atlassian.com', 'onenote.com',
  ],
  collaboration: [
    'slack.com', 'discord.com', 'mattermost.com', 'teams.microsoft.com',
    'twist.com', 'loom.com', 'zoom.us', 'gather.town', 'whereby.com',
  ],
  design_tool: [
    'figma.com', 'sketch.com', 'adobe.com', 'invisionapp.com',
    'framer.com', 'zeplin.io', 'canva.com', 'webflow.com', 'origami.design',
  ],
  devtools: [
    'github.com', 'gitlab.com', 'bitbucket.org', 'vercel.com',
    'netlify.com', 'railway.app', 'render.com', 'supabase.com',
    'planetscale.com', 'retool.com', 'doppler.com',
  ],
  apparel: [
    'nike.com', 'adidas.com', 'puma.com', 'newbalance.com',
    'patagonia.com', 'uniqlo.com', 'hm.com', 'zara.com',
    'lululemon.com', 'asics.com',
  ],
  food: [
    'doordash.com', 'ubereats.com', 'grubhub.com', 'instacart.com',
    'postmates.com', 'seamless.com',
  ],
  finance: [
    'stripe.com', 'braintree.com', 'adyen.com', 'square.com',
    'paypal.com', 'plaid.com', 'brex.com', 'wise.com', 'revolut.com',
  ],
  cloud: [
    'digitalocean.com', 'linode.com', 'render.com', 'fly.io',
    'vercel.com', 'netlify.com', 'cloudflare.com',
  ],
  cybersecurity: [
    'crowdstrike.com', 'sentinelone.com', 'darktrace.com', 'snyk.io',
    'wiz.io', 'aquasec.com', 'paloaltonetworks.com',
  ],
  hr_tech: [
    'workday.com', 'bamboohr.com', 'rippling.com', 'gusto.com',
    'greenhouse.io', 'lever.co', 'workable.com',
  ],
  edtech: [
    'coursera.org', 'udemy.com', 'udacity.com', 'skillshare.com',
    'masterclass.com', 'duolingo.com', 'khanacademy.org',
  ],
  media: [
    'vimeo.com', 'dailymotion.com', 'twitch.tv', 'brightcove.com', 'wistia.com',
  ],
  travel: [
    'airbnb.com', 'booking.com', 'expedia.com', 'kayak.com', 'skyscanner.com',
  ],
};



export const BLOCKED_DOMAINS = new Set([
  'google.com', 'google.co.uk', 'google.in', 'facebook.com', 'youtube.com',
  'twitter.com', 'x.com', 'linkedin.com', 'instagram.com', 'reddit.com',
  'wikipedia.org', 'amazon.com', 'bing.com', 'yahoo.com', 'tiktok.com',
  'pinterest.com', 'duckduckgo.com', 'apple.com', 'microsoft.com',
  'github.com', 'stackoverflow.com', 'medium.com',
  'clutch.co', 'g2.com', 'capterra.com', 'goodfirms.co',
  'trustpilot.com', 'crunchbase.com', 'producthunt.com',
  'growjo.com', 'cbinsights.com', 'topdevelopers.co',
]);

// ── Progress stages and their % ranges ─────────────────────────────────────
const PROGRESS = {
  profile: { start: 5,  end: 20 },
  search:  { start: 20, end: 38 },
  match:   { start: 38, end: 80 },
  filter:  { start: 80, end: 90 },
  save:    { start: 90, end: 100 },
};

export class AgentOrchestrator {
  private crawler      = new Crawler();
  private queryAnalyzer = new QueryAnalyzer();
  private extractor    = new EntityExtractor();
  private validator    = new Validator();
  private dupDetector  = new DuplicateDetector();
  private changeDetector = new ChangeDetector();
  private dynamicDiscovery = new DynamicDiscovery();
  private aiEnhancer   = new AIQueryEnhancer(process.env.GROQ_API_KEY);

  private profiler     = new CompanyProfiler();
  private searcher     = new CompetitorSearcher();
  private matcher      = new ServiceMatcher();
  private filter       = new RelevancyFilter();

  async run(rawQuery: string, jobId: string, existingQueryId?: string): Promise<void> {
    const emit = (stage: AgentEvent['stage'], agent: string, message: string, progress: number) => {
      jobRegistry.emit(jobId, { type: 'log', stage, agent, message, progress });
      console.log(`[${agent}] ${message}`);
    };

    const stageStart = (stage: AgentEvent['stage'], agent: string, message: string) => {
      const p = (PROGRESS as Record<string, { start: number; end: number }>)[stage];
      jobRegistry.emit(jobId, { type: 'stage_start', stage, agent, message, progress: p?.start ?? 0 });
      console.log(`\n[${agent}] ▶ ${message}`);
    };

    const stageDone = (stage: AgentEvent['stage'], agent: string, message: string) => {
      const p = (PROGRESS as Record<string, { start: number; end: number }>)[stage];
      jobRegistry.emit(jobId, { type: 'stage_done', stage, agent, message, progress: p?.end ?? 0 });
      console.log(`[${agent}] ✓ ${message}`);
    };

    try {
      await this.crawler.init();

      // ── Analyze query ─────────────────────────────────────────────────────
      const queryObj    = this.queryAnalyzer.analyze(rawQuery);
      const companyName = this.extractTargetCompany(rawQuery);

      emit('profile', 'Orchestrator', `Query: "${rawQuery}" | intent=${queryObj.intent} industry=${queryObj.industry ?? 'unknown'}`, 2);

      // ── Save query record ─────────────────────────────────────────────────
      let query = existingQueryId
        ? await db.query.findUnique({ where: { id: existingQueryId } })
        : null;

      if (!query) {
        query = await db.query.create({
          data: {
            raw: queryObj.raw, intent: queryObj.intent, industry: queryObj.industry,
            entityType: queryObj.entityType, location: queryObj.location,
            keywords: JSON.stringify(queryObj.keywords), objective: queryObj.objective,
          },
        });
      }

      const previousDomains = new Set<string>();
      const previousRuns = await db.query.findMany({
        where: { raw: queryObj.raw, id: { not: query.id } },
        include: { entities: { include: { entity: { select: { domain: true } } } } },
      });
      for (const prev of previousRuns) {
        for (const qe of prev.entities) previousDomains.add(qe.entity.domain);
      }

      // ── AGENT 1: Company Profiler ─────────────────────────────────────────
      stageStart('profile', 'CompanyProfiler', `Building profile of "${companyName || rawQuery}" using AI + web crawl...`);
      let profile = null;

      if (companyName) {
        // Pass aiEnhancer so profiler can use Groq world knowledge first (handles typos,
        // identifies industry/services even when the website is unreachable)
        profile = await this.profiler.profile(
          companyName,
          this.aiEnhancer,
          this.crawler,
          this.extractor,
          (msg) => emit('profile', 'CompanyProfiler', msg, 12),
        );
      } else {
        emit('profile', 'CompanyProfiler', 'No specific company in query — skipping profile (industry-wide search)', 12);
      }
      stageDone('profile', 'CompanyProfiler', profile
        ? `Profile built: "${profile.name}" | ${profile.primaryServices.length} primary services | model=${profile.businessModel}`
        : 'Profile skipped — using industry-wide search');

      // ── Sync profile industry into queryObj so Agent 2 uses the right seeds ─
      // Profile's industry is authoritative — prevents Agent 2 from re-guessing
      // independently and picking a different (wrong) industry.
      if (profile?.industry) {
        const seedKey = this.mapToSeedKey(profile.industry);
        if (seedKey) {
          (queryObj as any).industry = seedKey;
          emit('profile', 'Orchestrator', `Industry locked: ${seedKey} (from profile)`, 19);
        }
      }

      // ── AGENT 2: Competitor Searcher ──────────────────────────────────────
      stageStart('search', 'CompetitorSearcher', 'Searching for competitor candidates...');
      const searchResult = await this.searcher.search(
        profile,
        rawQuery,
        queryObj,
        this.aiEnhancer,
        this.dynamicDiscovery,
        BLOCKED_DOMAINS,
        (msg) => emit('search', 'CompetitorSearcher', msg, 30),
      );

      // Only update industry from search if profile didn't already lock it
      if (!queryObj.industry && searchResult.industry) {
        (queryObj as any).industry = searchResult.industry;
      }

      const candidateDomains = searchResult.domains.slice(0, 18);  // cap total

      if (candidateDomains.filter(d => !d.startsWith('__dir__')).length === 0) {
        emit('search', 'CompetitorSearcher', 'No candidates found — query may be out of scope', 38);
        await db.crawlLog.create({
          data: {
            queryId: query.id, url: 'unsupported:query', status: 'unsupported',
            error: `"${rawQuery}" could not be mapped to any known industry. Try: "Find competitors of X", "Best CRO agencies".`,
          },
        });
        await this.crawler.close();
        jobRegistry.done(jobId, { entitiesFound: 0 });
        return;
      }

      stageDone('search', 'CompetitorSearcher', `Found ${candidateDomains.filter(d => !d.startsWith('__dir__')).length} candidates to evaluate`);

      // ── AGENT 3: Service Matcher ──────────────────────────────────────────
      stageStart('match', 'ServiceMatcher', `Crawling candidates and matching against ${profile?.primaryServices.length ?? 0} primary services...`);

      const secondaryLinks: string[] = [];
      let matchProgress = PROGRESS.match.start;
      const matchedCandidates = await this.matcher.matchAll(
        profile,
        candidateDomains,
        this.crawler,
        this.extractor,
        BLOCKED_DOMAINS,
        (msg) => {
          matchProgress = Math.min(matchProgress + 3, PROGRESS.match.end - 2);
          emit('match', 'ServiceMatcher', msg, matchProgress);
        },
        (links) => secondaryLinks.push(...links),
        this.aiEnhancer,
      );

      stageDone('match', 'ServiceMatcher', `${matchedCandidates.length} candidates crawled successfully`);

      // Also crawl up to 4 secondary URLs discovered from pages
      const uniqueSecondary = [...new Set(secondaryLinks)]
        .filter(link => {
          try { const d = new URL(link).hostname.replace(/^www\./, ''); return !BLOCKED_DOMAINS.has(d); } catch { return false; }
        })
        .slice(0, 4);

      if (uniqueSecondary.length > 0) {
        emit('match', 'ServiceMatcher', `Crawling ${uniqueSecondary.length} secondary URLs discovered from pages...`, 78);
        const secondaryResults = await this.matcher.matchAll(
          profile, uniqueSecondary.map(u => {
            try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; }
          }).filter(Boolean),
          this.crawler, this.extractor, BLOCKED_DOMAINS,
          (msg) => emit('match', 'ServiceMatcher', `  (secondary) ${msg}`, 79),
          () => {},
          this.aiEnhancer,
        );
        matchedCandidates.push(...secondaryResults);
      }

      // ── AGENT 4: Relevancy Filter ─────────────────────────────────────────
      stageStart('filter', 'RelevancyFilter', 'Applying relevancy rules and service-match filter...');
      const filtered = this.filter.filter(
        matchedCandidates,
        profile,
        queryObj,
        this.validator,
        (msg) => emit('filter', 'RelevancyFilter', msg, 85),
      );
      const accepted = filtered.filter(r => r.isValid);
      stageDone('filter', 'RelevancyFilter', `${accepted.length} relevant results (${filtered.length - accepted.length} rejected)`);

      // ── Categorize accepted results into competitive tiers ────────────────
      // One Groq call for the whole batch (direct / partial / broader)
      if (profile && accepted.length > 0) {
        emit('filter', 'Orchestrator', 'Classifying results into competitive tiers...', 92);
        try {
          const tierMap = await this.aiEnhancer.categorizeResults(
            { name: profile.name, industry: profile.industry, businessModel: profile.businessModel, primaryServices: profile.primaryServices },
            accepted.map(r => ({ domain: r.domain, name: r.name, description: r.description, matchScore: r.matchScore, businessModel: r.businessModel })),
          );
          for (const result of accepted) {
            if (tierMap.has(result.domain)) {
              (result as any).competitorTier = tierMap.get(result.domain);
            }
          }
          const counts = { direct: 0, partial: 0, broader: 0 };
          for (const tier of tierMap.values()) counts[tier]++;
          emit('filter', 'Orchestrator', `Tiers assigned — direct:${counts.direct} partial:${counts.partial} broader:${counts.broader}`, 93);
        } catch (err) {
          emit('filter', 'Orchestrator', `Tier classification unavailable: ${(err as Error).message}`, 93);
        }
      }

      // ── Save results ──────────────────────────────────────────────────────
      stageStart('save', 'Orchestrator', `Saving ${accepted.length} results to database...`);

      let savedCount = 0;
      let newCount   = 0;

      for (const result of accepted) {
        if (this.dupDetector.isDuplicate({ domain: result.domain } as any)) continue;
        this.dupDetector.markSeen({ domain: result.domain } as any);

        const isNew = !previousDomains.has(result.domain);

        // Enrich using the entity extractor on already-fetched page data
        const entity = this.extractor.extractCompany(result.rawPageData as any);
        entity.source = `https://${result.domain}`;
        entity.category = queryObj.industry ? queryObj.industry.replace(/_/g, ' ') : null;
        entity.confidenceScore = result.confidenceScore;
        entity.relevanceScore  = result.relevanceScore;
        (entity as any).competitorTier = (result as any).competitorTier ?? null;

        // Add service match metadata to positioning
        if (result.matchedServices.length > 0) {
          (entity as any).positioning = `Shares ${result.matchedServices.length} key service${result.matchedServices.length > 1 ? 's' : ''}: ${result.matchedServices.slice(0, 3).join(', ')}`;
        }

        // Groq positioning if available
        if (this.aiEnhancer && entity.description) {
          try {
            const pos = await this.aiEnhancer.generatePositioning(entity.name, entity.description, rawQuery);
            if (pos) (entity as any).positioning = pos;
          } catch {}
        }

        // Enrich founders if sparse
        if ((entity.founders?.length ?? 0) < 2) {
          const aboutUrl = this.findAboutUrl(result.rawPageData?.internalLinks ?? [], `https://${result.domain}`);
          if (aboutUrl) {
            try {
              const pd = await this.crawler.crawlPage(aboutUrl);
              if (pd.success) {
                const enriched = this.extractor.extractCompany(pd as any);
                entity.founders = [...(entity.founders ?? []), ...(enriched.founders ?? [])].slice(0, 8);
              }
            } catch {}
          }
        }

        await this.saveEntity(entity, query.id, isNew);
        savedCount++;
        if (isNew) newCount++;

        const logStatus = isNew ? 'new' : 'updated';
        emit('save', 'Orchestrator', `Saved (${logStatus}): ${entity.name} (${result.domain}) — conf=${result.confidenceScore.toFixed(2)} match=${(result.matchScore * 100).toFixed(0)}%`, 95);

        await db.crawlLog.create({
          data: { queryId: query.id, url: `https://${result.domain}`, status: 'success', entitiesFound: isNew ? 1 : 0, duration: result.rawPageData?.duration ?? null },
        });
      }

      // Write rejected entities as skipped crawl logs
      for (const result of filtered.filter(r => !r.isValid)) {
        await db.crawlLog.create({
          data: {
            queryId: query.id, url: `https://${result.domain}`,
            status: 'skipped', error: result.rejectionReason,
          },
        });
      }

      await this.crawler.close();

      // No-new-results sentinel
      if (previousDomains.size > 0 && newCount === 0) {
        await db.crawlLog.create({
          data: { queryId: query.id, url: 'no_new_results:query', status: 'no_new_results', error: 'All discovered companies were already known from previous runs.' },
        });
      }

      stageDone('save', 'Orchestrator', `Complete — ${newCount} new / ${savedCount} total results for "${rawQuery}"`);
      jobRegistry.done(jobId, { entitiesFound: savedCount, newEntities: newCount });

    } catch (err) {
      const msg = (err as Error).message;
      console.error('[AgentOrchestrator] Fatal:', msg, (err as Error).stack);
      jobRegistry.error(jobId, msg);
      await this.crawler.close().catch(() => {});
    }
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  /**
   * Map any industry string Groq might return to our exact INDUSTRY_SEEDS key.
   * Groq sometimes returns aliases like "ab_testing" or "conversion_optimization"
   * that don't match our seed keys. Returns null if no valid mapping found.
   */
  private mapToSeedKey(industry: string | null): string | null {
    if (!industry) return null;
    const key = industry.toLowerCase().replace(/[\s-]/g, '_');

    // Direct match — fastest path
    if (INDUSTRY_SEEDS[key]) return key;

    // Alias → seed key mapping
    const ALIASES: Record<string, string> = {
      ab_testing:               'cro_agency',
      conversion_optimization:  'cro_agency',
      conversion_rate_optimization: 'cro_agency',
      experimentation:          'cro_agency',
      cro:                      'cro_agency',
      marketing_agency:         'digital_marketing',
      seo:                      'digital_marketing',
      saas:                     'software',
      b2b_saas:                 'software',
      enterprise_software:      'software',
      project_management:       'project_management',
      task_management:          'project_management',
      note_taking:              'notes_app',
      knowledge_management:     'notes_app',
      team_communication:       'collaboration',
      messaging:                'collaboration',
      ui_design:                'design_tool',
      ux_design:                'design_tool',
      developer_tools:          'devtools',
      infrastructure:           'cloud',
      hr:                       'hr_tech',
      human_resources:          'hr_tech',
      recruiting:               'hr_tech',
      talent_management:        'hr_tech',
      ecommerce:                'ecommerce',
      online_retail:            'ecommerce',
    };

    return ALIASES[key] ?? null;
  }

  private extractTargetCompany(query: string): string | null {
    return (
      query.match(/([a-zA-Z0-9_-]+)\s+(?:competitor|alternative|vs\b)/i)?.[1] ??
      query.match(/(?:competitor|alternative)\s+(?:of|to)\s+([a-zA-Z0-9_-]+)/i)?.[1] ??
      query.match(/(?:find\s+competitors?\s+of|analyze)\s+([a-zA-Z0-9._-]+)/i)?.[1] ??
      null
    );
  }

  private findAboutUrl(internalLinks: string[], _baseUrl: string): string | null {
    const SLUGS = ['/about-us', '/about_us', '/our-team', '/team/', '/who-we-are', '/leadership', '/people', '/company/about'];
    for (const link of internalLinks) {
      try {
        const path = new URL(link).pathname.toLowerCase();
        if (SLUGS.some(s => path === s.replace(/\/$/, '') || path.startsWith(s))) return link;
      } catch {}
    }
    for (const link of internalLinks) {
      try {
        const path = new URL(link).pathname.toLowerCase();
        if ((path.includes('about') || path.includes('team') || path.includes('people')) &&
            !path.includes('blog') && !path.includes('career') && !path.includes('job')) return link;
      } catch {}
    }
    return null;
  }

  private async saveEntity(entity: any, queryId: string, isNew: boolean): Promise<void> {
    const data = {
      name: entity.name, domain: entity.domain, description: entity.description,
      services: JSON.stringify(entity.services ?? []),
      founders: JSON.stringify(entity.founders ?? []),
      linkedin: entity.linkedin, twitter: entity.twitter,
      technologies: JSON.stringify(entity.technologies ?? []),
      locations: JSON.stringify(entity.locations ?? []),
      emails: JSON.stringify(entity.emails ?? []),
      phones: JSON.stringify(entity.phones ?? []),
      confidenceScore: entity.confidenceScore, relevanceScore: entity.relevanceScore,
      category: entity.category, source: entity.source,
      metaTitle: entity.metaTitle, metaDescription: entity.metaDescription,
      positioning: entity.positioning ?? null,
      competitorTier: entity.competitorTier ?? null,
      lastSeen: new Date(), isValid: true,
    };

    const existing = await db.entity.findUnique({ where: { domain: entity.domain } });
    let saved: any;

    if (existing) {
      const changes = this.changeDetector.detect(existing as any, data as any);
      saved = await db.entity.update({ where: { domain: entity.domain }, data });
      if (changes.hasChanges) {
        const snap = await db.snapshot.create({ data: { entityId: saved.id, data: JSON.stringify(data), hash: this.changeDetector.hash(data) } });
        for (const c of changes.changes) {
          await db.change.create({ data: { entityId: saved.id, snapshotId: snap.id, field: c.field, oldValue: c.oldValue, newValue: c.newValue, changeType: c.changeType } });
        }
      }
    } else {
      saved = await db.entity.create({ data });
      await db.snapshot.create({ data: { entityId: saved.id, data: JSON.stringify(data), hash: this.changeDetector.hash(data) } });
    }

    await db.queryEntity.upsert({
      where: { queryId_entityId: { queryId, entityId: saved.id } },
      update: { score: entity.relevanceScore },
      create: { queryId, entityId: saved.id, score: entity.relevanceScore, isNew },
    });

    await db.validation.create({ data: { entityId: saved.id, validationType: 'full', passed: true, score: entity.confidenceScore, reason: 'Passed agent pipeline' } });
  }
}
