import { CompanyEntity, LocalBusinessEntity, ProductEntity, PersonInfo } from '@discovery/shared';

interface SchemaOrgPerson {
  name: string;
  role: string;
  linkedin?: string;
  twitter?: string;
}

interface SchemaOrgData {
  name?: string;
  description?: string;
  industry?: string;
  services?: string[];
  foundingDate?: string;
  numberOfEmployees?: string;
  sameAs?: string[];
  address?: string;
  keyPeople?: SchemaOrgPerson[];
}

interface RawPageData {
  url: string;
  domain: string;
  title: string | null;
  description: string | null;
  keywords: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  headings: Array<{ level: number; text: string }>;
  bodyText: string;
  socialLinks: Record<string, string>;
  emails: string[];
  phones: string[];
  technologies: string[];
  html: string;
  schemaOrg?: SchemaOrgData | null;
}

export class EntityExtractor {
  extractCompany(page: RawPageData): CompanyEntity {
    const schema = page.schemaOrg ?? null;

    // Prefer Schema.org structured data over heuristic extraction
    const name = schema?.name ?? this.extractCompanyName(page);
    const description = schema?.description ?? this.extractDescription(page);
    const founders = this.extractKeyPeople(page);
    const locations = schema?.address
      ? [schema.address]
      : this.extractLocations(page);

    // Services: Schema.org first, then keyword scan as fallback
    const schemaServices = schema?.services ?? [];
    const scannedServices = schemaServices.length === 0 ? this.extractServices(page) : [];
    const services = [...new Set([...schemaServices, ...scannedServices])].slice(0, 8);

    // Social links: merge Schema.org sameAs URLs with crawled links
    const sameAsLinkedin = schema?.sameAs?.find(u => /linkedin\.com/i.test(u)) ?? null;
    const sameAsTwitter = schema?.sameAs?.find(u => /twitter\.com|x\.com/i.test(u)) ?? null;

    return {
      name,
      domain: page.domain,
      description,
      services,
      founders,
      linkedin: sameAsLinkedin ?? page.socialLinks.linkedin ?? null,
      twitter: sameAsTwitter ?? page.socialLinks.twitter ?? null,
      technologies: page.technologies,
      locations,
      emails: page.emails,
      phones: page.phones,
      category: null,
      confidenceScore: 0,
      relevanceScore: 0,
      source: page.url,
      metaTitle: page.title,
      metaDescription: page.description,
    };
  }

  extractLocalBusiness(page: RawPageData): LocalBusinessEntity {
    const name = this.extractCompanyName(page);
    const location = this.extractLocations(page)[0] ?? 'Unknown';
    const services = this.extractServices(page);
    const rating = this.extractRating(page.bodyText);

    return {
      name,
      domain: page.domain,
      location,
      services,
      rating,
      phone: page.phones[0] ?? null,
      website: page.url,
      confidenceScore: 0,
    };
  }

  extractProduct(page: RawPageData): ProductEntity {
    const name = this.extractCompanyName(page);
    const pricing = this.extractPricing(page.bodyText);
    const category = this.inferCategory(page.bodyText, page.title ?? '');

    return {
      name,
      domain: page.domain,
      category,
      brand: this.extractBrand(page),
      pricing,
      source: page.url,
      description: this.extractDescription(page),
      confidenceScore: 0,
    };
  }

