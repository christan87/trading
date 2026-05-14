import Anthropic from "@anthropic-ai/sdk";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getCollections } from "@/lib/db/mongodb";
import { marketDataService } from "@/lib/services/market-data";
import { marketScanService } from "@/lib/services/market-scan";
import { applyStrategyUpdate } from "@/lib/services/strategy-versioning";
import type { VirtualTrader, VirtualPosition } from "@/lib/db/models";
import {
  VIRTUAL_TRADER_EVAL_SYSTEM_PROMPT,
  buildVirtualTraderEvalPrompt,
} from "@/lib/prompts/virtual-trader-eval";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const EvalOutputSchema = z.object({
  analysis: z.string(),
  adjustments: z.array(
    z.object({
      parameter: z.string(),
      currentValue: z.string(),
      suggestedValue: z.string(),
      rationale: z.string(),
    })
  ),
  keepRunning: z.boolean(),
});

// Maximum open positions per virtual trader
const MAX_OPEN_POSITIONS = 5;
// Default position size as a fraction (falls back to config.maxPositionSizePct)
const DEFAULT_POSITION_PCT = 5;

export class VirtualTraderService {
  async createForUser(
    userId: string,
    strategyId: string,
    config: {
      virtualBalance: number;
      targetRoiPct: number;
      maxPositionSizePct: number;
    }
  ): Promise<VirtualTrader> {
    const { virtualTraders, strategies } = await getCollections();
    const uid = new ObjectId(userId);
    const sid = new ObjectId(strategyId);

    const strategy = await strategies.findOne({ _id: sid, userId: uid });
    if (!strategy) throw new Error("Strategy not found");

    const existing = await virtualTraders.findOne({ userId: uid, strategyId: sid });
    if (existing) throw new Error("Virtual trader already exists for this strategy");

    const now = new Date();
    const doc: Omit<VirtualTrader, "_id"> = {
      userId: uid,
      strategyId: sid,
      config: {
        virtualBalance: config.virtualBalance,
        targetRoiPct: config.targetRoiPct,
        maxPositionSizePct: Math.min(config.maxPositionSizePct, 10),
        isActive: true,
      },
      currentBalance: config.virtualBalance,
      totalReturnPct: 0,
      monthlyReturns: [],
      createdAt: now,
      updatedAt: now,
    };

    const result = await virtualTraders.insertOne(doc as VirtualTrader);
    return { _id: result.insertedId, ...doc };
  }

  async getForUser(userId: string): Promise<(VirtualTrader & { strategyName: string })[]> {
    const { virtualTraders, strategies } = await getCollections();
    const uid = new ObjectId(userId);
    const traders = await virtualTraders.find({ userId: uid }).toArray();

    return Promise.all(
      traders.map(async (t) => {
        const strategy = await strategies.findOne({ _id: t.strategyId });
        return { ...t, strategyName: strategy?.name ?? t.strategyId.toHexString() };
      })
    );
  }

  async getPositions(traderId: string, status?: "open" | "closed"): Promise<VirtualPosition[]> {
    const { virtualPositions } = await getCollections();
    const filter: Record<string, unknown> = { virtualTraderId: new ObjectId(traderId) };
    if (status) filter.status = status;
    return virtualPositions.find(filter).sort({ openedAt: -1 }).limit(100).toArray();
  }

