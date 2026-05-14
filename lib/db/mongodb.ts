import { MongoClient, Db, Collection } from "mongodb";
import type {
  User,
  Recommendation,
  Decision,
  Strategy,
  LearningCard,
  GeneratedLearningCard,
  AdaptationSuggestion,
  NewsEvent,
  CongressTrade,
  Position,
  Trade,
  PriceSnapshot,
} from "./models";

const uri = process.env.MONGODB_URI!;
const dbName = "trading-assistant";

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

if (process.env.NODE_ENV === "development") {
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  client = new MongoClient(uri);
  clientPromise = client.connect();
}

export async function getDb(): Promise<Db> {
  const c = await clientPromise;
  return c.db(dbName);
}

export async function getCollections() {
  const db = await getDb();
  return {
    users: db.collection<User>("users"),
    recommendations: db.collection<Recommendation>("recommendations"),
    decisions: db.collection<Decision>("decisions"),
    strategies: db.collection<Strategy>("strategies"),
    learningCards: db.collection<LearningCard>("learningCards"),
    news: db.collection<NewsEvent>("news"),
    congressTrades: db.collection<CongressTrade>("congressTrades"),
    positions: db.collection<Position>("positions"),
    trades: db.collection<Trade>("trades"),
    priceSnapshots: db.collection<PriceSnapshot>("priceSnapshots"),
    generatedLearningCards: db.collection<GeneratedLearningCard>("generatedLearningCards"),
    adaptationSuggestions: db.collection<AdaptationSuggestion>("adaptationSuggestions"),
  };
}

export { clientPromise };

export async function ensureIndexes(): Promise<void> {
  const db = await getDb();

  await db.collection("users").createIndex({ email: 1 }, { unique: true });
  await db.collection("recommendations").createIndex({ userId: 1, createdAt: -1 });
  await db.collection("recommendations").createIndex({ symbol: 1, "outcome.status": 1 });
  await db.collection("decisions").createIndex({ userId: 1, decidedAt: -1 });
  await db.collection("decisions").createIndex({ recommendationId: 1 });
  await db.collection("strategies").createIndex({ userId: 1, status: 1 });
  await db.collection("learningCards").createIndex({ userId: 1, nextReviewDate: 1 });
  await db.collection("news").createIndex({ tickers: 1, publishedAt: -1 });
  await db.collection("news").createIndex({ externalId: 1, sourceApi: 1 }, { unique: true });
  await db.collection("congressTrades").createIndex({ symbol: 1, tradeDate: -1 });
  await db.collection("positions").createIndex({ userId: 1, symbol: 1 });
  await db.collection("trades").createIndex({ userId: 1, submittedAt: -1 });
  await db.collection("generatedLearningCards").createIndex({ userId: 1, status: 1 });
  await db.collection("adaptationSuggestions").createIndex({ userId: 1, strategyType: 1, status: 1 });

  // Time-series collection for price snapshots
  try {
    await db.createCollection("priceSnapshots", {
      timeseries: {
        timeField: "timestamp",
        metaField: "symbol",
        granularity: "minutes",
      },
    });
  } catch {
    // Collection already exists — ignore
  }
}
