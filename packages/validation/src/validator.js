"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Validator = void 0;
const shared_1 = require("@discovery/shared");
const confidence_scorer_1 = require("./confidence-scorer");
const BLOCKED_DOMAINS = new Set([
    'google.com', 'facebook.com', 'youtube.com', 'twitter.com', 'linkedin.com',
    'instagram.com', 'reddit.com', 'wikipedia.org', 'amazon.com', 'bing.com',
    'yahoo.com', 'pinterest.com', 'tiktok.com', 'snapchat.com',
]);
class Validator {
    constructor() {
        this.scorer = new confidence_scorer_1.ConfidenceScorer();
    }
    validate(entity, queryObj) {
        const reasons = [];
        const flags = [];
        let isValid = true;
        // Check blocked domains
        if (BLOCKED_DOMAINS.has(entity.domain)) {
            isValid = false;
            reasons.push('Social media or search engine domain');
            flags.push('irrelevant');
        }
        // Check spam
        const contentToCheck = `${entity.name} ${entity.description ?? ''}`.toLowerCase();
        const spamFound = shared_1.SPAM_INDICATORS.filter(s => contentToCheck.includes(s));
        if (spamFound.length > 0) {
            isValid = false;
            reasons.push(`Spam indicators found: ${spamFound.join(', ')}`);
            flags.push('spam');
        }
        // Check minimum data
        if (!entity.name || entity.name.length < 2) {
            isValid = false;
            reasons.push('Missing company name');
            flags.push('incomplete');
        }
        if (!entity.domain || !entity.domain.includes('.')) {
            isValid = false;
            reasons.push('Invalid domain');
            flags.push('incomplete');
        }
        // Score confidence and relevance
        const { confidence, relevance } = this.scorer.scoreEntity(entity, queryObj);
        if (confidence < shared_1.CONFIDENCE_THRESHOLDS.MINIMUM) {
            isValid = false;
            reasons.push('Confidence score too low');
            flags.push('low_quality');
        }
        if (relevance < 0.1) {
            isValid = false;
            reasons.push('Not relevant to query');
            flags.push('irrelevant');
        }
        if (isValid && confidence >= shared_1.CONFIDENCE_THRESHOLDS.HIGH && relevance >= 0.7) {
            flags.push('high_confidence');
        }
        if (isValid && reasons.length === 0) {
            flags.push('verified');
            reasons.push('Passed all validation checks');
        }
        return {
            isValid,
            confidenceScore: confidence,
            relevanceScore: relevance,
            reasons,
            flags: flags,
        };
    }
}
exports.Validator = Validator;
//# sourceMappingURL=validator.js.map