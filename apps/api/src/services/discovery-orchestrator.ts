import { Crawler, DynamicDiscovery } from '@discovery/crawler';
import { QueryAnalyzer, EntityExtractor } from '@discovery/extraction';
import { Validator, DuplicateDetector, ChangeDetector } from '@discovery/validation';
import { db } from '@discovery/database';
import { CompanyEntity, PersonInfo } from '@discovery/shared';
import { AIQueryEnhancer } from './ai-query-enhancer';

// Curated seed companies per industry — used when we can't scrape search engines
const INDUSTRY_SEEDS: Record<string, string[]> = {
  // CRO agencies — sourced from Clutch top lists, G2, Growjo, and CBInsights
  // Covers boutique agencies that don't rank highly on Google (the gap vs Claude AI)
  cro_agency: [
    // Well-known CRO agencies
    'cxl.com', 'speero.com', 'getuplift.co', 'experimentzone.com',
    'conversionadvocates.com', 'invesp.com', 'widerfunnel.com',
    'conversion.com', 'splitbase.com', 'growthrock.co', 'six.agency',
    // Clutch top-ranked CRO agencies (not indexed well on Google)
    'conversion-rate-experts.com', 'thegood.com', 'northpeak.co',
    'webprofits.com.au', 'baymard.com', 'proclivity.digital',
    'together.agency', 'fresh-egg.co.uk', 'greenlight.digital',
    'rocketmill.co.uk', 'thewebshop.com', 'mightyhive.com',
    // G2 / CBInsights sourced
    'growthhackers.com', 'iamota.com', 'webileapps.com',
    'analytics-toolkit.com', 'widerplanet.com', 'conversioner.com',
    'objeqt.com', 'buyerlegend.com', 'trapholt.dk',
    // Boutique specialists from industry directories
    'cro.media', 'goodconversion.com', 'conversionista.se',
    '95visual.com', 'usabilitygeek.com', 'awconversion.com',
    'optimizationgroup.com', 'klientboost.com', 'apexure.com',
  ],
  // Ecommerce PLATFORMS — for queries about the technology (shopify alternatives, etc.)
  ecommerce_platform: [
    'shopify.com', 'bigcommerce.com', 'volusion.com', 'woocommerce.com',
    'squarespace.com', 'wix.com', 'prestashop.com', 'opencart.com',
    'magento.com', 'ecwid.com', 'shift4shop.com',
  ],
  // Ecommerce BRANDS — actual D2C stores built on these platforms
  ecommerce: [
    'gymshark.com', 'allbirds.com', 'mvmt.com', 'ruggable.com',
    'casper.com', 'away.com', 'warbyparker.com', 'glossier.com',
    'bombas.com', 'brooklinen.com', 'rothys.com', 'vuori.com',
    'chubbiesshorts.com', 'meundies.com', 'shinola.com',
  ],
  ai: [
    'openai.com', 'anthropic.com', 'cohere.com', 'mistral.ai',
    'huggingface.co', 'replicate.com', 'together.ai', 'groq.com',
    'perplexity.ai', 'jasper.ai', 'copy.ai', 'writesonic.com',
  ],
  digital_marketing: [
    'hubspot.com', 'semrush.com', 'ahrefs.com', 'moz.com',
    'hootsuite.com', 'sproutsocial.com', 'mailchimp.com', 'klaviyo.com',
    'marketo.com', 'activecampaign.com',
  ],
  apparel: [
    'nike.com', 'adidas.com', 'under-armour.com', 'puma.com',
    'newbalance.com', 'reebok.com', 'converse.com', 'vans.com',
    'patagonia.com', 'uniqlo.com', 'hm.com', 'zara.com',
    'lululemon.com', 'champion.com', 'asics.com',
  ],
  toys: [
    'hasbro.com', 'mattel.com', 'lego.com', 'funko.com',
    'mcfarlane.com', 'bandai.com', 'leapfrog.com', 'vtech.com',
  ],
  software: [
    'atlassian.com', 'notion.so', 'linear.app', 'asana.com',
    'monday.com', 'clickup.com', 'basecamp.com', 'trello.com',
    'gitlab.com', 'figma.com', 'miro.com', 'airtable.com',
  ],
  food: [
    'doordash.com', 'ubereats.com', 'grubhub.com', 'instacart.com',
    'postmates.com', 'seamless.com', 'freshkitchen.com', 'factor75.com',
  ],
  finance: [
    'stripe.com', 'braintree.com', 'adyen.com', 'square.com',
    'paypal.com', 'plaid.com', 'brex.com', 'mercury.com',
    'wise.com', 'revolut.com',
  ],
  healthcare: [
    'teladoc.com', 'hims.com', 'ro.co', 'babylonhealth.com',
    'noom.com', 'calm.com', 'zocdoc.com', 'doctorondemand.com',
  ],
  real_estate: [
    'zillow.com', 'redfin.com', 'realtor.com', 'compass.com',
    'opendoor.com', 'offerpad.com', 'homie.com', 'doorsteps.com',
  ],
  travel: [
    'airbnb.com', 'booking.com', 'expedia.com', 'hotels.com',
    'kayak.com', 'skyscanner.com', 'tripadvisor.com', 'klook.com',
  ],
  edtech: [
    'coursera.org', 'udemy.com', 'udacity.com', 'skillshare.com',
    'masterclass.com', 'duolingo.com', 'khanacademy.org', 'pluralsight.com',
  ],
  media: [
    'vimeo.com', 'dailymotion.com', 'twitch.tv', 'rumble.com',
    'odysee.com', 'brightcove.com', 'wistia.com', 'loom.com',
    'plex.tv', 'jellyfin.org', 'bitchute.com', 'peertube.social',
  ],
  social_media: [
    'mastodon.social', 'bluesky.social', 'threads.net',
    'discord.com', 'telegram.org', 'signal.org',
    'minds.com', 'mewe.com', 'gab.com',
  ],
  cloud: [
    'digitalocean.com', 'linode.com', 'vultr.com', 'hetzner.com',
    'render.com', 'railway.app', 'fly.io', 'vercel.com',
    'netlify.com', 'cloudflare.com', 'fastly.com',
  ],
  cybersecurity: [
    'crowdstrike.com', 'sentinelone.com', 'carbonblack.com', 'cylance.com',
    'darktrace.com', 'snyk.io', 'lacework.com', 'orca.security',
    'wiz.io', 'aquasec.com', 'paloaltonetworks.com',
  ],
  hr_tech: [
    'workday.com', 'bamboohr.com', 'rippling.com', 'gusto.com',
    'greenhouse.io', 'lever.co', 'workable.com', 'recruitee.com',
    'linkedin.com', 'indeed.com', 'glassdoor.com',
  ],
};

