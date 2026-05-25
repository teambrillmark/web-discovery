// Deterministic text similarity functions for profile comparison.
//
// WHY Jaccard similarity over cosine/embeddings?
//   • Transparent: the exact set of shared tokens is inspectable
//   • No external API or model dependency
//   • Sufficient precision for structured field comparison
//     (specialties, services, audience are short, structured lists)
//
// WHY semantic normalization instead of embeddings?
//   Without it: "Experimentation" and "A/B Testing" share zero tokens — Jaccard 0.
//   With it: both → 'abtesting' canonical token — Jaccard 1.
//   The B2B SaaS/agency domain has a small, stable synonym vocabulary.
//   A hand-curated normalization map beats embeddings for this narrow domain:
//   deterministic, zero latency, no API cost, fully auditable.
//
// WHY apply normalization in jaccardSimilarity/tokenOverlap but NOT in tokenize?
//   tokenize() is a general-purpose building block used by tests and other callers.
//   Normalization is a semantic layer that belongs at the comparison level.
//   Keeping tokenize() pure lets tests verify tokenization independently.

const MIN_TOKEN_LENGTH = 2;

// Stopwords that carry no semantic meaning in B2B company profile context.
// Two categories:
//   1. Common English function words
//   2. Professional modifier words — adjectives/nouns that describe HOW a service
//      is delivered but NOT what competitive category it belongs to.
//      e.g. "AI-Powered A/B Testing" and "A/B Testing" are the same competitive
//      category; "ai" and "powered" add no competitive information.
//      Removing these reduces Jaccard denominator noise.
const STOPWORDS = new Set([
  // Function words
  'a', 'an', 'the', 'and', 'or', 'of', 'for', 'in', 'to', 'at',
  'is', 'are', 'be', 'as', 'by', 'on', 'it', 'with', 'from',
  // Delivery modifiers (don't distinguish competitive category)
  'powered', 'driven', 'based', 'focused', 'led', 'first',
  'advanced', 'smart', 'intelligent', 'predictive', 'strategic',
  // Descriptor nouns (how work is packaged, not what category it falls in)
  'strategies', 'strategy', 'programs', 'program',
]);

// ── Semantic normalization map ───────────────────────────────────────────────
// Maps known B2B phrases → canonical tokens before tokenization.
// WHY longest-first? Prevents "conversion rate optimization" from being partially
// matched by "conversion optimization" first, leaving "rate" as a stray token.
// Canonical tokens use compact single/hyphen-free strings so tokenize() keeps them whole.
//
// How to read this: LEFT side = raw phrase user/AI might write; RIGHT = canonical token.
// When jaccardSimilarity sees "Experimentation" and "A/B Testing" in two separate
// specialty arrays, both normalize to 'abtesting', and the Jaccard goes from ~0 to 1.

const PHRASE_NORMALIZATIONS: [phrase: string, token: string][] = [
  // ── CRO cluster — all mean "improving conversion rates" ───────────────────
  ['conversion rate optimization', 'cro'],
  ['conversion rate optimisation', 'cro'],
  ['conversion rate testing', 'cro'],
  ['landing page optimization', 'cro'],
  ['landing page optimisation', 'cro'],
  ['conversion optimization', 'cro'],
  ['conversion optimisation', 'cro'],
  ['cro strategy', 'cro'],       // "CRO strategy" → just "cro" (strip descriptive modifier)
  ['cro consulting', 'cro'],
  ['cro support', 'cro'],
  ['cro management', 'cro'],

  // ── A/B testing cluster — all mean "running controlled experiments" ───────
  ['a/b test development', 'abtesting'],
  ['ab test development', 'abtesting'],
  ['a/b testing', 'abtesting'],
  ['ab testing', 'abtesting'],
  ['split testing', 'abtesting'],
  ['multivariate testing', 'abtesting'],
  ['multivariate optimisation', 'cro'],
  ['experimentation programs', 'abtesting'],  // "experimentation programs" → "abtesting"
  ['experimentation platform', 'abtesting'],
  ['experimentation strategy', 'abtesting'],
  ['ai-powered testing', 'abtesting'],        // "AI-Powered Testing" (operational) → canonical
  ['ai powered testing', 'abtesting'],

  // ── Single-word synonyms ─────────────────────────────────────────────────
  ['experimentation', 'abtesting'],
  ['experiments', 'abtesting'],

  // ── CRO ↔ A/B Testing cross-cluster ─────────────────────────────────────
  // WHY? "CRO" and "A/B Testing" compete for the same budget and are direct substitutes
  // in the competitive landscape. A "CRO Agency" IS a competitor to an A/B Testing Agency.
  // Mapping 'cro' → 'abtesting' means:
  //   "CRO Agency" → "abtesting Agency" → {abtesting, agency}
  //   "A/B Testing Agency" → "abtesting Agency" → {abtesting, agency}
  //   tokenOverlap = 1.0 — correct, they ARE the same competitive cluster.
  // WHY single-word and not multi-word phrase?
  //   'cro' → 'abtesting' works transitively in the single-pass loop:
  //   "cro strategy" first maps "cro strategy" → "cro", then "cro" → "abtesting" in the same pass.
  ['cro', 'abtesting'],

  // ── Spelling normalizations ───────────────────────────────────────────────
  ['e-commerce', 'ecommerce'],
  ['optimisation', 'optimization'],
  ['personalisation', 'personalization'],
];

// Pre-sorted once at module load (longest phrase first)
const SORTED_NORMS = PHRASE_NORMALIZATIONS.slice().sort((a, b) => b[0].length - a[0].length);

// Apply semantic normalization to a raw string before tokenization.
// Returns a string with known phrases replaced by their canonical equivalents.
export function normalizeText(text: string): string {
  let s = text.toLowerCase();
  for (const [phrase, token] of SORTED_NORMS) {
    if (s.includes(phrase)) {
      // Replace all occurrences
      s = s.split(phrase).join(` ${token} `);
    }
  }
  return s;
}

export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[\s,\/\-\+\&\(\)]+/)
      .map((t) => t.replace(/[^a-z0-9]/g, ''))
      .filter((t) => t.length >= MIN_TOKEN_LENGTH && !STOPWORDS.has(t)),
  );
}

// Jaccard similarity on two arrays of strings.
// Applies semantic normalization before tokenization.
// Each string is tokenized; all tokens from each array are merged into one set.
// Jaccard = |intersection| / |union|
export function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const setA = flatNormalizedTokenSet(a);
  const setB = flatNormalizedTokenSet(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

// Token overlap between two single strings. Returns |intersection| / |larger set|.
// Applies semantic normalization before tokenization.
// We use max(|A|, |B|) as denominator so the larger set penalises over-specificity.
export function tokenOverlap(a: string, b: string): number {
  if (!a || !b) return 0;
  const setA = tokenize(normalizeText(a));
  const setB = tokenize(normalizeText(b));
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  return intersection / Math.max(setA.size, setB.size);
}

// Industry match: token overlap > 0.5 (accounts for "Digital Marketing" vs "Marketing")
export function industryMatch(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return tokenOverlap(a, b) >= 0.5;
}

// Returns the shared canonical tokens between two string arrays — for reasoning generation.
export function sharedTokens(a: string[], b: string[]): string[] {
  const setA = flatNormalizedTokenSet(a);
  const setB = flatNormalizedTokenSet(b);
  return [...setA].filter((t) => setB.has(t));
}

function flatNormalizedTokenSet(arr: string[]): Set<string> {
  const result = new Set<string>();
  for (const s of arr) {
    for (const t of tokenize(normalizeText(s))) {
      result.add(t);
    }
  }
  return result;
}
