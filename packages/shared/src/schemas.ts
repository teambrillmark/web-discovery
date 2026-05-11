export const COMPANY_SCHEMA = {
  required: ['name', 'domain'],
  optional: ['description', 'services', 'founders', 'linkedin', 'technologies', 'locations', 'emails'],
};

export const PRODUCT_SCHEMA = {
  required: ['name', 'category', 'brand', 'source'],
  optional: ['pricing', 'description'],
};

export const LOCAL_BUSINESS_SCHEMA = {
  required: ['name', 'location'],
  optional: ['services', 'rating', 'phone', 'website'],
};
