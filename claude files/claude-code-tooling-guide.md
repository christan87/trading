# Claude Code Tooling Guide — Trading Assistant App

> **This document tells you what to install and configure before running Claude Code on this project.** Follow the setup section first, then feed the Claude Code prompt at the bottom.

---

## 1. MCP Servers

MCP servers give Claude Code direct access to external tools and data during development. Configure these in the project's `.mcp.json` file so they're shared across the team.

### Required MCP Servers

**Alpaca Trading API** — Direct access to brokerage, market data, and options from Claude Code's session. Claude Code can query live market data, test order placement, and validate API responses without you writing wrapper code first.

```bash
# Install via Claude Code CLI
claude mcp add alpaca \
  --transport stdio \
  --env ALPACA_API_KEY=YOUR_PAPER_API_KEY \
  --env ALPACA_SECRET_KEY=YOUR_PAPER_SECRET_KEY \
  --env ALPACA_PAPER_TRADE=True \
  -- uvx alpaca-mcp-server
```

Why: Alpaca's official MCP Server v2 provides 61 tool endpoints covering account info, order placement, options chains, market data, and news. Claude Code can use these tools to validate your Portfolio Service, Market Data Service, and order flows against real API responses during development. It eliminates the "write code, run it, check the response, fix, repeat" loop — Claude Code sees the real API shape directly.

**Sequential Thinking** — Structured reasoning for complex architectural decisions. Essential for the Strategy Engine's prompt design, risk assessment logic, and data model relationships.

```bash
claude mcp add sequential-thinking \
  --transport stdio \
  -- npx -y @modelcontextprotocol/server-sequential-thinking
```

Why: The Strategy Engine, three-tier risk assessor, and Market Scan pipeline involve multi-step reasoning across multiple data sources. Sequential Thinking forces Claude Code to break these down methodically rather than generating a monolithic implementation that misses edge cases. Use it when building the scan pipeline, outcome reconciliation logic, and SM-2 spaced repetition algorithm.

**GitHub** — Repository awareness for PR workflows, issue tracking, and code review during development.

```bash
claude mcp add --transport http github \
  https://api.githubcopilot.com/mcp \
  --header "Authorization: Bearer YOUR_GITHUB_PAT"
```

Why: As the project grows, Claude Code can create issues for discovered bugs, review PRs, and understand the repo structure. Especially useful when multiple features are in development simultaneously.

**Context7** — Live documentation lookup. Fetches current docs for libraries instead of relying on training data.

```bash
claude mcp add context7 \
  --transport stdio \
  -- npx -y @upstash/context7-mcp
```

Why: Your stack includes Next.js 15 (App Router), Upstash Redis, BullMQ, NextAuth.js, and Alpaca's API — all of which have had breaking changes in 2025-2026. Context7 ensures Claude Code references the current API surface, not stale training data. Critical for NextAuth.js v5 configuration (which differs substantially from v4) and BullMQ's worker API.

### Optional MCP Servers (add when needed)

**MongoDB** — Direct database access for schema validation and query testing.

```bash
claude mcp add mongodb \
  --transport stdio \
  -- npx -y @modelcontextprotocol/server-postgres  # use mongo equivalent
  # Or use the community MongoDB MCP server:
  # npx -y mongodb-mcp-server --connectionString "mongodb+srv://..."
```

When to add: During Phase 1B when building data models and indexes. Claude Code can validate that queries perform as expected and indexes are being used.

**Playwright** — Browser automation for testing the dashboard UI.

```bash
claude mcp add playwright \
  --transport stdio \
  -- npx -y @anthropic/mcp-server-playwright
```

When to add: During Phase 1B-1C when building the dashboard and strategy console. Claude Code can visually verify that real-time quote updates render correctly and that the OAuth flow works end-to-end.

### Project `.mcp.json` Configuration

Create this file in the project root. Claude Code reads it automatically on session start.

```json
{
  "mcpServers": {
    "alpaca": {
      "type": "stdio",
      "command": "uvx",
      "args": ["alpaca-mcp-server"],
      "env": {
        "ALPACA_API_KEY": "${ALPACA_API_KEY}",
        "ALPACA_SECRET_KEY": "${ALPACA_SECRET_KEY}",
        "ALPACA_PAPER_TRADE": "True"
      }
    },
    "sequential-thinking": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
    },
    "context7": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"]
    }
  }
}
```

Note: GitHub MCP uses HTTP transport with personal credentials — configure it at user scope (`--scope user`), not in the project `.mcp.json`, so you don't commit your PAT.

---

## 2. Claude Code Custom Instructions

