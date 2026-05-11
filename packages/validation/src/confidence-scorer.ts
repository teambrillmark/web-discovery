import { CompanyEntity, QueryObject, CONFIDENCE_THRESHOLDS } from '@discovery/shared';

export class ConfidenceScorer {
  scoreEntity(entity: CompanyEntity, queryObj: QueryObject): { confidence: number; relevance: number } {
    const confidence = this.calculateConfidence(entity);
    const relevance = this.calculateRelevance(entity, queryObj);
    return { confidence, relevance };
  }

  private calculateConfidence(entity: CompanyEntity): number {
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

    if (entity.name && entity.name.length > 2) score += weights.name;
    if (entity.domain && entity.domain.includes('.')) score += weights.domain;
    if (entity.description && entity.description.length > 50) score += weights.description;
    if (entity.services && entity.services.length > 0) score += weights.services;
    if (entity.technologies && entity.technologies.length > 0) score += weights.technologies;
    if (entity.linkedin) score += weights.linkedin;
    if (entity.emails && entity.emails.length > 0) score += weights.emails;
    if (entity.locations && entity.locations.length > 0) score += weights.locations;

    return Math.min(1, score);
  }

  private calculateRelevance(entity: CompanyEntity, queryObj: QueryObject): number {
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
    } else {
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
    } else {
      // All words were operators — no keyword penalty
      score += 0.2;
    }

    // 3. Location match
    if (queryObj.location) {
      if (textToCheck.includes(queryObj.location.toLowerCase())) score += 0.15;
    } else {
      score += 0.1;
    }

    // 4. Agency-vs-tool relevance adjustment
    //    For agency_search intent: boost entities with client/service language,
    //    penalize entities that look like SaaS tools. This adjusts the score
    //    for borderline cases that pass the hard validator check.
    if (queryObj.intent === 'agency_search' || queryObj.intent === 'local_business_search') {
      const desc = textToCheck;

      // Agency service signals → boost
      const agencySignals = [
        'our team', 'our clients', 'our experts', 'case study', 'case studies',
        'we help', 'we partner', 'managed service', 'full-service', 'consulting',
        'consultancy', 'bespoke', 'tailored', 'dedicated team', 'client results',
      ];
      const agencyHits = agencySignals.filter(s => desc.includes(s)).length;
      if (agencyHits >= 2) score += 0.15;
      else if (agencyHits >= 1) score += 0.07;

      // SaaS tool signals → penalize
      const toolSignals = [
        'free trial', 'pricing', 'sign up free', 'per user', 'per month',
        'dashboard', 'self-serve', 'no-code', '14-day', '30-day free',
      ];
      const toolHits = toolSignals.filter(s => desc.includes(s)).length;
      if (toolHits >= 3) score -= 0.35;
      else if (toolHits >= 2) score -= 0.2;
      else if (toolHits >= 1) score -= 0.05;
    }

    return Math.min(1, Math.max(0.05, score));
  }

  categorizeConfidence(score: number): 'high' | 'medium' | 'low' | 'very_low' {
    if (score >= CONFIDENCE_THRESHOLDS.HIGH) return 'high';
    if (score >= CONFIDENCE_THRESHOLDS.MEDIUM) return 'medium';
    if (score >= CONFIDENCE_THRESHOLDS.LOW) return 'low';
    return 'very_low';
  }
}
