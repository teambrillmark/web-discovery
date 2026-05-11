import { SearchOptions, SearchResult } from './types';
export declare class SearchEngine {
    private browser;
    private context;
    init(): Promise<void>;
    search(options: SearchOptions): Promise<SearchResult[]>;
    /**
     * DuckDuckGo HTML (https://html.duckduckgo.com/html/) — no JS, more bot-tolerant.
     * Links use redirect format: //duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com&...
     * We decode the 'uddg' parameter to get the real URL.
     */
    private searchDuckDuckGoHTML;
    /**
     * Decode DuckDuckGo redirect URLs.
     * Formats seen: //duckduckgo.com/l/?uddg=https%3A%2F%2F...
     *               https://duckduckgo.com/l/?uddg=https%3A...
     *               Direct https:// URLs (sometimes returned)
     */
    private decodeDuckDuckGoUrl;
    private searchBing;
    private extractDomain;
    close(): Promise<void>;
}
