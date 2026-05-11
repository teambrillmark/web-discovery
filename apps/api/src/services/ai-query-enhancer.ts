/**
 * Smart query enhancer — NO paid API required.
 *
 * Strategy:
 * 1. Extract the target company name from the query.
 * 2. Do a quick HTTP meta-fetch of their homepage (no Playwright — just a fetch()).
 * 3. Read their <meta name="description"> and <title>.
 * 4. Detect industry from that text using our own INDUSTRY_PATTERNS.
 * 5. Return the resolved industry so the orchestrator picks the right seed list.
 *
 * Optional (free): set GROQ_API_KEY in .env (free at console.groq.com — no credit card)
 * to get AI-generated competitor lists for even better results.
 */

const COMPANY_EXTRACT_PATTERNS = [
  /([a-zA-Z0-9_-]+)\s+(?:competitor|alternative|vs\b)/i,
  /(?:competitor|alternative)\s+(?:of|to)\s+([a-zA-Z0-9_-]+)/i,
  /(?:find|best|top|leading)\s+([a-zA-Z0-9_-]+)\s+(?:competitor|alternative)/i,
];

// Maps industry text patterns to internal keys — must match INDUSTRY_SEEDS keys in orchestrator
const INDUSTRY_TEXT_PATTERNS: Array<{ pattern: RegExp; industry: string }> = [
  { pattern: /\ba\/b\s*test|\bsplit\s*test|conversion\s*rate\s*optim|\bcro\b|experimentation.*agency/i, industry: 'cro_agency' },
  { pattern: /digital\s*market|seo\b|\bppc\b|\bsem\b|paid\s*ads|growth\s*hack/i, industry: 'digital_marketing' },
  { pattern: /video\s*shar|streaming\s*video|video\s*platform|video\s*host/i, industry: 'media' },
  { pattern: /social\s*network|social\s*media\s*platform/i, industry: 'social_media' },
  { pattern: /e-?commerce|online\s*retail|online\s*store|marketplace/i, industry: 'ecommerce_platform' },
  { pattern: /fintech|financial\s*tech|payment\s*platform|digital\s*bank/i, industry: 'finance' },
  { pattern: /artificial\s*intelligence|machine\s*learning|large\s*language\s*model/i, industry: 'ai' },
  { pattern: /cloud\s*computing|cloud\s*service|infrastructure\s*as\s*a\s*service/i, industry: 'cloud' },
  { pattern: /cybersecurity|information\s*security|endpoint\s*protect/i, industry: 'cybersecurity' },
  { pattern: /footwear|athletic\s*shoe|sportswear|apparel|clothing\s*brand/i, industry: 'apparel' },
  { pattern: /food\s*delivery|restaurant|meal\s*kit|catering/i, industry: 'food' },
  { pattern: /real\s*estate|proptech|property\s*tech/i, industry: 'real_estate' },
  { pattern: /travel|hotel|flight\s*search|booking\s*platform/i, industry: 'travel' },
  { pattern: /online\s*education|e-?learning|edtech|learning\s*platform/i, industry: 'edtech' },
  { pattern: /recruiting|talent\s*acquisition|staffing|hr\s*tech|workforce/i, industry: 'hr_tech' },
  { pattern: /saas|software\s*as\s*a\s*service/i, industry: 'software' },
  { pattern: /note.?taking|wiki|knowledge\s*base|personal\s*knowledge|docs.*tool/i, industry: 'notes_app' },
  { pattern: /project\s*management|task\s*management|work\s*management\s*tool/i, industry: 'project_management' },
  { pattern: /team\s*collaboration|workplace\s*communication|messaging.*platform|team\s*messaging/i, industry: 'collaboration' },
  { pattern: /all.in.one\s*workspace|productivity\s*(?:tool|app|suite)|workspace\s*app/i, industry: 'productivity' },
  { pattern: /design.*tool|design.*software|prototyping.*tool|ui.*design\s*tool/i, industry: 'design_tool' },
  { pattern: /developer\s*tool|devops\s*platform|code\s*editor|version\s*control/i, industry: 'devtools' },
];

export interface AIQueryInsight {
  company: string | null;
  industry: string | null;
  competitors: string[];
  confidence: number;
  source: 'meta-fetch' | 'groq' | 'none';
}

const EMPTY: AIQueryInsight = { company: null, industry: null, competitors: [], confidence: 0, source: 'none' };

export class AIQueryEnhancer {
  private groqKey: string | null;

