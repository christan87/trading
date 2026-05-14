"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/Card";
import type { NotificationType } from "@/lib/db/models";

const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  stop_loss_triggered: "Stop-loss triggered",
  scan_opportunity: "High-confidence scan opportunity",
  virtual_trader_update: "Virtual trader monthly report",
  strategy_reeval: "Strategy re-evaluation completed",
  position_target_hit: "Position hit target price",
};

const NOTIFICATION_DESCRIPTIONS: Record<NotificationType, string> = {
  stop_loss_triggered: "Urgent alert when a stop-loss triggers (also enables browser push)",
  scan_opportunity: "When a scan finds a result with confidence > 80",
  virtual_trader_update: "Monthly evaluation reports from your virtual traders",
  strategy_reeval: "When Claude updates strategy parameters",
  position_target_hit: "When a tracked position hits its target price",
};

const ALL_TYPES: NotificationType[] = [
  "stop_loss_triggered",
  "scan_opportunity",
  "virtual_trader_update",
  "strategy_reeval",
  "position_target_hit",
];

export function NotificationSettingsPanel() {
  const [settings, setSettings] = useState<Partial<Record<NotificationType, boolean>>>({});
  const [pushSupported, setPushSupported] = useState(false);
  const [pushGranted, setPushGranted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/user/preferences")
      .then((r) => r.ok ? r.json() : {})
      .then((d: { notificationSettings?: Partial<Record<NotificationType, boolean>> }) => {
        if (d.notificationSettings) setSettings(d.notificationSettings);
      });

    setPushSupported("Notification" in window && "serviceWorker" in navigator);
    if ("Notification" in window) {
      setPushGranted(Notification.permission === "granted");
    }
  }, []);

  const toggle = (type: NotificationType) => {
    setSettings((prev) => ({ ...prev, [type]: !(prev[type] ?? true) }));
  };

  const requestPush = async () => {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPushGranted(result === "granted");
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    await fetch("/api/user/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationSettings: settings }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <Card>
      <p className="text-sm font-semibold text-zinc-300 mb-1">Notification Settings</p>
      <p className="text-xs text-zinc-500 mb-4">Choose which events trigger in-app notifications.</p>

      <div className="space-y-3">
        {ALL_TYPES.map((type) => (
          <label key={type} className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings[type] ?? true}
              onChange={() => toggle(type)}
              className="mt-0.5 accent-yellow-500"
            />
            <div>
              <p className="text-sm text-zinc-300">{NOTIFICATION_LABELS[type]}</p>
              <p className="text-xs text-zinc-600">{NOTIFICATION_DESCRIPTIONS[type]}</p>
            </div>
          </label>
        ))}
      </div>

      {pushSupported && (
        <div className="mt-4 pt-4 border-t border-zinc-800">
          <p className="text-xs text-zinc-400 mb-2">Browser push notifications (urgent alerts only)</p>
          {pushGranted ? (
            <p className="text-xs text-emerald-400">Push notifications enabled</p>
          ) : (
            <button
              onClick={requestPush}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors underline"
            >
              Enable browser push notifications
            </button>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-sm bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-semibold px-4 py-1.5 rounded-lg transition-colors"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-xs text-emerald-400">Saved.</span>}
      </div>
    </Card>
  );
}
