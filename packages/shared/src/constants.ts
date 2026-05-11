export const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.8,
  MEDIUM: 0.6,
  LOW: 0.4,
  MINIMUM: 0.2,
};

export const CRAWL_SETTINGS = {
  MAX_PAGES_PER_QUERY: 20,
  REQUEST_TIMEOUT: 30000,
  MAX_RETRIES: 3,
  RETRY_DELAY: 2000,
  HEADLESS: true,
  USER_AGENT: 'Mozilla/5.0 (compatible; DiscoveryBot/1.0)',
};

export const SEARCH_ENGINES = {
  GOOGLE: 'https://www.google.com/search?q=',
  BING: 'https://www.bing.com/search?q=',
  DUCKDUCKGO: 'https://duckduckgo.com/?q=',
};

export const TECH_SIGNATURES: Record<string, string[]> = {
  // Ecommerce
  'Shopify': ['cdn.shopify.com', 'shopifycdn.com', 'myshopify.com'],
  'WooCommerce': ['woocommerce', 'wc-api'],
  'Magento': ['mage/cookies', 'magento', 'mageworx'],
  'BigCommerce': ['bigcommerce.com', 'cdn11.bigcommerce'],
  // CMS
  'WordPress': ['wp-content', 'wp-includes', 'wordpress.org'],
  'Webflow': ['webflow.com', 'assets.website-files.com'],
  'Squarespace': ['squarespace.com', 'static1.squarespace'],
  'Wix': ['wixstatic.com', 'wix.com'],
  // Analytics & CRO
  'Optimizely': ['optimizely.com', 'cdn.optimizely.com'],
  'VWO': ['vwo.com', 'visualwebsiteoptimizer'],
  'Hotjar': ['hotjar.com', 'static.hotjar.com'],
  'Google Analytics': ['google-analytics.com', 'gtag/js', 'ga.js'],
  'Google Tag Manager': ['googletagmanager.com', 'gtm.js'],
  'Mixpanel': ['mixpanel.com', 'cdn.mxpnl.com'],
  'Amplitude': ['amplitude.com', 'cdn.amplitude.com'],
  // CRM & Marketing
  'HubSpot': ['hubspot.com', 'hs-scripts.com'],
  'Salesforce': ['salesforce.com', 'force.com'],
  'Klaviyo': ['klaviyo.com', 'klaviyoV2'],
  'Mailchimp': ['mailchimp.com', 'chimpstatic.com'],
  'Intercom': ['intercom.io', 'widget.intercom.io'],
  'Segment': ['cdn.segment.com', 'analytics.js'],
  // Frameworks
  'React': ['react.development.js', 'react.production.min.js', '__react'],
  'Next.js': ['_next/static', '__NEXT_DATA__'],
  'Vue.js': ['vue.min.js', '__vue__'],
  'Angular': ['angular.min.js', 'ng-version'],
  'Nuxt.js': ['_nuxt/', '__nuxt'],
  'Gatsby': ['gatsby-chunk', '/static/gatsby'],
  // Infrastructure
  'Cloudflare': ['cloudflare.com', '__cf_bm', 'cf-ray'],
  'AWS CloudFront': ['cloudfront.net'],
  'Fastly': ['fastly.net'],
  // Payments
  'Stripe': ['js.stripe.com', 'stripe.com/v3'],
  'PayPal': ['paypal.com/sdk', 'paypalobjects.com'],
};

export const SOCIAL_LINK_PATTERNS: Record<string, RegExp> = {
  linkedin: /linkedin\.com\/(company|in)\//i,
  twitter: /twitter\.com\/|x\.com\//i,
  facebook: /facebook\.com\//i,
  instagram: /instagram\.com\//i,
  youtube: /youtube\.com\/(channel|c|user)\//i,
  github: /github\.com\//i,
};

export const SPAM_INDICATORS = [
  'casino', 'poker', 'betting', 'adult', 'xxx', 'porn',
  'pharmacy', 'pills', 'viagra', 'loan', 'payday',
];

export const ENTITY_TYPES_MAP: Record<string, string> = {
  competitor_analysis: 'company',
  market_discovery: 'company',
  local_business_search: 'local_business',
  product_discovery: 'product',
  agency_search: 'company',
  technology_search: 'company',
  brand_discovery: 'company',
  general_search: 'company',
};
