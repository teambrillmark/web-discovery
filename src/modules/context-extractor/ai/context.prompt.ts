export function buildContextPrompt(domain: string, extractedContent: string): string {
  return `You are a business intelligence analyst. Analyze the following website content and extract structured business context.

WEBSITE DOMAIN: ${domain}

EXTRACTED CONTENT:
${extractedContent}

Return ONLY valid JSON matching this exact structure. No extra text, no markdown fences.

{
  "companyType": "one of: Agency | SaaS | Marketplace | eCommerce Brand | Media | Consulting | Tool | Platform | Other",
  "industry": "the primary industry (e.g. eCommerce, FinTech, Healthcare, Marketing)",
  "niche": "specific niche within the industry (e.g. Shopify CRO, B2B SaaS analytics)",
  "services": ["list of specific services explicitly mentioned, max 10"],
  "targetAudience": ["list of target customer segments explicitly mentioned, max 5"],
  "positioningSummary": "1-2 sentence summary of how the company positions itself",
  "extractedContentSummary": "1 sentence describing the quality/completeness of extracted content",
  "confidence": "high if 4+ fields clearly supported by content, medium if 2-3 fields supported, low if content is sparse or unclear"
}

Rules:
- Only include services that are explicitly mentioned or strongly implied by the content.
- Never fabricate services, audiences, or industries not present in the content.
- confidence must reflect how much evidence the content provides, not how complete the JSON is.
- If content is sparse, set confidence to "low" and populate what you can.`;
}
