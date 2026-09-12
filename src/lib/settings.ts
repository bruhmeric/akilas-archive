import { db } from "@/lib/db";

export const DEFAULT_SETTINGS = {
  /** How long the presigned download URL stays valid after redemption (seconds) */
  presignExpirySeconds: 300,
  /** How long a one-time link can sit un-redeemed (hours) */
  linkExpiryHours: 24,
  /** Message of the day shown in the terminal */
  motd: "Welcome to Akila's Archive. Type `help` to get started.",
  /** How many objects `find` may scan per bucket */
  searchScanLimit: 20000,
};

export type SettingsKey = keyof typeof DEFAULT_SETTINGS;
export type Settings = Record<SettingsKey, string | number>;

export async function getSettings(): Promise<Settings> {
  const rows = await db.setting.findMany();
  const out: Settings = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (row.key in DEFAULT_SETTINGS) {
      const k = row.key as SettingsKey;
      if (typeof DEFAULT_SETTINGS[k] === "number") {
        const n = Number(row.value);
        if (!Number.isNaN(n)) out[k] = n;
      } else {
        out[k] = row.value;
      }
    }
  }
  return out;
}

export async function setSetting(key: SettingsKey, value: string): Promise<void> {
  await db.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}