// Industry directory pages — crawled for links (secondary URL extraction), not for entities.
// The entities found on these pages are the actual companies listed in the directory.
const DIRECTORY_PAGES: Record<string, string[]> = {
  cro_agency: [
    'https://clutch.co/agencies/conversion-rate-optimization',
    'https://goodfirms.co/cro-companies',
    'https://www.topdevelopers.co/blog/top-conversion-rate-optimization-companies',
  ],
  digital_marketing: [
    'https://clutch.co/agencies/digital-marketing',
    'https://goodfirms.co/digital-marketing-companies',
  ],
};

// Blocked domains that should never be crawled as entities
// (they may still be crawled for link extraction in DIRECTORY_PAGES)
const BLOCKED_DOMAINS = new Set([
  'google.com', 'google.co.uk', 'google.in', 'google.co',
  'facebook.com', 'youtube.com', 'twitter.com', 'x.com',
  'linkedin.com', 'instagram.com', 'reddit.com', 'wikipedia.org',
  'amazon.com', 'bing.com', 'yahoo.com', 'tiktok.com',
  'pinterest.com', 'whatsapp.com', 'snapchat.com',
  'duckduckgo.com', 'baidu.com', 'yandex.com', 'apple.com',
  'microsoft.com', 'github.com', 'stackoverflow.com', 'medium.com',
  // Review/directory sites — blocked as entities, allowed as link sources
  'clutch.co', 'g2.com', 'capterra.com', 'goodfirms.co',
  'trustpilot.com', 'crunchbase.com', 'producthunt.com',
  'growjo.com', 'cbinsights.com', 'topdevelopers.co',
]);

