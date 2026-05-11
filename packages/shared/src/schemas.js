"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOCAL_BUSINESS_SCHEMA = exports.PRODUCT_SCHEMA = exports.COMPANY_SCHEMA = void 0;
exports.COMPANY_SCHEMA = {
    required: ['name', 'domain'],
    optional: ['description', 'services', 'founders', 'linkedin', 'technologies', 'locations', 'emails'],
};
exports.PRODUCT_SCHEMA = {
    required: ['name', 'category', 'brand', 'source'],
    optional: ['pricing', 'description'],
};
exports.LOCAL_BUSINESS_SCHEMA = {
    required: ['name', 'location'],
    optional: ['services', 'rating', 'phone', 'website'],
};
//# sourceMappingURL=schemas.js.map