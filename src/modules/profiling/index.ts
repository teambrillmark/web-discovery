export { ProfilingService } from './services/profiling.service';
export { ProfileRepository } from './persistence/profile.repository';
export type { IProfileRepository } from './persistence/profile.repository';
export { CandidateFilter } from './filtering/candidate.filter';
export type {
  FilterCandidate,
  CandidateFilterStats,
  CandidateFilterResult,
} from './filtering/candidate.filter';
export type {
  CompetitorProfile,
  MatchedSignals,
  ScoringResult,
  ProfilingInput,
  ProfilingOutput,
  ProfilingStats,
  ProfilingTargetContext,
  StoredProfile,
} from './types';
