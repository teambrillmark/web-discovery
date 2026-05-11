export interface CrawlerOptions {
    headless?: boolean;
    timeout?: number;
    maxRetries?: number;
    retryDelay?: number;
    userAgent?: string;
    waitForSelector?: string;
}
export interface SearchOptions {
    engine?: 'google' | 'bing' | 'duckduckgo';
    maxResults?: number;
    query: string;
}
export interface SearchResult {
    url: string;
    title: string;
    snippet: string;
    domain: string;
    rank: number;
}
export interface SchemaOrgPerson {
    name: string;
    role: string;
    linkedin?: string;
    twitter?: string;
}
export interface SchemaOrgData {
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
export interface PageData {
    url: string;
    domain: string;
    html: string;
    title: string | null;
    description: string | null;
    keywords: string | null;
    ogTitle: string | null;
    ogDescription: string | null;
    canonicalUrl: string | null;
    headings: Array<{
        level: number;
        text: string;
    }>;
    links: string[];
    internalLinks: string[];
    externalLinks: string[];
    socialLinks: Record<string, string>;
    emails: string[];
    phones: string[];
    technologies: string[];
    bodyText: string;
    schemaOrg: SchemaOrgData | null;
    success: boolean;
    error?: string;
    duration: number;
    statusCode?: number;
}
