import { QueryObject } from '@discovery/shared';
export declare class QueryAnalyzer {
    analyze(rawQuery: string): QueryObject;
    /** Returns true if query is just a domain like "brillmark.com" */
    isDomainQuery(query: string): boolean;
    /** Extract clean domain from a domain query */
    extractDomainFromQuery(query: string): string | null;
    private detectIntent;
    /** Public: detect industry from any arbitrary text (description, meta, body) */
    detectIndustryFromText(text: string): string | null;
    private detectIndustry;
    private detectLocation;
    private detectEntityType;
    private extractKeywords;
    private buildObjective;
    generateSearchQueries(queryObj: QueryObject): string[];
}
