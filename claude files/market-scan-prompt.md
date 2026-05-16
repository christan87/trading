# Prompt for Claude Code — Market Scan Feature

---

## Prompt (copy this entire block into Claude Code):

```
Read CLAUDE.md in the project root. You are extending an existing application — do not create new infrastructure that duplicates what already exists.

## Context

All phases in CLAUDE.md (1A through 1D) have been completed and are working. The following services already exist and are functional:
- News Service (`src/lib/services/news.ts`) — Alpaca + Finnhub news aggregation
- Congress Service (`src/lib/services/congress.ts`) — congressional trade ingestion from Finnhub
- Strategy Engine (`src/lib/services/strategy-engine.ts`) — Claude-powered recommendations
- Risk Assessor (`src/lib/services/risk-assessor.ts`) — three-tier risk calculation
- Market Data Service (`src/lib/services/market-data.ts`) — Alpaca + Finnhub quotes
- Outcome Tracker (`src/lib/services/outcome-tracker.ts`) — recommendation outcome reconciliation
- BullMQ worker (`workers/background.ts`) — background job processing

The `Recommendation` model already exists with entry price, target, stop-loss, three-tier risk, snapshot, and outcome tracking.

## New feature: Market Scan

Build a Market Scan feature that proactively discovers stock and options opportunities based on political events, congressional trades, and government contract awards.

### How it works

The Market Scan is an event-driven discovery engine. Unlike the existing Strategy Engine (which analyzes a ticker the user already picked), the Market Scan finds tickers the user hasn't thought of yet.

**Scan triggers (implement all three):**

1. **Political event trigger** — When the News Service ingests an article categorized as "political", "regulatory", or "geopolitical" with a sentiment score, automatically run a scan to identify affected sectors and tickers. Use the existing News Service `ingest-news` job as the trigger point — add a post-ingestion hook that checks if any new articles match the political/regulatory/geopolitical categories, and if so, dispatches a `market-scan` BullMQ job.

2. **Congressional trade cluster trigger** — When the Congress Service detects 3+ members of Congress buying the same sector or ticker within a 30-day window, automatically trigger a scan on that sector. Use the existing `ingest-congress` daily job as the trigger — add a post-ingestion analysis step that detects clusters.

3. **Manual trigger** — User clicks "Scan Now" in the UI, optionally selecting a scan type (political events, congressional activity, or full scan).

**Scan universe:**
- Default: S&P 500 constituents (store the ticker list in a JSON file, update monthly)
- Extended: user's watchlist tickers + S&P 500
- The scan should NOT attempt to analyze all 8,000+ US equities — scope it to the S&P 500 universe for performance and API rate limit reasons

**Scan pipeline (for each trigger):**

Step 1: Identify affected sectors/industries from the triggering event using Claude Sonnet (e.g., "infrastructure bill passed" → Construction, Materials, Industrial sectors)

Step 2: Filter the S&P 500 universe to tickers in affected sectors (use Finnhub's company profile endpoint for sector/industry classification, cache in MongoDB with 30-day TTL)

Step 3: For each candidate ticker (max 20 per scan), fetch current price, 30-day price history, and recent news from the existing Market Data and News services

Step 4: Send batch to Claude Opus for analysis — ask Claude to rank the candidates by opportunity quality and assign each a structured scan result

**Scan result model (add to existing data models):**

```typescript
interface ScanResult {
  _id: ObjectId;
  userId: ObjectId;
  scanId: string;                    // groups results from the same scan
  triggerType: "political_event" | "congress_cluster" | "manual";
  triggerEventId: ObjectId | null;   // links to NewsEvent or CongressTrade cluster
  triggerSummary: string;            // human-readable: "Infrastructure bill H.R.1234 passed"
  symbol: string;
  companyName: string;
  sector: string;
  industry: string;

  // Entry price range (not a single price — accounts for volatility)
  entryRange: {
    min: number;                     // support level / ideal entry
    max: number;                     // resistance level / max acceptable entry
    currentPrice: number;            // price at scan time
    rationale: string;               // why this range (e.g., "min is 20-day SMA support at $142.30")
  };

  expectedImpact: "high" | "moderate" | "low";
  impactTimeframe: "days" | "weeks" | "months";
  direction: "bullish" | "bearish" | "neutral";
  rationale: string;                 // Claude's explanation of why this ticker is affected
  confidence: number;                // 0-100

  // Uses existing three-tier risk from risk-assessor.ts
  risk: Recommendation["risk"];      // reuse the same risk structure

