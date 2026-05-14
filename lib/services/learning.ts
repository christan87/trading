import { getCollections } from "@/lib/db/mongodb";
import { TIPS, getTipsForStrategy } from "@/lib/data/tips";
import { ObjectId } from "mongodb";
import type { LearningCard } from "@/lib/db/models";

export type DifficultyRating = "very_easy" | "easy" | "fair" | "hard" | "very_hard";

interface SM2Result {
  easeFactor: number;
  interval: number;
  repetitions: number;
}

// SM-2 algorithm implementation
export function sm2(
  rating: DifficultyRating,
  prev: { easeFactor: number; interval: number; repetitions: number }
): SM2Result {
  const qualityMap: Record<DifficultyRating, number> = {
    very_easy: 5,
    easy: 4,
    fair: 3,
    hard: 2,
    very_hard: 1,
  };
  const q = qualityMap[rating];
  let { easeFactor, interval, repetitions } = prev;

  if (q < 3) {
    // Failed — reset
    repetitions = 0;
    interval = 1;
    easeFactor = Math.max(1.3, easeFactor - 0.2);
  } else {
    // Passed
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * easeFactor);

    repetitions += 1;

    // Adjust ease factor per rating
    if (q === 5) easeFactor += 0.15;
    else if (q === 4) easeFactor += 0.1;
    else if (q === 3) { /* unchanged */ }
    else if (q === 2) easeFactor = Math.max(1.3, easeFactor - 0.15);

    easeFactor = Math.max(1.3, easeFactor);
  }

  return { easeFactor, interval, repetitions };
}

// Seed initial learning cards for a user from the tips library
export async function seedLearningCards(userId: string): Promise<number> {
  const { learningCards } = await getCollections();
  const uid = new ObjectId(userId);

  const existing = await learningCards.countDocuments({ userId: uid });
  if (existing > 0) return 0; // Already seeded

  const cards = buildCardsFromTips();
  const now = new Date();

  const docs: Omit<LearningCard, "_id">[] = cards.map((c) => ({
    userId: uid,
    strategyType: c.strategyType,
    tipId: c.tipId,
    question: c.question,
    questionType: c.questionType,
    options: c.options,
    correctAnswer: c.correctAnswer,
    explanation: c.explanation,
    easeFactor: 2.5,
    interval: 1,
    repetitions: 0,
    nextReviewDate: now,
    lastReviewDate: null,
    lastDifficultyRating: null,
    createdAt: now,
  }));

  await learningCards.insertMany(docs as LearningCard[]);
  return docs.length;
}

export async function getDueCards(userId: string, limit = 5): Promise<LearningCard[]> {
  const { learningCards } = await getCollections();
  return learningCards
    .find({ userId: new ObjectId(userId), nextReviewDate: { $lte: new Date() } })
    .sort({ nextReviewDate: 1 })
    .limit(limit)
    .toArray();
}

export async function submitAnswer(
  userId: string,
  cardId: string,
  rating: DifficultyRating
): Promise<{ correct: boolean; explanation: string; nextReviewDate: Date }> {
  const { learningCards } = await getCollections();
  const uid = new ObjectId(userId);
  const cid = new ObjectId(cardId);

  const card = await learningCards.findOne({ _id: cid, userId: uid });
  if (!card) throw new Error("Card not found");

  const result = sm2(rating, {
    easeFactor: card.easeFactor,
    interval: card.interval,
    repetitions: card.repetitions,
  });

  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + result.interval);

  await learningCards.updateOne(
    { _id: cid },
    {
      $set: {
        easeFactor: result.easeFactor,
        interval: result.interval,
        repetitions: result.repetitions,
        nextReviewDate,
        lastReviewDate: new Date(),
        lastDifficultyRating: rating,
      },
    }
  );

  return { correct: true, explanation: card.explanation, nextReviewDate };
}