  async runDailyScan(userId: string): Promise<{ tradersUpdated: number; positionsOpened: number }> {
    const { virtualTraders, scanResults, virtualPositions } = await getCollections();
    const uid = new ObjectId(userId);

    const activeTraders = await virtualTraders
      .find({ userId: uid, "config.isActive": true })
      .toArray();

    if (activeTraders.length === 0) return { tradersUpdated: 0, positionsOpened: 0 };

    // Run one market scan (shared across all traders for this user)
    const summary = await marketScanService.runScan("manual");

    if (summary.rateLimited || !summary.scanId) {
      return { tradersUpdated: 0, positionsOpened: 0 };
    }

    // Fetch the newly scanned results
    const newResults = await scanResults
      .find({ scanId: summary.scanId, "aiAnalysis.confidence": { $gte: 60 } })
      .sort({ "aiAnalysis.confidence": -1 })
      .limit(10)
      .toArray();

    let positionsOpened = 0;

    for (const trader of activeTraders) {
      const openCount = await virtualPositions.countDocuments({
        virtualTraderId: trader._id,
        status: "open",
      });

      if (openCount >= MAX_OPEN_POSITIONS) continue;

      const slots = MAX_OPEN_POSITIONS - openCount;
      const toOpen = newResults.slice(0, slots);

      for (const result of toOpen) {
        if (!result.aiAnalysis || !result.entryRange) continue;
        if (result.aiAnalysis.suggestedDirection === "watch") continue;

        let currentPrice: number;
        try {
          const quote = await marketDataService.getQuote(result.symbol);
          currentPrice = quote.price;
        } catch {
          currentPrice = result.entryRange.currentPrice;
        }

        const positionSizePct = trader.config.maxPositionSizePct ?? DEFAULT_POSITION_PCT;
        const allocationAmount = (trader.currentBalance * positionSizePct) / 100;
        const quantity = Math.max(1, Math.floor(allocationAmount / currentPrice));

        const targetPct = result.aiAnalysis.suggestedDirection === "long" ? 1.1 : 0.9;
        const stopPct = result.aiAnalysis.suggestedDirection === "long" ? 0.95 : 1.05;

        const now = new Date();
        const position: Omit<VirtualPosition, "_id"> = {
          virtualTraderId: trader._id,
          symbol: result.symbol,
          assetType: "equity",
          side: result.aiAnalysis.suggestedDirection === "long" ? "long" : "short",
          entryPrice: currentPrice,
          quantity,
          currentPrice,
          unrealizedPnlPct: 0,
          targetPrice: Math.round(currentPrice * targetPct * 100) / 100,
          stopLossPrice: Math.round(currentPrice * stopPct * 100) / 100,
          recommendationSnapshot: {
            rationale: result.aiAnalysis.thesis,
            confidence: result.aiAnalysis.confidence,
            dataInputs: result.triggerSummary,
          },
          status: "open",
          exitPrice: null,
          exitReason: null,
          realizedPnlPct: null,
          openedAt: now,
          closedAt: null,
        };

        await virtualPositions.insertOne(position as VirtualPosition);
        positionsOpened++;
      }
    }

    return { tradersUpdated: activeTraders.length, positionsOpened };
  }

  async monitorPositions(userId: string): Promise<{ checked: number; closed: number }> {
    const { virtualTraders, virtualPositions } = await getCollections();
    const uid = new ObjectId(userId);

    const activeTraders = await virtualTraders
      .find({ userId: uid, "config.isActive": true })
      .toArray();

    let totalChecked = 0;
    let totalClosed = 0;

    for (const trader of activeTraders) {
      const openPositions = await virtualPositions
        .find({ virtualTraderId: trader._id, status: "open" })
        .toArray();

      for (const pos of openPositions) {
        totalChecked++;

        let currentPrice: number;
        try {
          const quote = await marketDataService.getQuote(pos.symbol);
          currentPrice = quote.price;
        } catch {
          continue;
        }

        const pnlPct =
          pos.side === "long"
            ? ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100
            : ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100;

        // Update current price
        await virtualPositions.updateOne(
          { _id: pos._id },
          { $set: { currentPrice, unrealizedPnlPct: Math.round(pnlPct * 100) / 100 } }
        );

        // Check exit conditions
        const hitTarget =
          pos.side === "long"
            ? currentPrice >= pos.targetPrice
            : currentPrice <= pos.targetPrice;
        const hitStop =
          pos.side === "long"
            ? currentPrice <= pos.stopLossPrice
            : currentPrice >= pos.stopLossPrice;

        // Max hold: 30 calendar days
        const holdingDays = Math.floor((Date.now() - pos.openedAt.getTime()) / 86400_000);
        const hitTimeLimit = holdingDays >= 30;

        if (hitTarget || hitStop || hitTimeLimit) {
          const exitReason = hitTarget ? "target_hit" : hitStop ? "stop_hit" : "time_limit";
          const realizedPnlPct = Math.round(pnlPct * 100) / 100;
          const now = new Date();

          await virtualPositions.updateOne(
            { _id: pos._id },
            {
              $set: {
                status: "closed",
                exitPrice: currentPrice,
                exitReason,
                realizedPnlPct,
                closedAt: now,
              },
            }
          );

          // Adjust virtual balance
          const positionValue = pos.entryPrice * pos.quantity;
          const gainLoss = (pnlPct / 100) * positionValue;
          const newBalance = trader.currentBalance + gainLoss;

          await virtualPositions.updateOne({ _id: pos._id }, { $set: {} }); // no-op, balance updated below

          const totalReturnPct =
            ((newBalance - trader.config.virtualBalance) / trader.config.virtualBalance) * 100;

          await virtualTraders.updateOne(
            { _id: trader._id },
            {
              $set: {
                currentBalance: Math.round(newBalance * 100) / 100,
                totalReturnPct: Math.round(totalReturnPct * 100) / 100,
                updatedAt: now,
              },
            }
          );

          // Refresh trader in-memory for subsequent positions in this batch
          trader.currentBalance = Math.round(newBalance * 100) / 100;

          totalClosed++;
        }
      }
    }

    return { checked: totalChecked, closed: totalClosed };
  }

