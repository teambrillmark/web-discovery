import { QueryObject, DiscoveryIntent, EntityType } from '@discovery/shared';

// Domain regex - detects bare domains like "brillmark.com" or "https://example.com"
const DOMAIN_REGEX = /^(?:https?:\/\/)?(?:www\.)?([\w-]+\.[\w.-]+)(?:\/.*)?$/i;

const INTENT_PATTERNS: Array<{ pattern: RegExp; intent: DiscoveryIntent }> = [
  { pattern: /competitor|alternative|vs\s|versus|similar to/i, intent: 'competitor_analysis' },
  { pattern: /agency|agencies|firm|firms/i, intent: 'agency_search' },
  { pattern: /local|near me|\bin\s+[a-z]+|delhi|mumbai|new york|london|bangalore/i, intent: 'local_business_search' },
  { pattern: /\bproduct\b|\btool\b|\bsoftware\b|\bplatform\b|\bsaas\b/i, intent: 'product_discovery' },
  { pattern: /\bbrand\b|\bstore\b|\bshop\b|\becommerce\b/i, intent: 'brand_discovery' },
  { pattern: /\btechnology\b|using\s+\w+|powered by|built with/i, intent: 'technology_search' },
  { pattern: /best|top|leading|popular/i, intent: 'market_discovery' },
];

// Use word boundaries for short abbreviations to avoid false matches
// e.g. "llm" would match "brillmark" without \b
const INDUSTRY_PATTERNS: Array<{ pattern: RegExp; industry: string }> = [
  { pattern: /\bcro\b|conversion rate optimization|a\/b test|experimentation|conversion optimiz/i, industry: 'cro_agency' },
  // Platform queries (the software itself): "shopify alternatives", "best ecommerce platform"
  { pattern: /shopify\s+(?:alternative|competitor|vs|platform)|(?:best|top)\s+ecommerce\s+platform|bigcommerce|woocommerce|magento|opencart|prestashop/i, industry: 'ecommerce_platform' },
  // Brand/store queries: "top shopify stores", "best ecommerce brands", "D2C brands"
  { pattern: /shopify\s+store|(?:best|top|popular)\s+(?:online\s+)?(?:store|brand|shop|business)|d2c|dtc|direct.to.consumer|ecommerce\s+brand/i, industry: 'ecommerce' },
  // Generic ecommerce
  { pattern: /ecommerce|e-commerce|online store/i, industry: 'ecommerce_platform' },
  { pattern: /\bai\b(?!\w)|artificial intelligence|machine learning|\bml\b(?!\w)|\bllm\b(?!\w)|generative/i, industry: 'ai' },
  { pattern: /\bseo\b|digital marketing|\bppc\b|\bsem\b|paid ads|growth hacking/i, industry: 'digital_marketing' },
  { pattern: /\bsports\b|jersey|clothing|apparel|fashion|garment|uniform|shoe|shoes|sneaker|sneakers|footwear|boots|activewear|sportswear|jordan|nike|adidas/i, industry: 'apparel' },
  { pattern: /\btoy\b|\bgame\b(?! agency)|\bkids\b|\bchildren\b|\bentertainment\b/i, industry: 'toys' },
  { pattern: /\bsoftware\b(?! agency)|\bsaas\b|development agency|dev agency/i, industry: 'software' },
  { pattern: /food|restaurant|hospitality|catering|\bfnb\b/i, industry: 'food' },
  { pattern: /finance|fintech|banking|insurance|trading/i, industry: 'finance' },
  { pattern: /healthcare|health tech|medtech|pharma|telemedicine|clinic/i, industry: 'healthcare' },
  { pattern: /real estate|proptech|property|realty|mortgage/i, industry: 'real_estate' },
  { pattern: /travel|hospitality|hotel|booking|flight|tourism/i, industry: 'travel' },
  { pattern: /edtech|education|learning|e-learning|online course|tutoring/i, industry: 'edtech' },
  { pattern: /\bvideo\b|streaming|youtube|vimeo|twitch|podcast|media|entertainment|broadcast/i, industry: 'media' },
  { pattern: /social media|social network|facebook|instagram|tiktok|snapchat/i, industry: 'social_media' },
  { pattern: /cloud|hosting|infrastructure|vpc|devops|kubernetes|docker/i, industry: 'cloud' },
  { pattern: /cybersecurity|security|firewall|antivirus|endpoint|soc\b|siem/i, industry: 'cybersecurity' },
  { pattern: /recruiting|talent|staffing|hiring|hr tech|workforce/i, industry: 'hr_tech' },
];