  status: "new" | "viewed" | "promoted" | "dismissed";
  promotedToRecommendationId: ObjectId | null;  // if user promotes to a full recommendation
  createdAt: Date;
  expiresAt: Date;                   // scan results expire after 7 days
}
```

**"Promote to recommendation" action:**
When the user reviews a scan result and wants to act on it, they click "Analyze" which runs the full Strategy Engine on that ticker (reusing the existing strategy-engine.ts flow). This creates a proper Recommendation with full snapshot, entry/target/stop-loss, and outcome tracking. The ScanResult's `promotedToRecommendationId` links back to the generated Recommendation.

### UI

Add a new page at `src/app/scan/page.tsx`:
- Scan results displayed as cards grouped by scan event (trigger summary as header)
- Each card shows: ticker, company name, sector, entry range (min-max with current price indicator), expected impact badge, direction arrow, confidence gauge, risk label
- Filter by: trigger type, sector, direction, impact level
- Sort by: confidence (default), recency, sector
- Actions per card: "Analyze" (promotes to full recommendation), "Add to watchlist", "Dismiss"
- "Scan Now" button in the header with dropdown for scan type selection
- Show scan history (last 10 scans) with result counts

Add a scan results summary widget to the existing dashboard page showing the count of new/unreviewed scan results with a link to the full scan page.

### BullMQ jobs

Add to the existing worker:

| Job | Queue | Schedule | Description |
|-----|-------|----------|-------------|
| `market-scan` | analysis | Event-triggered + manual | Run scan pipeline for a given trigger |
| `scan-sector-classify` | ai | Sub-job of market-scan | Claude Sonnet call to identify affected sectors |
| `scan-candidate-analyze` | ai | Sub-job of market-scan | Claude Opus batch analysis of candidate tickers |
| `scan-cleanup` | maintenance | Daily at midnight | Delete expired scan results (older than 7 days) |

### Integration points (use existing services, do NOT duplicate)

- Market data: use `market-data.ts` for current prices and historical bars
- News context: use `news.ts` for recent articles on candidate tickers
- Congressional trades: use `congress.ts` for trade data on candidates
- Risk assessment: use `risk-assessor.ts` for three-tier risk calculation
- AI calls: follow the existing Claude API patterns (BullMQ queue, retry logic, prompt caching, JSON output schema)
- Fallback: when AI is unavailable (check `ai-fallback.ts` status), show scan results with Tier 1 risk only and flag that AI analysis is pending

### API rate limit budget

Each full scan consumes approximately:
- 1 Claude Sonnet call (sector classification)
- 1 Claude Opus batch call (candidate analysis, up to 20 tickers)
- 20-40 Finnhub REST calls (company profiles + quotes for candidates)
- 20-40 Alpaca REST calls (price history for candidates)

Limit to a maximum of 6 scans per day to stay within free-tier API budgets. Track scan count in Redis and reject manual scans that exceed the daily limit with a user-friendly message showing when the next scan will be available.

### Files to create

- `src/lib/services/market-scan.ts` — scan orchestration service
- `src/lib/db/models/scan-result.ts` — ScanResult model/interface
- `src/lib/queue/jobs/market-scan.ts` — BullMQ job handler
- `src/lib/prompts/scan-sectors.ts` — Sonnet prompt for sector classification
- `src/lib/prompts/scan-candidates.ts` — Opus prompt for candidate analysis
- `src/app/scan/page.tsx` — scan results page
- `src/components/scan/` — scan result cards, filters, scan history
- `src/data/sp500.json` — S&P 500 constituent list
- Update `src/app/dashboard/page.tsx` — add scan results summary widget
- Update `workers/background.ts` — register new job handlers

### Files to modify (extend, not replace)

- `src/lib/queue/jobs/` — add post-ingestion hooks to `ingest-news` and `ingest-congress` jobs
- `src/lib/services/news.ts` — add method to filter articles by political/regulatory category
- `src/lib/services/congress.ts` — add method to detect trade clusters (3+ members, same sector, 30 days)

Do NOT modify the existing Recommendation, Decision, Strategy, or other core models. The ScanResult is a new, separate entity that links to Recommendations via `promotedToRecommendationId`.

Build this feature following the coding standards in CLAUDE.md: TypeScript strict mode, server components by default, error boundaries, regulatory disclaimer on all AI-generated content.
```

---

## Notes on what changed from the original prompt

**Original:** "I have completed all phases in the CLAUD.md file"
**Improved:** Explicitly lists every existing service by filename so Claude Code knows what's already built and doesn't recreate it.

**Original:** "Efficiently scans the market based on major political change, bills passed, contracts given etc..."
**Improved:** Three concrete trigger mechanisms (political news → post-ingestion hook, congressional cluster detection, manual button), a defined scan universe (S&P 500, not "the market"), and a 4-step pipeline with specific API calls at each step.

**Original:** "Max min price entry point"
**Improved:** A structured `entryRange` object with `min` (support level), `max` (resistance level), `currentPrice`, and `rationale` explaining how the range was calculated.

**Original:** "I want the monthly ROI target to be adjustable"
**Removed entirely.** This already exists in the spec as `riskProfile.roiTargetMonthlyPct` (default 25, range 5-50) in the User model, and is implemented in the Settings page. Including it in the prompt would confuse Claude Code into thinking it needs to build something that already works.

**Added:** Rate limit budget (6 scans/day), file manifest (what to create vs. modify), explicit "do NOT duplicate" instructions, and the "promote to recommendation" workflow that connects scan results back into the existing recommendation/decision/outcome pipeline.
