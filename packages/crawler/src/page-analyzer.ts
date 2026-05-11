import { Page } from 'playwright';
import { PageData, SchemaOrgData, SchemaOrgPerson } from './types';
import { TECH_SIGNATURES, SOCIAL_LINK_PATTERNS } from '@discovery/shared';

export class PageAnalyzer {
  async analyze(page: Page, html: string, url: string, duration: number, statusCode?: number): Promise<PageData> {
    const domain = this.extractDomain(url);

    const [title, metaData, headings, links, bodyText] = await Promise.all([
      page.title().catch(() => null),
      this.extractMeta(page),
      this.extractHeadings(page),
      this.extractLinks(page, domain),
      this.extractBodyText(page),
    ]);

    const emails = this.extractEmails(html + bodyText);
    const phones = this.extractPhones(html + bodyText);
    const technologies = this.detectTechnologies(html);
    const socialLinks = this.extractSocialLinks(links.all);
    const schemaOrg = this.extractSchemaOrg(html);

    // DOM-based people extraction — merge into schemaOrg.keyPeople, deduplicated
    const domPeople = await this.extractPeopleFromDOM(page);
    let finalSchemaOrg = schemaOrg;
    if (domPeople.length > 0) {
      const existing = schemaOrg?.keyPeople ?? [];
      const existingNames = new Set(existing.map(p => p.name.toLowerCase()));
      const merged = [...existing, ...domPeople.filter(p => !existingNames.has(p.name.toLowerCase()))].slice(0, 8);
      if (schemaOrg) {
        schemaOrg.keyPeople = merged;
      } else {
        finalSchemaOrg = { keyPeople: merged };
      }
    }

    return {
      url,
      domain,
      html,
      title,
      description: metaData.description,
      keywords: metaData.keywords,
      ogTitle: metaData.ogTitle,
      ogDescription: metaData.ogDescription,
      canonicalUrl: metaData.canonical,
      headings,
      links: links.all,
      internalLinks: links.internal,
      externalLinks: links.external,
      socialLinks,
      emails,
      phones,
      technologies,
      bodyText: bodyText.slice(0, 12000),
      schemaOrg: finalSchemaOrg,
      success: true,
      duration,
      statusCode,
    };
  }

  private async extractMeta(page: Page) {
    return page.evaluate(() => ({
      description: document.querySelector('meta[name="description"]')?.getAttribute('content') ??
                   document.querySelector('meta[property="og:description"]')?.getAttribute('content') ?? null,
      keywords: document.querySelector('meta[name="keywords"]')?.getAttribute('content') ?? null,
      ogTitle: document.querySelector('meta[property="og:title"]')?.getAttribute('content') ?? null,
      ogDescription: document.querySelector('meta[property="og:description"]')?.getAttribute('content') ?? null,
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
    })).catch(() => ({ description: null, keywords: null, ogTitle: null, ogDescription: null, canonical: null }));
  }

  private async extractHeadings(page: Page): Promise<Array<{ level: number; text: string }>> {
    return page.evaluate(() => {
      const headings: Array<{ level: number; text: string }> = [];
      document.querySelectorAll('h1, h2, h3').forEach(el => {
        const level = parseInt(el.tagName.charAt(1));
        const text = el.textContent?.trim() ?? '';
        if (text) headings.push({ level, text });
      });
      return headings;
    }).catch(() => []);
  }

  private async extractLinks(page: Page, domain: string): Promise<{ all: string[]; internal: string[]; external: string[] }> {
    const allLinks = await page.evaluate(() => {
      const links: string[] = [];
      document.querySelectorAll('a[href]').forEach(el => {
        const href = el.getAttribute('href');
        if (href && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
          links.push(href);
        }
      });
      return links;
    }).catch(() => []);

    const absoluteLinks = allLinks
      .map(link => {
        try {
          return new URL(link, `https://${domain}`).href;
        } catch {
          return null;
        }
      })
      .filter((l): l is string => l !== null)
      .slice(0, 100);

    const internal = absoluteLinks.filter(l => l.includes(domain));
    const external = absoluteLinks.filter(l => !l.includes(domain));

    return { all: absoluteLinks, internal, external };
  }

