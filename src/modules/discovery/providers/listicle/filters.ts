// Domains that consistently appear as navigation, tracking, or social links
// inside listicle pages. They are never the competitor company websites we want.
// Filtering them early reduces false-positive noise before normalization.

const BLOCKED_ROOT_DOMAINS: ReadonlySet<string> = new Set([
  // Social media
  'twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'linkedin.com',
  'youtube.com', 'tiktok.com', 'pinterest.com', 'reddit.com', 'snapchat.com',
  'tumblr.com', 'whatsapp.com', 'telegram.org', 'discord.com', 'twitch.tv',
  'vimeo.com', 'behance.net', 'dribbble.com', 'threads.net',

  // Search engines
  'google.com', 'bing.com', 'yahoo.com', 'duckduckgo.com', 'baidu.com',
  'yandex.com', 'ask.com', 'ecosia.org',

  // CDN / cloud infrastructure
  'cloudflare.com', 'amazonaws.com', 'azure.com', 'cloud.google.com',
  'fastly.com', 'cloudfront.net', 'akamai.com', 'akamaihd.net',
  'jsdelivr.net', 'unpkg.com', 'cloudinary.com', 'imgix.com',

  // Analytics / heatmaps / session recording
  'google-analytics.com', 'googletagmanager.com', 'hotjar.com', 'segment.com',
  'mixpanel.com', 'amplitude.com', 'fullstory.com', 'heap.io', 'logrocket.com',
  'datadog.com', 'newrelic.com', 'sentry.io', 'bugsnag.com',

  // Ad networks / affiliate / programmatic
  'doubleclick.net', 'googlesyndication.com', 'adnxs.com', 'outbrain.com',
  'taboola.com', 'sharethrough.com', 'rubiconproject.com', 'criteo.com',
  'shareasale.com', 'cj.com', 'impact.com', 'tappx.com', '33across.com',
  '33across.co.uk', 'amillionads.com', 'veepee-ad.com', 'aarki.com',
  'recreativ.com', 'openx.com', 'appnexus.com', 'pubmatic.com',
  'sovrn.com', 'triplelift.com', 'contextweb.com', 'indexexchange.com',
  'bidswitch.com', 'smartadserver.com', 'adform.net', 'yieldmo.com',

  // Email / marketing automation platforms
  'mailchimp.com', 'sendgrid.com', 'mailgun.com', 'klaviyo.com',
  'constantcontact.com', 'activecampaign.com',

  // Dev / tech reference sites
  'github.com', 'gitlab.com', 'stackoverflow.com', 'npmjs.com',
  'pypi.org', 'docker.com', 'kubernetes.io',

  // Generic reference / knowledge
  'wikipedia.org', 'wikimedia.org', 'britannica.com', 'w3.org',
  'schema.org', 'iana.org', 'archive.org',

  // Payment processors (global infra, not competitors)
  'stripe.com', 'paypal.com', 'square.com', 'braintreepayments.com',
]);

// Returns the registrable root domain by taking the last two labels.
// "cdn.cloudflare.com" -> "cloudflare.com" so it matches the blocklist.
function getRootDomain(domain: string): string {
  const parts = domain.split('.');
  return parts.length >= 2 ? parts.slice(-2).join('.') : domain;
}

export function isBlockedDomain(domain: string): boolean {
  return BLOCKED_ROOT_DOMAINS.has(domain) || BLOCKED_ROOT_DOMAINS.has(getRootDomain(domain));
}
