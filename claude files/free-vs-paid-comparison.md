# Free vs. Paid Service Comparison — Trading Assistant App

**Companion to:** Trading Assistant Technical Specification v1.0  
**Date:** May 13, 2026

---

## Overview

The original specification recommends approximately **$325–450/month** in paid services (Alpaca Algo Trader Plus $99, Benzinga $99, Polygon.io $199, Quiver Quantitative $25, plus Claude API ~$25–50). This document evaluates free alternatives for each service, what you give up by using them, and recommends a tiered approach so you can start at $0 and scale spending as the app proves its value.

---

## 1. Market Data API

### Paid: Alpaca Algo Trader Plus — $99/month

Full consolidated tape from CTA/UTP (100% of US equity market volume), full OPRA options data, WebSocket streaming, 200 requests/minute on trading endpoints. This is the gold standard for a trading app: every exchange, every quote, zero delay.

### Free: Alpaca Basic Plan — $0

The Basic plan is the default for all Alpaca accounts (paper and live). It provides real-time data from the IEX exchange only for equities, and only the indicative feed for options. Rate limit is 200 API calls/minute. WebSocket streaming works but only delivers IEX quotes.

**What you lose:** IEX represents roughly 3–5% of total US equity volume. You're seeing a narrow slice of the market, which means bid/ask spreads may look different than consolidated, and some thinly-traded stocks may show stale quotes. Options data is indicative (computed, not live from OPRA), so Greeks and IV will be approximate. For a personal tool in paper trading mode, this is workable. For live trading with real money, it's a meaningful data quality gap.

**Verdict: Start here.** The Basic plan is genuinely sufficient for building and testing the entire MVP. Upgrade to Algo Trader Plus only when you move from paper trading to live trading.

### Free alternative: Finnhub — $0

Finnhub offers 60 API calls/minute with no daily limit, real-time WebSocket streaming for up to 50 symbols, company news, basic fundamentals, and SEC filings. It also includes congressional trading data, ESG scores, and sentiment analysis — covering multiple data needs in a single free API.

**What you lose vs. Alpaca Data:** Finnhub's free WebSocket is limited to 50 symbols (adequate for a personal watchlist, tight for scanning). Historical data depth is limited. No options data on the free tier. Data is not from the consolidated tape — sourced from third-party aggregation, so slight quality differences possible.

**What you gain:** Congressional trading data included free (potentially eliminating the need for Quiver Quantitative). Company news included (potentially reducing the need for Benzinga). A single API covering market data, news, and alternative data.

**Verdict: Strong supplementary source.** Use Finnhub as a secondary data feed alongside Alpaca Basic. Its congressional trading and news endpoints could save you $125/month in other subscriptions.

### Free alternative: Alpha Vantage — $0

Alpha Vantage provides access to 200,000+ tickers across 20+ exchanges, 50+ pre-computed technical indicators, and an official MCP server for AI integration. Coverage includes stocks, forex, crypto, and options data.

**What you lose:** The free tier is severely limited at 25 API requests per day and 5 per minute. No WebSocket streaming at all — REST only. Real-time US market data requires a paid plan ($49.99+/month). At 25 calls/day, you can't even pull quotes for a 30-stock watchlist without exhausting your daily quota.

**Verdict: Prototyping only.** Alpha Vantage's free tier is a sample, not a solution. Useful for testing technical indicator calculations during development, but not viable for a running application. If you need pre-computed indicators, consider Twelve Data instead.

### Free alternative: Twelve Data — $0

Twelve Data offers 800 API calls/day (the most generous daily allowance among free tiers), 130+ API-calculated technical indicators, and coverage across 50+ global exchanges. WebSocket is available on the free tier but limited to 8 symbols from a restricted list.

**What you lose:** Data is delayed by 4 hours on the free tier. WebSocket is capped at 8 symbols and restricted to trial symbols only. No options data on the free plan.

**Verdict: Best free tier for historical/indicator data.** The 800 calls/day limit and 130+ indicators make Twelve Data the best free option for backtesting and technical analysis. Poor for real-time trading due to the 4-hour delay. Use it for strategy backtesting in Phase 2, not for live quotes.

### Free alternative: Polygon.io Free Tier — $0

Polygon.io's free tier provides 5 API requests/minute, limited historical data (1 year), and delayed quotes. No WebSocket on the free plan. No options data.

**What you lose:** The 5 calls/minute rate limit is extremely restrictive. One year of history is insufficient for strategy backtesting. No real-time data, no streaming, no options.

**Verdict: Not viable.** The free tier is too limited for anything beyond a quick proof of concept. Polygon's value proposition is at the $199/month tier where you get unlimited calls and full WebSocket — there's no meaningful middle ground.