Beyond the `CLAUDE.md` spec file, add these custom rules to `.claude/settings.json` to shape Claude Code's behavior across all sessions.

### `.claude/settings.json`

```json
{
  "permissions": {
    "allow": [
      "Read",
      "Write",
      "Bash(npm *)",
      "Bash(npx *)",
      "Bash(node *)",
      "Bash(mongosh *)",
      "Bash(curl *)",
      "Bash(git *)"
    ],
    "deny": [
      "Bash(rm -rf /*)"
    ]
  }
}
```

### `.claude/rules/trading-app.md`

Create this rules file — it loads automatically on every session and applies project-wide constraints:

```markdown
# Trading Assistant — Claude Code Rules

## Regulatory
- Every AI-generated recommendation MUST display the disclaimer: "This is an AI-generated analysis for informational purposes only. It is not investment advice."
- Never implement auto-execute trade functionality. All orders require explicit user confirmation via a button click.
- Never use language like "guaranteed", "proven", or "will make money" in any AI output, UI copy, or code comments.

## Architecture
- This is a monorepo. All code lives in a single Next.js project. Do not create separate microservices or Docker containers.
- All Claude API calls go through BullMQ jobs. Never call the Claude API in the synchronous request path.
- All external data injected into Claude prompts must be wrapped in XML tags (<price_data>, <news>, etc.) with the system prompt instructing Claude to treat them as untrusted data.
- Use existing services before creating new ones. Check src/lib/services/ first.

## Data
- All monetary calculations use integer cents to avoid floating-point errors.
- Recommendation snapshots are immutable — never update the snapshot field after creation.
- Congressional trade data and news articles must never be used as the sole basis for a recommendation. They are supplementary signals.

## Security
- Never log API keys, OAuth tokens, or encrypted values.
- All Alpaca API calls go through server-side API routes. Never expose keys in frontend code.
- Encrypt OAuth tokens with AES-256-GCM before storing in MongoDB.

## Code Style
- TypeScript strict mode. No `any` types except when parsing external API responses (and add a comment explaining why).
- Server components by default. Use "use client" only for interactive elements.
- Error boundaries on every page-level component.
- Prefer named exports over default exports.
- Use Zod for runtime validation of all external API responses and Claude API outputs.

## Testing
- Unit tests required for: risk-assessor.ts (Tier 1 rules engine), learning.ts (SM-2 algorithm), encryption.ts, rate-limiter.ts.
- Integration tests required for: Alpaca OAuth flow, BullMQ job retry/dead-letter behavior.
- Use Vitest, not Jest.

## AI Calls
- Use claude-opus-4-5 only for strategy recommendations and market scan analysis.
- Use claude-sonnet-4-5 for news summarization, sector classification, and learning card generation.
- Always use Anthropic prompt caching for the system prompt.
- All Claude responses must be JSON with a Zod-validated schema.
```

---

## 3. Prompts to Feed Claude Code

Use these prompts in sequence. Each one is a self-contained Claude Code session. Start a new session for each phase.

### Session 1: Project Initialization

```
Read CLAUDE.md in this directory. Initialize the project:

1. Create the Next.js 15 project with App Router, TypeScript strict mode, Tailwind CSS
2. Set up the project structure exactly as specified in CLAUDE.md
3. Create .env.local.example with all required environment variables
4. Install dependencies: next, react, mongoose, ioredis, bullmq, socket.io, @anthropic-ai/sdk, zod, next-auth
5. Set up MongoDB connection utility at src/lib/db/mongodb.ts
6. Set up Redis client at src/lib/utils/redis.ts
7. Set up encryption utility at src/lib/utils/encryption.ts using AES-256-GCM
8. Create all TypeScript interfaces from the Data Models section of CLAUDE.md in src/lib/db/models/
9. Set up the .mcp.json file for project MCP servers

Do not build any UI yet. This session is infrastructure only. Run type-check after setup.
```

### Session 2: Brokerage Connection

```
Read CLAUDE.md. Phase 1B, Feature 1: Brokerage Connection.

Use the Alpaca MCP server to explore the API shape before writing wrapper code. Then build:

1. NextAuth.js custom provider for Alpaca OAuth2 in src/app/api/auth/[...nextauth]/
2. Portfolio Service at src/lib/services/portfolio.ts wrapping Alpaca Trading API (account, positions, orders)
3. API routes at src/app/api/alpaca/ for account info, positions, and order placement
4. Position sync: polling every 30 seconds using BullMQ scheduled job
5. Order placement supports: market, limit, stop, stop_limit for both equities and options

Test the OAuth flow end-to-end with Alpaca paper trading. Validate that positions sync correctly using the Alpaca MCP server to compare.
```

