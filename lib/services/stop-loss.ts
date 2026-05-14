import { ObjectId } from "mongodb";
import { getCollections } from "@/lib/db/mongodb";
import { marketDataService } from "@/lib/services/market-data";
import { notificationService } from "@/lib/services/notifications";
import type { StopLoss } from "@/lib/db/models";

export class StopLossService {
  async create(params: {
    userId: string;
    positionId: string;
    symbol: string;
    type: "fixed" | "trailing";
    percentageThreshold: number;
    entryPrice: number;
  }): Promise<StopLoss> {
    const { stopLosses } = await getCollections();
    const uid = new ObjectId(params.userId);

    // Cancel any existing active stop-loss for this position
    await stopLosses.updateMany(
      { userId: uid, positionId: params.positionId, status: "active" },
      { $set: { status: "cancelled" } }
    );

    const anchorPrice = params.entryPrice;
    const triggerPrice = anchorPrice * (1 - params.percentageThreshold / 100);

    const doc: Omit<StopLoss, "_id"> = {
      userId: uid,
      positionId: params.positionId,
      symbol: params.symbol,
      type: params.type,
      percentageThreshold: params.percentageThreshold,
      anchorPrice,
      entryPrice: params.entryPrice,
      triggerPrice: Math.round(triggerPrice * 100) / 100,
      status: "active",
      triggeredAt: null,
      createdAt: new Date(),
    };

    const result = await stopLosses.insertOne(doc as StopLoss);
    return { _id: result.insertedId, ...doc };
  }

  async getActive(userId: string): Promise<StopLoss[]> {
    const { stopLosses } = await getCollections();
    return stopLosses
      .find({ userId: new ObjectId(userId), status: "active" })
      .toArray();
  }

  async getForPosition(positionId: string, userId: string): Promise<StopLoss | null> {
    const { stopLosses } = await getCollections();
    return stopLosses.findOne({
      positionId,
      userId: new ObjectId(userId),
      status: "active",
    });
  }

  async cancel(stopLossId: string, userId: string): Promise<void> {
    const { stopLosses } = await getCollections();
    await stopLosses.updateOne(
      { _id: new ObjectId(stopLossId), userId: new ObjectId(userId) },
      { $set: { status: "cancelled" } }
    );
  }

  async checkAll(): Promise<{ checked: number; triggered: number; updated: number }> {
    const { stopLosses, users } = await getCollections();

    const activeStops = await stopLosses
      .find({ status: "active" })
      .toArray();

    let triggered = 0;
    let updated = 0;

    for (const stop of activeStops) {
      let currentPrice: number;
      try {
        const quote = await marketDataService.getQuote(stop.symbol);
        currentPrice = quote.price;
      } catch {
        continue;
      }

      let didUpdate = false;

      if (stop.type === "trailing" && currentPrice > stop.anchorPrice) {
        // Anchor only moves up
        const newAnchor = currentPrice;
        const newTrigger = Math.round(newAnchor * (1 - stop.percentageThreshold / 100) * 100) / 100;
        await stopLosses.updateOne(
          { _id: stop._id },
          { $set: { anchorPrice: newAnchor, triggerPrice: newTrigger } }
        );
        stop.anchorPrice = newAnchor;
        stop.triggerPrice = newTrigger;
        didUpdate = true;
        updated++;
      }

      if (currentPrice <= stop.triggerPrice) {
        const now = new Date();
        await stopLosses.updateOne(
          { _id: stop._id },
          { $set: { status: "triggered", triggeredAt: now } }
        );

        // Look up the user's notification preferences
        const user = await users.findOne({ _id: stop.userId });
        const notifEnabled = user?.preferences?.notificationSettings?.stop_loss_triggered ?? true;

        if (notifEnabled) {
          await notificationService.create({
            userId: stop.userId.toString(),
            type: "stop_loss_triggered",
            title: `Stop-loss triggered: ${stop.symbol}`,
            message: `Your ${stop.type} stop-loss on ${stop.symbol} triggered at $${currentPrice.toFixed(2)} (trigger was $${stop.triggerPrice.toFixed(2)}).`,
            severity: "urgent",
            relatedEntityType: "stop_loss",
            relatedEntityId: stop._id.toString(),
          });
        }

        triggered++;
      } else if (!didUpdate) {
        // No-op — price between trigger and anchor
      }
    }

    return { checked: activeStops.length, triggered, updated };
  }
}

export const stopLossService = new StopLossService();
