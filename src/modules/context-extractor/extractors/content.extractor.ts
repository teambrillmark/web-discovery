import * as cheerio from 'cheerio';
import type { ExtractedContent } from '../types';
import { cleanText, deduplicateLines } from '../utils/content.utils';

const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'svg', 'iframe', 'footer', 'head']);
const SKIP_CLASS_PATTERNS = [
  /cookie/i,
  /gdpr/i,
  /banner/i,
  /popup/i,
  /modal/i,
  /overlay/i,
  /legal/i,
  /privacy/i,
  /copyright/i,
];
const HERO_SELECTORS = [
  '[class*="hero"]',
  '[class*="banner"]',
  '[class*="jumbotron"]',
  '[id*="hero"]',
  'header',
  'main > section:first-child',
  'main > div:first-child',
];
const SERVICE_SELECTORS = [
  '[class*="service"]',
  '[class*="feature"]',
  '[class*="offering"]',
  '[class*="solution"]',
  '[id*="service"]',
  '[id*="feature"]',
];
const ABOUT_SELECTORS = [
  '[class*="about"]',
  '[id*="about"]',
  '[class*="mission"]',
  '[class*="story"]',
];
const MAX_SECTION_CHARS = 1200;
const MAX_BODY_CHARS = 2000;

export class ContentExtractor {
  extract(html: string, method: 'fetch' | 'playwright'): ExtractedContent {
    const $ = cheerio.load(html);

    // Remove noise nodes before extraction
    $('script, style, noscript, svg, iframe').remove();
    SKIP_CLASS_PATTERNS.forEach((pattern) => {
      $('[class]').each((_, el) => {
        const cls = $(el).attr('class') ?? '';
        if (pattern.test(cls)) $(el).remove();
      });
    });

    const title = cleanText($('title').text());
    const metaDescription = cleanText(
      $('meta[name="description"]').attr('content') ??
      $('meta[property="og:description"]').attr('content') ??
      '',
    );

    const headings: string[] = [];
    $('h1, h2, h3').each((_, el) => {
      const text = cleanText($(el).text());
      if (text.length > 2 && text.length < 200) headings.push(text);
    });

    const navLabels: string[] = [];
    $('nav a, nav li, header nav').each((_, el) => {
      const text = cleanText($(el).text());
      if (text.length > 1 && text.length < 60) navLabels.push(text);
    });

    const heroText = this.extractSection($, HERO_SELECTORS, MAX_SECTION_CHARS);
    const servicesText = this.extractSection($, SERVICE_SELECTORS, MAX_SECTION_CHARS);
    const aboutText = this.extractSection($, ABOUT_SELECTORS, MAX_SECTION_CHARS);

    const bodyText = this.extractBody($, MAX_BODY_CHARS);

    const totalChars =
      title.length +
      metaDescription.length +
      headings.join('').length +
      heroText.length +
      servicesText.length +
      aboutText.length +
      bodyText.length;

    return {
      title,
      metaDescription,
      headings: [...new Set(headings)],
      heroText,
      servicesText,
      aboutText,
      navLabels: [...new Set(navLabels)].slice(0, 20),
      bodyText,
      crawlMethod: method,
      totalChars,
    };
  }

  private extractSection(
    $: cheerio.CheerioAPI,
    selectors: string[],
    maxChars: number,
  ): string {
    for (const selector of selectors) {
      const el = $(selector).first();
      if (el.length) {
        const text = cleanText(el.text());
        if (text.length > 20) {
          return text.slice(0, maxChars);
        }
      }
    }
    return '';
  }

  private extractBody($: cheerio.CheerioAPI, maxChars: number): string {
    const candidates = ['main', 'article', '#content', '.content', 'body'];
    let containerSel = 'body';
    for (const sel of candidates) {
      if ($(sel).length) { containerSel = sel; break; }
    }
    const container = $(containerSel).first();

    // Remove already-extracted sections to avoid duplication
    container.find('header, footer, nav').remove();

    const raw = container.text().replace(/\s+/g, '\n');
    return deduplicateLines(raw).slice(0, maxChars);
  }
}