  constructor(groqKey?: string) {
    this.groqKey = groqKey ?? null;
  }

  async enhance(
    query: string,
    profileContext?: { industry: string | null; businessModel: string; primaryServices: string[] },
  ): Promise<AIQueryInsight> {
    const companyName = this.extractCompanyName(query);
    if (!companyName) return EMPTY;

    // Known non-.com domains for popular software companies
    const KNOWN_DOMAINS: Record<string, string> = {
      notion: 'notion.so',
      linear: 'linear.app',
      figma: 'figma.com',
      slack: 'slack.com',
      zoom: 'zoom.us',
      miro: 'miro.com',
      airtable: 'airtable.com',
      clickup: 'clickup.com',
      discord: 'discord.com',
      dropbox: 'dropbox.com',
      asana: 'asana.com',
      monday: 'monday.com',
      jira: 'atlassian.com',
      trello: 'trello.com',
      vercel: 'vercel.com',
      netlify: 'netlify.com',
      supabase: 'supabase.com',
      webflow: 'webflow.com',
      framer: 'framer.com',
      loom: 'loom.com',
      retool: 'retool.com',
      amplitude: 'amplitude.com',
      mixpanel: 'mixpanel.com',
      segment: 'segment.com',
      intercom: 'intercom.com',
      zendesk: 'zendesk.com',
    };
    const normalizedName = companyName.toLowerCase().replace(/[^a-z0-9-]/g, '');
    const domain = KNOWN_DOMAINS[normalizedName] ?? `${normalizedName}.com`;

    // Strategy 1: Groq AI (free tier) — most accurate competitor list
    if (this.groqKey) {
      const groqResult = await this.tryGroq(query, companyName, domain, profileContext);
      if (groqResult.confidence >= 0.5) return groqResult;
    }

    // Strategy 2: Quick HTTP meta-fetch — reads target company's own description
    const metaResult = await this.tryMetaFetch(domain);
    if (metaResult.industry) {
      return { ...metaResult, company: domain, competitors: [], confidence: 0.7, source: 'meta-fetch' };
    }

    return EMPTY;
  }

  private extractCompanyName(query: string): string | null {
    for (const pattern of COMPANY_EXTRACT_PATTERNS) {
      const match = query.match(pattern);
      if (match?.[1]) return match[1];
    }
    return null;
  }