const LOCATION_PATTERNS: RegExp[] = [
  /\bin\s+([\w\s]+?)(?:\s*,|\s*$)/i,
  /\bnear\s+([\w\s]+?)(?:\s*,|\s*$)/i,
];

const KEYWORD_STOP_WORDS = new Set([
  'find', 'best', 'top', 'good', 'great', 'list', 'of', 'the', 'a', 'an',
  'and', 'or', 'for', 'with', 'using', 'competitor', 'competitors', 'alternative',
  'alternatives', 'similar', 'like', 'versus', 'vs', 'leading', 'popular',
  'how', 'what', 'where', 'who', 'show', 'me', 'give', 'store', 'stores',
  'brand', 'brands', 'company', 'companies', 'agency', 'agencies',
]);

export class QueryAnalyzer {
  analyze(rawQuery: string): QueryObject {
    let trimmed = rawQuery.trim();

    // Normalize URL-prefixed queries: "https://www.brillmark.com/ competitor" → "brillmark.com competitor"
    if (/^https?:\/\//i.test(trimmed)) {
      try {
        const urlPart = trimmed.split(/\s+/)[0];
        const parsed = new URL(urlPart);
        const domain = parsed.hostname.replace(/^www\./i, '');
        const rest = trimmed.slice(urlPart.length).trim();
        trimmed = rest ? `${domain} ${rest}` : domain;
      } catch { /* leave trimmed as-is */ }
    }

    const isDomain = this.isDomainQuery(trimmed);

    // For bare domain queries, treat as competitor analysis
    const intent = isDomain ? 'competitor_analysis' : this.detectIntent(trimmed);
    const industry = this.detectIndustry(trimmed);
    const location = this.detectLocation(trimmed);
    const entityType = this.detectEntityType(trimmed, intent);
    const keywords = this.extractKeywords(trimmed, isDomain);
    const objective = this.buildObjective(trimmed, intent, industry, isDomain);

    return {
      raw: trimmed,
      intent,
      industry,
      location,
      entityType,
      keywords,
      objective,
    };
  }

  /** Returns true if query is just a domain like "brillmark.com" */
  isDomainQuery(query: string): boolean {
    const cleaned = query.trim().toLowerCase();
    return DOMAIN_REGEX.test(cleaned) && !cleaned.includes(' ');
  }

  /** Extract clean domain from a domain query */
  extractDomainFromQuery(query: string): string | null {
    const match = query.trim().match(DOMAIN_REGEX);
    if (!match) return null;
    return match[1].toLowerCase().replace(/^www\./, '');
  }

  private detectIntent(query: string): DiscoveryIntent {
    for (const { pattern, intent } of INTENT_PATTERNS) {
      if (pattern.test(query)) return intent;
    }
    return 'general_search';
  }

  /** Public: detect industry from any arbitrary text (description, meta, body) */
  detectIndustryFromText(text: string): string | null {
    for (const { pattern, industry } of INDUSTRY_PATTERNS) {
      if (pattern.test(text)) return industry;
    }
    return null;
  }

  private detectIndustry(query: string): string | null {
    return this.detectIndustryFromText(query);
  }

  private detectLocation(query: string): string | null {
    for (const pattern of LOCATION_PATTERNS) {
      const match = query.match(pattern);
      if (match?.[1]) {
        const loc = match[1].trim();
        // Filter out intent noise like "in Delhi" vs "in 2024"
        if (loc.length > 2 && !/^\d+$/.test(loc)) return loc;
      }
    }

    const cityMatch = query.match(
      /\b(Delhi|Mumbai|Bangalore|Chennai|Hyderabad|Pune|London|New York|Los Angeles|Chicago|San Francisco|Toronto|Sydney|Singapore)\b/i
    );
    return cityMatch?.[1] ?? null;
  }

