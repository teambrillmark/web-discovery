"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SearchEngine = void 0;
const playwright_1 = require("playwright");
class SearchEngine {
    constructor() {
        this.browser = null;
        this.context = null;
    }
    async init() {
        this.browser = await playwright_1.chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
        });
        this.context = await this.browser.newContext({
            // Use a realistic macOS Chrome UA
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 800 },
            locale: 'en-US',
            extraHTTPHeaders: {
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
        });
    }
    async search(options) {
        if (!this.context)
            await this.init();
        const { query, maxResults = 10 } = options;
        // Try DuckDuckGo HTML first (no JS required, bot-friendly)
        try {
            const results = await this.searchDuckDuckGoHTML(query, maxResults);
            if (results.length > 0) {
                console.log(`[SearchEngine] DuckDuckGo: "${query}" → ${results.length} results`);
                return results;
            }
        }
        catch (e) {
            console.warn(`[SearchEngine] DuckDuckGo failed:`, e.message);
        }
        // Fallback: Bing
        try {
            const results = await this.searchBing(query, maxResults);
            if (results.length > 0) {
                console.log(`[SearchEngine] Bing fallback: "${query}" → ${results.length} results`);
                return results;
            }
        }
        catch (e) {
            console.warn(`[SearchEngine] Bing failed:`, e.message);
        }
        console.warn(`[SearchEngine] All engines returned 0 results for: "${query}"`);
        return [];
    }
    /**
     * DuckDuckGo HTML (https://html.duckduckgo.com/html/) — no JS, more bot-tolerant.
     * Links use redirect format: //duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com&...
     * We decode the 'uddg' parameter to get the real URL.
     */
    async searchDuckDuckGoHTML(query, maxResults) {
        const page = await this.context.newPage();
        try {
            const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=us-en`;
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
            // Small delay for full render
            await page.waitForTimeout(1500);
            const rawResults = await page.evaluate(() => {
                const items = [];
                // Each result is .result or .web-result
                const selectors = ['.result', '.web-result', '[data-testid="result"]'];
                let elements = null;
                for (const sel of selectors) {
                    const found = document.querySelectorAll(sel);
                    if (found.length > 0) {
                        elements = found;
                        break;
                    }
                }
                if (!elements)
                    return items;
                elements.forEach(el => {
                    const linkEl = el.querySelector('a.result__a, a[data-testid="result-title-a"], h2 a');
                    const snippetEl = el.querySelector('.result__snippet, [data-testid="result-snippet"], .snippet');
                    const href = linkEl?.getAttribute('href') ?? '';
                    const title = linkEl?.textContent?.trim() ?? '';
                    const snippet = snippetEl?.textContent?.trim() ?? '';
                    if (href && title && !title.toLowerCase().includes('advertisement')) {
                        items.push({ href, title, snippet });
                    }
                });
                return items;
            });
            await page.close();
            const results = [];
            for (const r of rawResults) {
                if (results.length >= maxResults)
                    break;
                const realUrl = this.decodeDuckDuckGoUrl(r.href);
                if (realUrl) {
                    results.push({
                        url: realUrl,
                        title: r.title,
                        snippet: r.snippet,
                        domain: this.extractDomain(realUrl),
                        rank: results.length + 1,
                    });
                }
            }
            return results;
        }
        catch (error) {
            await page.close().catch(() => { });
            throw error;
        }
    }
    /**
     * Decode DuckDuckGo redirect URLs.
     * Formats seen: //duckduckgo.com/l/?uddg=https%3A%2F%2F...
     *               https://duckduckgo.com/l/?uddg=https%3A...
     *               Direct https:// URLs (sometimes returned)
     */
    decodeDuckDuckGoUrl(href) {
        if (!href)
            return null;
        // Already a direct URL
        if (href.startsWith('http') && !href.includes('duckduckgo.com/l/')) {
            return href;
        }
        // DuckDuckGo redirect: extract uddg parameter
        try {
            const fullUrl = href.startsWith('//') ? `https:${href}` : href;
            const url = new URL(fullUrl);
            const uddg = url.searchParams.get('uddg');
            if (uddg)
                return decodeURIComponent(uddg);
        }
        catch { }
        // Fallback: try regex extraction
        const match = href.match(/uddg=([^&]+)/);
        if (match) {
            try {
                return decodeURIComponent(match[1]);
            }
            catch { }
        }
        return null;
    }
    async searchBing(query, maxResults) {
        const page = await this.context.newPage();
        try {
            await page.goto(`https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${maxResults}&form=QBLH`, { waitUntil: 'domcontentloaded', timeout: 20000 });
            await page.waitForTimeout(1000);
            const results = await page.evaluate((max) => {
                const items = [];
                // Bing result selectors
                const selectors = ['li.b_algo', '.b_algo'];
                let elements = null;
                for (const sel of selectors) {
                    const found = document.querySelectorAll(sel);
                    if (found.length > 0) {
                        elements = found;
                        break;
                    }
                }
                if (!elements)
                    return items;
                elements.forEach(el => {
                    if (items.length >= max)
                        return;
                    const linkEl = el.querySelector('h2 a, h3 a');
                    const snippetEl = el.querySelector('.b_caption p, p.b_algoSlug, .b_paractl');
                    const url = linkEl?.getAttribute('href') ?? '';
                    const title = linkEl?.textContent?.trim() ?? '';
                    const snippet = snippetEl?.textContent?.trim() ?? '';
                    if (url.startsWith('http') && title) {
                        items.push({ url, title, snippet });
                    }
                });
                return items;
            }, maxResults);
            await page.close();
            return results.map((r, i) => ({
                ...r,
                domain: this.extractDomain(r.url),
                rank: i + 1,
            }));
        }
        catch (error) {
            await page.close().catch(() => { });
            throw error;
        }
    }
    extractDomain(url) {
        try {
            return new URL(url).hostname.replace(/^www\./, '');
        }
        catch {
            return url;
        }
    }
    async close() {
        if (this.context) {
            await this.context.close();
            this.context = null;
        }
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
}
exports.SearchEngine = SearchEngine;
//# sourceMappingURL=search-engine.js.map