  private async extractBodyText(page: Page): Promise<string> {
    return page.evaluate(() => {
      const selectors = ['main', 'article', '.content', '#content', 'body'];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) return el.textContent?.trim() ?? '';
      }
      return document.body?.textContent?.trim() ?? '';
    }).catch(() => '');
  }

  private extractEmails(text: string): string[] {
    const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
    const matches = text.match(emailRegex) ?? [];
    return [...new Set(matches)].filter(e => !e.includes('example.com') && !e.includes('test.com')).slice(0, 5);
  }

  private extractPhones(text: string): string[] {
    const phoneRegex = /(\+?1?\s?)?(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})/g;
    const matches = text.match(phoneRegex) ?? [];
    return [...new Set(matches)].slice(0, 3);
  }

  private detectTechnologies(html: string): string[] {
    const detected: string[] = [];
    for (const [tech, signatures] of Object.entries(TECH_SIGNATURES)) {
      if (signatures.some(sig => html.toLowerCase().includes(sig.toLowerCase()))) {
        detected.push(tech);
      }
    }
    return detected;
  }

  private extractSocialLinks(links: string[]): Record<string, string> {
    const social: Record<string, string> = {};
    for (const link of links) {
      for (const [platform, pattern] of Object.entries(SOCIAL_LINK_PATTERNS)) {
        if (pattern.test(link) && !social[platform]) {
          social[platform] = link;
        }
      }
    }
    return social;
  }

  private extractSchemaOrg(html: string): SchemaOrgData | null {
    try {
      const matches = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
      if (!matches) return null;

      for (const block of matches) {
        const jsonText = block.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim();
        let parsed: any;
        try { parsed = JSON.parse(jsonText); } catch { continue; }

        // Handle @graph arrays (e.g. Yoast SEO output)
        const nodes: any[] = Array.isArray(parsed)
          ? parsed
          : parsed['@graph']
            ? parsed['@graph']
            : [parsed];

        for (const node of nodes) {
          const type: string = node['@type'] ?? '';
          const isOrg = /Organization|Corporation|LocalBusiness|Company/i.test(type);
          if (!isOrg) continue;

          const result: SchemaOrgData = {};
          if (node.name) result.name = String(node.name);
          if (node.description) result.description = String(node.description).slice(0, 400);
          if (node.foundingDate) result.foundingDate = String(node.foundingDate);
          if (node.address) {
            const addr = typeof node.address === 'string'
              ? node.address
              : [node.address.addressLocality, node.address.addressRegion, node.address.addressCountry]
                  .filter(Boolean).join(', ');
            result.address = addr;
          }
          if (Array.isArray(node.sameAs)) result.sameAs = node.sameAs.filter((s: any) => typeof s === 'string');
          if (node.numberOfEmployees) {
            result.numberOfEmployees = typeof node.numberOfEmployees === 'object'
              ? String(node.numberOfEmployees.value ?? node.numberOfEmployees.minValue ?? '')
              : String(node.numberOfEmployees);
          }

          // Extract key people from founder / employee / member fields
          const keyPeople: SchemaOrgPerson[] = [];
          const personSources: Array<{ nodes: any; role: string }> = [
            { nodes: node.founder, role: 'Founder' },
            { nodes: node.employee, role: 'Employee' },
            { nodes: node.member, role: 'Member' },
          ];
          for (const { nodes: pNodes, role } of personSources) {
            if (!pNodes) continue;
            const arr = Array.isArray(pNodes) ? pNodes : [pNodes];
            for (const p of arr) {
              if (!p || typeof p !== 'object') continue;
              const personType: string = p['@type'] ?? '';
              if (personType && !/Person/i.test(personType)) continue;
              const name = p.name ? String(p.name).trim() : null;
              if (!name || name.length < 3) continue;
              const jobTitle: string = p.jobTitle ? String(p.jobTitle) : role;
              const sameAsLinks: string[] = Array.isArray(p.sameAs) ? p.sameAs : (p.url ? [p.url] : []);
              const linkedin = sameAsLinks.find((u: string) => /linkedin\.com/i.test(u));
              const twitter = sameAsLinks.find((u: string) => /twitter\.com|x\.com/i.test(u));
              keyPeople.push({ name, role: jobTitle, ...(linkedin ? { linkedin } : {}), ...(twitter ? { twitter } : {}) });
            }
            if (keyPeople.length >= 6) break;
          }
          if (keyPeople.length) result.keyPeople = keyPeople;

          // hasOfferCatalog or knowsAbout as service hints
          const offerItems: string[] = [];
          if (node.hasOfferCatalog?.itemListElement) {
            for (const item of node.hasOfferCatalog.itemListElement) {
              if (item.name) offerItems.push(String(item.name));
            }
          }
          if (Array.isArray(node.knowsAbout)) {
            for (const k of node.knowsAbout) {
              offerItems.push(typeof k === 'string' ? k : String(k.name ?? ''));
            }
          }
          if (offerItems.length) result.services = offerItems.slice(0, 8);

          return result;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * DOM-based person extraction — runs inside the live Playwright browser context
   * so it has full access to the rendered DOM, not just raw text.
   * Handles team cards where name and role are in separate sibling/child elements.
   */
  private async extractPeopleFromDOM(page: Page): Promise<SchemaOrgPerson[]> {
    return page.evaluate(() => {
      const EXEC_ROLE = /CEO|CTO|CFO|COO|CMO|CPO|CRO|Founder|Co-Founder|President|Chairman|Director|VP|Vice President|Managing Director|Chief Executive|Chief Technology|Chief Operating|Chief Financial|Chief Marketing|Chief Product|Chief Revenue|Chief Commercial|Chief People|Head of/i;
      // Words that appear in service/industry terms but never in personal names
      const NOT_A_NAME = /\b(Rate|Optimization|Development|Marketing|Analytics|Management|Strategy|Integration|Technology|Services|Solutions|Platform|Software|Commerce|Intelligence|Automation|Operations|Infrastructure|Architecture|Engineering|Administration|Testing|Consulting|Research|Production|Distribution|Manufacturing|Acquisition|Implementation|Transformation)\b/;

      const seen = new Set<string>();
      const people: Array<{ name: string; role: string }> = [];

      const add = (name: string, role: string) => {
        name = name.trim().replace(/\s+/g, ' ');
        role = role.trim().replace(/\s+/g, ' ');
        if (name.length < 4 || name.length > 55) return;
        if (role.length < 3 || role.length > 80) return;
        // Must look like a real name: at least two words, starts uppercase
        if (!/^[A-Z][a-z]/.test(name)) return;
        if (name.split(' ').length < 2) return;
        // Reject service/industry terms that pass the above checks
        if (NOT_A_NAME.test(name)) return;
        if (seen.has(name.toLowerCase())) return;
        seen.add(name.toLowerCase());
        people.push({ name, role });
      };

      // Strategy 1: Team/person card containers — most reliable
      const CARD_SELECTORS = [
        '[class*="team-member"]', '[class*="team_member"]', '[class*="teamMember"]',
        '[class*="team-card"]',  '[class*="team_card"]',   '[class*="teamCard"]',
        '[class*="person-card"]','[class*="person_card"]', '[class*="personCard"]',
        '[class*="people-item"]','[class*="people_item"]',
        '[class*="member-card"]','[class*="member_item"]',
        '[class*="staff-card"]', '[class*="staff_item"]',
        '[class*="executive"]',  '[class*="leadership"]',
        '[class*="our-team"]',
        '[class*="bio-card"]',   '[class*="bio_card"]',
        '[itemtype*="Person"]',  '[typeof="Person"]',
      ].join(', ');

      document.querySelectorAll(CARD_SELECTORS).forEach(card => {
        // Name: prefer heading tags, then strong/b
        const nameEl = card.querySelector('h1,h2,h3,h4,h5,strong,b,[class*="name"],[class*="title"]:not([class*="job"]):not([class*="position"])');
        const name = nameEl?.textContent?.trim() ?? '';

        // Role: prefer elements with role/title/position class, or p/span after the name
        const roleEl =
          card.querySelector('[class*="role"],[class*="position"],[class*="job-title"],[class*="jobtitle"],[class*="designation"],[class*="title"][class*="job"],[class*="title"][class*="pos"]') ??
          nameEl?.nextElementSibling ??
          card.querySelector('p,span');
        const role = roleEl?.textContent?.trim() ?? '';

        if (name && role && EXEC_ROLE.test(role)) add(name, role);
      });

      // Strategy 2: Any h3/h4 followed by a sibling with an exec title
      if (people.length === 0) {
        document.querySelectorAll('h3, h4').forEach(h => {
          const name = h.textContent?.trim() ?? '';
          const next = h.nextElementSibling;
          const role = next?.textContent?.trim() ?? '';
          if (name && role && EXEC_ROLE.test(role)) add(name, role);
        });
      }

      // Strategy 3: <strong> name in a short parent element containing an exec title nearby
      if (people.length === 0) {
        document.querySelectorAll('p strong, p b, li strong, li b').forEach(strong => {
          const name = strong.textContent?.trim() ?? '';
          const parent = strong.parentElement;
          const fullText = parent?.textContent?.trim() ?? '';
          const restText = fullText.replace(name, '').trim();
          // Require short surrounding context — long paragraphs indicate marketing copy, not a bio line
          if (restText.length > 120) return;
          const roleMatch = restText.match(EXEC_ROLE);
          if (name && roleMatch) add(name, roleMatch[0]);
        });
      }

      // Strategy 4: figcaptions with "Name | Role" or "Name | Role | Company" (always runs)
      document.querySelectorAll('figcaption, [class*="caption"], [class*="credit"], [class*="byline"]').forEach(el => {
        const text = el.textContent?.trim() ?? '';
        const pipeMatch = text.match(/^([A-Z][a-zA-Z'-]+(?: [A-Z][a-zA-Z'-]+)+)\s*[|,]\s*([^|,\n]{3,60})/);
        if (!pipeMatch) return;
        const name = pipeMatch[1].trim();
        const roleFragment = pipeMatch[2].trim();
        if (EXEC_ROLE.test(roleFragment)) add(name, roleFragment.replace(/\s*[|].*$/, '').trim());
      });

      return people.slice(0, 8);
    }).catch(() => []);
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }
}