  private detectEntityType(query: string, intent: DiscoveryIntent): EntityType {
    if (intent === 'local_business_search') return 'local_business';
    if (intent === 'product_discovery') return 'product';
    if (/\bperson\b|\bfounder\b|\bceo\b|\bcto\b|\bpeople\b/i.test(query)) return 'person';
    return 'company';
  }

  private extractKeywords(query: string, isDomain: boolean): string[] {
    if (isDomain) {
      // For bare domain queries, use the domain name parts as keywords
      const domain = this.extractDomainFromQuery(query) ?? query;
      const parts = domain.split('.')[0].split(/[-_]/).filter(p => p.length > 2);
      return parts.length > 0 ? parts : [domain];
    }

    const words = query.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !KEYWORD_STOP_WORDS.has(w));
    return [...new Set(words)].slice(0, 10);
  }

  private buildObjective(query: string, intent: DiscoveryIntent, industry: string | null, isDomain: boolean): string {
    const industryStr = industry ? ` in ${industry.replace(/_/g, ' ')}` : '';
    if (isDomain) {
      return `Discover direct competitors of ${query} and analyze the competitive landscape`;
    }
    switch (intent) {
      case 'competitor_analysis': return `Discover direct competitors${industryStr} for: ${query}`;
      case 'market_discovery': return `Map the market landscape${industryStr} for: ${query}`;
      case 'local_business_search': return `Find local businesses matching: ${query}`;
      case 'agency_search': return `Identify agencies${industryStr} matching: ${query}`;
      case 'product_discovery': return `Discover products/tools matching: ${query}`;
      case 'brand_discovery': return `Find brands/companies matching: ${query}`;
      default: return `General discovery for: ${query}`;
    }
  }

  generateSearchQueries(queryObj: QueryObject): string[] {
    const queries: string[] = [];
    const isDomain = this.isDomainQuery(queryObj.raw);

    if (isDomain) {
      const domain = this.extractDomainFromQuery(queryObj.raw) ?? queryObj.raw;
      const companyName = domain.split('.')[0];
      queries.push(`"${companyName}" competitors`);
      queries.push(`alternatives to ${domain}`);
      queries.push(`sites like ${domain}`);
      queries.push(`companies similar to ${companyName}`);
      if (queryObj.industry) {
        queries.push(`best ${queryObj.industry.replace(/_/g, ' ')} companies`);
        queries.push(`top ${queryObj.industry.replace(/_/g, ' ')} agencies 2024`);
      } else {
        queries.push(`${companyName} competitors ${new Date().getFullYear()}`);
      }
      return [...new Set(queries)].slice(0, 6);
    }

    // Regular text queries
    queries.push(queryObj.raw);

    if (queryObj.intent === 'competitor_analysis') {
      const domainMatch = queryObj.raw.match(/(?:of|for)\s+([\w.-]+\.[\w]{2,})/i);
      if (domainMatch) {
        const domain = domainMatch[1];
        const company = domain.split('.')[0];
        queries.push(`competitors of ${domain}`);
        queries.push(`alternatives to ${domain}`);
        queries.push(`"${company}" competitors`);
      }
    }

    if (queryObj.industry) {
      queries.push(`best ${queryObj.industry.replace(/_/g, ' ')} companies`);
      queries.push(`top ${queryObj.industry.replace(/_/g, ' ')} agencies`);
    }

    if (queryObj.location) {
      const kw = queryObj.keywords.slice(0, 3).join(' ');
      queries.push(`${kw} in ${queryObj.location}`);
    }

    if (queryObj.keywords.length > 0) {
      queries.push(`${queryObj.keywords.slice(0, 3).join(' ')} companies`);
    }

    return [...new Set(queries)].slice(0, 6);
  }
}