### Session 3: Market Data + Dashboard

```
Read CLAUDE.md. Phase 1B, Features 2: Real-time quotes and dashboard.

Build:
1. Market Data Service at src/lib/services/market-data.ts — WebSocket consumer for Alpaca, REST fallback for Finnhub
2. Redis pub/sub for broadcasting quotes to connected clients
3. SSE endpoint at src/app/api/quotes/stream/ for real-time quote delivery
4. Dashboard page at src/app/dashboard/page.tsx with:
   - Account summary card (balance, equity, buying power)
   - Positions table with live P&L (server component for initial load, client component for real-time updates)
   - Watchlist management (add/remove tickers, persisted in MongoDB)
   - Price chart using Recharts (intraday + daily views)
5. Options chain viewer component
6. Price snapshot persistence to MongoDB time-series collection every 60 seconds

Use Context7 MCP to fetch current Recharts and Next.js App Router docs before building components.
```

### Session 4: AI Fallback + Risk Assessor

```
Read CLAUDE.md. Features 6 and 3 (partial): AI Fallback system and Tier 1 Risk Assessor.

Build these BEFORE the Strategy Engine so the degradation system is in place from the start:

1. AiFallbackManager at src/lib/services/ai-fallback.ts:
   - Monitor Claude API health (last 10 call latencies + error rates in Redis)
   - getAiStatus() returns "available" | "degraded" | "unavailable"
   - Auto-transition logic: >50% failures in 10 min → degraded, >90% in 30 min → unavailable
   - React context provider <AiStatusProvider> for conditional rendering

2. Risk Assessor Tier 1 (best practices, rules-based) at src/lib/services/risk-assessor.ts:
   - Pure rules engine, no AI dependency
   - Factors: earnings proximity, VIX level, position size %, DTE for options, volume, SMA trend
   - Scoring: sum factors, normalize to 1-10 scale
   - Must work identically whether AI is available or not
   - Unit tests for every rule and the normalization logic

Use sequential-thinking MCP server to reason through the risk factor weights and edge cases.
```

### Session 5: Strategy Engine

```
Read CLAUDE.md. Feature 3: Strategy Engine.

Build:
1. News Service at src/lib/services/news.ts — aggregate from Alpaca + Finnhub, store in MongoDB
2. Congress Service at src/lib/services/congress.ts — Finnhub congressional trades, daily ingestion
3. Strategy Engine at src/lib/services/strategy-engine.ts:
   - Gather context: price data (Market Data Service), news (News Service), congress trades (Congress Service), macro (FRED)
   - Construct Claude prompt with XML-delimited data blocks
   - System prompt with JSON output schema and prompt caching
   - BullMQ job for Claude API calls (30s timeout, 3 retries, exponential backoff, dead-letter queue)
4. Risk Assessor Tier 2 (data-driven, Claude) + Tier 3 (combined weighted)
5. Recommendation snapshot: capture ALL inputs into the immutable snapshot field
6. Strategy Console page at src/app/strategy/page.tsx:
   - Ticker input + "Analyze" button
   - Recommendation card: entry/target/stop, three risk gauges, rationale, confidence
   - Accept/Dismiss buttons
   - When AI unavailable: show Research Workbench (manual evaluation template)

Design the Claude prompt template carefully. Use sequential-thinking to iterate on the prompt structure. Test with 3 different tickers and timeframes.
```

### Session 6: Decision Log + Outcome Tracking

```
Read CLAUDE.md. Feature 4: Decision Log with Outcome Tracking.

Build:
1. Decision log CRUD at src/app/api/decisions/
2. Outcome Tracker at src/lib/services/outcome-tracker.ts:
   - BullMQ job running hourly during market hours
   - For each tracking recommendation: fetch current price, add checkpoint, check target/stop-loss
   - Resolution logic: target hit → success, stop hit → failure, timeframe expired → actual return
   - Optional Claude Sonnet post-mortem on resolved recommendations
3. Decision log page at src/app/decisions/page.tsx:
   - Table with filters (ticker, date range, outcome)
   - Summary stats (win rate, avg return, sample size) — only show aggregate stats when 30+ closed decisions
   - Snapshot comparison view: side-by-side "what we thought" vs "what happened"
4. Options tracking at src/components/dashboard/options-tracker.tsx:
   - Contract details, Greeks display, DTE countdown, breakeven visualization
   - Exit trigger alerts when positions hit targets
```

### Session 7: Tips + Learning Mode

