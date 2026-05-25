# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev                    # start Next.js dev server
pnpm build                  # production build
pnpm test                   # run tests in watch mode
pnpm test:run               # run all tests once
pnpm test:coverage          # run tests with coverage
pnpm tsc --noEmit           # type check
pnpm lint                   # ESLint

# Run a single test file
pnpm vitest run src/modules/context-extractor/tests/groq.analyzer.test.ts

# Prisma
pnpm prisma:generate        # regenerate Prisma client after schema changes
pnpm prisma:migrate         # run migrations in dev
pnpm prisma:migrate:deploy  # run migrations in production

# Playwright — must run once after install or version bump
pnpm exec playwright install chromium
```

## Environment

Copy `.env.example` to `.env`. Two variables are required:
- `DATABASE_URL` — PostgreSQL connection string
- `GROQ_API_KEY` — without this the Context Extractor returns 503 and the Groq discovery provider is disabled

## Architecture

This is a **Next.js 15 App Router** application implementing a 3-stage competitor discovery pipeline. The frontend (`src/components/CompetitorDiscoveryWidget.tsx`) calls the three API routes in sequence.

### Pipeline stages

**Stage 1 — Query Engine** (`/api/v1/query-engine`)
Accepts raw user input, normalizes it to a bare domain, and loads all previously discovered competitors from PostgreSQL as an exclusion list. Returns `normalizedDomain`, `exclusions[]`, and a `queryId` UUID.

**Stage 2 — Context Extractor** (`/api/v1/context-extractor`)
Crawls the target domain (Cheerio first, Playwright fallback for JS-heavy sites), extracts structured content via `ContentExtractor`, then calls Groq AI (`GroqAnalyzer`) to produce a `BusinessContext`: industry, niche, services, target audience, positioning. This context is passed to all discovery providers to prevent topic drift.

**Stage 3 — Discovery** (`/api/v1/discovery`)
Runs three providers in parallel via `DiscoveryService`:
- `GroqAIProvider` — Groq LLM asked to enumerate direct competitors given the business context
- `StubSearchProvider` — Playwright scrapes AlternativeTo for competitor slugs
- `ListicleExtractionProvider` — Playwright runs Yahoo searches for `"best X agencies"` queries, then Cheerio extracts domains from listicle article pages

Results flow through `ResultCollectorService` (normalize + deduplicate within run), then `DeduplicationEngineService` persists to PostgreSQL and classifies each domain as new vs. existing.

### Module layout

```
src/
  app/api/v1/          # Next.js route handlers (thin — delegate to modules)
  components/          # React client components (CompetitorDiscoveryWidget)
  lib/                 # Shared infra: logger (pino), prisma client, groq client, retry, errors
  modules/
    context-extractor/ # Crawl → extract → Groq AI → BusinessContext
    discovery/         # Provider orchestration + result collection
    deduplication/     # Persist to DB, new vs. existing classification
    query-engine/      # Input normalization, exclusion loading
    result-collector/  # Cross-provider dedup and normalization
  shared/domain/       # Shared normalizeDomain / validateDomain utilities
```

### Key conventions

**Server-only enforcement**: Classes that use Node.js APIs (Prisma, Playwright, Groq) call `assertServerContext(className)` in their constructors. Module barrel exports (`server.ts`) also import `server-only` so Next.js enforces this at build time.

**Structured logging**: Every module receives a `Logger` (pino) via constructor injection, created with `createLogger('module-name:component')`. Log contexts always include `queryId` and `domain`.

**Validation at boundaries**: Zod schemas validate all API inputs. AI responses are also validated against Zod schemas before use — malformed AI output falls back to low-confidence defaults rather than throwing.

**Error classes**: Domain errors extend `AppError` (`src/lib/errors.ts`) with a `code` string and HTTP `statusCode`. Providers never throw — they catch internally and return `[]`.

**Discovery providers** implement `IDiscoveryProvider` (`src/modules/discovery/providers/base/provider.interface.ts`) and are wired up in the route handler. Adding a provider means implementing the interface and appending to the `providers[]` array in the route.

**ListicleExtractionProvider data flow**: `BusinessContext` → `buildListicleQueries()` (query-builder) → Yahoo SERP via Playwright (page-extractor) → Cheerio domain extraction (domain-extractor) → filters + normalization → `ProviderResult[]`

### Database schema

Two tables: `competitors` (one row per unique domain, `DISCOVERED | VALIDATED_PASS | VALIDATED_FAIL`) and `discoveries` (one row per discovery event, linked by `competitorId`). The dedup engine creates the competitor row if new, updates `lastDiscoveredAt` if existing, and always appends a discovery row for history.

### Testing

Vitest with `environment: 'node'`. Tests live alongside modules in `tests/` subdirectories. Mocks are constructed inline — there is no shared test fixture infrastructure. Run a focused test with `pnpm vitest run <path>`.