export async function getLearningProgress(userId: string): Promise<{
  dueToday: number;
  totalCards: number;
  masteredCards: number; // interval >= 21 days
  streakDays: number;
}> {
  const { learningCards } = await getCollections();
  const uid = new ObjectId(userId);
  const now = new Date();

  const [dueToday, totalCards, masteredCards] = await Promise.all([
    learningCards.countDocuments({ userId: uid, nextReviewDate: { $lte: now } }),
    learningCards.countDocuments({ userId: uid }),
    learningCards.countDocuments({ userId: uid, interval: { $gte: 21 } }),
  ]);

  // Simple streak: count consecutive days with at least one review
  const recentCards = await learningCards
    .find({ userId: uid, lastReviewDate: { $ne: null } })
    .sort({ lastReviewDate: -1 })
    .limit(60)
    .toArray();

  let streakDays = 0;
  const daysSeen = new Set<string>();
  for (const c of recentCards) {
    if (c.lastReviewDate) {
      daysSeen.add(c.lastReviewDate.toISOString().split("T")[0]);
    }
  }

  let checkDate = new Date();
  while (true) {
    const key = checkDate.toISOString().split("T")[0];
    if (daysSeen.has(key)) {
      streakDays++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  return { dueToday, totalCards, masteredCards, streakDays };
}

// ── Static question bank generated from the tips library ─────────────────

interface CardTemplate {
  tipId: string;
  strategyType: string;
  question: string;
  questionType: "multiple_choice" | "true_false";
  options: string[];
  correctAnswer: number;
  explanation: string;
}

function buildCardsFromTips(): CardTemplate[] {
  return [
    // Momentum
    {
      tipId: "mom-001",
      strategyType: "momentum",
      question: "Which RSI range is typically associated with a healthy uptrend in a momentum trade?",
      questionType: "multiple_choice",
      options: ["20–40", "50–70", "70–90", "80–100"],
      correctAnswer: 1,
      explanation: "RSI in the 50–70 range indicates bullish momentum without extreme overbought conditions. Above 70 can persist in strong trends but adds reversal risk.",
    },
    {
      tipId: "mom-002",
      strategyType: "momentum",
      question: "A breakout on below-average volume is as reliable as one on high volume.",
      questionType: "true_false",
      options: ["True", "False"],
      correctAnswer: 1,
      explanation: "False. Volume confirms price moves. A breakout without volume expansion is suspect and more likely to be a false breakout. Look for 1.5–2× average volume.",
    },
    {
      tipId: "mom-003",
      strategyType: "momentum",
      question: "In a strong uptrend, when is RSI above 70 a strong sell signal on its own?",
      questionType: "multiple_choice",
      options: [
        "Immediately when it crosses 70",
        "After it falls back below 70",
        "RSI above 70 alone is not a reliable exit in a strong trend",
        "When it reaches 80",
      ],
      correctAnswer: 2,
      explanation: "RSI can stay above 70 for weeks in a strong momentum trend. Using RSI alone as an exit is premature. Better to wait for RSI to fall back below 70 or use a trailing stop.",
    },
    // Mean reversion
    {
      tipId: "rev-001",
      strategyType: "mean_reversion",
      question: "Mean reversion trading works best when a stock is in a fundamental breakdown.",
      questionType: "true_false",
      options: ["True", "False"],
      correctAnswer: 1,
      explanation: "False. Mean reversion assumes prices oscillate around a stable average — it works in established ranges. A stock in a fundamental breakdown (e.g., accounting fraud, product failure) may not revert and keeps falling.",
    },
    {
      tipId: "rev-002",
      strategyType: "mean_reversion",
      question: "What does a Bollinger Band squeeze signal?",
      questionType: "multiple_choice",
      options: [
        "An imminent downtrend",
        "Reduced volatility, with a breakout likely soon",
        "Overbought conditions",
        "A trend reversal is confirmed",
      ],
      correctAnswer: 1,
      explanation: "A squeeze (narrow bands) signals low volatility and coiled energy. A significant move is coming but the direction is unknown — wait for a confirmed break with volume.",
    },
    {
      tipId: "rev-003",
      strategyType: "mean_reversion",
      question: "When a stock reaches 3 standard deviations below its mean, you should always use full position size for maximum profit potential.",
      questionType: "true_false",
      options: ["True", "False"],
      correctAnswer: 1,
      explanation: "False. At 3 standard deviations, there's a higher risk that the deviation reflects a fundamental change, not a temporary price extreme. The rubber band effect suggests reducing to ~75% size at this level.",
    },
    // Breakout
    {
      tipId: "brk-001",
      strategyType: "breakout",
      question: "What is the measured move target for a breakout from a $10 consolidation range?",
      questionType: "multiple_choice",
      options: [
        "$5 above the breakout",
        "$10 above the breakout",
        "$15 above the breakout",
        "No target — ride indefinitely",
      ],
      correctAnswer: 1,
      explanation: "The measured move projects the height of the prior range above the breakout point. A $10 range broken to the upside has a $10 measured move target.",
    },
    {
      tipId: "brk-002",
      strategyType: "breakout",
      question: "Which of these reduces the risk of trading a false breakout?",
      questionType: "multiple_choice",
      options: [
        "Enter on the intraday high above resistance",
        "Wait for the daily close above resistance on high volume",
        "Buy immediately when price touches resistance",
        "Use a larger position size to average down if it fails",
      ],
      correctAnswer: 1,
      explanation: "Entering on the daily close (not intraday) with volume confirmation filters many false breakouts. A retest of the broken resistance as new support is an even safer entry.",
    },
    // Earnings
    {
      tipId: "earn-001",
      strategyType: "earnings_play",
      question: "What is 'IV crush' in the context of earnings trading?",
      questionType: "multiple_choice",
      options: [
        "A stock price dropping sharply on earnings",
        "The collapse of implied volatility after an earnings announcement",
        "Increased buying volume before earnings",
        "A failed earnings trade losing value",
      ],
      correctAnswer: 1,
      explanation: "IV (implied volatility) inflates before earnings as the market prices in uncertainty. After the announcement — regardless of direction — IV drops sharply. Long options bought before earnings lose this premium even if the stock moves in your direction.",
    },
    {
      tipId: "earn-002",
      strategyType: "earnings_play",
      question: "An at-the-money straddle costs $8 on a $100 stock. What is the approximate expected move percentage?",
      questionType: "multiple_choice",
      options: ["4%", "8%", "16%", "12%"],
      correctAnswer: 1,
      explanation: "Expected Move ≈ straddle price / stock price = $8 / $100 = 8%. The market expects the stock to stay within ±8% after earnings.",
    },
    {
      tipId: "earn-003",
      strategyType: "earnings_play",
      question: "Beating EPS estimates always results in a stock price increase.",
      questionType: "true_false",
      options: ["True", "False"],
      correctAnswer: 1,
      explanation: "False. The stock is compared to 'whisper numbers' and expectations embedded in the price. A 10% EPS beat with weak revenue guidance or margin compression often leads to a sell-off — guidance matters more than the headline beat.",
    },
    // Options
    {
      tipId: "opt-001",
      strategyType: "options_spread",
      question: "What is the maximum loss when buying a call option?",
      questionType: "multiple_choice",
      options: [
        "The strike price × 100",
        "The premium paid",
        "Unlimited",
        "The stock price × 100",
      ],
      correctAnswer: 1,
      explanation: "When you buy an option, you pay a premium upfront. That premium is your maximum loss — the option can only go to zero. This is one advantage of long options over short options.",
    },
    {
      tipId: "opt-002",
      strategyType: "options_spread",
      question: "A long option with 0.50 delta will gain how much in value if the stock rises by $2?",
      questionType: "multiple_choice",
      options: ["$0.25", "$1.00", "$2.00", "$0.50"],
      correctAnswer: 1,
      explanation: "Delta measures the change in option price per $1 move in the stock. 0.50 delta × $2 move = $1.00 gain per share, or $100 per contract (100 shares). Delta is not constant — it changes as the stock moves.",
    },
    {
      tipId: "opt-003",
      strategyType: "options_spread",
      question: "In a bull call spread, what is the maximum profit?",
      questionType: "multiple_choice",
      options: [
        "Unlimited — the stock can rise forever",
        "The width of the spread minus the net premium paid",
        "The premium received from the short call",
        "The premium paid for the long call",
      ],
      correctAnswer: 1,
      explanation: "In a bull call spread, max profit = spread width − net debit. For a $10 wide spread costing $3, max profit = $7 per share ($700 per contract). The short call caps the upside but lowers the cost.",
    },
    {
      tipId: "opt-004",
      strategyType: "options_spread",
      question: "Options with fewer than 7 days to expiration are dangerous for buyers because:",
      questionType: "multiple_choice",
      options: [
        "They become harder to sell",
        "Theta decay is maximal, eroding value rapidly",
        "Delta approaches zero",
        "The SEC requires additional disclosures",
      ],
      correctAnswer: 1,
      explanation: "Theta (time decay) accelerates dramatically in the final 30 days and especially the final 7 days. For buyers, the stock must move fast and far to overcome this decay. The risk/reward for buying < 7 DTE options is generally unfavorable.",
    },
    // Risk Management
    {
      tipId: "risk-001",
      strategyType: "general",
      question: "You have a $40,000 account and want to risk no more than 1%. Your stop is $3 below entry. What is your maximum position size?",
      questionType: "multiple_choice",
      options: ["100 shares", "133 shares", "200 shares", "400 shares"],
      correctAnswer: 1,
      explanation: "1% of $40,000 = $400 max risk per trade. $400 ÷ $3 stop = ~133 shares. This keeps a single loss from materially damaging your account.",
    },
    {
      tipId: "risk-002",
      strategyType: "general",
      question: "A VIX above 35 typically indicates:",
      questionType: "multiple_choice",
      options: [
        "Low volatility — a good time to add risk",
        "Normal market conditions",
        "Extreme fear, potential capitulation",
        "An imminent bull market",
      ],
      correctAnswer: 2,
      explanation: "VIX > 35 signals extreme fear and usually occurs during market panics. While counterintuitive, these are often near-term buying opportunities — fear drives overselling. However, position sizing should be smaller due to high volatility.",
    },
    {
      tipId: "risk-003",
      strategyType: "general",
      question: "Congressional trades disclosed under the STOCK Act must be reported within:",
      questionType: "multiple_choice",
      options: ["24 hours", "7 days", "45 days", "90 days"],
      correctAnswer: 2,
      explanation: "The STOCK Act requires Members of Congress to disclose trades within 45 days of the transaction. This lag means the informational edge may have already played out by the time the trade is public.",
    },
  ];
}
