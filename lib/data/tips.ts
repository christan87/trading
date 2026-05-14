export interface Tip {
  id: string;
  strategyType: string; // matches Recommendation.strategyType
  title: string;
  content: string; // markdown
  relatedConcepts: string[];
  difficulty: "beginner" | "intermediate" | "advanced";
}

export const TIPS: Tip[] = [
  // ── Momentum ──────────────────────────────────────────────────────────
  {
    id: "mom-001",
    strategyType: "momentum",
    title: "What is Momentum Trading?",
    content: `Momentum trading assumes that assets moving strongly in one direction will continue that direction for a period. You buy into strength and sell when momentum fades.\n\n**Key signals:** rising RSI (50–70), price above 20- and 50-day SMAs, increasing volume on up-days.\n\n**Risk:** momentum can reverse violently — always use a stop loss and scale out of winners.`,
    relatedConcepts: ["RSI", "SMA", "volume", "trend"],
    difficulty: "beginner",
  },
  {
    id: "mom-002",
    strategyType: "momentum",
    title: "Volume Confirms Momentum",
    content: `Price moves without volume are suspect. A breakout on 2× average volume is far more reliable than one on thin trading.\n\n**Rule of thumb:** if price rises but volume is shrinking, the move is weakening and a reversal is more likely. Watch for volume expansion on the first pullback after a breakout — that's the re-entry signal.`,
    relatedConcepts: ["volume", "breakout", "confirmation"],
    difficulty: "intermediate",
  },
  {
    id: "mom-003",
    strategyType: "momentum",
    title: "RSI Overbought Does Not Mean Sell",
    content: `RSI above 70 signals overbought — but in a strong trend, RSI can stay above 70 for weeks. Selling purely because RSI is overbought in a momentum trade is premature.\n\n**Better rule:** wait for RSI to *fall back below* 70 as an exit signal, or use a trailing stop rather than an RSI threshold alone.`,
    relatedConcepts: ["RSI", "overbought", "exits"],
    difficulty: "intermediate",
  },
  // ── Mean Reversion ────────────────────────────────────────────────────
  {
    id: "rev-001",
    strategyType: "mean_reversion",
    title: "What is Mean Reversion?",
    content: `Mean reversion assumes prices oscillate around a long-term average. When a stock is unusually far below its average, you buy expecting it to snap back.\n\n**Key signals:** RSI below 30, price more than 2 standard deviations below the 20-day Bollinger Band, high short interest.\n\n**Risk:** falling knives — a stock can keep falling. Only trade mean reversion in established ranges, not during fundamental breakdowns.`,
    relatedConcepts: ["RSI", "Bollinger Bands", "standard deviation", "range"],
    difficulty: "beginner",
  },
  {
    id: "rev-002",
    strategyType: "mean_reversion",
    title: "Bollinger Band Squeeze",
    content: `When the bands narrow (low volatility), it signals coiled energy — a breakout is coming. The direction is unknown, so wait for confirmation.\n\n**Trade:** after a squeeze, enter in the direction of the first 1-2% move on above-average volume. Your stop is the opposite band.`,
    relatedConcepts: ["Bollinger Bands", "volatility", "squeeze", "breakout"],
    difficulty: "intermediate",
  },
  {
    id: "rev-003",
    strategyType: "mean_reversion",
    title: "The Rubber Band Effect",
    content: `The further a stock stretches from its mean, the stronger the snap-back — but also the more dangerous the hold. Position size inversely with distance from mean.\n\n**Practical rule:** at 1.5 std dev, use 50% normal size. At 2 std dev, 100%. At 3 std dev, 75% (risk of fundamental break is real). Never average down more than twice.`,
    relatedConcepts: ["position sizing", "standard deviation", "averaging down"],
    difficulty: "advanced",
  },
  // ── Breakout ──────────────────────────────────────────────────────────
  {
    id: "brk-001",
    strategyType: "breakout",
    title: "Trading Breakouts",
    content: `A breakout occurs when price decisively moves above resistance or below support, often after a period of consolidation.\n\n**Entry:** buy the candle close above resistance, not the intraday spike — false breakouts are common.\n\n**Target:** measure the height of the prior range and project it above the breakout point (measured move).`,
    relatedConcepts: ["resistance", "support", "consolidation", "measured move"],
    difficulty: "beginner",
  },
  {
    id: "brk-002",
    strategyType: "breakout",
    title: "Avoiding False Breakouts",
    content: `False breakouts trap buyers who chase price above resistance, then sell hard. To filter them:\n\n1. Require volume 1.5× average on the breakout candle\n2. Wait for a retest of the broken resistance as new support before entering\n3. Avoid breakouts into earnings or major macro events\n\nThe retest entry gives up a few percent but dramatically reduces false-break losses.`,
    relatedConcepts: ["false breakout", "volume", "retest", "support"],
    difficulty: "intermediate",
  },
  // ── Earnings Play ─────────────────────────────────────────────────────
  {
    id: "earn-001",
    strategyType: "earnings_play",
    title: "Earnings Volatility Basics",
    content: `Stocks make their largest single-day moves around earnings. This creates opportunity — and land mines.\n\n**Key concept:** implied volatility (IV) inflates before earnings, then crushes after the announcement regardless of direction. Buying options before earnings means you're paying a premium that evaporates.\n\n**Two approaches:** (1) trade the stock directly for a directional bet, (2) sell options (e.g. iron condor) to profit from IV crush.`,
    relatedConcepts: ["implied volatility", "IV crush", "earnings", "options"],
    difficulty: "beginner",
  },
  {
    id: "earn-002",
    strategyType: "earnings_play",
    title: "Expected Move Calculation",
    content: `The options market prices in an "expected move" — the range the stock is expected to stay within after earnings.\n\n**Quick formula:** Expected Move ≈ (at-the-money straddle price) / stock price × 100%\n\nIf you believe the stock will move *more* than the expected move, buy options. If you believe it will stay *inside* the range, sell options (iron condor, strangle).`,
    relatedConcepts: ["expected move", "straddle", "iron condor", "implied volatility"],
    difficulty: "intermediate",
  },
  {
    id: "earn-003",
    strategyType: "earnings_play",
    title: "Whisper Numbers and Beats",
    content: `Beating EPS estimates doesn't guarantee a stock rises — the market compares actual results to the "whisper number" (the real expectation beyond consensus).\n\nA 10% EPS beat on weak revenue guidance can sink a stock. Watch: revenue growth, forward guidance, and gross margin expansion. These matter more than the headline EPS beat.`,
    relatedConcepts: ["EPS", "guidance", "revenue", "whisper number"],
    difficulty: "advanced",
  },
  // ── Options Spread ────────────────────────────────────────────────────
  {
    id: "opt-001",
    strategyType: "options_spread",
    title: "Calls and Puts: The Basics",
    content: `**Call option:** right to *buy* 100 shares at the strike price before expiration. Profits when stock rises.\n\n**Put option:** right to *sell* 100 shares at the strike price before expiration. Profits when stock falls.\n\nYou pay a premium upfront. Max loss on a long option = premium paid. Max gain on a long call = unlimited. Max gain on a long put = strike price (stock can only go to zero).`,
    relatedConcepts: ["call", "put", "strike", "premium", "expiration"],
    difficulty: "beginner",
  },
  {
    id: "opt-002",
    strategyType: "options_spread",
    title: "The Greeks: Delta and Theta",
    content: `**Delta:** how much the option price changes per $1 move in the stock. A 0.50 delta call gains $0.50 per $1 stock rise. ATM options ≈ 0.50 delta.\n\n**Theta:** time decay — the daily erosion of option value. Long options lose theta; short options gain it. Theta accelerates in the final 30 days before expiration.\n\n**Implication:** if you're long options, you need the stock to move fast enough to overcome theta decay.`,
    relatedConcepts: ["delta", "theta", "time decay", "ATM", "ITM"],
    difficulty: "intermediate",
  },
  {
    id: "opt-003",
    strategyType: "options_spread",
    title: "Bull Call Spread",
    content: `A bull call spread = buy a lower strike call + sell a higher strike call. Both same expiration.\n\n**Why:** reduces cost basis (the short call premium offsets the long call premium). Caps max profit at the spread width.\n\n**Example:** buy $150 call, sell $160 call. Max profit = $10 × 100 = $1,000 minus premium paid. Max loss = premium paid.\n\n**Use when:** moderately bullish — you don't expect a blowout move but want defined risk.`,
    relatedConcepts: ["bull call spread", "debit spread", "defined risk", "vertical spread"],
    difficulty: "intermediate",
  },
  {
    id: "opt-004",
    strategyType: "options_spread",
    title: "Managing DTE Risk",
    content: `DTE = Days to Expiration. Options with fewer than 7 DTE are dangerous for buyers — theta decay is maximal and small adverse moves can wipe out the position overnight.\n\n**Best practice:** target 30–60 DTE for new positions. If you're holding an option that's fallen to less than 7 DTE without reaching the target, consider closing it rather than hoping for a last-minute move.`,
    relatedConcepts: ["DTE", "theta", "time decay", "expiration"],
    difficulty: "intermediate",
  },
  // ── General Risk Management ───────────────────────────────────────────
  {
    id: "risk-001",
    strategyType: "general",
    title: "The 1% Rule",
    content: `Never risk more than 1-2% of your total portfolio on a single trade. This means your stop loss × position size ≤ 1-2% of account.\n\n**Example:** $50,000 account, 1% max risk = $500 per trade. If stop is $2 below entry, max position = 250 shares.\n\nWith this rule, you can be wrong 20 times in a row and still have 80% of your capital.`,
    relatedConcepts: ["position sizing", "stop loss", "risk management"],
    difficulty: "beginner",
  },
  {
    id: "risk-002",
    strategyType: "general",
    title: "VIX as a Fear Gauge",
    content: `The VIX (CBOE Volatility Index) measures expected market volatility over the next 30 days. It's often called the "fear gauge."\n\n- VIX < 15: calm market, complacency\n- VIX 15–25: normal market conditions\n- VIX 25–35: elevated fear, choppy conditions\n- VIX > 35: extreme fear, potential capitulation\n\nHigh VIX = higher option premiums. Low VIX = cheaper options. Momentum strategies work better in low-VIX environments.`,
    relatedConcepts: ["VIX", "volatility", "fear", "options pricing"],
    difficulty: "beginner",
  },
  {
    id: "risk-003",
    strategyType: "general",
    title: "Congressional Trading Signals",
    content: `Members of Congress must disclose stock trades within 45 days under the STOCK Act. Academic research shows congressional trades, particularly by members on committees relevant to an industry, outperform the market.\n\n**Signal strength:** cluster buys (3+ members buying the same stock within 90 days) are a stronger signal than individual trades.\n\n**Caveat:** these are lagging signals — trades are disclosed up to 45 days after execution. The informational edge may have already played out.`,
    relatedConcepts: ["STOCK Act", "congressional trading", "insider trading", "alpha"],
    difficulty: "intermediate",
  },
];

export function getTipsForStrategy(strategyType: string): Tip[] {
  const direct = TIPS.filter((t) => t.strategyType === strategyType);
  const general = TIPS.filter((t) => t.strategyType === "general");
  return [...direct, ...general];
}

export function getTipById(id: string): Tip | undefined {
  return TIPS.find((t) => t.id === id);
}