export class DiscoveryOrchestrator {
  private crawler: Crawler;
  private queryAnalyzer: QueryAnalyzer;
  private entityExtractor: EntityExtractor;
  private validator: Validator;
  private duplicateDetector: DuplicateDetector;
  private changeDetector: ChangeDetector;
  private dynamicDiscovery: DynamicDiscovery;
  private aiEnhancer: AIQueryEnhancer | null;

  constructor() {
    this.crawler = new Crawler();
    this.queryAnalyzer = new QueryAnalyzer();
    this.entityExtractor = new EntityExtractor();
    this.validator = new Validator();
    this.duplicateDetector = new DuplicateDetector();
    this.changeDetector = new ChangeDetector();
    this.dynamicDiscovery = new DynamicDiscovery();
    // Always enable — meta-fetch works with no key; Groq (free at console.groq.com) unlocks AI competitors
    this.aiEnhancer = new AIQueryEnhancer(process.env.GROQ_API_KEY);
  }

  async run(rawQuery: string, existingQueryId?: string): Promise<void> {
    console.log(`\n[Orchestrator] ▶ Starting discovery for: "${rawQuery}"`);

    try {
      // 1. Analyze query
      const queryObj = this.queryAnalyzer.analyze(rawQuery);
      const isDomain = this.queryAnalyzer.isDomainQuery(rawQuery);
      console.log(`[Orchestrator] Intent: ${queryObj.intent} | Industry: ${queryObj.industry ?? 'unknown'} | Domain: ${isDomain}`);

      // 2. Save query record
      let query = existingQueryId
        ? await db.query.findUnique({ where: { id: existingQueryId } })
        : null;

      if (!query) {
        query = await db.query.create({
          data: {
            raw: queryObj.raw,
            intent: queryObj.intent,
            industry: queryObj.industry,
            entityType: queryObj.entityType,
            location: queryObj.location,
            keywords: JSON.stringify(queryObj.keywords),
            objective: queryObj.objective,
          },
        });
      }

      // 3. Collect domains already discovered in previous runs of this same raw query
      //    so we can skip re-linking them and show only truly new results.
      const previousDomains = new Set<string>();
      const previousRuns = await db.query.findMany({
        where: { raw: queryObj.raw, id: { not: query.id } },
        include: { entities: { include: { entity: { select: { domain: true } } } } },
      });
      for (const prev of previousRuns) {
        for (const qe of prev.entities) previousDomains.add(qe.entity.domain);
      }
      const isRerun = previousDomains.size > 0;
      if (isRerun) {
        console.log(`[Orchestrator] Re-run — ${previousDomains.size} previously known domains will not be re-linked`);
      }

      // 4. Build URL list using tiered strategy
      const urlList = await this.buildUrlList(rawQuery, isDomain, queryObj.industry);
      console.log(`[Orchestrator] URL list: ${urlList.length} targets to crawl`);

      if (urlList.length === 0) {
        console.warn('[Orchestrator] No URLs to crawl — query not supported');
        // Write a sentinel log entry so the frontend can detect this state
        await db.crawlLog.create({
          data: {
            queryId: query.id,
            url: 'unsupported:query',
            status: 'unsupported',
            error: `Query "${rawQuery}" could not be mapped to any known industry or company. Try: "Find competitors of example.com", "Best Shopify agencies", or "AI companies".`,
          },
        });
        return;
      }

      // 5. Crawl all URLs
      await this.crawler.init();
      let savedCount = 0;
      let newEntityCount = 0;
      const secondaryUrls = new Set<string>();

      for (let i = 0; i < urlList.length; i++) {
        const url = urlList[i];
        const logEntry = await db.crawlLog.create({
          data: { queryId: query.id, url, status: 'crawling' },
        });

        console.log(`[Orchestrator] (${i + 1}/${urlList.length}) Crawling: ${url}`);
        const pageData = await this.crawler.crawlPage(url);

        await db.crawlLog.update({
          where: { id: logEntry.id },
          data: {
            status: pageData.success ? 'success' : 'failed',
            statusCode: pageData.statusCode,
            error: pageData.error,
            duration: pageData.duration,
          },
        });

        if (!pageData.success || !pageData.html) {
          console.log(`[Orchestrator] ✗ Failed: ${url} — ${pageData.error ?? 'no content'}`);
          continue;
        }

        // For directory pages (clutch, g2, goodfirms etc.) — harvest their outbound
        // links but skip entity creation entirely. The directory host is in BLOCKED_DOMAINS
        // so validation would reject it anyway, but doing it explicitly is faster.
        const urlHost = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } })();
        if (this.isBlocked(urlHost)) {
          console.log(`[Orchestrator] 📋 Directory page ${urlHost} — extracting links only`);
          this.extractSecondaryUrls(pageData.externalLinks ?? [], secondaryUrls);
          await db.crawlLog.update({ where: { id: logEntry.id }, data: { status: 'skipped', error: 'directory-only: links extracted' } });
          continue;
        }