  private async tryMetaFetch(domain: string): Promise<{ industry: string | null }> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(`https://${domain}`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DiscoveryBot/1.0; +https://discovery.local)' },
      });
      clearTimeout(timer);
      if (!res.ok) return { industry: null };

      // Only read first 20KB — meta tags are always in the <head>
      const reader = res.body?.getReader();
      if (!reader) return { industry: null };
      let html = '';
      while (html.length < 20000) {
        const { done, value } = await reader.read();
        if (done) break;
        html += new TextDecoder().decode(value);
        if (html.includes('</head>')) break;
      }
      reader.cancel().catch(() => {});

      // Extract meta description and title
      const descMatch =
        html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{10,})/i) ??
        html.match(/<meta[^>]+content=["']([^"']{10,})[^>]+name=["']description["']/i) ??
        html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{10,})/i);
      const titleMatch = html.match(/<title[^>]*>([^<]{3,})<\/title>/i);

      const text = `${descMatch?.[1] ?? ''} ${titleMatch?.[1] ?? ''}`;
      const industry = this.detectIndustry(text);
      console.log(`[AIEnhancer] meta-fetch ${domain} → desc="${(descMatch?.[1] ?? '').slice(0, 80)}" → industry=${industry ?? 'none'}`);
      return { industry };
    } catch {
      return { industry: null };
    }
  }

  async tryGroq(
    query: string,
    companyName: string,
    domain: string,
    profileContext?: { industry: string | null; businessModel: string; primaryServices: string[] },
  ): Promise<AIQueryInsight> {
    try {
      // Build a richer context line when we already know the profile so Groq
      // returns the RIGHT TYPE of competitor (same business model, same niche).
      const contextLine = profileContext
        ? `${companyName} is a "${profileContext.businessModel}" in the "${profileContext.industry ?? 'unknown'}" space. Their main services: ${profileContext.primaryServices.slice(0, 3).join(', ')}.`
        : '';

      const body = {
        model: 'llama-3.1-8b-instant',
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: `Return ONLY a JSON object (no markdown) for this discovery query: "${query}"
${contextLine ? `\nContext: ${contextLine}` : ''}
Fields:
- "industry": one of [cro_agency, digital_marketing, ecommerce, ecommerce_platform, software, ai, finance, media, cybersecurity, hr_tech, real_estate, travel, apparel, food, productivity, project_management, collaboration, notes_app, design_tool, devtools, cloud] or null
- "competitors": array of up to 10 real competitor domains for ${companyName} — SAME BUSINESS MODEL and SAME SERVICE NICHE as ${companyName}. Return only companies that directly compete (not tools, not directory sites, not review sites).
- "confidence": float 0-1

IMPORTANT: Return competitors with the same business model. If ${companyName} is an agency, return other agencies. If it is a SaaS tool, return other tools. Do not mix types.
Example for "figma competitor": {"industry":"design_tool","competitors":["sketch.com","adobe.com","invisionapp.com","framer.com","zeplin.io","canva.com"],"confidence":0.9}
Example for "notion competitor": {"industry":"notes_app","competitors":["obsidian.md","roamresearch.com","evernote.com","confluence.atlassian.com","coda.io","craft.do"],"confidence":0.9}
Example for "brillmark competitor" (A/B test dev agency): {"industry":"cro_agency","competitors":["echologyx.com","teamcroco.com","conversionratestore.com","roboboogie.com","splitbase.com","invesp.com","speero.com","experimentzone.com"],"confidence":0.9}`
        }],
      };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${this.groqKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      clearTimeout(timer);
      if (!res.ok) return EMPTY;

      const data = await res.json();
      const text = data.choices?.[0]?.message?.content ?? '';
      const jsonMatch = text.match(/\{[\s\S]+\}/);
      if (!jsonMatch) return EMPTY;
      const parsed = JSON.parse(jsonMatch[0]);

      return {
        company: domain,
        industry: typeof parsed.industry === 'string' ? parsed.industry : null,
        competitors: Array.isArray(parsed.competitors)
          ? parsed.competitors.filter((d: unknown) => typeof d === 'string' && d.includes('.')).slice(0, 12)
          : [],
        confidence: typeof parsed.confidence === 'number' ? Math.min(1, Math.max(0, parsed.confidence)) : 0,
        source: 'groq',
      };
    } catch {
      return EMPTY;
    }
  }

  /**
   * Use Groq world knowledge to build a company profile — even when the website is
   * unreachable or the name is misspelled. Returns null when Groq doesn't recognize
   * the company.
   */
  async buildCompanyProfile(companyName: string): Promise<{
    correctName: string;
    correctDomain: string;
    industry: string | null;
    primaryServices: string[];
    secondaryServices: string[];
    businessModel: 'agency' | 'tool' | 'platform' | 'brand' | 'unknown';
    description: string;
  } | null> {
    if (!this.groqKey) return null;

    try {
      const body = {
        model: 'llama-3.1-8b-instant',
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: `You are a business research AI. The user typed: "${companyName}" — this may have typos or be a partial name.

Identify this company and return ONLY a JSON object (no markdown, no explanation):
{
  "correctName": "exact company name",
  "correctDomain": "their main website domain (e.g. brillmark.com)",
  "industry": "MUST be exactly one of these keys: cro_agency, digital_marketing, ecommerce, ecommerce_platform, software, ai, finance, media, cybersecurity, hr_tech, real_estate, travel, apparel, food, productivity, project_management, collaboration, notes_app, design_tool, devtools, cloud — or null if none fits",
  "primaryServices": ["service 1", "service 2", "service 3"],
  "secondaryServices": ["service A", "service B"],
  "businessModel": "agency OR tool OR platform OR brand OR unknown",
  "description": "one sentence — what this company does and who they serve"
}

CRITICAL RULES:
- industry: use EXACTLY the key listed above. For A/B testing / experimentation / CRO agencies use "cro_agency" (NOT "ab_testing" or "experimentation"). For HR software use "hr_tech". For note-taking apps use "notes_app".
- primaryServices: MUST be separate array items — do NOT put multiple services in one string. BAD: ["A/B testing, experimentation, CRO"]. GOOD: ["A/B Testing", "Conversion Rate Optimization", "Experimentation"].
- secondaryServices: same rule — one service per array item.
- Correct typos (e.g. "brillamrk" → "Brillmark", "ntion" → "Notion").
- Return null (not JSON) if you have no knowledge of this company.

Example for "brillmark": {"correctName":"Brillmark","correctDomain":"brillmark.com","industry":"cro_agency","primaryServices":["A/B Testing","Conversion Rate Optimization","Experimentation"],"secondaryServices":["Analytics Consulting","Landing Page Optimization"],"businessModel":"agency","description":"Brillmark is a CRO agency specializing in A/B testing and experimentation for e-commerce and SaaS companies."}
Example for "notion": {"correctName":"Notion","correctDomain":"notion.so","industry":"notes_app","primaryServices":["Note Taking","Wikis","Databases"],"secondaryServices":["Project Management","Task Tracking"],"businessModel":"tool","description":"Notion is an all-in-one workspace for notes, wikis, and project management."}`,
        }],
      };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Authorization': `Bearer ${this.groqKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      clearTimeout(timer);
      if (!res.ok) return null;

      const data = await res.json();
      const text = (data.choices?.[0]?.message?.content ?? '').trim();
      if (text === 'null' || !text.includes('{')) return null;

      const match = text.match(/\{[\s\S]+\}/);
      if (!match) return null;
      const parsed = JSON.parse(match[0]);

      return {
        correctName:       typeof parsed.correctName === 'string'    ? parsed.correctName    : companyName,
        correctDomain:     typeof parsed.correctDomain === 'string'  ? parsed.correctDomain  : `${companyName.toLowerCase()}.com`,
        industry:          typeof parsed.industry === 'string'       ? parsed.industry        : null,
        primaryServices:   Array.isArray(parsed.primaryServices)     ? parsed.primaryServices : [],
        secondaryServices: Array.isArray(parsed.secondaryServices)   ? parsed.secondaryServices : [],
        businessModel:     ['agency','tool','platform','brand'].includes(parsed.businessModel) ? parsed.businessModel : 'unknown',
        description:       typeof parsed.description === 'string'    ? parsed.description     : '',
      };
    } catch {
      return null;
    }
  }

  /**
   * Extract services a company ACTIVELY OFFERS from their page text.
   * Returns two lists:
   *   offeredServices  — things the company sells/provides (use for matching)
   *   mentionedServices — things mentioned as context, outcomes, or tools used (ignore for matching)
   *
   * This replaces the keyword-scan approach which produced false positives like Ahrefs
   * matching "Conversion Rate Optimization" because they mention CRO as a benefit.
   */
  async extractOfferedServices(
    companyName: string,
    pageText: string,
  ): Promise<{ offeredServices: string[]; mentionedServices: string[] }> {
    const FALLBACK = { offeredServices: [], mentionedServices: [] };
    if (!this.groqKey) return FALLBACK;

    try {
      const body = {
        model: 'llama-3.1-8b-instant',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `Read this excerpt from ${companyName}'s website and return ONLY a JSON object:

"${pageText.slice(0, 2000)}"

Return:
{
  "offeredServices": ["service 1", "service 2"],
  "mentionedServices": ["thing mentioned but not sold"]
}

Rules:
- offeredServices: things this company actively sells or delivers to clients (their service catalog)
- mentionedServices: industry terms, outcomes, or tools they reference but don't directly provide
- Each item must be a concise label (1-4 words), no duplicates
- Max 6 items per list
- If the company is a SaaS tool, offeredServices should reflect what the tool does (e.g. "A/B Testing Software"), not agency services
- Return empty arrays if unclear`,
        }],
      };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Authorization': `Bearer ${this.groqKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      clearTimeout(timer);
      if (!res.ok) return FALLBACK;

      const data = await res.json();
      const text = (data.choices?.[0]?.message?.content ?? '').trim();
      const match = text.match(/\{[\s\S]+\}/);
      if (!match) return FALLBACK;
      const parsed = JSON.parse(match[0]);

      return {
        offeredServices:  Array.isArray(parsed.offeredServices)  ? parsed.offeredServices.filter((s: unknown) => typeof s === 'string').slice(0, 6)  : [],
        mentionedServices: Array.isArray(parsed.mentionedServices) ? parsed.mentionedServices.filter((s: unknown) => typeof s === 'string').slice(0, 6) : [],
      };
    } catch {
      return FALLBACK;
    }
  }

  /**
   * Build structured profiles for a batch of crawled competitors in a single Groq call.
   * Returns a Map<domain, CandidateAIProfile> so the service matcher can compare
   * structured profiles instead of scanning raw body text with keyword heuristics.
   *
   * Processed in chunks of 10 to stay within token limits.
   */
  async profileCandidatesBatch(
    candidates: Array<{ domain: string; name: string; description: string; services: string[] }>,
    queryIndustry: string | null,
  ): Promise<Map<string, { domain: string; industry: string | null; primaryServices: string[]; businessModel: 'agency' | 'tool' | 'platform' | 'brand' | 'unknown' }>> {
    const profileMap = new Map<string, { domain: string; industry: string | null; primaryServices: string[]; businessModel: 'agency' | 'tool' | 'platform' | 'brand' | 'unknown' }>();
    if (!this.groqKey || candidates.length === 0) return profileMap;

    const CHUNK = 10;
    for (let i = 0; i < candidates.length; i += CHUNK) {
      const chunk = candidates.slice(i, i + CHUNK);
      try {
        const list = chunk.map(c =>
          `{"domain":"${c.domain}","name":"${c.name.slice(0, 50)}","desc":"${c.description.slice(0, 100)}","services":${JSON.stringify(c.services.slice(0, 5))}}`
        ).join('\n');

        const body = {
          model: 'llama-3.1-8b-instant',
          max_tokens: 700,
          messages: [{
            role: 'user',
            content: `Profile these companies in the context of the "${queryIndustry ?? 'unknown'}" industry.

Companies:
${list}

Return ONLY a JSON array (no markdown, no explanation):
[{"domain":"example.com","industry":"key or null","primaryServices":["service 1","service 2"],"businessModel":"agency|tool|platform|brand|unknown"}]

Industry keys: cro_agency, digital_marketing, ecommerce, ecommerce_platform, software, ai, finance, media, cybersecurity, hr_tech, real_estate, travel, apparel, food, productivity, project_management, collaboration, notes_app, design_tool, devtools, cloud

Rules:
- primaryServices: 2-4 concise labels of what this company actively sells or delivers
- businessModel: agency=human-led services, tool=self-serve SaaS, platform=marketplace, brand=consumer product
- Use only the exact industry keys listed above, or null`,
          }],
        };

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST', signal: controller.signal,
          headers: { 'Authorization': `Bearer ${this.groqKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        clearTimeout(timer);
        if (!res.ok) continue;

        const data = await res.json();
        const text = (data.choices?.[0]?.message?.content ?? '').trim();
        const match = text.match(/\[[\s\S]+\]/);
        if (!match) continue;

        const parsed: Array<{ domain: string; industry: string | null; primaryServices: string[]; businessModel: string }> = JSON.parse(match[0]);
        for (const p of parsed) {
          if (!p.domain) continue;
          profileMap.set(p.domain, {
            domain: p.domain,
            industry: typeof p.industry === 'string' ? p.industry : null,
            primaryServices: Array.isArray(p.primaryServices)
              ? p.primaryServices.filter((s: unknown) => typeof s === 'string').slice(0, 6)
              : [],
            businessModel: (['agency', 'tool', 'platform', 'brand'] as const).includes(p.businessModel as any)
              ? p.businessModel as 'agency' | 'tool' | 'platform' | 'brand'
              : 'unknown',
          });
        }
      } catch {}
    }

    return profileMap;
  }

  /**
   * Classify whether a crawled entity is a genuine competitor for the given query intent.
   * Used for borderline cases where rule-based signals are ambiguous.
   *
   * Returns: { type: 'agency'|'tool'|'platform'|'brand'|'unknown', isRelevant: boolean, reason: string }
   * Falls back gracefully (returns isRelevant=true) when Groq is unavailable.
   */
  async classifyEntityRelevance(
    entityName: string,
    entityDescription: string,
    queryIntent: string,
    industry: string | null,
  ): Promise<{ type: string; isRelevant: boolean; reason: string }> {
    const FALLBACK = { type: 'unknown', isRelevant: true, reason: 'classifier unavailable' };
    if (!this.groqKey) return FALLBACK;

    try {
      const body = {
        model: 'llama-3.1-8b-instant',
        max_tokens: 120,
        messages: [{
          role: 'user',
          content: `Classify this company for a "${queryIntent}" query in the "${industry ?? 'general'}" industry.
Company: "${entityName}"
Description: "${entityDescription.slice(0, 300)}"

Return ONLY JSON: {"type":"agency|tool|platform|brand|unknown","isRelevant":true|false,"reason":"one short sentence"}
- type="agency" → human-led service/consulting firm
- type="tool" → self-serve SaaS product (has pricing/free trial/dashboard)
- type="platform" → marketplace or two-sided platform
- type="brand" → consumer product brand
For intent "agency_search": tools and platforms are NOT relevant.`,
        }],
      };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Authorization': `Bearer ${this.groqKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      clearTimeout(timer);
      if (!res.ok) return FALLBACK;

      const data = await res.json();
      const text = data.choices?.[0]?.message?.content ?? '';
      const match = text.match(/\{[\s\S]+\}/);
      if (!match) return FALLBACK;
      const parsed = JSON.parse(match[0]);

      return {
        type: parsed.type ?? 'unknown',
        isRelevant: parsed.isRelevant !== false,
        reason: parsed.reason ?? '',
      };
    } catch {
      return FALLBACK;
    }
  }

  /**
   * Classify a set of filtered results into competitive tiers relative to the profile.
   * Returns a map of domain → tier so the orchestrator can tag each entity before saving.
   *
   * Tiers:
   *   direct  — same business model AND same core service niche (head-to-head competitors)
   *   partial — overlapping services but different model or broader/narrower scope
   *   broader — related industry but not a direct service competitor
   */
  async categorizeResults(
    profile: { name: string; industry: string | null; businessModel: string; primaryServices: string[] },
    results: Array<{ domain: string; name: string; description: string; matchScore: number; businessModel: string }>,
  ): Promise<Map<string, 'direct' | 'partial' | 'broader'>> {
    const tierMap = new Map<string, 'direct' | 'partial' | 'broader'>();
    if (!this.groqKey || results.length === 0) return tierMap;

    // Heuristic pre-fill so Groq only needs to confirm/adjust edge cases
    for (const r of results) {
      if (r.matchScore >= 0.6 && r.businessModel === profile.businessModel) {
        tierMap.set(r.domain, 'direct');
      } else if (r.matchScore >= 0.2) {
        tierMap.set(r.domain, 'partial');
      } else {
        tierMap.set(r.domain, 'broader');
      }
    }

    // Ask Groq to refine the tiers for the full batch in one call
    try {
      const resultList = results.map(r =>
        `{ "domain":"${r.domain}", "name":"${r.name}", "desc":"${r.description.slice(0, 80)}", "model":"${r.businessModel}", "match":${r.matchScore.toFixed(2)} }`
      ).join('\n');

      const body = {
        model: 'llama-3.1-8b-instant',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: `You are classifying competitors of "${profile.name}" (${profile.businessModel}, industry: ${profile.industry ?? 'unknown'}, primary services: ${profile.primaryServices.slice(0, 3).join(', ')}).

For each company below, assign a competitive tier:
- "direct": same business model AND same core service niche — head-to-head competitor
- "partial": overlapping services but different model, scope, or specialisation
- "broader": related space but not a direct service competitor

Companies to classify:
${resultList}

Return ONLY a JSON array: [{"domain":"example.com","tier":"direct"},...]
No explanation, no markdown.`,
        }],
      };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', signal: controller.signal,
        headers: { 'Authorization': `Bearer ${this.groqKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      clearTimeout(timer);

      if (res.ok) {
        const data = await res.json();
        const text = (data.choices?.[0]?.message?.content ?? '').trim();
        const match = text.match(/\[[\s\S]+\]/);
        if (match) {
          const parsed: Array<{ domain: string; tier: string }> = JSON.parse(match[0]);
          for (const item of parsed) {
            if (item.domain && ['direct', 'partial', 'broader'].includes(item.tier)) {
              tierMap.set(item.domain, item.tier as 'direct' | 'partial' | 'broader');
            }
          }
        }
      }
    } catch {}

    return tierMap;
  }

  /**
   * Generate a one-sentence competitive positioning snippet for an entity.
   * Explains WHY this company is relevant to the query — the qualitative context
   * that the PDF report identified as missing from our system.
   */
  async generatePositioning(
    entityName: string,
    entityDescription: string,
    queryText: string,
  ): Promise<string | null> {
    if (!this.groqKey) return null;

    try {
      const body = {
        model: 'llama-3.1-8b-instant',
        max_tokens: 80,
        messages: [{
          role: 'user',
          content: `In one sentence (max 25 words), explain why "${entityName}" is a competitor for: "${queryText}".
Use their description: "${entityDescription.slice(0, 200)}"
Return only the sentence, no quotes, no preamble.`,
        }],
      };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Authorization': `Bearer ${this.groqKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      clearTimeout(timer);
      if (!res.ok) return null;

      const data = await res.json();
      return data.choices?.[0]?.message?.content?.trim() ?? null;
    } catch {
      return null;
    }
  }

  private detectIndustry(text: string): string | null {
    for (const { pattern, industry } of INDUSTRY_TEXT_PATTERNS) {
      if (pattern.test(text)) return industry;
    }
    return null;
  }
}
