import { Page } from 'playwright';
import { PageData } from './types';
export declare class PageAnalyzer {
    analyze(page: Page, html: string, url: string, duration: number, statusCode?: number): Promise<PageData>;
    private extractMeta;
    private extractHeadings;
    private extractLinks;
    private extractBodyText;
    private extractEmails;
    private extractPhones;
    private detectTechnologies;
    private extractSocialLinks;
    private extractSchemaOrg;
    /**
     * DOM-based person extraction — runs inside the live Playwright browser context
     * so it has full access to the rendered DOM, not just raw text.
     * Handles team cards where name and role are in separate sibling/child elements.
     */
    private extractPeopleFromDOM;
    private extractDomain;
}