  private extractCompanyName(page: RawPageData): string {
    const looksLikeTagline = (s: string) => {
      // Taglines tend to be long, multi-word, and start with verbs/prepositions
      const TAGLINE_STARTERS = /^(from|helping|building|making|the place|grow|unlock|discover|transform|turning|powering|your|we |how |why |what )/i;
      const words = s.trim().split(/\s+/);
      return words.length >= 6 || TAGLINE_STARTERS.test(s.trim());
    };

    // OG title — strip trailing separator sections and reject taglines
    if (page.ogTitle) {
      const cleaned = page.ogTitle.replace(/\s*[-|–]\s*.+$/, '').trim();
      if (cleaned.length > 1 && !looksLikeTagline(cleaned)) return cleaned;
    }

    // H1 — usually the page's primary heading; short H1s are reliable company names
    const h1 = page.headings.find(h => h.level === 1);
    if (h1?.text && h1.text.length < 50 && !looksLikeTagline(h1.text)) return h1.text;

    // Meta title — strip trailing separator sections
    if (page.title) {
      const cleaned = page.title.replace(/\s*[-|–]\s*.+$/, '').trim();
      if (cleaned.length > 1 && !looksLikeTagline(cleaned)) return cleaned;
    }

    // If OG/H1/title all look like taglines, try to find a short H2 before falling back
    const h2 = page.headings.find(h => h.level === 2 && h.text.length < 40 && !looksLikeTagline(h.text));
    if (h2?.text) return h2.text;

    // Capitalize domain slug as final fallback
    return page.domain.split('.')[0].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  private extractDescription(page: RawPageData): string | null {
    const desc = page.description ?? page.ogDescription;
    if (desc && desc.length > 20) return desc;

    // Try first meaningful paragraph from body
    const sentences = page.bodyText.split(/[.!?]+/).filter(s => s.trim().length > 50);
    return sentences[0]?.trim() ?? null;
  }

  private extractServices(page: RawPageData): string[] {
    const services: string[] = [];
    const serviceKeywords = [
      // CRO & Marketing
      'A/B Testing', 'CRO', 'Conversion Rate Optimization', 'UX Design', 'UX Research',
      'SEO', 'SEM', 'PPC', 'Social Media', 'Email Marketing', 'Content Marketing',
      'Performance Marketing', 'Growth Marketing', 'Affiliate Marketing',
      // Dev & Tech
      'Web Development', 'Mobile Development', 'App Development', 'API Development',
      'Cloud Services', 'DevOps', 'Cybersecurity', 'Data Engineering',
      // Data & AI
      'Data Analytics', 'Business Intelligence', 'Machine Learning', 'AI',
      'Automation', 'Integration', 'Data Science', 'Computer Vision',
      // Ecommerce
      'E-commerce', 'Shopify', 'WooCommerce', 'Magento', 'Marketplace',
      // General business
      'Consulting', 'Strategy', 'Branding', 'Design', 'Logistics',
      'Manufacturing', 'Distribution', 'Wholesale', 'Retail',
      'Streaming', 'Video', 'Podcast', 'Media', 'Publishing',
      'Insurance', 'Lending', 'Payments', 'Banking', 'Investing',
      'Recruitment', 'HR', 'Payroll', 'Training', 'Certification',
      'Healthcare', 'Telemedicine', 'Pharmacy', 'Fitness', 'Wellness',
      'Real Estate', 'Property Management', 'Mortgage',
      'Travel', 'Hotels', 'Flights', 'Tours',
    ];

    const text = `${page.bodyText} ${page.headings.map(h => h.text).join(' ')}`.toLowerCase();

    for (const service of serviceKeywords) {
      if (text.includes(service.toLowerCase())) {
        services.push(service);
      }
    }

    return [...new Set(services)].slice(0, 8);
  }

  private extractKeyPeople(page: RawPageData): PersonInfo[] {
    // 1. Schema.org structured data — highest fidelity
    if (page.schemaOrg?.keyPeople?.length) {
      return page.schemaOrg.keyPeople.slice(0, 6);
    }

    // 2. Text pattern extraction — scan body for exec titles near capitalized names
    const EXEC_TITLES = [
      'CEO', 'Chief Executive Officer',
      'CTO', 'Chief Technology Officer',
      'CFO', 'Chief Financial Officer',
      'CMO', 'Chief Marketing Officer',
      'COO', 'Chief Operating Officer',
      'CRO', 'Chief Revenue Officer',
      'CPO', 'Chief Product Officer',
      'Founder', 'Co-Founder', 'Co-founder',
      'President', 'Chairman', 'Managing Director', 'MD',
      'VP', 'Vice President',
    ];

    // Normalise title → short label
    const SHORT: Record<string, string> = {
      'Chief Executive Officer': 'CEO',
      'Chief Technology Officer': 'CTO',
      'Chief Financial Officer': 'CFO',
      'Chief Marketing Officer': 'CMO',
      'Chief Operating Officer': 'COO',
      'Chief Revenue Officer': 'CRO',
      'Chief Product Officer': 'CPO',
      'Managing Director': 'MD',
      'Vice President': 'VP',
    };

    const titlesRegex = EXEC_TITLES.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const patterns = [
      // "CEO: John Smith" or "CEO – John Smith"
      new RegExp(`(${titlesRegex})\\s*[:\\-–]\\s*([A-Z][a-z]+(?: [A-Z][a-z]+)+)`, 'g'),
      // "John Smith, CEO" or "John Smith (CEO)"
      new RegExp(`([A-Z][a-z]+(?: [A-Z][a-z]+)+)[,\\s]+(?:\\(|)(${titlesRegex})(?:\\)|)`, 'g'),
      // "John Smith is the CEO"
      new RegExp(`([A-Z][a-z]+(?: [A-Z][a-z]+)+)\\s+is\\s+(?:the\\s+)?(${titlesRegex})`, 'gi'),
    ];

    const seen = new Set<string>();
    const people: PersonInfo[] = [];
    const text = page.bodyText;

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null && people.length < 6) {
        // Pattern 1 captures (role, name); patterns 2-3 capture (name, role)
        let name: string;
        let role: string;
        if (pattern.source.startsWith(`(${titlesRegex.slice(0, 10)}`)) {
          role = match[1];
          name = match[2];
        } else {
          name = match[1];
          role = match[2];
        }
        name = name?.trim();
        role = role?.trim();
        if (!name || !role || name.length < 4 || name.split(' ').length < 2) continue;
        // Reject service/industry terms that pass the basic name checks
        if (/\b(Rate|Optimization|Development|Marketing|Analytics|Management|Strategy|Integration|Technology|Services|Solutions|Platform|Software|Commerce|Intelligence|Automation|Operations|Engineering|Administration|Testing|Consulting|Research)\b/.test(name)) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        people.push({ name, role: SHORT[role] ?? role });
      }
    }

