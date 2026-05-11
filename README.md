# Discovery Intelligence Engine

An AI-powered, fully local Discovery & Competitor Intelligence System built with Node.js, TypeScript, Playwright, Next.js, and SQLite. No paid AI APIs required — runs entirely on your machine.

## What It Does

| Capability | Description |
|------------|-------------|
| 🔍 Dynamic Discovery | Accept any natural-language query and discover relevant companies, brands, or businesses |
| 🕷️ Playwright Crawling | Headless browser crawling of real websites for deep data extraction |
| 🧠 Smart Extraction | Convert messy HTML into structured entities (name, services, tech stack, contacts) |
| ✅ AI Validation | Score, validate, and deduplicate results intelligently |
| 📊 Change Detection | Track changes to entities over time with full history |
| 🏆 Ranking Engine | Score entities by confidence, relevance, freshness, and completeness |
| 💾 Local Storage | SQLite database with full history, no cloud dependency |
| 📤 CSV/JSON Export | Export results at any time |
| 🖥️ Live UI | Real-time table interface with sorting, filtering, and live crawl logs |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Next.js Frontend (port 3000)             │
│  SearchBar → EntityTable → QueryHistory → LogPanel → Stats  │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP API
┌────────────────────────▼────────────────────────────────────┐
│                  Express API (port 3001)                      │
│  /queries  /entities  /crawl  /export                        │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│              Discovery Orchestrator                           │
│  QueryAnalyzer → SearchEngine → Crawler → Extractor          │
│  → Validator → DuplicateDetector → ChangeDetector → DB       │
└─────────────┬────────────────┬───────────────────────────────┘
              │                │
┌─────────────▼──┐    ┌────────▼──────────┐
│  Playwright    │    │  SQLite Database   │
│  Chromium      │    │  (Prisma ORM)      │
└────────────────┘    └───────────────────┘
```

## Project Structure

```
web-discovery-agent/
├── apps/
│   ├── web/                    # Next.js 14 frontend
│   │   └── src/
│   │       ├── app/            # App router pages
│   │       └── components/     # React components
│   └── api/                    # Express API server
│       └── src/
│           ├── routes/         # API route handlers
│           ├── services/       # Discovery orchestrator
│           └── scripts/        # CLI tools
├── packages/
│   ├── shared/                 # Shared TypeScript types & constants
│   ├── database/               # Prisma + SQLite client
│   ├── crawler/                # Playwright crawler & search engine
│   ├── extraction/             # Query analysis & entity extraction
│   ├── validation/             # Validation, dedup, change detection
│   └── ranking/                # Entity ranking engine
├── .claude/
│   └── skills/                 # Claude skill definitions
│       ├── competitor-analysis/
│       ├── ecommerce-discovery/
│       ├── local-business-discovery/
│       ├── website-analysis/
│       ├── ranking-engine/
│       ├── extraction-engine/
│       └── validation-engine/
├── data/                       # Local data storage
│   ├── discovery.db            # SQLite database (auto-created)
│   ├── snapshots/              # JSON snapshots
│   └── exports/                # CSV/JSON exports
├── .env                        # Environment variables
├── package.json                # Monorepo root
└── README.md
```

## Quick Start

### Prerequisites
- Node.js 18+
- npm 8+

### 1. Install Dependencies
```bash
cd web-discovery-agent
npm install
```

### 2. Install Playwright Browser
```bash
npx playwright install chromium
```

### 3. Setup Database
```bash
npm run db:push        # Create SQLite schema
npm run db:seed        # Add demo data
```

### 4. Start the System
```bash
# Terminal 1: Start API
npm run dev:api

# Terminal 2: Start Frontend
npm run dev:web
```

Open http://localhost:3000

### 5. Run a Discovery
In the browser, type any query:
- "Find competitors of brillmark.com"
- "Best Shopify CRO agencies"
- "Sports jersey manufacturers in Delhi"

Or run from CLI:
```bash
cd apps/api
npm run crawl "Find competitors of brillmark.com"
```

### 6. Run the Demo
```bash
npm run demo
```
Runs 4 example queries automatically and saves results.

## Available Commands

| Command | Description |
|---------|-------------|
| `npm run setup` | Full setup (install + db + playwright) |
| `npm run dev` | Start both API and frontend |
| `npm run dev:api` | Start API only (port 3001) |
| `npm run dev:web` | Start frontend only (port 3000) |
| `npm run demo` | Run 4 example discovery queries |
| `npm run crawl "query"` | Run single discovery from CLI |
| `npm run db:push` | Apply database schema |
| `npm run db:seed` | Seed demo data |
| `npm run db:studio` | Open Prisma Studio (DB viewer) |

## Database Schema

```sql
-- Core entities discovered
entities (id, name, domain, description, services, founders,
          linkedin, twitter, technologies, locations, emails, phones,
          confidenceScore, relevanceScore, isValid, source,
          firstSeen, lastSeen, createdAt, updatedAt)