### Summary: Market Data

| Provider | Cost | Rate Limit | Real-Time | WebSocket | Options | Best For |
|----------|------|-----------|-----------|-----------|---------|----------|
| Alpaca Algo Trader Plus | $99/mo | 200/min | Full SIP | Yes, full | Full OPRA | Live trading (Phase 2+) |
| **Alpaca Basic** | **$0** | **200/min** | **IEX only** | **Yes, IEX** | **Indicative** | **MVP / paper trading** |
| **Finnhub** | **$0** | **60/min** | **US stocks** | **Yes, 50 sym** | **No** | **Supplementary + news + congress** |
| Twelve Data | $0 | 800/day | 4hr delay | 8 symbols | No | Backtesting, indicators |
| Alpha Vantage | $0 | 25/day | No | No | No | Quick prototyping only |
| Polygon.io | $0 | 5/min | No | No | No | Not viable at free tier |

**Recommendation:** Alpaca Basic (primary, $0) + Finnhub (supplementary, $0) for the MVP. Upgrade Alpaca to Algo Trader Plus ($99) when moving to live trading.

---

## 2. Financial News

### Paid: Benzinga Pro API — $99/month

Benzinga provides institutional-grade financial news with ticker tagging, analyst ratings, earnings calendars, and sentiment data. Content is original (not aggregated), with near-zero latency on market-moving headlines. Pre-tagged by ticker, sector, and category.

### Free: Alpaca News API — $0 (included with any Alpaca account)

Alpaca includes a basic news endpoint in all accounts. Coverage is narrower than Benzinga, and articles are aggregated (not original content), but it provides headline + summary + ticker associations at no additional cost.

**What you lose:** Lower volume of articles, less sophisticated tagging, no analyst ratings calendar, no FDA/economic event calendars. Coverage skews toward major tickers; small-caps may have spotty coverage.

**Verdict: Sufficient for Phase 1.** The Strategy Engine needs news context to feed Claude, not a comprehensive newswire. Alpaca's news endpoint provides enough signal for AI analysis. Add Benzinga when you need earnings calendars and analyst rating feeds in Phase 2.

### Free: Finnhub Company News — $0

Finnhub provides company-specific news via REST API on the free tier (60 calls/min). Articles include headline, summary, source, and ticker association. General market news is also available.

**What you lose:** Finnhub's WebSocket news feed has been reported to deliver only historical items (not real-time) on lower-tier plans, so don't rely on streaming news from Finnhub. REST news endpoints do return recent articles.

**Verdict: Good secondary source.** Combine with Alpaca news for broader coverage. Claude can deduplicate and synthesize across both sources.

### Free: GNews API / Mediastack — $0

General news APIs with financial keyword filtering. GNews offers 100 requests/day free. Mediastack offers 100 requests/month free.

**What you lose:** No ticker tagging — you must extract ticker associations yourself. Not financially oriented; lots of noise. No earnings/ratings/economic calendar data. Coverage quality varies widely.

**Verdict: Last resort.** Only useful if you need political/geopolitical news that financial-specific APIs don't cover. For financial news, stick with Alpaca + Finnhub.

### Summary: News

| Provider | Cost | Ticker Tagging | Latency | Rate Limit | Best For |
|----------|------|---------------|---------|-----------|----------|
| Benzinga Pro | $99/mo | Yes, automated | Near-zero | 1/sec | Production newsroom quality |
| **Alpaca News** | **$0** | **Yes** | **Moderate** | **Bundled** | **MVP baseline** |
| **Finnhub News** | **$0** | **Yes** | **Moderate** | **60/min** | **Supplementary coverage** |
| GNews | $0 | No | Variable | 100/day | Political/geopolitical only |

**Recommendation:** Alpaca News (primary) + Finnhub News (secondary), both free. Add Benzinga ($99) in Phase 2 when earnings calendars and analyst ratings become relevant.

---

## 3. Congressional Trading Data

### Paid: Quiver Quantitative — $25/month

Structured JSON API with filtering by ticker, member, date range, and chamber. Full historical depth back to STOCK Act inception (2012). Real-time (same-day) filing data on paid plan. Clean REST endpoints.

### Paid alternative: Financial Modeling Prep (FMP) — $14–29/month

FMP's Ownership APIs include Senate and House trading data alongside insider trading and Form 13F institutional data. A general-purpose financial data API that happens to include congressional trades.

### Free: Finnhub Congressional Trading — $0

Finnhub includes congressional trading as one of its alternative data endpoints. Available on the free tier with the same 60 calls/minute rate limit. Returns member name, symbol, transaction type, and amount range.