        // Extract secondary URLs from this page (competitor links, related sites)
        if (isDomain || queryObj.intent === 'competitor_analysis' || queryObj.intent === 'agency_search') {
          this.extractSecondaryUrls(pageData.externalLinks ?? [], secondaryUrls);
        }

        // Extract + validate entity
        const extracted = this.entityExtractor.extractCompany(pageData as any);
        extracted.source = url;
        if (queryObj.industry) {
          extracted.category = queryObj.industry.replace(/_/g, ' ');
        }

        const validation = this.validator.validate(extracted, queryObj);
        extracted.confidenceScore = validation.confidenceScore;
        extracted.relevanceScore = validation.relevanceScore;

        if (!validation.isValid) {
          console.log(`[Orchestrator] ✗ Rejected ${extracted.domain}: ${validation.reasons[0]}`);
          continue;
        }

        if (this.duplicateDetector.isDuplicate(extracted)) {
          console.log(`[Orchestrator] ↩ Duplicate: ${extracted.domain}`);
          continue;
        }
        this.duplicateDetector.markSeen(extracted);

        // Enrich founders from About/Team subpage when homepage gave sparse results
        if (extracted.founders.length < 2) {
          const aboutUrl = this.findAboutPageUrl(pageData.internalLinks ?? [], url);
          if (aboutUrl) {
            extracted.founders = await this.enrichFoundersFromAboutPage(aboutUrl, extracted.founders);
          }
        }

        // Groq-powered quality gate: for agency_search with borderline confidence,
        // ask the LLM whether this is a genuine service agency or a SaaS tool.
        // Runs only when Groq key is set — fails open (keeps entity) on error.
        if (
          this.aiEnhancer &&
          queryObj.intent === 'agency_search' &&
          extracted.confidenceScore < 0.7 &&
          extracted.description
        ) {
          const classification = await this.aiEnhancer.classifyEntityRelevance(
            extracted.name,
            extracted.description,
            queryObj.intent,
            queryObj.industry,
          );
          if (!classification.isRelevant) {
            console.log(`[Orchestrator] 🤖 Groq rejected ${extracted.domain}: ${classification.reason}`);
            await db.crawlLog.update({ where: { id: logEntry.id }, data: { status: 'skipped', error: `Groq: ${classification.reason}` } });
            continue;
          }
          console.log(`[Orchestrator] 🤖 Groq approved ${extracted.domain} (${classification.type}): ${classification.reason}`);
        }

        // Generate qualitative positioning snippet (fills the "qualitative context" gap)
        if (this.aiEnhancer && extracted.description) {
          const positioning = await this.aiEnhancer.generatePositioning(
            extracted.name,
            extracted.description,
            rawQuery,
          );
          if (positioning) (extracted as any).positioning = positioning;
        }

        const isNewDomain = !previousDomains.has(extracted.domain);
        await this.saveEntity(extracted, query.id, isNewDomain);
        savedCount++;
        if (isNewDomain) newEntityCount++;
        console.log(`[Orchestrator] ✅ Saved${isNewDomain ? ' (new)' : ' (updated)'}: ${extracted.name} (${extracted.domain}) conf=${extracted.confidenceScore.toFixed(2)}`);

        await db.crawlLog.update({
          where: { id: logEntry.id },
          data: { entitiesFound: isNewDomain ? 1 : 0 },
        });

