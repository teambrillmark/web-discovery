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
export declare class DynamicDiscovery {
    private readonly WIKI_API;
    private readonly DDG_API;
    private readonly DDG_HTML;
    private readonly TIMEOUT;
    /**
     * Given a company name or domain, discover its industry and related competitor domains.
     */
    discover(companyNameOrDomain: string): Promise<DynamicResult>;
    /**
     * Use DuckDuckGo IA for a broader query like "youtube competitors".
     * Useful when we have a full user query, not just a company name.
     */
    discoverFromQuery(query: string): Promise<DynamicResult>;
    /**
     * Scrape DuckDuckGo HTML search results for "{company} competitors" to discover
     * real competitor domains from live web search — no API key required.
     */
    private searchWebForCompetitors;
    private isCommonNonCompany;
    private tryWikipedia;
    private tryDuckDuckGo;
    /**
     * Convert a DuckDuckGo FirstURL like "https://duckduckgo.com/Vimeo" to "vimeo.com"
     */
    private ddgUrlToDomain;
    /**
     * Convert a Wikipedia page title like "Vimeo" or "Twitch (service)" to a domain.
     */
    private titleToDomain;
    private inferIndustry;
    private fetchWithTimeout;
}
