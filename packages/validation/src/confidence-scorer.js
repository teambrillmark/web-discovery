"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfidenceScorer = void 0;
const shared_1 = require("@discovery/shared");
class ConfidenceScorer {
    scoreEntity(entity, queryObj) {
        const confidence = this.calculateConfidence(entity);
        const relevance = this.calculateRelevance(entity, queryObj);
        return { confidence, relevance };
    }
    calculateConfidence(entity) {
        let score = 0;
        const weights = {
            name: 0.15,
            domain: 0.15,
            description: 0.15,
            services: 0.15,
            technologies: 0.10,
            linkedin: 0.10,
            emails: 0.10,
            locations: 0.10,
        };
        if (entity.name && entity.name.length > 2)
            score += weights.name;
        if (entity.domain && entity.domain.includes('.'))
            score += weights.domain;
        if (entity.description && entity.description.length > 50)
            score += weights.description;
        if (entity.services && entity.services.length > 0)
            score += weights.services;
        if (entity.technologies && entity.technologies.length > 0)
            score += weights.technologies;
        if (entity.linkedin)
            score += weights.linkedin;
        if (entity.emails && entity.emails.length > 0)
            score += weights.emails;
        if (entity.locations && entity.locations.length > 0)
            score += weights.locations;
        return Math.min(1, score);
    }
    calculateRelevance(entity, queryObj) {
        let score = 0;
        const textToCheck = [
            entity.name,
            entity.description ?? '',
            entity.category ?? '',
            entity.services?.join(' ') ?? '',
            entity.metaTitle ?? '',
            entity.metaDescription ?? '',
        ].join(' ').toLowerCase();
        // 1. Industry/category match — the most reliable signal for competitor queries
        //    (e.g. "youtube competitor" → entity.category = "media" → match)
        if (queryObj.industry) {
            const industrySlug = queryObj.industry.replace(/_/g, ' ');
            const industryWords = industrySlug.split(' ');
            const wordMatches = industryWords.filter(w => textToCheck.includes(w)).length;
            score += (wordMatches / industryWords.length) * 0.35;
            // Direct category match via entity.category field
            if (entity.category) {
                const catNorm = entity.category.toLowerCase().replace(/\s+/g, ' ');
                if (catNorm.includes(industryWords[0]) || industrySlug.includes(catNorm.split(' ')[0])) {
                    score += 0.35;
                }
            }
        }
        else {
            // No industry — give a moderate baseline so entities aren't auto-penalized
            score += 0.3;
        }
        // 2. Keyword overlap — exclude query operator words that never appear on target sites
        const OPERATOR_WORDS = new Set([
            'competitor', 'competitors', 'alternative', 'alternatives',
            'find', 'best', 'top', 'similar', 'like', 'vs', 'versus',
            'leading', 'popular', 'agency', 'agencies',
        ]);
        const meaningfulKeywords = queryObj.keywords.filter(kw => !OPERATOR_WORDS.has(kw) && kw.length > 2);
        if (meaningfulKeywords.length > 0) {
            const matched = meaningfulKeywords.filter(kw => textToCheck.includes(kw));
            score += (matched.length / meaningfulKeywords.length) * 0.3;
        }
        else {
            // All words were operators — no keyword penalty
            score += 0.2;
        }
        // 3. Location match
        if (queryObj.location) {
            if (textToCheck.includes(queryObj.location.toLowerCase()))
                score += 0.15;
        }
        else {
            score += 0.1;
        }
        return Math.min(1, Math.max(0.05, score));
    }
    categorizeConfidence(score) {
        if (score >= shared_1.CONFIDENCE_THRESHOLDS.HIGH)
            return 'high';
        if (score >= shared_1.CONFIDENCE_THRESHOLDS.MEDIUM)
            return 'medium';
        if (score >= shared_1.CONFIDENCE_THRESHOLDS.LOW)
            return 'low';
        return 'very_low';
    }
}
exports.ConfidenceScorer = ConfidenceScorer;
//# sourceMappingURL=confidence-scorer.js.map