-- User queries
queries (id, raw, intent, industry, entityType, location,
         keywords, objective, createdAt, updatedAt)

-- Query-Entity relationships
query_entities (queryId, entityId, rank, score)

-- Point-in-time snapshots
snapshots (id, entityId, data, hash, createdAt)

-- Field-level changes between snapshots
changes (id, entityId, snapshotId, field, oldValue, newValue,
         changeType, detectedAt)

-- Validation records
validations (id, entityId, validationType, passed, score, reason, createdAt)

-- Crawl activity logs
crawl_logs (id, queryId, url, status, statusCode, error,
            duration, entitiesFound, createdAt, updatedAt)
```

## Claude Skills System

The `.claude/skills/` directory contains structured skill definitions. Claude Code reads these as instructions for orchestrating discoveries.

### Available Skills

| Skill | When Used |
|-------|-----------|
| `competitor-analysis` | "competitors of X", "alternatives to X" |
| `ecommerce-discovery` | "best ecommerce", "Shopify stores" |
| `local-business-discovery` | "in Delhi", "near me" |
| `website-analysis` | Single domain analysis |
| `ranking-engine` | Scoring and ranking results |
| `extraction-engine` | Extracting structured data from HTML |
| `validation-engine` | Validating and deduplicating results |

## Example Queries

The system dynamically handles these (and many more):

```
Find competitors of brillmark.com
Best Shopify CRO agencies
Best ecommerce websites
Sports jersey manufacturers in Delhi
Best AI agencies
Newly launched toy brands
Shopify development agencies
CRO companies using Optimizely
Ecommerce brands with strong UX
Top marketing automation platforms
SaaS companies for email marketing
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/queries` | List all queries |
| POST | `/api/queries` | Analyze new query |
| GET | `/api/queries/:id` | Query details |
| GET | `/api/entities` | List entities (paginated, filterable) |
| GET | `/api/entities/:id` | Entity details with history |
| POST | `/api/crawl/run` | Start discovery crawl |
| GET | `/api/crawl/logs` | Crawl activity logs |
| GET | `/api/crawl/status` | Crawl statistics |
| GET | `/api/export/csv` | Export as CSV |
| GET | `/api/export/json` | Export as JSON |

## Frontend Features

- **Search Bar**: Natural language query input with example queries
- **Entity Table**: Sortable, filterable table with confidence score bars
- **Query History**: Sidebar with past queries and intent badges
- **Live Log Panel**: Real-time crawl activity feed
- **Stats Bar**: Total entities, crawl success rate, activity counts
- **CSV Export**: One-click export of all discovered entities
- **Pagination**: Navigate through large result sets
- **Auto-refresh**: Tables auto-update every 8 seconds

## Screenshots

> After running the system, results appear in the main table:

```
┌──────────────────────────────────────────────────────────────┐
│ Discovery Intelligence Engine                    ● Active     │
├──────────────────────────────────────────────────────────────┤
│ [Search query input...]                    [Discover]         │
│ Examples: Find competitors of brillmark.com | Best Shopify.. │
├──────────────────────────────────────────────────────────────┤
│ 23 Entities │ 89 Crawled │ 71 Success │ 79% Rate             │
├─────────────┬────────────────────────────────────────────────┤
│ Query       │ Name        Domain    Confidence  Last Seen    │
│ History     │─────────────────────────────────────────────── │
│             │ CXL         cxl.com   ████░ 87%  2024-01-15   │
│ competitor  │ Speero      speero.com████░ 82%  2024-01-15   │
│ analysis    │ GetUplift   getuplift ███░░ 71%  2024-01-15   │
└─────────────┴────────────────────────────────────────────────┘
```

## Configuration

Edit `.env` to configure:

```env
DATABASE_URL="file:./data/discovery.db"
PORT=3001
CRAWL_HEADLESS=true
CRAWL_TIMEOUT=30000
CRAWL_MAX_RETRIES=3
```

## License
MIT