  async runMonthlyEvaluation(userId: string): Promise<{ evaluated: number; updated: number }> {
    const { virtualTraders, virtualPositions, strategies } = await getCollections();
    const uid = new ObjectId(userId);

    const now = new Date();
    const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    // Look at positions closed in the last 31 days
    const since = new Date(Date.now() - 31 * 86400_000);

    const activeTraders = await virtualTraders
      .find({ userId: uid, "config.isActive": true })
      .toArray();

    let evaluated = 0;
    let updated = 0;

    for (const trader of activeTraders) {
      const strategy = await strategies.findOne({ _id: trader.strategyId });
      if (!strategy) continue;

      const closedThisMonth = await virtualPositions
        .find({
          virtualTraderId: trader._id,
          status: "closed",
          closedAt: { $gte: since },
        })
        .toArray();

      const openCount = await virtualPositions.countDocuments({
        virtualTraderId: trader._id,
        status: "open",
      });

      // Compute month return from balance delta
      const lastMonthEntry = trader.monthlyReturns.at(-1);
      const startBalance = lastMonthEntry?.endBalance ?? trader.config.virtualBalance;
      const monthReturnPct =
        Math.round(((trader.currentBalance - startBalance) / startBalance) * 10000) / 100;

      const closedPayload = closedThisMonth.map((p) => ({
        symbol: p.symbol,
        side: p.side,
        entryPrice: p.entryPrice,
        exitPrice: p.exitPrice ?? p.entryPrice,
        realizedPnlPct: p.realizedPnlPct ?? 0,
        exitReason: p.exitReason ?? "unknown",
        holdingDays: p.closedAt
          ? Math.floor((p.closedAt.getTime() - p.openedAt.getTime()) / 86400_000)
          : 0,
        rationale: p.recommendationSnapshot.rationale,
      }));

      const priorMonthlyReturns = trader.monthlyReturns.slice(-6).map((m) => ({
        month: m.month,
        returnPct: m.returnPct,
      }));

      // Call Claude Sonnet for evaluation
      let evalResult: z.infer<typeof EvalOutputSchema> | null = null;
      try {
        const response = await client.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 1024,
          system: [
            {
              type: "text",
              text: VIRTUAL_TRADER_EVAL_SYSTEM_PROMPT,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: [
            {
              role: "user",
              content: buildVirtualTraderEvalPrompt({
                strategyType: strategy.type,
                month: monthKey,
                config: trader.config,
                currentBalance: trader.currentBalance,
                monthReturn: monthReturnPct,
                closedPositions: closedPayload,
                openPositionCount: openCount,
                priorMonthlyReturns,
              }),
            },
          ],
        });

        const rawText = response.content[0].type === "text" ? response.content[0].text : "";
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          evalResult = EvalOutputSchema.parse(parsed);
        }
      } catch (err) {
        console.error("[virtual-trader] eval Claude error:", err);
      }

      // Record monthly return
      const monthEntry = {
        month: monthKey,
        startBalance,
        endBalance: trader.currentBalance,
        returnPct: monthReturnPct,
        tradesExecuted: closedThisMonth.length,
        winRate:
          closedThisMonth.length > 0
            ? Math.round(
                (closedThisMonth.filter((p) => (p.realizedPnlPct ?? 0) > 0).length /
                  closedThisMonth.length) *
                  100
              ) / 100
            : 0,
      };

      await virtualTraders.updateOne(
        { _id: trader._id },
        {
          $push: { monthlyReturns: monthEntry },
          $set: { updatedAt: now },
        }
      );

      evaluated++;

      // Apply strategy parameter adjustments if Claude produced them
      if (evalResult && evalResult.adjustments.length > 0) {
        const newParams: Record<string, unknown> = { ...strategy.parameters };
        for (const adj of evalResult.adjustments) {
          newParams[adj.parameter] = adj.suggestedValue;
        }
        try {
          await applyStrategyUpdate(
            userId,
            strategy.type,
            newParams,
            `Virtual trader monthly evaluation ${monthKey}: ${evalResult.analysis}`
          );
          updated++;
        } catch (err) {
          console.error("[virtual-trader] applyStrategyUpdate error:", err);
        }
      }

      // Deactivate if Claude recommends stopping
      if (evalResult && !evalResult.keepRunning) {
        await virtualTraders.updateOne(
          { _id: trader._id },
          { $set: { "config.isActive": false, updatedAt: now } }
        );
      }
    }

    return { evaluated, updated };
  }

  async updateConfig(
    traderId: string,
    userId: string,
    patch: Partial<VirtualTrader["config"]>
  ): Promise<void> {
    const { virtualTraders } = await getCollections();
    const setFields: Record<string, unknown> = { updatedAt: new Date() };
    for (const [k, v] of Object.entries(patch)) {
      setFields[`config.${k}`] = v;
    }
    await virtualTraders.updateOne(
      { _id: new ObjectId(traderId), userId: new ObjectId(userId) },
      { $set: setFields }
    );
  }
}

export const virtualTraderService = new VirtualTraderService();
