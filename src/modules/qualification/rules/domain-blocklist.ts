// Qualification-layer domain blocklist.
//
// PURPOSE: Rejects well-known non-competitor entities that appear in discovery
// results (from AI suggestions, listicle extraction, or web search) but are
// categorically never a competitor of any B2B service company.
//
// SCOPE: This is NOT the same as listicle/filters.ts. That file catches
// navigation/ad-widget noise from listicle page HTML. This file catches entities
// that were *suggested as competitors* but belong to irrelevant categories.
//
// Categories covered:
//   - Social / community platforms
//   - Job boards & HR platforms
//   - App stores & marketplaces
//   - Infrastructure / CDN / hosting
//   - Analytics / tracking tools
//   - Documentation / dev reference sites
//   - Search engines & aggregators
//   - Media / publishing networks
//   - Generic collaboration / productivity
//   - Payment processors

// ── Category: social & community ─────────────────────────────────────────────
const SOCIAL_COMMUNITY = new Set([
  'twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'linkedin.com',
  'youtube.com', 'tiktok.com', 'pinterest.com', 'reddit.com', 'snapchat.com',
  'tumblr.com', 'whatsapp.com', 'telegram.org', 'discord.com', 'twitch.tv',
  'vimeo.com', 'behance.net', 'dribbble.com', 'threads.net', 'quora.com',
  'medium.com', 'substack.com', 'hashnode.dev', 'dev.to', 'hackernoon.com',
  'meetup.com', 'eventbrite.com', 'luma.events',
  'slideshare.net', 'speakerdeck.com', 'prezi.com',
  'producthunt.com', 'indiehackers.com', 'ycombinator.com',
]);

// ── Category: job boards & HR platforms ──────────────────────────────────────
const JOB_BOARDS = new Set([
  'linkedin.com',  // also social — dual listing intentional
  'glassdoor.com', 'glassdoor.co.uk', 'glassdoor.co.in',
  'indeed.com', 'indeed.co.uk',
  'monster.com', 'ziprecruiter.com', 'careerbuilder.com',
  'workday.com', 'greenhouse.io', 'lever.co', 'ashby.io',
  'bamboohr.com', 'gusto.com', 'rippling.com', 'justworks.com',
  'namely.com', 'paylocity.com', 'adp.com',
  'talent.com', 'simplyhired.com', 'dice.com', 'wellfound.com',
  'angel.co', 'remote.co', 'remoteok.com', 'weworkremotely.com',
  'flexjobs.com', 'toptal.com', 'upwork.com', 'fiverr.com',
  'peopleai.com', 'lattice.com', 'culture-amp.com',
]);

// ── Category: app stores & distribution ──────────────────────────────────────
const APP_STORES = new Set([
  'apps.apple.com', 'apple.com',
  'play.google.com',
  'chrome.google.com',
  'marketplace.atlassian.com',
  'appsource.microsoft.com',
  'aws.amazon.com',
  'salesforce.com', // AppExchange is the marketplace, but salesforce itself is infra-adjacent
  'g2.com', 'capterra.com', 'trustpilot.com', 'getapp.com', 'software.com',
  'alternativeto.net',
  'sourceforge.net',
  'softonic.com',
]);

// ── Category: infrastructure / CDN / cloud ────────────────────────────────────
const INFRASTRUCTURE = new Set([
  'cloudflare.com', 'amazonaws.com', 'azure.com', 'cloud.google.com',
  'digitalocean.com', 'heroku.com', 'render.com', 'vercel.com', 'netlify.com',
  'fastly.com', 'cloudfront.net', 'akamai.com', 'akamaihd.net',
  'github.com', 'gitlab.com', 'bitbucket.org',
  'npmjs.com', 'pypi.org', 'docker.com', 'kubernetes.io',
  'terraform.io', 'hashicorp.com', 'circleci.com', 'travis-ci.com',
  'jenkins.io', 'github.io',
]);

// ── Category: analytics / monitoring / tracking ───────────────────────────────
// Note: some tools (hotjar, mixpanel) can appear as "adjacent" but are never
// direct competitors of an agency or other non-analytics company.
// They are rejected here to keep intelligence focused on service companies.
const ANALYTICS_INFRA = new Set([
  'google-analytics.com', 'googletagmanager.com',
  'segment.com', 'mixpanel.com', 'amplitude.com',
  'fullstory.com', 'heap.io', 'logrocket.com',
  'datadog.com', 'newrelic.com', 'sentry.io', 'bugsnag.com',
  'pendo.io', 'userpilot.com', 'appcues.com', 'intercom.com',
  'zendesk.com', 'freshdesk.com',
  'statuspage.io', 'opsgenie.com', 'pagerduty.com',
]);

// ── Category: documentation & developer portals ───────────────────────────────
const DOCUMENTATION = new Set([
  'docs.github.com', 'readthedocs.io', 'readthedocs.org',
  'gitbook.io', 'notion.so', 'confluence.atlassian.com',
  'stackoverflow.com', 'stackexchange.com',
  'developer.mozilla.org', 'w3.org', 'mdn.dev',
  'schema.org', 'iana.org', 'wikipedia.org', 'wikimedia.org',
  'archive.org', 'britannica.com',
]);

// ── Category: search engines & aggregators ───────────────────────────────────
const SEARCH_ENGINES = new Set([
  'google.com', 'bing.com', 'yahoo.com', 'duckduckgo.com',
  'baidu.com', 'yandex.com', 'ask.com', 'ecosia.org',
  'ahrefs.com', 'semrush.com', 'moz.com',  // SEO tools are tools, not competitors
]);