**What you lose:** Filtering is less granular than Quiver — no state-level or committee-based filtering on the free tier. Historical depth may be shallower. Data freshness: filings may appear with a slight delay compared to dedicated providers.

**Verdict: Viable for Phase 1 and potentially Phase 2.** Finnhub's congressional trading endpoint covers the core use case (which members are trading which tickers) at no cost. For the MVP's Strategy Engine, this provides sufficient signal. Add Quiver only in Phase 3 when you need committee-based filtering and deeper statistical analysis.

### Free: House/Senate Stock Watcher (Open Source) — $0

Previously the go-to open source option, but as of early 2026, the S3 buckets return HTTP 403 errors. The GitHub repos have not been updated since mid-2025. Cached historical copies may still be useful for backtesting.

**Verdict: Dead project.** Do not build against this. Use Finnhub instead.

### Summary: Congressional Trades

| Provider | Cost | Both Chambers | API Quality | Historical Depth | Committee Data |
|----------|------|--------------|-------------|-----------------|---------------|
| Quiver Quantitative | $25/mo | Yes | Excellent | 2012+ | Yes |
| FMP | $14–29/mo | Yes | Good | 2012+ | No |
| **Finnhub** | **$0** | **Yes** | **Good** | **Moderate** | **No** |
| House/Senate Watcher | $0 | Yes | N/A (dead) | Historical only | No |

**Recommendation:** Finnhub free tier for MVP through Phase 2. Upgrade to Quiver ($25/mo) in Phase 3 when committee-based analysis becomes a feature.

---

## 4. Macro Economic Indicators

### Recommended: FRED API — $0

**There is no reason to pay for macro data.** FRED (Federal Reserve Economic Data) provides free, unlimited API access to 800,000+ economic time series. This includes everything you need: Fed Funds Rate, Treasury yields, CPI, GDP, unemployment, VIX, and more. Rate limit is 120 requests/minute, and there are no daily caps.

### Alternative: Alpha Vantage Economic Indicators — $0

Alpha Vantage includes economic indicator endpoints (CPI, GDP, Federal Funds Rate, Treasury yields) on the free tier. However, these count against your 25 calls/day limit, which is too constrained for a production app.

**Verdict: Use FRED exclusively.** It's the primary source — Alpha Vantage and others are just redistributing FRED data anyway. No paid alternative needed.

---

## 5. Caching / Pub-Sub (Redis)

### Paid: Upstash Serverless Redis — Pay-as-you-go

Upstash charges $0.20 per 100K commands after the first 500K/month free, with $0.25/GB storage. For a typical trading app, monthly cost would be $5–20/month depending on usage intensity.

### Free: Upstash Free Tier — $0

500K commands/month free (increased from 10K daily in 2025). This handles caching, pub/sub, and rate-limit counters for a single-user trading app comfortably. A watchlist of 50 tickers updating every second during market hours generates roughly 1.2M pub/sub messages/month — you'd exceed the free tier during active trading.

**What you lose at free tier:** If you exceed 500K commands, you start paying. For a personal tool (not multi-user), careful caching design keeps you under the limit.

### Free: Self-hosted Redis on Railway/Render — $0–5/month

Railway and Render both offer free-tier compute that can run a Redis instance. Railway's free tier includes $5/month in resource credits. Render's free tier has limitations on always-on services but can run Redis as a background worker.

