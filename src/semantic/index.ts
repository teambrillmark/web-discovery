export {
  DEFAULT_ONTOLOGY,
  mapToSemanticGroups,
  groupSimilarity,
  groupRelationship,
  getGroupAcronyms,
  getGroupKeywords,
  type SemanticGroup,
  type OntologyGroupId,
} from './ontology';

export {
  classifyCompanyTaxonomy,
  taxonomyAlignment,
  competitiveDistance,
  classifyCompetitiveRelationship,
  type CompanyTaxonomy,
  type TaxonomyInput,
  type BusinessModel,
  type DeliveryModel,
  type MarketType,
  type AudienceScope,
  type BusinessModelConfidence,
  type CompetitiveRelationship,
} from './taxonomy';

export {
  accumulateTaxonomyEvidence,
  type ClassificationEvidence,
  type EvidenceClassification,
} from './evidence-classifier';

export {
  semanticSpecialtyOverlap,
  type SemanticOverlapResult,
} from './semantic-matcher';
