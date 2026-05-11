import type { QueryObject } from '@discovery/shared';
import type { Validator } from '@discovery/validation';
import type { CandidateResult, CompanyProfile, EmitFn } from './types';

export interface FilteredResult extends CandidateResult {
  confidenceScore: number;
  relevanceScore:  number;
  isValid:         boolean;
  rejectionReason: string | null;
}

// Minimum fraction of profile primary services a candidate must share
const MIN_MATCH_SCORE = 0.1;

// Industries where queries are for service agencies — tools/platforms are irrelevant competitors
const SERVICE_INDUSTRIES = new Set(['cro_agency', 'digital_marketing', 'hr_tech', 'edtech']);

export class RelevancyFilter {
  filter(
    candidates: CandidateResult[],
    profile: CompanyProfile | null,
    queryObj: QueryObject,
    validator: Validator,
    emit: EmitFn,
  ): FilteredResult[] {
    emit(`Evaluating ${candidates.length} candidates for relevance...`);

    const results: FilteredResult[] = [];
    let rejectedTool = 0;
    let rejectedScore = 0;
    let rejectedMatch = 0;

    for (const candidate of candidates) {
      // Exclude the query company itself from its own competitor results
      if (profile && candidate.domain === profile.domain) {
        emit(`  ✗ Excluded ${candidate.domain}: this is the query company`);
        continue;
      }

      // Build a mock entity for the existing validator
      const mockEntity: any = {
        name:            candidate.name,
        domain:          candidate.domain,
        description:     candidate.description,
        metaDescription: candidate.rawPageData?.metaDescription ?? '',
        metaTitle:       candidate.rawPageData?.title ?? '',
        services:        candidate.services,
        technologies:    candidate.techStack,
        founders:        [],
        emails:          [],
        phones:          [],
        locations:       [],
        confidenceScore: 0,
        relevanceScore:  0,
        source:          candidate.source,
        category:        queryObj.industry ? queryObj.industry.replace(/_/g, ' ') : null,
      };

      const validation = validator.validate(mockEntity, queryObj);

      if (!validation.isValid) {
        const reason = validation.flags.includes('tool_not_agency')
          ? 'SaaS tool — not a service competitor'
          : validation.reasons[0] ?? 'failed validation';
        emit(`  ✗ Rejected ${candidate.domain}: ${reason}`);
        if (validation.flags.includes('tool_not_agency')) rejectedTool++;
        else rejectedScore++;

        results.push({
          ...candidate,
          confidenceScore:  validation.confidenceScore,
          relevanceScore:   validation.relevanceScore,
          isValid:          false,
          rejectionReason:  reason,
        });
        continue;
      }

      // Reject self-serve tools when the query is for a service agency industry.
      // businessModel is detected by ServiceMatcher from the crawled page — more
      // reliable than the regex signal count in validator.ts for borderline cases
      // (e.g. Ahrefs says "helping you" and mentions CRO but is clearly a tool).
      const isServiceIndustry = queryObj.industry && SERVICE_INDUSTRIES.has(queryObj.industry);
      if (isServiceIndustry && candidate.businessModel === 'tool') {
        emit(`  ✗ Rejected ${candidate.domain}: self-serve tool — not an agency competitor`);
        rejectedTool++;
        results.push({ ...candidate, confidenceScore: validation.confidenceScore, relevanceScore: validation.relevanceScore, isValid: false, rejectionReason: 'Self-serve tool — not an agency competitor' });
        continue;
      }

      // Service match gate: when we have a profile, require at least 1 service match
      if (profile && profile.primaryServices.length > 0 && candidate.matchScore < MIN_MATCH_SCORE) {
        emit(`  ✗ ${candidate.domain}: no service overlap (match=${(candidate.matchScore * 100).toFixed(0)}%)`);
        rejectedMatch++;
        results.push({
          ...candidate,
          confidenceScore:  validation.confidenceScore,
          relevanceScore:   validation.relevanceScore,
          isValid:          false,
          rejectionReason:  'No service overlap with query company profile',
        });
        continue;
      }

      emit(`  ✓ ${candidate.domain}: score=${(validation.confidenceScore * 100).toFixed(0)}% match=${(candidate.matchScore * 100).toFixed(0)}%`);
      results.push({
        ...candidate,
        confidenceScore:  validation.confidenceScore,
        relevanceScore:   validation.relevanceScore,
        isValid:          true,
        rejectionReason:  null,
      });
    }

    const accepted = results.filter(r => r.isValid);

    // Sort: service match score first, then confidence score
    accepted.sort((a, b) => {
      const matchDiff = b.matchScore - a.matchScore;
      return Math.abs(matchDiff) > 0.05 ? matchDiff : b.confidenceScore - a.confidenceScore;
    });

    emit(
      `Filter complete — ${accepted.length} relevant results` +
      (rejectedTool  ? ` | ${rejectedTool} tools removed`           : '') +
      (rejectedScore ? ` | ${rejectedScore} low-quality removed`     : '') +
      (rejectedMatch ? ` | ${rejectedMatch} no service match`        : ''),
    );

    return results;
  }
}
