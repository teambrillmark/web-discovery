// Canonical validation lives in src/shared/domain.
// This file re-exports it so result-collector consumers keep their existing import path.
export { validateDomain } from '../../../shared/domain';