        await this.sleep(300);
      }

      // 6. Crawl secondary URLs discovered from pages (up to 5 extra)
      const extraUrls = [...secondaryUrls].filter(u => !urlList.includes(u)).slice(0, 5);
      if (extraUrls.length > 0) {
        console.log(`[Orchestrator] Processing ${extraUrls.length} secondary URLs from page links...`);
        for (const url of extraUrls) {
          const logEntry = await db.crawlLog.create({
            data: { queryId: query.id, url, status: 'crawling' },
          });

          const pageData = await this.crawler.crawlPage(url);
          await db.crawlLog.update({
            where: { id: logEntry.id },
            data: {
              status: pageData.success ? 'success' : 'failed',
              error: pageData.error,
              duration: pageData.duration,
            },
          });

          if (!pageData.success) continue;

          const extracted = this.entityExtractor.extractCompany(pageData as any);
          extracted.source = url;
          if (queryObj.industry) extracted.category = queryObj.industry.replace(/_/g, ' ');

          const validation = this.validator.validate(extracted, queryObj);
          extracted.confidenceScore = validation.confidenceScore;
          extracted.relevanceScore = validation.relevanceScore;

          if (!validation.isValid || this.duplicateDetector.isDuplicate(extracted)) continue;
          this.duplicateDetector.markSeen(extracted);

          if (extracted.founders.length < 2) {
            const aboutUrl = this.findAboutPageUrl(pageData.internalLinks ?? [], url);
            if (aboutUrl) {
              extracted.founders = await this.enrichFoundersFromAboutPage(aboutUrl, extracted.founders);
            }
          }

          const isNewDomain = !previousDomains.has(extracted.domain);
          await this.saveEntity(extracted, query.id, isNewDomain);
          savedCount++;
          if (isNewDomain) newEntityCount++;
          console.log(`[Orchestrator] ✅ (secondary) Saved${isNewDomain ? ' (new)' : ' (updated)'}: ${extracted.name} (${extracted.domain})`);
          await this.sleep(300);
        }
      }

      await this.crawler.close();

      // Write no-new-results sentinel so the frontend can show the right message
      if (isRerun && newEntityCount === 0) {
        console.log('[Orchestrator] Re-run complete — no new entities discovered');
        await db.crawlLog.create({
          data: {
            queryId: query.id,
            url: 'no_new_results:query',
            status: 'no_new_results',
            error: 'No new companies found. All discovered results were already known from previous runs of this query.',
          },
        });
      }

      console.log(`\n[Orchestrator] ✅ Complete — ${newEntityCount} new / ${savedCount} total entities for "${rawQuery}"\n`);

    } catch (error) {
      console.error('[Orchestrator] Fatal error:', (error as Error).message, (error as Error).stack);
      await this.crawler.close().catch(() => {});
    }
  }

  /**
   * Build the URL list to crawl using 3 tiers:
   * Tier 1: The target domain itself (for domain queries)
   * Tier 2: Industry seed companies
   * Tier 3: Keyword-matched seeds
   */
  private async buildUrlList(rawQuery: string, isDomain: boolean, industry: string | null): Promise<string[]> {
    const urls: string[] = [];
    const seenDomains = new Set<string>();

    const addUrl = (domain: string) => {
      const clean = domain.toLowerCase().replace(/^www\./, '').replace(/\/$/, '');
      if (!seenDomains.has(clean) && !this.isBlocked(clean)) {
        seenDomains.add(clean);
        urls.push(`https://${clean}`);
      }
    };

    // addDirectoryUrl: adds a full URL (including path) for a directory page.
    // The page is crawled only for its outbound links — the directory host itself
    // is blocked as an entity (see BLOCKED_DOMAINS) so no entity record is created.
    const addDirectoryUrl = (fullUrl: string) => {
      if (!seenDomains.has(fullUrl)) {
        seenDomains.add(fullUrl);
        urls.push(fullUrl);
      }
    };

    // Tier -1: AI-powered query understanding — uses Claude's world knowledge to identify
    // the target company, its industry, and known competitors directly.
    let resolvedIndustry = industry;
    const queryObj = this.queryAnalyzer.analyze(rawQuery);
    if (this.aiEnhancer && !isDomain) {
      try {
        console.log(`[Orchestrator] Tier -1 (AI enhancer): analyzing "${rawQuery}"`);
        const insight = await this.aiEnhancer.enhance(rawQuery);
        if (insight.confidence >= 0.5) {
          console.log(`[Orchestrator] Tier -1 → company=${insight.company ?? 'n/a'} industry=${insight.industry ?? 'n/a'} competitors=${insight.competitors.length}`);
          // AI-identified competitors are the highest-quality signal — add them all
          insight.competitors.forEach(d => addUrl(d));
          // Also crawl the target company itself if identified
          if (insight.company) addUrl(insight.company);
          // Use AI-identified industry for seed selection if not already set
          if (!resolvedIndustry && insight.industry) resolvedIndustry = insight.industry;
        }
      } catch (err) {
        console.warn(`[Orchestrator] Tier -1 (AI) failed: ${(err as Error).message}`);
      }
    }

    // Tier 0: Dynamic discovery via Wikipedia + DuckDuckGo — works for any company or query
    if (!isDomain && ['competitor_analysis', 'market_discovery', 'brand_discovery', 'general_search'].includes(queryObj.intent)) {
      try {
        console.log(`[Orchestrator] Tier 0 (dynamic lookup): querying Wikipedia + DDG for "${rawQuery}"`);
        const dynResult = await this.dynamicDiscovery.discoverFromQuery(rawQuery);
        if (dynResult.domains.length > 0 || dynResult.industry) {
          console.log(`[Orchestrator] Tier 0 → source=${dynResult.source} industry=${dynResult.industry ?? 'n/a'} domains=${dynResult.domains.length}`);
          dynResult.domains.slice(0, 10).forEach(d => addUrl(d));
          if (!resolvedIndustry && dynResult.industry) resolvedIndustry = dynResult.industry;
        }
      } catch (err) {
        console.warn(`[Orchestrator] Tier 0 failed: ${(err as Error).message}`);
      }
    }

    // Tier 1: Direct domain
    if (isDomain) {
      const domain = this.queryAnalyzer.extractDomainFromQuery(rawQuery);
      if (domain) {
        console.log(`[Orchestrator] Tier 1 (direct domain): ${domain}`);
        addUrl(domain);

        // Check DB to see if we already know this company's category
        if (!resolvedIndustry) {
          const existing = await db.entity.findUnique({ where: { domain } }).catch(() => null);
          if (existing?.category) {
            const catKey = existing.category.replace(/\s+/g, '_').toLowerCase();
            if (INDUSTRY_SEEDS[catKey]) {
              resolvedIndustry = catKey;
              console.log(`[Orchestrator] Tier 1b (DB-inferred industry: ${catKey})`);
            }
          }
        }
      }
    }

    // Tier 2: Industry seed companies + directory pages for link harvesting
    if (resolvedIndustry && INDUSTRY_SEEDS[resolvedIndustry]) {
      const seeds = INDUSTRY_SEEDS[resolvedIndustry];
      console.log(`[Orchestrator] Tier 2 (${resolvedIndustry} seeds): ${seeds.length} companies`);
      seeds.forEach(s => addUrl(s));

      // Also queue directory pages for this industry — Playwright will crawl them
      // and extract outbound agency links as secondary URLs. The directory hosts
      // themselves are in BLOCKED_DOMAINS so they won't produce entity records.
      const dirPages = DIRECTORY_PAGES[resolvedIndustry] ?? [];
      if (dirPages.length > 0) {
        console.log(`[Orchestrator] Tier 2d (directory pages for ${resolvedIndustry}): ${dirPages.length} pages`);
        dirPages.forEach(url => addDirectoryUrl(url));
      }
    } else {
      // Tier 3a: Keyword match against seed domain names in the query text
      const queryLower = rawQuery.toLowerCase();
      let matched = false;
      for (const [ind, seeds] of Object.entries(INDUSTRY_SEEDS)) {
        if (seeds.some(s => queryLower.includes(s.split('.')[0]))) {
          console.log(`[Orchestrator] Tier 3a (keyword-matched industry: ${ind})`);
          seeds.forEach(s => addUrl(s));
          matched = true;
          break;
        }
      }

      // Tier 3b: Intent-based fallback
      if (!matched) {
        if (queryObj.intent === 'agency_search') {
          // Agency searches without industry → default to CRO/digital agencies
          console.log(`[Orchestrator] Tier 3b (agency fallback → cro_agency seeds)`);
          (INDUSTRY_SEEDS.cro_agency ?? []).forEach(s => addUrl(s));
          matched = true;
        } else if (queryObj.intent === 'local_business_search') {
          const loc = queryObj.location?.toLowerCase() ?? '';
          const ind = loc.includes('delhi') || loc.includes('india') || loc.includes('mumbai')
            ? 'apparel' : 'food';
          console.log(`[Orchestrator] Tier 3b (local business fallback → ${ind} seeds)`);
          (INDUSTRY_SEEDS[ind] ?? []).forEach(s => addUrl(s));
          matched = true;
        } else if (['competitor_analysis', 'market_discovery'].includes(queryObj.intent)) {
          // Extract the target company name from the query and try to crawl it directly
          // e.g. "youtube competitors" → crawl youtube.com, then use secondary links
          const companyMatch = rawQuery.match(
            /(?:competitors?\s+of\s+|alternatives?\s+to\s+|vs\.?\s+|like\s+)([a-zA-Z0-9_.-]+)/i
          ) ?? rawQuery.match(/([a-zA-Z0-9_-]+)\s+(?:competitors?|alternatives?)/i);

          if (companyMatch?.[1]) {
            const companySlug = companyMatch[1].toLowerCase().replace(/[^a-z0-9-]/g, '');
            const guessedDomain = `${companySlug}.com`;
            if (!this.isBlocked(guessedDomain)) {
              console.log(`[Orchestrator] Tier 3b (competitor: extracted company → ${guessedDomain})`);
              addUrl(guessedDomain);
              matched = true;
            }
          }
        }
      }

      // Tier 3c: Extract any known brand/company name from the query and crawl it directly
      if (!matched) {
        const words = rawQuery.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
        const knownBrands: Record<string, string> = {
          nike: 'nike.com', adidas: 'adidas.com', jordan: 'nike.com', puma: 'puma.com',
          apple: 'apple.com', samsung: 'samsung.com', google: 'google.com',
          amazon: 'amazon.com', tesla: 'tesla.com', microsoft: 'microsoft.com',
          shopify: 'shopify.com', stripe: 'stripe.com', notion: 'notion.so',
          figma: 'figma.com', slack: 'slack.com', zoom: 'zoom.us',
          hubspot: 'hubspot.com', salesforce: 'salesforce.com', zendesk: 'zendesk.com',
          lego: 'lego.com', netflix: 'netflix.com', spotify: 'spotify.com',
          airbnb: 'airbnb.com', uber: 'uber.com', lyft: 'lyft.com',
          doordash: 'doordash.com', instacart: 'instacart.com',
        };
        let brandMatched = false;
        for (const word of words) {
          if (knownBrands[word]) {
            console.log(`[Orchestrator] Tier 3c (brand name match: ${word} → ${knownBrands[word]})`);
            addUrl(knownBrands[word]);
            // Also add related industry seeds
            const brandIndustry = this.queryAnalyzer.analyze(rawQuery).industry;
            if (brandIndustry && INDUSTRY_SEEDS[brandIndustry]) {
              INDUSTRY_SEEDS[brandIndustry].slice(0, 8).forEach(s => addUrl(s));
            }
            brandMatched = true;
            break;
          }
        }

        // Tier 3d: Last resort — use software seeds as a general tech-company fallback
        if (!brandMatched) {
          console.log(`[Orchestrator] Tier 3d (no match found — query may be out of scope)`);
          // Return empty so the caller can surface a helpful error message
        }
      }
    }

    return urls.slice(0, 15);
  }

  /**
   * Extract competitor / related company links from a crawled page.
   * Looks for external links that point to company homepages.
   */
  private extractSecondaryUrls(externalLinks: string[], target: Set<string>): void {
    for (const link of externalLinks) {
      try {
        const url = new URL(link);
        const domain = url.hostname.replace(/^www\./, '');
        // Only homepage-level links (path is just / or empty)
        const isHomepage = url.pathname === '/' || url.pathname === '';
        if (isHomepage && !this.isBlocked(domain) && target.size < 20) {
          target.add(`https://${domain}`);
        }
      } catch {}
    }
  }

  private async saveEntity(entity: CompanyEntity, queryId: string, isNew = true): Promise<void> {
    const existing = await db.entity.findUnique({ where: { domain: entity.domain } });

    const data = {
      name: entity.name,
      domain: entity.domain,
      description: entity.description,
      services: JSON.stringify(entity.services),
      founders: JSON.stringify(entity.founders),
      linkedin: entity.linkedin,
      twitter: entity.twitter,
      technologies: JSON.stringify(entity.technologies),
      locations: JSON.stringify(entity.locations),
      emails: JSON.stringify(entity.emails),
      phones: JSON.stringify(entity.phones),
      confidenceScore: entity.confidenceScore,
      relevanceScore: entity.relevanceScore,
      category: entity.category,
      source: entity.source,
      metaTitle: entity.metaTitle,
      metaDescription: entity.metaDescription,
      positioning: (entity as any).positioning ?? null,
      lastSeen: new Date(),
      isValid: true,
    };

    let savedEntity;
    if (existing) {
      const changes = this.changeDetector.detect({ ...existing } as any, data as any);
      savedEntity = await db.entity.update({ where: { domain: entity.domain }, data });

      if (changes.hasChanges) {
        const snapshot = await db.snapshot.create({
          data: {
            entityId: savedEntity.id,
            data: JSON.stringify(data),
            hash: this.changeDetector.hash(data),
          },
        });
        for (const change of changes.changes) {
          await db.change.create({
            data: {
              entityId: savedEntity.id,
              snapshotId: snapshot.id,
              field: change.field,
              oldValue: change.oldValue,
              newValue: change.newValue,
              changeType: change.changeType,
            },
          });
        }
      }
    } else {
      savedEntity = await db.entity.create({ data });
      await db.snapshot.create({
        data: {
          entityId: savedEntity.id,
          data: JSON.stringify(data),
          hash: this.changeDetector.hash(data),
        },
      });
    }

    // Always link to this query — isNew marks whether this was a fresh discovery
    await db.queryEntity.upsert({
      where: { queryId_entityId: { queryId, entityId: savedEntity.id } },
      update: { score: entity.relevanceScore },
      create: { queryId, entityId: savedEntity.id, score: entity.relevanceScore, isNew },
    });

    await db.validation.create({
      data: {
        entityId: savedEntity.id,
        validationType: 'full',
        passed: true,
        score: entity.confidenceScore,
        reason: 'Passed validation',
      },
    });
  }

  /** Find the best About/Team subpage URL from a crawled page's internal links. */
  private findAboutPageUrl(internalLinks: string[], _baseUrl: string): string | null {
    const ABOUT_SLUGS = ['/about-us', '/about_us', '/our-team', '/team/', '/who-we-are', '/leadership', '/management', '/people', '/company/about', '/about/'];
    for (const link of internalLinks) {
      let path = '';
      try { path = new URL(link).pathname.toLowerCase(); } catch { continue; }
      if (ABOUT_SLUGS.some(s => path === s.replace(/\/$/, '') || path.startsWith(s))) {
        return link;
      }
    }
    // Looser pass: any internal link whose path contains "about" or "team"
    for (const link of internalLinks) {
      let path = '';
      try { path = new URL(link).pathname.toLowerCase(); } catch { continue; }
      if ((path.includes('about') || path.includes('team') || path.includes('people')) &&
          !path.includes('blog') && !path.includes('career') && !path.includes('job')) {
        return link;
      }
    }
    return null;
  }

  /** Crawl an About/Team page and merge any found people into existingFounders. */
  private async enrichFoundersFromAboutPage(aboutUrl: string, existingFounders: PersonInfo[]): Promise<PersonInfo[]> {
    try {
      console.log(`[Orchestrator] Crawling about page: ${aboutUrl}`);
      const aboutPage = await this.crawler.crawlPage(aboutUrl);
      if (!aboutPage.success) return existingFounders;

      const aboutEntity = this.entityExtractor.extractCompany(aboutPage as any);
      if (aboutEntity.founders.length === 0) return existingFounders;

      const existingNames = new Set(existingFounders.map(p => p.name.toLowerCase()));
      const newPeople = aboutEntity.founders.filter(p => !existingNames.has(p.name.toLowerCase()));
      console.log(`[Orchestrator] About page contributed ${newPeople.length} additional people`);
      return [...existingFounders, ...newPeople].slice(0, 8);
    } catch {
      return existingFounders;
    }
  }

  private isBlocked(domain: string): boolean {
    const normalized = domain.toLowerCase().replace(/^www\./, '');
    return BLOCKED_DOMAINS.has(normalized);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