**What you lose:** Operational overhead — you manage uptime, restarts, and data persistence. No built-in global replication. If the container sleeps (Render's free tier does this), your cache goes cold.

### Free: In-memory caching (node-cache / lru-cache) — $0

For a single-server Node.js app, an in-memory cache eliminates Redis entirely. Libraries like `node-cache` or `lru-cache` provide TTL-based caching with zero infrastructure. For pub/sub, use Node.js EventEmitter or the built-in `BroadcastChannel`.

**What you lose:** Cache is lost on server restart. No shared state between multiple Node.js processes. No pub/sub to external consumers. Not viable if you deploy workers separately from the web server.

**Verdict: Upstash free tier is the right answer.** 500K commands/month is sufficient for MVP development and light usage. The HTTP-based API works perfectly with serverless/edge deployments. Graduate to pay-as-you-go only when usage grows.

---

## 6. Job Queue (Background Processing)

### Paid: BullMQ on Redis — $0 (library is free; cost is the Redis instance)

BullMQ itself is open-source and free. The only cost is the Redis instance it runs on. With Upstash free tier or self-hosted Redis, BullMQ costs nothing.

### Free alternative: Node.js setTimeout / setInterval + Agenda.js — $0

For simple scheduled jobs (poll news every 5 minutes, sync positions every 30 seconds), you don't need a full queue system. `setInterval` in your Node.js process handles cron-like scheduling. Agenda.js uses MongoDB (which you already have) as the job store, eliminating the Redis dependency entirely.

**What you lose:** No automatic retry with exponential backoff (you'd implement this manually). No dead-letter queue for failed jobs. No concurrency control. No job dashboard for monitoring. These matter for the Claude API calls in the Strategy Engine, where reliability is critical.

**Verdict: Keep BullMQ.** It's free (the library, not the infrastructure), and the retry/dead-letter/concurrency features are essential for reliable Claude API integration. Run it on the Upstash free tier Redis.

---

## 7. Claude API (AI Engine)

### Paid: Claude API (Opus + Sonnet) — ~$25–50/month

There is no free alternative that matches Claude's capability for this use case. The Strategy Engine requires complex multi-source reasoning (price data + news + congressional trades + macro indicators → structured recommendation). This is Claude Opus territory.

### Cost reduction strategies (all compatible with the free-tier approach):

**Prompt caching:** Anthropic's prompt caching can reduce input token costs by up to 90% on repeated calls. The system prompt and strategy definitions don't change between calls — cache them.

**Sonnet for simple tasks:** Use claude-sonnet-4-5 ($3/M input, $15/M output) instead of Opus ($15/M input, $75/M output) for news summarization, ticker extraction, and sentiment classification. Reserve Opus for strategy recommendations only.

**Batch API:** For Phase 2's parallel strategy simulation, use the Batch API at 50% of standard pricing. Results within 24 hours — acceptable for end-of-day scoring.

**Reduce call frequency:** Instead of analyzing on-demand, run strategy analysis on a schedule (e.g., daily at market close for swing trades, hourly during market hours for day trades). This bounds your API costs predictably.

**Estimated costs at minimum viable usage:**
- 3 Opus strategy calls/day × 22 trading days = 66 calls × ~$0.15/call = ~$10/month
- 20 Sonnet news calls/day × 22 trading days = 440 calls × ~$0.01/call = ~$4.40/month
- Total: ~$15/month at conservative usage

**Verdict: Irreducible cost, but minimizable.** Budget $15–30/month for Claude API. This is the one line item you cannot eliminate because it's the core differentiator of the app.

---

## Cost Comparison Summary

### Paid Stack (Original Spec)

| Service | Provider | Monthly Cost |
|---------|----------|-------------|
| Market Data | Alpaca Algo Trader Plus | $99 |
| Market Data (supplementary) | Polygon.io | $199 |
| News | Benzinga Pro | $99 |
| Congressional Trades | Quiver Quantitative | $25 |
| Macro Data | FRED | $0 |
| Cache/Pub-Sub | Upstash | ~$10 |
| AI Engine | Claude API | ~$35 |
| **Total** | | **~$467/month** |

### Free-First Stack (Recommended for MVP)

| Service | Provider | Monthly Cost |
|---------|----------|-------------|
| Market Data | Alpaca Basic (free) | $0 |
| Market Data (supplementary) | Finnhub (free) | $0 |
| News | Alpaca News + Finnhub News (free) | $0 |
| Congressional Trades | Finnhub (free) | $0 |
| Macro Data | FRED (free) | $0 |
| Cache/Pub-Sub | Upstash (free tier) | $0 |
| AI Engine | Claude API (conservative) | ~$15 |
| **Total** | | **~$15/month** |

### Graduated Stack (Recommended Upgrade Path)

| Milestone | Add | Monthly Cost |
|-----------|-----|-------------|
| MVP (paper trading) | Free stack + Claude | ~$15 |
| Live trading begins | Alpaca Algo Trader Plus | +$99 → ~$114 |
| Phase 2 features | Benzinga Pro | +$99 → ~$213 |
| Phase 3 features | Quiver Quantitative | +$25 → ~$238 |
| Scale demands | Polygon.io | +$199 → ~$437 |

---

## Final Recommendation

**Finnhub is the MVP's secret weapon.** A single free API that covers market data (60 calls/min, WebSocket for 50 symbols), company news, and congressional trading data. Combined with Alpaca's free Basic plan for brokerage + IEX quotes, and FRED for macro data, you have a complete data foundation at $0/month.

The only unavoidable cost is Claude API at ~$15/month. Every other paid service in the original spec can be deferred until the specific feature that requires it reaches development.

**The principle: don't pay for data you're not using yet.** The free stack has real limitations (IEX-only quotes, 50-symbol WebSocket cap, no OPRA options data), but none of them block you from building, testing, and iterating on the full MVP feature set. Pay for premium data only when you've validated that the app works and you're ready to trade real money.
