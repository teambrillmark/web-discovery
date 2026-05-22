import { describe, it, expect } from 'vitest';
import { ContentExtractor } from '../extractors/content.extractor';

const extractor = new ContentExtractor();

const SAMPLE_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>BrillMark - CRO Agency for Shopify</title>
  <meta name="description" content="We help Shopify brands improve conversion rates." />
</head>
<body>
  <nav><a href="/">Home</a><a href="/services">Services</a><a href="/about">About</a></nav>
  <header>
    <div class="hero"><h1>Boost Your Shopify Conversions</h1><p>Expert CRO for eCommerce brands.</p></div>
  </header>
  <main>
    <section class="services">
      <h2>Our Services</h2>
      <p>Conversion Rate Optimization</p>
      <p>A/B Testing</p>
      <p>Shopify Development</p>
    </section>
    <section class="about">
      <h2>About Us</h2>
      <p>BrillMark is a data-driven CRO agency.</p>
    </section>
    <p>We work with eCommerce brands to maximize revenue per visitor.</p>
  </main>
  <footer><p>Copyright 2024. Privacy Policy. Cookie Policy.</p></footer>
  <script>console.log("should be stripped")</script>
</body>
</html>
`;

describe('ContentExtractor', () => {
  it('extracts title and meta description', () => {
    const result = extractor.extract(SAMPLE_HTML, 'fetch');
    expect(result.title).toBe('BrillMark - CRO Agency for Shopify');
    expect(result.metaDescription).toBe('We help Shopify brands improve conversion rates.');
  });

  it('extracts headings', () => {
    const result = extractor.extract(SAMPLE_HTML, 'fetch');
    expect(result.headings).toContain('Boost Your Shopify Conversions');
    expect(result.headings).toContain('Our Services');
    expect(result.headings).toContain('About Us');
  });

  it('extracts nav labels', () => {
    const result = extractor.extract(SAMPLE_HTML, 'fetch');
    expect(result.navLabels).toContain('Home');
    expect(result.navLabels).toContain('Services');
  });

  it('extracts hero text', () => {
    const result = extractor.extract(SAMPLE_HTML, 'fetch');
    expect(result.heroText).toContain('Shopify');
  });

  it('extracts services text', () => {
    const result = extractor.extract(SAMPLE_HTML, 'fetch');
    expect(result.servicesText).toContain('Conversion Rate Optimization');
  });

  it('extracts about text', () => {
    const result = extractor.extract(SAMPLE_HTML, 'fetch');
    expect(result.aboutText).toContain('BrillMark');
  });

  it('strips script tags from body text', () => {
    const result = extractor.extract(SAMPLE_HTML, 'fetch');
    expect(result.bodyText).not.toContain('should be stripped');
    expect(result.bodyText).not.toContain('console.log');
  });

  it('strips footer content from body text', () => {
    const result = extractor.extract(SAMPLE_HTML, 'fetch');
    expect(result.bodyText).not.toContain('Cookie Policy');
    expect(result.bodyText).not.toContain('Copyright');
  });

  it('tracks crawl method', () => {
    const fetch = extractor.extract(SAMPLE_HTML, 'fetch');
    expect(fetch.crawlMethod).toBe('fetch');
    const playwright = extractor.extract(SAMPLE_HTML, 'playwright');
    expect(playwright.crawlMethod).toBe('playwright');
  });

  it('returns non-zero totalChars for content-rich HTML', () => {
    const result = extractor.extract(SAMPLE_HTML, 'fetch');
    expect(result.totalChars).toBeGreaterThan(50);
  });

  it('handles empty HTML gracefully', () => {
    const result = extractor.extract('<html><body></body></html>', 'fetch');
    expect(result.title).toBe('');
    expect(result.headings).toHaveLength(0);
    expect(result.totalChars).toBe(0);
  });

  it('deduplicates headings', () => {
    const html = `<html><body><h1>Same Title</h1><h1>Same Title</h1></body></html>`;
    const result = extractor.extract(html, 'fetch');
    const count = result.headings.filter((h) => h === 'Same Title').length;
    expect(count).toBe(1);
  });
});
