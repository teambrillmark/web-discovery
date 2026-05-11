/**
 * Dynamic competitor and industry discovery using free public APIs.
 * No API keys required — uses Wikipedia REST API and DuckDuckGo Instant Answer API.
 *
 * Wikipedia related pages API: https://en.wikipedia.org/api/rest_v1/page/related/{title}
 * DuckDuckGo IA API: https://api.duckduckgo.com/?q={query}&format=json
 */

export interface DynamicResult {
  industry: string | null;
  domains: string[];
  description: string | null;
  source: 'wikipedia' | 'duckduckgo' | 'none';
}

// Map Wikipedia/DDG description text → internal industry key
const DESCRIPTION_INDUSTRY_MAP: Array<{ pattern: RegExp; industry: string }> = [
  // CRO / A-B testing must come before digital_marketing — it's more specific
  { pattern: /\ba\/b test|\bsplit test|conversion.*rate.*optim|\bcro\b|experimentation.*platform|website.*optim.*agency/i, industry: 'cro_agency' },
  { pattern: /video.*shar|streaming.*video|video.*platform|video.*host/i, industry: 'media' },
  { pattern: /social.*network|social.*media.*platform/i, industry: 'social_media' },
  { pattern: /e-?commerce|online.*retail|online.*shop|marketplace/i, industry: 'ecommerce' },
  { pattern: /fintech|financial.*tech|payment.*platform|digital.*bank/i, industry: 'finance' },
  { pattern: /artificial.*intelligence|machine.*learning|large.*language/i, industry: 'ai' },
  { pattern: /cloud.*computing|cloud.*service|infrastructure.*as/i, industry: 'cloud' },
  { pattern: /cybersecurity|information.*security|endpoint.*protect/i, industry: 'cybersecurity' },
  { pattern: /footwear|athletic.*shoe|sportswear|apparel|clothing.*brand/i, industry: 'apparel' },
  { pattern: /food.*delivery|restaurant.*tech|meal.*kit/i, industry: 'food' },
  { pattern: /real.*estate|property.*tech|proptech/i, industry: 'real_estate' },
  { pattern: /online.*travel|hotel.*booking|flight.*search/i, industry: 'travel' },
  { pattern: /software.*company|saas|cloud.*application/i, industry: 'software' },
  { pattern: /online.*education|e-?learning|edtech|learning.*platform/i, industry: 'edtech' },
  { pattern: /digital.*market|seo|paid.*ads|paid.*search/i, industry: 'digital_marketing' },
  { pattern: /note.?taking|wiki|knowledge\s*base|personal\s*knowledge|docs.*tool/i, industry: 'notes_app' },
  { pattern: /project\s*management|task\s*management|work\s*management/i, industry: 'project_management' },
  { pattern: /team\s*collaboration|workplace\s*communication|messaging.*platform|team\s*messaging/i, industry: 'collaboration' },
  { pattern: /all.in.one\s*workspace|productivity\s*tool|productivity\s*app|workspace\s*app/i, industry: 'productivity' },
  { pattern: /design.*tool|design.*software|prototyping.*tool|ui.*design/i, industry: 'design_tool' },
  { pattern: /developer\s*tool|devops|code.*editor|ide\b|version\s*control/i, industry: 'devtools' },
];

// Known non-.com TLDs for popular companies so we don't guess wrong
const KNOWN_TLDS: Record<string, string> = {
  twitch: 'twitch.tv',
  telegram: 'telegram.org',
  signal: 'signal.org',
  whatsapp: 'whatsapp.com',
  github: 'github.com',
  gitlab: 'gitlab.com',
  bitbucket: 'bitbucket.org',
  mastodon: 'mastodon.social',
  khanacademy: 'khanacademy.org',
  wikipedia: 'wikipedia.org',
  mozilla: 'mozilla.org',
  creativecommons: 'creativecommons.org',
};

export class DynamicDiscovery {
  private readonly WIKI_API = 'https://en.wikipedia.org/api/rest_v1';
  private readonly DDG_API = 'https://api.duckduckgo.com';
  private readonly DDG_HTML = 'https://html.duckduckgo.com/html';
  private readonly TIMEOUT = 8000;

  /**
   * Given a company name or domain, discover its industry and related competitor domains.
   */
  async discover(companyNameOrDomain: string): Promise<DynamicResult> {
    // Normalize: strip TLD if it's a domain
    const name = companyNameOrDomain
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\.(com|io|co|net|org|tv|ai|app).*$/i, '')
      .trim();

    // Try Wikipedia first — higher quality structured data
    const wikiResult = await this.tryWikipedia(name);
    if (wikiResult.domains.length > 0 || wikiResult.industry) {
      return { ...wikiResult, source: 'wikipedia' };
    }

    // Fallback to DuckDuckGo IA
    const ddgResult = await this.tryDuckDuckGo(name);
    if (ddgResult.domains.length > 0 || ddgResult.industry) {
      return { ...ddgResult, source: 'duckduckgo' };
    }

