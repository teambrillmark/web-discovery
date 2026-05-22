const MAX_CONTENT_CHARS = 8000;
const MIN_CRAWL_CONTENT_CHARS = 300;

export function cleanText(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/[^\x20-\x7E -￿]/g, '')
    .trim();
}

export function deduplicateLines(text: string): string {
  const seen = new Set<string>();
  return text
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed || seen.has(trimmed)) return false;
      seen.add(trimmed);
      return true;
    })
    .join('\n');
}

export function truncateToLimit(text: string, maxChars = MAX_CONTENT_CHARS): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '\n[content truncated]';
}

export function isSparseContent(text: string): boolean {
  return cleanText(text).length < MIN_CRAWL_CONTENT_CHARS;
}

export function buildContentForAI(
  title: string,
  metaDescription: string,
  headings: string[],
  heroText: string,
  servicesText: string,
  aboutText: string,
  navLabels: string[],
  bodyText: string,
): string {
  const sections: string[] = [];

  if (title) sections.push(`TITLE: ${title}`);
  if (metaDescription) sections.push(`META DESCRIPTION: ${metaDescription}`);
  if (navLabels.length) sections.push(`NAVIGATION: ${navLabels.join(' | ')}`);
  if (headings.length) sections.push(`HEADINGS:\n${headings.slice(0, 15).join('\n')}`);
  if (heroText) sections.push(`HERO SECTION:\n${heroText}`);
  if (servicesText) sections.push(`SERVICES SECTION:\n${servicesText}`);
  if (aboutText) sections.push(`ABOUT SECTION:\n${aboutText}`);
  if (bodyText) sections.push(`BODY TEXT:\n${bodyText}`);

  return truncateToLimit(sections.join('\n\n'));
}

export { MAX_CONTENT_CHARS, MIN_CRAWL_CONTENT_CHARS };
