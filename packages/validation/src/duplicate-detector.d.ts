import { CompanyEntity } from '@discovery/shared';
export declare class DuplicateDetector {
    private seen;
    isDuplicate(entity: CompanyEntity): boolean;
    markSeen(entity: CompanyEntity): void;
    findSimilar(entity: CompanyEntity, candidates: CompanyEntity[]): CompanyEntity | null;
    private normalizeKey;
    private nameSimilarity;
    private editDistance;
    reset(): void;
}