```
Read CLAUDE.md. Feature 7: Tips and Learning Mode.

Build:
1. Tips content data at src/data/tips/ — JSON files organized by strategy type
   - Create 15-20 tips covering: momentum, mean reversion, options basics, risk management
   - Each tip: id, strategyType, title, content (markdown), relatedConcepts, difficulty
2. Tips panel component (collapsible sidebar) — contextual to current strategy view
3. Learning card generator — each tip produces 2-3 quiz questions
4. SM-2 spaced repetition engine at src/lib/services/learning.ts:
   - Full SM-2 algorithm with difficulty → quality score mapping from CLAUDE.md
   - nextReviewDate calculation
   - Unit tests covering all 5 difficulty levels and edge cases (ease factor floor at 1.3, interval reset)
5. Quiz modal component — MC (4 options) and T/F, difficulty rating after answer
6. Learning mode page at src/app/learning/page.tsx:
   - Cards due today, streak tracker, mastery percentage
   - Quiz frequency setting (every 30 min / 1 hr / per session)
7. Toggle in settings for tips on/off and learning mode on/off
```

### Session 8: Market Scan (from market-scan-prompt.md)

```
[Paste the full prompt from market-scan-prompt.md here]
```

---

## 4. Development Workflow Tips

### How to use MCP servers effectively during development

**Alpaca MCP for API validation:** Before writing any Alpaca API wrapper code, ask Claude Code to "use the Alpaca MCP tools to get account info and list positions." This lets Claude Code see the exact API response shape and build your TypeScript interfaces directly from real data.

**Sequential Thinking for complex logic:** For the risk assessor, SM-2 algorithm, and scan pipeline, start with: "Use sequential thinking to reason through the implementation of [feature]. Consider edge cases, failure modes, and performance implications before writing code."

**Context7 for dependency docs:** Before any session that uses a library, ask: "Use Context7 to fetch the current documentation for [next-auth@5 / bullmq / recharts / @anthropic-ai/sdk]." This prevents Claude Code from using deprecated APIs.

### Session management

Start a fresh Claude Code session for each phase listed above. Long sessions accumulate stale context and cause drift from the spec. If a session exceeds 30 minutes of active work, consider splitting the remaining tasks into a new session.

After each session, run:
```bash
npm run typecheck    # catch type errors
npm run lint         # style consistency
npm run test         # unit test suite
```

### When to use extended thinking

For these specific tasks, ask Claude Code to think deeply before generating code:
- Designing the Claude prompt template for the Strategy Engine
- Implementing the three-tier risk assessment weighting logic
- Designing the scan pipeline's sector classification prompt
- Resolving circular dependency issues between services

Prompt: "Think carefully about this before writing code. Use sequential thinking if available."

---

## 5. Cost Budget for Development

During active development, expect these costs:

| Service | Development Usage | Monthly Cost |
|---------|------------------|-------------|
| Claude Code (your sessions) | Covered by your Claude plan | $0-200 depending on plan |
| Claude API (strategy engine testing) | ~50 Opus + ~200 Sonnet calls during dev | ~$15 |
| Alpaca | Paper trading, free tier | $0 |
| Finnhub | Free tier, 60 req/min | $0 |
| FRED | Free, 120 req/min | $0 |
| Upstash Redis | Free tier, 500K commands | $0 |
| MongoDB Atlas | Free tier (M0, 512MB) | $0 |
| **Total development cost** | | **~$15 + your Claude plan** |

---

## Quick Start Checklist

Before launching Claude Code:

- [ ] Place `CLAUDE.md` in the project root
- [ ] Place `.mcp.json` in the project root (from section 1)
- [ ] Create `.claude/rules/trading-app.md` (from section 2)
- [ ] Set environment variables: `ALPACA_API_KEY`, `ALPACA_SECRET_KEY`, `FINNHUB_API_KEY`, `FRED_API_KEY`, `ANTHROPIC_API_KEY`, `ENCRYPTION_KEY`, `MONGODB_URI`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `NEXTAUTH_SECRET`
- [ ] Configure GitHub MCP at user scope: `claude mcp add --transport http --scope user github https://api.githubcopilot.com/mcp --header "Authorization: Bearer YOUR_PAT"`
- [ ] Install prerequisites: Node.js 20+, Python 3.10+ (for Alpaca MCP), uv (for Alpaca MCP), Docker (optional)
- [ ] Create an Alpaca paper trading account at https://app.alpaca.markets/signup
- [ ] Create free API keys at: Finnhub (finnhub.io), FRED (fred.stlouisfed.org), Anthropic (console.anthropic.com)

Then start Claude Code and run Session 1.