// ── Category: media & publishing ─────────────────────────────────────────────
const MEDIA = new Set([
  'techcrunch.com', 'wired.com', 'theverge.com', 'engadget.com',
  'cnn.com', 'bbc.com', 'nytimes.com', 'wsj.com', 'forbes.com',
  'businessinsider.com', 'entrepreneur.com', 'inc.com',
  'marketingland.com', 'searchengineland.com', 'hubspot.com',
  'neil-patel.com', 'backlinko.com',
]);

// ── Category: generic productivity / collaboration ────────────────────────────
const PRODUCTIVITY = new Set([
  'slack.com', 'zoom.us', 'teams.microsoft.com', 'microsoft.com',
  'office365.com', 'google.com',
  'asana.com', 'monday.com', 'basecamp.com', 'clickup.com',
  'notion.so', 'airtable.com', 'coda.io',
  'dropbox.com', 'box.com', 'onedrive.live.com',
  'trello.com', 'jira.atlassian.com',
  'docusign.com', 'pandadoc.com',
]);

// ── Category: payment / commerce infra ───────────────────────────────────────
const PAYMENT = new Set([
  'stripe.com', 'paypal.com', 'square.com', 'braintreepayments.com',
  'shopify.com', 'woocommerce.com', 'bigcommerce.com', 'magento.com',
  'wix.com', 'squarespace.com', 'wordpress.com', 'webflow.com',
]);

// ── Combined master set ───────────────────────────────────────────────────────
const ALL_BLOCKED: ReadonlySet<string> = new Set([
  ...SOCIAL_COMMUNITY,
  ...JOB_BOARDS,
  ...APP_STORES,
  ...INFRASTRUCTURE,
  ...ANALYTICS_INFRA,
  ...DOCUMENTATION,
  ...SEARCH_ENGINES,
  ...MEDIA,
  ...PRODUCTIVITY,
  ...PAYMENT,
]);

// ── Subdomain patterns that indicate non-competitor subdomains ────────────────
// If the first label of a domain matches one of these, it's a functional
// subdomain (auth, CDN, API endpoint) not a company's main presence.
const NON_COMPETITOR_SUBDOMAINS = new Set([
  'login', 'accounts', 'auth', 'sso', 'oauth', 'saml',
  'cdn', 'static', 'assets', 'media', 'img', 'images', 'files',
  'api', 'api2', 'rest', 'graphql', 'webhook', 'webhooks',
  'mail', 'email', 'smtp', 'imap',
  'docs', 'help', 'support', 'status', 'statuspage',
  'admin', 'app', 'dashboard', 'portal', 'console',
  'blog', 'news',   // not a competitor's primary domain
  'careers', 'jobs', 'hiring',
  'legacy', 'old', 'staging', 'dev', 'sandbox', 'test',
]);

// Common 2-label TLDs where the root is 3 labels deep.
// e.g. glassdoor.co.uk → root is glassdoor.co.uk (not co.uk)
const TWO_PART_TLDS = new Set([
  'co.uk', 'com.au', 'co.nz', 'co.in', 'co.za', 'co.jp',
  'com.br', 'com.mx', 'com.ar', 'org.uk', 'net.au', 'ne.jp',
]);

export function getRootDomain(domain: string): string {
  const parts = domain.split('.');
  if (parts.length >= 3) {
    const lastTwo = parts.slice(-2).join('.');
    if (TWO_PART_TLDS.has(lastTwo)) {
      return parts.slice(-3).join('.');
    }
  }
  return parts.length >= 2 ? parts.slice(-2).join('.') : domain;
}

export function isSubdomainDomain(domain: string): boolean {
  const root = getRootDomain(domain);
  if (domain === root) return false;
  // Extract the first label (everything before the root domain)
  const firstLabel = domain.slice(0, domain.length - root.length - 1).split('.')[0] ?? '';
  return NON_COMPETITOR_SUBDOMAINS.has(firstLabel);
}

export function isBlocklistedDomain(domain: string): { blocked: boolean; category: string } {
  // Direct match
  if (ALL_BLOCKED.has(domain)) {
    return { blocked: true, category: getCategoryForDomain(domain) };
  }
  // Root domain match (catches e.g. uk.glassdoor.com → glassdoor.com)
  const root = getRootDomain(domain);
  if (root !== domain && ALL_BLOCKED.has(root)) {
    return { blocked: true, category: getCategoryForDomain(root) };
  }
  return { blocked: false, category: '' };
}

function getCategoryForDomain(domain: string): string {
  if (SOCIAL_COMMUNITY.has(domain)) return 'community-platform';
  if (JOB_BOARDS.has(domain))       return 'job-board';
  if (APP_STORES.has(domain))       return 'app-store';
  if (INFRASTRUCTURE.has(domain))   return 'infrastructure-domain';
  if (ANALYTICS_INFRA.has(domain))  return 'analytics-tracking-tool';
  if (DOCUMENTATION.has(domain))    return 'documentation-site';
  if (SEARCH_ENGINES.has(domain))   return 'search-engine-or-seo-tool';
  if (MEDIA.has(domain))            return 'media-publication';
  if (PRODUCTIVITY.has(domain))     return 'productivity-tool';
  if (PAYMENT.has(domain))          return 'payment-commerce-infra';
  return 'blocklisted-domain';
}
