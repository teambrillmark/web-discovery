import { CompanyEntity, LocalBusinessEntity, ProductEntity } from '@discovery/shared';
interface SchemaOrgPerson {
    name: string;
    role: string;
    linkedin?: string;
    twitter?: string;
}
interface SchemaOrgData {
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
interface RawPageData {
    url: string;
    domain: string;
    title: string | null;
    description: string | null;
    keywords: string | null;
    ogTitle: string | null;
    ogDescription: string | null;
    headings: Array<{
        level: number;
        text: string;
    }>;
    bodyText: string;
    socialLinks: Record<string, string>;
    emails: string[];
    phones: string[];
    technologies: string[];
    html: string;
    schemaOrg?: SchemaOrgData | null;
}
export declare class EntityExtractor {
    extractCompany(page: RawPageData): CompanyEntity;
    extractLocalBusiness(page: RawPageData): LocalBusinessEntity;
    extractProduct(page: RawPageData): ProductEntity;
    private extractCompanyName;
    private extractDescription;
    private extractServices;
    private extractKeyPeople;
    private extractLocations;
    private extractRating;
    private extractPricing;
    private inferCategory;
    private extractBrand;
}
export {};
