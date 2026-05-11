import { CompanyEntity, QueryObject } from '@discovery/shared';
export declare class ConfidenceScorer {
    scoreEntity(entity: CompanyEntity, queryObj: QueryObject): {
        confidence: number;
        relevance: number;
    };
    private calculateConfidence;
    private calculateRelevance;
    categorizeConfidence(score: number): 'high' | 'medium' | 'low' | 'very_low';
}