    return people;
  }

  private extractLocations(page: RawPageData): string[] {
    const locationPatterns = [
      /(?:located|based|headquartered)\s+(?:in|at)\s+([A-Z][a-z]+(?:\s*,\s*[A-Z][a-z]+)?)/g,
      /([A-Z][a-z]+(?:,\s*[A-Z]{2})?)\s+(?:office|headquarters|HQ)/g,
    ];

    const locations: string[] = [];
    for (const pattern of locationPatterns) {
      let match;
      while ((match = pattern.exec(page.bodyText)) !== null) {
        if (match[1]) locations.push(match[1]);
      }
    }

    return [...new Set(locations)].slice(0, 3);
  }

  private extractRating(text: string): number | null {
    const ratingMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:\/\s*5|stars?|rating)/i);
    if (ratingMatch) {
      const rating = parseFloat(ratingMatch[1]);
      return rating <= 5 ? rating : null;
    }
    return null;
  }

  private extractPricing(text: string): string | null {
    const pricingPatterns = [
      /\$(\d+(?:\.\d+)?)\s*(?:\/\s*(?:month|mo|year|yr))?/i,
      /(free|freemium|open source)/i,
      /starting\s+(?:at|from)\s+\$(\d+)/i,
    ];

    for (const pattern of pricingPatterns) {
      const match = text.match(pattern);
      if (match) return match[0];
    }
    return null;
  }

  private inferCategory(text: string, title: string): string {
    const combined = `${text} ${title}`.toLowerCase();
    if (combined.includes('cro') || combined.includes('conversion')) return 'CRO Tool';
    if (combined.includes('analytics')) return 'Analytics';
    if (combined.includes('email')) return 'Email Marketing';
    if (combined.includes('social')) return 'Social Media';
    if (combined.includes('ecommerce') || combined.includes('shopify')) return 'Ecommerce';
    return 'Software';
  }

  private extractBrand(page: RawPageData): string {
    return page.domain.split('.')[0].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
}
