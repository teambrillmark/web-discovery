# How the Discovery Intelligence Engine Works

A beginner-friendly guide to understanding every component of the system.

---

## Table of Contents
1. [How Discovery Works](#1-how-discovery-works)
2. [How Query Analysis Works](#2-how-query-analysis-works)
3. [How Search Works](#3-how-search-works)
4. [How Crawling Works](#4-how-crawling-works)
5. [How Entity Extraction Works](#5-how-entity-extraction-works)
6. [How AI Validation Works](#6-how-ai-validation-works)
7. [How Skills Work](#7-how-skills-work)
8. [How Duplicate Detection Works](#8-how-duplicate-detection-works)
9. [How Change Detection Works](#9-how-change-detection-works)
10. [How Ranking Works](#10-how-ranking-works)
11. [How Storage Works](#11-how-storage-works)
12. [How Freshness Detection Works](#12-how-freshness-detection-works)
13. [Full Flow Example](#13-full-flow-example)

---

## 1. How Discovery Works

**The Big Picture:**

When you type "Find competitors of brillmark.com", the system:
1. Understands what you're asking (query analysis)
2. Searches the web (Playwright + Google/Bing)
3. Visits each result page (Playwright crawler)
4. Extracts structured data from each page
5. Validates and scores each entity
6. Saves to database
7. Shows results in the UI

Think of it like a very smart research assistant that:
- Reads your question
- Googles relevant terms
- Visits each website
- Takes notes about each company
- Filters out irrelevant ones
- Organizes results by quality

---

## 2. How Query Analysis Works

**File:** `packages/extraction/src/query-analyzer.ts`

The QueryAnalyzer converts a raw text query into a structured object.

**Input:** `"Find competitors of brillmark.com"`

**Output:**
```json
{
  "raw": "Find competitors of brillmark.com",
  "intent": "competitor_analysis",
  "industry": "cro_agency",
  "entityType": "company",
  "location": null,
  "keywords": ["competitors", "brillmark", "cro", "shopify"],
  "objective": "Discover direct competitors in CRO space"
}
```

**How it detects intent:**
- If query contains "competitor" → `competitor_analysis`
- If query contains "agency" → `agency_search`
- If query contains a city name → `local_business_search`
- If query contains "product" → `product_discovery`

**How it detects industry:**
- Scans for industry keywords: "cro", "shopify", "ai", "marketing"
- Maps to standard industry codes

**Why this matters:** The intent and industry guide WHICH search queries to generate and WHAT to look for during crawling.

---

## 3. How Search Works

**File:** `packages/crawler/src/search-engine.ts`

The SearchEngine uses Playwright to control a real Chrome browser and scrape search results.

**Why Playwright instead of APIs?**
- No paid API keys needed
- Gets real search results
- Can handle JavaScript-rendered pages
- Mimics real user behavior

**How it works:**
1. Opens a headless Chrome browser
2. Navigates to Google/Bing/DuckDuckGo
3. Waits for results to load
4. Extracts URLs, titles, and snippets from result elements
5. Returns list of `SearchResult` objects

**Generated search queries for "competitors of brillmark.com":**
```
"competitors of brillmark.com"
"alternatives to brillmark.com"
"sites like brillmark.com"
"best cro agency companies"
"top cro agency agencies"
```

Multiple queries = more diverse results = better discovery coverage.

---

## 4. How Crawling Works

**File:** `packages/crawler/src/crawler.ts`

The Crawler visits each discovered URL and extracts page data.

**Step by step:**
1. Launches Chrome (headless = invisible)
2. Opens the URL
3. Waits for the page to load
4. Blocks images/videos/fonts (faster!)
5. Extracts HTML, metadata, links
6. Returns `PageData` object

**What gets extracted:**
- Page title and meta description
- All headings (H1, H2, H3)
- All links (internal + external)
- Email addresses (regex)
- Phone numbers (regex)
- Social media links
- Technologies (scanning HTML for signatures)

**Retry logic:**
- If a page fails, retries up to 3 times
- Waits 2s, then 4s, then 6s between retries
- Returns failed status if all retries fail

**Resource blocking:**
Blocks PNG/JPG/GIF/fonts/videos to load pages 3-5x faster. We only need text content.

---

## 5. How Entity Extraction Works

**File:** `packages/extraction/src/entity-extractor.ts`

Converts raw page data into a structured `CompanyEntity`.

**Company Name Extraction Priority:**
1. `og:title` tag (most reliable, cleaned)
2. First `<h1>` heading (if < 60 chars)
3. Page `<title>` (cleaned, removing " - Company" suffixes)
4. Domain name (fallback: "brillmark" → "Brillmark")

**Description Extraction:**
1. `meta[name="description"]` tag
2. `og:description` tag
3. First paragraph with > 50 characters

**Services Detection:**
Scans body text for 20+ service keywords:
- "A/B Testing" → found if "a/b test" appears
- "CRO" → found if "conversion rate optimization" appears
- etc.

**Technology Detection:**
Scans HTML source for fingerprints:
```
"cdn.shopify.com" → Shopify detected
"cdn.optimizely.com" → Optimizely detected
"static.hotjar.com" → Hotjar detected
```

This tells us what tools a company uses, which is valuable competitive intelligence.

---

## 6. How AI Validation Works

**File:** `packages/validation/src/validator.ts`

Every extracted entity goes through validation before being saved.

**Stage 1: Hard Filters (immediate reject)**
- Is the domain Google, Facebook, YouTube, etc.? → REJECT
- Does the name/description contain spam keywords? → REJECT
- Is the name too short (< 2 chars)? → REJECT
- Is the domain malformed? → REJECT

**Stage 2: Confidence Scoring**

Calculates a 0-1 score based on what data we found:
```
name present:        +15%
valid domain:        +15%
description > 50ch:  +15%
services found:      +15%
technologies found:  +10%
linkedin found:      +10%
email found:         +10%
location found:      +10%
                     ────
MAX POSSIBLE:        100%
```

**Stage 3: Relevance Scoring**

How relevant is this entity to the original query?
```
keyword overlap:   50% weight
industry match:    30% weight
location match:    20% weight
```

If you searched for "CRO agencies" and the entity's text mentions "cro", "conversion", "optimization" → high relevance.

**Final Decision:**
- Confidence < 0.2 → REJECT
- Relevance < 0.1 → REJECT
- Otherwise → ACCEPT with scores attached

---

## 7. How Skills Work

**Directory:** `.claude/skills/`

Skills are structured Markdown files that define HOW Claude should approach different types of discoveries.

**What a skill contains:**
- **Purpose**: What this skill does
- **Trigger**: When to use it
- **Workflow**: Step-by-step process
- **Extraction Schema**: What data to look for
- **Validation Rules**: What makes a result valid
- **Examples**: Sample inputs and outputs

**How skills are selected:**
```
Query: "Find competitors of brillmark.com"
→ Contains "competitors" → Select competitor-analysis skill
→ Skill defines: search strategies, validation rules, output format
→ System follows skill's workflow
```

**Available skills:**
1. `competitor-analysis` — direct competitor discovery
2. `ecommerce-discovery` — finding online stores
3. `local-business-discovery` — location-based search
4. `website-analysis` — deep single-site analysis
5. `ranking-engine` — scoring formulas
6. `extraction-engine` — data extraction rules
7. `validation-engine` — quality filters

**Creating a new skill:**
Just add a new directory with a `SKILL.md` file following the same structure. The system picks it up automatically.

---

## 8. How Duplicate Detection Works

**File:** `packages/validation/src/duplicate-detector.ts`

Prevents the same company from appearing multiple times.

**Method 1: Domain Normalization**
- `www.brillmark.com` = `brillmark.com`
- `BRILLMARK.COM` = `brillmark.com`
- If same normalized domain seen → SKIP

**Method 2: Name Similarity (Levenshtein Distance)**
- Compares character-by-character edit distance
- "BrillMark" vs "Brillmark" → 85%+ similar → SAME
- "Speero" vs "Sphere" → 60% similar → DIFFERENT

The Levenshtein algorithm counts how many single-character edits (insertions, deletions, substitutions) are needed to change one string to another.

---

## 9. How Change Detection Works

**File:** `packages/validation/src/change-detector.ts`

Tracks what changed about an entity between crawls.

**How it works:**
1. When an entity is first saved, a `snapshot` is created (JSON copy of all fields + MD5 hash)
2. Next time the same domain is crawled, a new snapshot is prepared
3. The MD5 hashes are compared
4. If hashes differ → field-by-field diff is computed
5. Each changed field is saved as a `Change` record

**Example:**
```
Old snapshot: { services: ["CRO", "A/B Testing"] }
New snapshot: { services: ["CRO", "A/B Testing", "Shopify Optimization"] }

Change detected:
  field: "services"
  changeType: "modified"
  oldValue: '["CRO","A/B Testing"]'
  newValue: '["CRO","A/B Testing","Shopify Optimization"]'
```

This lets you see when companies add new services, change technologies, or update their descriptions.

---

## 10. How Ranking Works

**File:** `packages/ranking/src/ranking-engine.ts`

Sorts entities so the most relevant and trustworthy appear first.

**Scoring formula:**
```
score = confidence × 0.35
      + relevance  × 0.30
      + freshness  × 0.20
      + completeness × 0.15
      + (isNew ? 0.10 : 0)
```

**Why freshness matters:**
Recently crawled data is more reliable than old data. An entity crawled today gets freshness = 1.0; one crawled a month ago gets 0.1.

**Why new entity bonus:**
Prioritizes newly discovered entities so you always surface fresh results, not just the same old seed data.

**The ranking assigns each entity a rank number (1, 2, 3...)** and you can sort by any field in the UI.

---

## 11. How Storage Works

**Database:** SQLite (a single file at `data/discovery.db`)

SQLite was chosen because:
- No server required (it's just a file)
- Fully local, no cloud dependency
- Fast enough for thousands of entities
- Prisma ORM provides type-safe queries

**Key tables:**

| Table | Purpose |
|-------|---------|
| `entities` | All discovered companies/businesses |
| `queries` | Every discovery query run |
| `query_entities` | Which entities belong to which query |
| `snapshots` | Point-in-time copies of entity data |
| `changes` | Field-level change records |
| `validations` | Validation results for each entity |
| `crawl_logs` | Log of every URL crawled |

**JSON fields in SQLite:**
Since SQLite doesn't have native array/object types, fields like `services`, `technologies`, `emails` are stored as JSON strings:
```sql
services = '["CRO","A/B Testing","Shopify"]'
```
The API parses these before sending to the frontend.

---

## 12. How Freshness Detection Works

Freshness is calculated from `lastSeen` timestamp:

| Time Since Last Seen | Freshness Score |
|---------------------|-----------------|
| < 1 hour | 1.0 (100%) |
| < 24 hours | 0.9 (90%) |
| < 3 days | 0.7 (70%) |
| < 1 week | 0.5 (50%) |
| < 1 month | 0.3 (30%) |
| > 1 month | 0.1 (10%) |

Every crawl updates `lastSeen` for found entities. The ranking engine uses this to push recently-verified entities higher in results.

**New entity detection:**
If `firstSeen` is within the last 48 hours → entity is "new" → gets +0.10 bonus in ranking.

---

## 13. Full Flow Example

**Query:** "Find competitors of brillmark.com"

```
User types query in SearchBar
    ↓
POST /api/queries { raw: "Find competitors of brillmark.com" }
    ↓
QueryAnalyzer.analyze()
    intent: "competitor_analysis"
    industry: "cro_agency"
    keywords: ["cro", "shopify", "competitors"]
    ↓
POST /api/crawl/run { queryId, raw }
    ↓
DiscoveryOrchestrator.run()
    ↓
Generate search queries:
    "competitors of brillmark.com"
    "alternatives to brillmark.com"
    "best cro agency companies"
    ↓
SearchEngine.search() × 3 queries
    → 24 URLs collected
    ↓
Filter blocked domains (Google, Facebook...)
    → 18 URLs remaining
    ↓
Crawler.crawlPage() × 18 pages (3 concurrent)
    ↓
For each page:
    EntityExtractor.extractCompany()
    Validator.validate()
    → 11 pass validation, 7 rejected
    DuplicateDetector.isDuplicate()
    → 2 duplicates removed, 9 unique
    ↓
saveEntity() for each:
    Check existing → create/update
    ChangeDetector.detect() → save changes
    Create snapshot
    Link to query
    ↓
Database updated with 9 new entities
    ↓
Frontend auto-refreshes every 8s
    → Table shows results
    → Log panel shows crawl activity
    ↓
User sees companies like:
    cxl.com          | Confidence: 87% | Services: CRO, Training
    speero.com       | Confidence: 82% | Services: CRO, Experimentation
    experimentzone.com | Confidence: 74% | Services: CRO, A/B Testing
```

Total time: approximately 2-5 minutes depending on network and page complexity.
