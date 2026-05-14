import { ObjectId } from "mongodb";

export interface User {
  _id: ObjectId;
  email: string;
  alpacaAccountId: string;
  alpacaOAuthToken: string; // AES-256-GCM encrypted
  alpacaRefreshToken: string; // AES-256-GCM encrypted
  alpacaTokenExpiresAt: Date | null;
  riskProfile: {
    maxPositionSizePct: number;
    defaultStopLossPct: number;
    roiTargetMonthlyPct: number; // default 25, range 5-50
    optionsApprovalLevel: number; // 1-3
  };
  preferences: {
    tipsEnabled: boolean;
    learningModeEnabled: boolean;
    aiEnabled: boolean;
  };
  watchlist: string[]; // ticker symbols
  createdAt: Date;
  updatedAt: Date;
}

export interface Recommendation {
  _id: ObjectId;
  userId: ObjectId;
  symbol: string;
  assetType: "equity" | "option";
  strategyType: string;
  timeframe: "intraday" | "swing" | "position";
  direction: "long" | "short";
  entry: { price: number; condition: string };
  target: { price: number; expectedReturnPct: number };
  stopLoss: { price: number; maxLossPct: number };
  optionDetails: {
    contractType: "call" | "put";
    suggestedStrike: number;
    suggestedExpiration: Date;
    suggestedStrategy: string;
  } | null;
  risk: {
    bestPractices: {
      score: number;
      factors: string[];
      methodology: string;
    };
    datadriven: {
      score: number;
      factors: string[];
      methodology: string;
    };
    combined: {
      score: number;
      weightBestPractices: number;
      weightDataDriven: number;
      label: "low" | "moderate" | "high" | "very_high";
    };
  };
  confidence: number;
  rationale: string;
  snapshot: {
    priceData: {
      currentPrice: number;
      priceHistory30d: { date: string; ohlcv: number[] }[];
      technicalIndicators: Record<string, number>;
    };
    newsArticles: {
      headline: string;
      summary: string;
      source: string;
      publishedAt: Date;
      sentiment: string | null;
    }[];
    congressTrades: {
      memberName: string;
      party: string;
      transactionType: string;
      amountRange: string;
      tradeDate: Date;
    }[];
    macroIndicators: Record<string, number>;
    marketConditions: {
      spyChange30d: number;
      vix: number;
      sectorPerformance: Record<string, number>;
    };
    claudePromptHash: string;
    claudeModelVersion: string;
    promptTemplate: string;
  };
  outcome: {
    status: "pending" | "tracking" | "resolved";
    checkpoints: {
      date: Date;
      currentPrice: number;
      percentChange: number;
      onTrack: boolean;
      notes: string;
    }[];
    finalResult: {
      exitPrice: number;
      returnPct: number;
      hitTarget: boolean;
      hitStopLoss: boolean;
      holdingPeriodDays: number;
      exitReason: "target_hit" | "stop_hit" | "manual" | "expiration" | "time_limit";
    } | null;
    performedAsExpected: boolean | null;
    postMortem: string | null;
  };
  createdAt: Date;
}

export interface Decision {
  _id: ObjectId;
  userId: ObjectId;
  recommendationId: ObjectId;
  action: "accepted" | "dismissed" | "modified";
  modifications: Record<string, unknown> | null;
  tradeId: ObjectId | null;
  decidedAt: Date;
  closedAt: Date | null;
}

export interface Strategy {
  _id: ObjectId;
  userId: ObjectId;
  name: string;
  type: string;
  parameters: Record<string, unknown>;
  status: "active" | "paper" | "archived";
  performance: {
    totalRecommendations: number;
    accepted: number;
    dismissed: number;
    wins: number;
    losses: number;
    avgReturnPct: number;
    winRate: number;
    sharpeRatio: number | null;
    maxDrawdownPct: number;
    lastCalculatedAt: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface LearningCard {
  _id: ObjectId;
  userId: ObjectId;
  strategyType: string;
  tipId: string;
  question: string;
  questionType: "multiple_choice" | "true_false";
  options: string[];
  correctAnswer: number;
  explanation: string;
  easeFactor: number; // SM-2: starts at 2.5, min 1.3
  interval: number; // days
  repetitions: number;
  nextReviewDate: Date;
  lastReviewDate: Date | null;
  lastDifficultyRating: "very_easy" | "easy" | "fair" | "hard" | "very_hard" | null;
  createdAt: Date;
}

export interface NewsEvent {
  _id: ObjectId;
  sourceApi: "alpaca" | "finnhub";
  externalId: string;
  headline: string;
  summary: string;
  tickers: string[];
  category: "political" | "earnings" | "macro" | "sector" | "regulatory" | "geopolitical";
  sentiment: "positive" | "negative" | "neutral" | null;
  publishedAt: Date;
  ingestedAt: Date;
}

export interface CongressTrade {
  _id: ObjectId;
  memberName: string;
  chamber: "senate" | "house";
  party: "D" | "R" | "I";
  state: string;
  symbol: string;
  transactionType: "purchase" | "sale";
  amountRange: string;
  tradeDate: Date;
  filingDate: Date;
  reportingGapDays: number;
  sourceApi: string;
  ingestedAt: Date;
}

export interface Position {
  _id: ObjectId;
  userId: ObjectId;
  alpacaPositionId: string;
  assetType: "equity" | "option";
  symbol: string;
  optionDetails: {
    contractSymbol: string;
    putOrCall: "put" | "call";
    strikePrice: number;
    expirationDate: Date;
    contractsHeld: number;
  } | null;
  entryPrice: number; // integer cents
  currentPrice: number; // integer cents
  quantity: number;
  marketValue: number; // integer cents
  unrealizedPnl: number; // integer cents
  unrealizedPnlPct: number;
  recommendationId: ObjectId | null;
  openedAt: Date;
  lastSyncedAt: Date;
}

export interface Trade {
  _id: ObjectId;
  userId: ObjectId;
  positionId: ObjectId;
  alpacaOrderId: string;
  symbol: string;
  assetType: "equity" | "option";
  side: "buy" | "sell";
  orderType: "market" | "limit" | "stop" | "stop_limit";
  quantity: number;
  filledPrice: number | null; // integer cents
  status: "pending" | "filled" | "partially_filled" | "cancelled" | "rejected";
  recommendationId: ObjectId | null;
  submittedAt: Date;
  filledAt: Date | null;
}

export interface GeneratedLearningCard {
  _id: ObjectId;
  userId: ObjectId;
  status: "pending_review" | "approved" | "rejected";
  strategyType: string;
  sourceContext: string; // what trade/activity this was generated from
  question: string;
  questionType: "multiple_choice" | "true_false";
  options: string[];
  correctAnswer: number;
  explanation: string;
  generatedAt: Date;
  reviewedAt: Date | null;
}

export interface AdaptationSuggestion {
  _id: ObjectId;
  userId: ObjectId;
  strategyType: string;
  status: "pending" | "acknowledged";
  analysis: string;
  suggestions: {
    parameter: string;
    currentValue: string;
    suggestedValue: string;
    rationale: string;
  }[];
  losingTradeCount: number;
  winRateAtGeneration: number;
  generatedAt: Date;
  acknowledgedAt: Date | null;
}

export interface PriceSnapshot {
  symbol: string;
  timestamp: Date;
  open: number; // integer cents
  high: number;
  low: number;
  close: number;
  volume: number;
  source: "alpaca" | "finnhub";
}