    return { industry: null, domains: [], description: null, source: 'none' };
  }

  /**
   * Use DuckDuckGo IA for a broader query like "youtube competitors".
   * Useful when we have a full user query, not just a company name.
   */
  async discoverFromQuery(query: string): Promise<DynamicResult> {
    // Extract the TARGET company name from common query patterns before querying
    // e.g. "brillmark competitor" → "brillmark", "competitors of notion" → "notion"
    const companyName =
      query.match(/([a-zA-Z0-9_-]+)\s+(?:competitor|alternative|vs\b)/i)?.[1] ??
      query.match(/(?:competitor|alternative)\s+(?:of|to)\s+([a-zA-Z0-9_-]+)/i)?.[1] ??
      query.match(/(?:find|best|top)\s+([a-zA-Z0-9_-]+)\s+(?:competitor|alternative)/i)?.[1] ??
      null;

    if (companyName) {
      // Look up the company directly — this gives much better results than the full query
      const result = await this.discover(companyName);

      // Supplement with live web search results for real competitor pages
      const webDomains = await this.searchWebForCompetitors(companyName);
      const merged = [...new Set([...result.domains, ...webDomains])];

      if (merged.length > 0 || result.industry) {
        return { ...result, domains: merged };
      }
    }

    // Fallback: send the full query to DDG
    const ddgResult = await this.tryDuckDuckGo(query);
    if (ddgResult.domains.length > 0 || ddgResult.industry) return { ...ddgResult, source: 'duckduckgo' };

    return { industry: null, domains: [], description: null, source: 'none' };
  }

  /**
   * Run multiple search queries in parallel and merge results.
   * This replaces static seed lists — given profile context we build
   * several targeted searches (competitor, alternative, "top X agency", etc.)
   * and deduplicate the merged domain set.
   */
  async discoverFromMultipleQueries(queries: string[]): Promise<DynamicResult> {
    const allDomains = new Set<string>();
    let industry: string | null = null;
    let description: string | null = null;
    let source: DynamicResult['source'] = 'none';

    const settled = await Promise.allSettled(
      queries.map(q => this.discoverFromQuery(q)),
    );

    for (const result of settled) {
      if (result.status !== 'fulfilled') continue;
      const r = result.value;
      r.domains.forEach(d => allDomains.add(d));
      if (!industry && r.industry) industry = r.industry;
      if (!description && r.description) description = r.description;
      if (r.source !== 'none') source = r.source;
    }

    return { industry, domains: [...allDomains], description, source };
  }

  /**
   * Scrape DuckDuckGo HTML for a plain keyword query — used for industry discovery
   * searches like "top a/b testing agencies 2025" that aren't tied to a company name.
   */
  async searchByKeyword(query: string): Promise<string[]> {
    return this.searchWebForCompetitors(query);
  }

  /**
   * Scrape DuckDuckGo HTML search results for "{company} competitors" to discover
   * real competitor domains from live web search — no API key required.
   */
  private async searchWebForCompetitors(companyName: string): Promise<string[]> {
    try {
      const q = `${companyName} competitors alternatives`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.TIMEOUT);

      const res = await fetch(`${this.DDG_HTML}/?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; CompanyDiscoveryBot/1.0)',
          'Accept': 'text/html',
        },
      });
      clearTimeout(timer);
      if (!res.ok) return [];

      const html = await res.text();

      // Extract result URLs from redirect hrefs: uddg=https%3A%2F%2Fexample.com%2F...
      const uddgMatches = [...html.matchAll(/uddg=(https?%3A%2F%2F[^&"'\s]+)/g)];
      const domains = new Set<string>();

      for (const match of uddgMatches) {
        try {
          const decoded = decodeURIComponent(match[1]);
          const domain = new URL(decoded).hostname.replace(/^www\./, '');
          if (domain && domain.includes('.') && !this.isCommonNonCompany(domain) && !this.isCompanyVariant(domain, companyName)) {
            domains.add(domain);
          }
        } catch {}
        if (domains.size >= 15) break;
      }

      // Also extract plain domain text from result__url spans as backup
      const urlSpanMatches = [...html.matchAll(/class="result__url"[^>]*>\s*([a-z0-9.-]+\.[a-z]{2,})/gi)];
      for (const match of urlSpanMatches) {
        const domain = match[1].trim().toLowerCase().replace(/^www\./, '').split('/')[0];
        if (domain && domain.includes('.') && !this.isCommonNonCompany(domain) && !this.isCompanyVariant(domain, companyName)) {
          domains.add(domain);
        }
        if (domains.size >= 15) break;
      }

      console.log(`[DynamicDiscovery] DDG web search for "${companyName}" → ${domains.size} domains`);
      return [...domains];
    } catch {
      return [];
    }
  }

  private isCommonNonCompany(domain: string): boolean {
    const NON_COMPANY = new Set([
      'google.com', 'bing.com', 'yahoo.com', 'duckduckgo.com',
      'facebook.com', 'twitter.com', 'x.com', 'linkedin.com',
      'youtube.com', 'reddit.com', 'wikipedia.org', 'amazon.com',
      'medium.com', 'quora.com', 'forbes.com', 'techcrunch.com',
      'g2.com', 'capterra.com', 'trustpilot.com', 'glassdoor.com',
      'crunchbase.com', 'producthunt.com', 'github.com',
    ]);
    return NON_COMPANY.has(domain);
  }

  /**
   * Returns true if domain looks like a word-variant of the searched company name.
   * Filters out results like "notions.com" or "johnnienotions.com" when searching for "notion".
   */
  private isCompanyVariant(domain: string, companyName: string): boolean {
    const slug = domain.split('.')[0].toLowerCase();
    const company = companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!company || company.length < 3) return false;
    // Exact match (company's own domain) or simple plurals
    if (slug === company || slug === company + 's' || slug === company + 'es') return true;
    // Slug is a compound word containing the company name (e.g. johnnienotions)
    if (slug.length > company.length + 2 && slug.includes(company)) return true;
    return false;
  }

  private async tryWikipedia(companyName: string): Promise<Omit<DynamicResult, 'source'>> {
    try {
      const [summary, related] = await Promise.all([
        this.fetchWithTimeout(`${this.WIKI_API}/page/summary/${encodeURIComponent(companyName)}`),
        this.fetchWithTimeout(`${this.WIKI_API}/page/related/${encodeURIComponent(companyName)}`),
      ]);

      const description: string = summary?.extract ?? null;
      const industry = description ? this.inferIndustry(description) : null;

      const relatedPages: Array<{ title: string; description?: string }> = related?.pages ?? [];
      const domains = relatedPages
        .map(p => this.titleToDomain(p.title))
        .filter((d): d is string => d !== null)
        .slice(0, 15);

      return { industry, domains, description: description?.slice(0, 400) ?? null };
    } catch {
      return { industry: null, domains: [], description: null };
    }
  }

  private async tryDuckDuckGo(query: string): Promise<Omit<DynamicResult, 'source'>> {
    try {
      const params = new URLSearchParams({
        q: query,
        format: 'json',
        no_html: '1',
        skip_disambig: '1',
        t: 'CompanyDiscoveryBot',
      });
      const data = await this.fetchWithTimeout(`${this.DDG_API}/?${params}`);
      if (!data) return { industry: null, domains: [], description: null };

      const description: string = data.AbstractText ?? data.Answer ?? null;
      const industry = description ? this.inferIndustry(description) : null;

      // Extract domains from RelatedTopics
      const topics: Array<{ Text?: string; FirstURL?: string; Topics?: any[] }> =
        data.RelatedTopics ?? [];

      const domains: string[] = [];
      for (const topic of topics) {
        // Nested topics (grouped results)
        if (topic.Topics) {
          for (const sub of topic.Topics) {
            const domain = this.ddgUrlToDomain(sub.FirstURL);
            if (domain) domains.push(domain);
          }
        } else {
          const domain = this.ddgUrlToDomain(topic.FirstURL);
          if (domain) domains.push(domain);
        }
        if (domains.length >= 15) break;
      }

      return { industry, domains, description: description?.slice(0, 400) ?? null };
    } catch {
      return { industry: null, domains: [], description: null };
    }
  }

  /**
   * Convert a DuckDuckGo FirstURL like "https://duckduckgo.com/Vimeo" to "vimeo.com"
   */
  private ddgUrlToDomain(firstUrl?: string): string | null {
    if (!firstUrl) return null;
    try {
      const path = new URL(firstUrl).pathname.replace(/^\//, '');
      return this.titleToDomain(decodeURIComponent(path));
    } catch {
      return null;
    }
  }

  /**
   * Convert a Wikipedia page title like "Vimeo" or "Twitch (service)" to a domain.
   */
  private titleToDomain(title: string): string | null {
    // Strip parenthetical qualifiers: "Twitch (service)" → "Twitch"
    const cleaned = title.replace(/\s*\([^)]+\)/g, '').trim().toLowerCase();

    // Skip obviously non-company titles
    if (cleaned.length < 2 || cleaned.length > 40) return null;
    if (/\d{4}|list of|comparison|history of|wikipedia/i.test(cleaned)) return null;

    const slug = cleaned.replace(/[^a-z0-9-]/g, '');
    if (!slug) return null;

    // Check known non-.com TLDs
    if (KNOWN_TLDS[slug]) return KNOWN_TLDS[slug];

    return `${slug}.com`;
  }

  private inferIndustry(text: string): string | null {
    for (const { pattern, industry } of DESCRIPTION_INDUSTRY_MAP) {
      if (pattern.test(text)) return industry;
    }
    return null;
  }

  private async fetchWithTimeout(url: string): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.TIMEOUT);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'CompanyDiscoveryBot/1.0 (research tool)' },
      });
      if (!res.ok) return null;
      return res.json();
    } finally {
      clearTimeout(timer);
    }
  }
}
