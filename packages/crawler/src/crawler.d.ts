import { CrawlerOptions, PageData } from './types';
export declare class Crawler {
    private browser;
    private context;
    private options;
    private analyzer;
    constructor(options?: CrawlerOptions);
    init(): Promise<void>;
    crawlPage(url: string): Promise<PageData>;
    crawlMultiple(urls: string[], concurrency?: number): Promise<PageData[]>;
    close(): Promise<void>;
    private extractDomain;
    private sleep;
}
