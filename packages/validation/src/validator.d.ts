import { CompanyEntity, QueryObject, ValidationResult } from '@discovery/shared';
export declare class Validator {
    private scorer;
    constructor();
    validate(entity: CompanyEntity, queryObj: QueryObject): ValidationResult;
}
