import fs from "fs/promises"
import path from "path"
import * as baileys from "baileys"
import type * as types from "../types/types.js"
import { connect } from "../database/connect.js"
import * as database from "../database/database.js"
import { Bot } from "../bot/bot.js"
import { getRuntimeAssetPath, getRuntimeBotName, getRuntimeChannelUrl, getRuntimeCommandPrefixes, getRuntimeCurrencyName, getRuntimeOwnerJid, getRuntimeOwnerLid, getRuntimeOwnerName, getRuntimeOwnerPn, getRuntimeReceptionNumber, getRuntimeSocialLinks, normalizePrefixes, normalizeReceptionNumber, parseOptionalUrl } from "./zeta_cf.js"
import { getEffectiveBotJid } from "./bot-scope.js"

interface BotSession {
  bot_id: string
  bot_jid: string
  bot_number: string
  owner_jid: string
  user_jid?: string
  bot_type: "free" | "premium" | "main"
  parent_bot_jid?: string
  session_path: string
  is_active: boolean
  created_at: string
  expires_at?: string
  last_seen?: string
}

interface BotsData {
  bots: BotSession[]
  last_updated: string
  version: string
}

type PremiumProfileSetting = {
  key: string
  value: string
}

type PremiumProfileSubOwner = {
  user_jid: string
  added_by?: string
}

type PremiumBotProfile = {
  bot_number: string
  bot_jid: string
  saved_at: string
  expires_at: string
  asset_backup_path?: string
  bot: Partial<types.BotDocument>
  settings: PremiumProfileSetting[]
  subowners: PremiumProfileSubOwner[]
}

type PremiumBotProfilesFile = {
  version: string
  last_updated: string
  profiles: Record<string, PremiumBotProfile>
}

const PREMIUM_PROFILE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const PREMIUM_PROFILES_PATH = path.join(process.cwd(), "databot", "premium-bot-profiles.json")
const PREMIUM_PROFILE_ASSETS_DIR = path.join(process.cwd(), "backups", "premium-profiles-assets")

const cleanProfileText = (value: unknown): string => String(value ?? "").trim()
const premiumNumberKey = (value: unknown): string => cleanProfileText(value).split("@")[0].replace(/[^0-9]/g, "")
const premiumJidByNumber = (number: string): string => `${number}@s.whatsapp.net`

const premiumProfileInitialData = (): PremiumBotProfilesFile => ({
  version: "1.0.0",
  last_updated: new Date().toISOString(),
  profiles: {},
})

const pathExistsSafe = async (targetPath: string): Promise<boolean> => {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

const readPremiumProfiles = async (): Promise<PremiumBotProfilesFile> => {
  try {
    const raw = await fs.readFile(PREMIUM_PROFILES_PATH, "utf8")
    const parsed = JSON.parse(raw) as PremiumBotProfilesFile
    return {
      version: parsed?.version || "1.0.0",
      last_updated: parsed?.last_updated || new Date().toISOString(),
      profiles: parsed?.profiles && typeof parsed.profiles === "object" ? parsed.profiles : {},
    }
  } catch {
    await fs.mkdir(path.dirname(PREMIUM_PROFILES_PATH), { recursive: true }).catch(() => {})
    const initial = premiumProfileInitialData()
    await fs.writeFile(PREMIUM_PROFILES_PATH, JSON.stringify(initial, null, 2)).catch(() => {})
    return initial
  }
}

const writePremiumProfiles = async (data: PremiumBotProfilesFile): Promise<void> => {
  data.last_updated = new Date().toISOString()
  await fs.mkdir(path.dirname(PREMIUM_PROFILES_PATH), { recursive: true })
  await fs.writeFile(PREMIUM_PROFILES_PATH, JSON.stringify(data, null, 2))
}

const premiumProfileAssetsPath = (botNumber: string): string => path.join(PREMIUM_PROFILE_ASSETS_DIR, `prem-${botNumber}`)
const premiumRuntimeAssetsPath = (botNumber: string): string => path.join(process.cwd(), "database", "assets", "sockets", botNumber)

const cleanupExpiredPremiumProfiles = async (data?: PremiumBotProfilesFile): Promise<PremiumBotProfilesFile> => {
  const profiles = data || await readPremiumProfiles()
  const now = Date.now()
  let changed = false

  for (const [number, profile] of Object.entries(profiles.profiles)) {
    const expires = new Date(profile.expires_at).getTime()
    if (!Number.isFinite(expires) || expires <= now) {
      delete profiles.profiles[number]
      changed = true
      const assetPath = profile.asset_backup_path || premiumProfileAssetsPath(number)
      await fs.rm(assetPath, { recursive: true, force: true }).catch(() => {})
    }
  }

  if (changed) await writePremiumProfiles(profiles).catch(() => {})
  return profiles
}

const dbAllSafe = async <T = any>(query: string, params: any[] = []): Promise<T[]> => {
  try {
    const db = await connect()
    return await new Promise<T[]>((resolve) => {
      db.all(query, params, (err, rows: T[]) => {
        if (err) {
          console.error("[PremiumProfile] DB all error:", err)
          resolve([])
        } else {
          resolve(rows || [])
        }
      })
    })
  } catch (error) {
    console.error("[PremiumProfile] DB all catch:", error)
    return []
  }
}

const dbRunSafe = async (query: string, params: any[] = []): Promise<boolean> => {
  try {
    const db = await connect()
    return await new Promise<boolean>((resolve) => {
      db.run(query, params, (err) => {
        if (err) {
          console.error("[PremiumProfile] DB run error:", err)
          resolve(false)
        } else {
          resolve(true)
        }
      })
    })
  } catch (error) {
    console.error("[PremiumProfile] DB run catch:", error)
    return false
  }
}

const getEditablePremiumBotData = (bot: types.BotDocument): Partial<types.BotDocument> => ({
  bot_jid: bot.bot_jid,
  name: bot.name || "",
  owner_jid: bot.owner_jid || "",
  owner_lid: bot.owner_lid || "",
  owner_pn: bot.owner_pn || "",
  owner_name: bot.owner_name || "",
  owner_number: bot.owner_number || "",
  logo_url: bot.logo_url || "",
  thumbnail_url: bot.thumbnail_url || "",
  submenu_url: bot.submenu_url || "",
  welcome_url: bot.welcome_url || "",
  rpg_url: bot.rpg_url || "",
  channel_url: bot.channel_url || "",
  facebook_url: bot.facebook_url || "",
  instagram_url: bot.instagram_url || "",
  tiktok_url: bot.tiktok_url || "",
  telegram_url: bot.telegram_url || "",
  prefixes: bot.prefixes || "",
  setup_completed: bot.setup_completed ? 1 : 0,
  setup_step: Number(bot.setup_step || 0),
  bot_type: "premium",
  parent_bot_jid: "",
  currency: bot.currency || "",
  username: bot.username || "",
  status: bot.status || "",
  autojoin_enabled: bot.autojoin_enabled ? 1 : 0,
})

const hasActivePremiumTokenByNumber = async (botNumber: string): Promise<boolean> => {
  const rows = await dbAllSafe<{ id: number; expires_at: string }>(
    `SELECT id, expires_at FROM premium_codes
     WHERE bot_number = ?
       AND is_active = 1
       AND bot_type = 'premium'`,
    [botNumber],
  )
  const now = Date.now()
  return rows.some((row) => {
    const expires = new Date(row.expires_at).getTime()
    return Number.isFinite(expires) && expires > now
  })
}

export const markPremiumTokenReusableByNumber = async (botNumberInput: string): Promise<boolean> => {
  const botNumber = premiumNumberKey(botNumberInput)
  if (!botNumber) return false

  return dbRunSafe(
    `UPDATE premium_codes
     SET is_active = 1,
         notifications_sent = 0
     WHERE bot_number = ?
       AND bot_type = 'premium'`,
    [botNumber],
  )
}

export const savePremiumBotProfileByNumber = async (botNumberInput: string, botJidInput = ""): Promise<boolean> => {
  const botNumber = premiumNumberKey(botNumberInput)
  if (!botNumber) return false

  const botJid = cleanProfileText(botJidInput) || premiumJidByNumber(botNumber)
  const bot = await database.Bots.find(botJid).catch(() => null)
  if (!bot || bot.bot_type !== "premium") return false

  const settings = await dbAllSafe<PremiumProfileSetting>(
    `SELECT key, value FROM bot_settings WHERE bot_jid = ? ORDER BY key ASC`,
    [botJid],
  )
  const subowners = await dbAllSafe<PremiumProfileSubOwner>(
    `SELECT user_jid, added_by FROM bot_subowners WHERE bot_jid = ? ORDER BY created_at ASC`,
    [botJid],
  )

  const assetSourcePath = premiumRuntimeAssetsPath(botNumber)
  const assetBackupPath = premiumProfileAssetsPath(botNumber)
  if (await pathExistsSafe(assetSourcePath)) {
    await fs.mkdir(path.dirname(assetBackupPath), { recursive: true }).catch(() => {})
    await fs.rm(assetBackupPath, { recursive: true, force: true }).catch(() => {})
    await fs.cp(assetSourcePath, assetBackupPath, { recursive: true, force: true }).catch((error) => {
      console.error("[PremiumProfile] Error guardando assets:", error)
    })
  }

  const profiles = await cleanupExpiredPremiumProfiles()
  profiles.profiles[botNumber] = {
    bot_number: botNumber,
    bot_jid: botJid,
    saved_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + PREMIUM_PROFILE_TTL_MS).toISOString(),
    asset_backup_path: assetBackupPath,
    bot: getEditablePremiumBotData(bot),
    settings,
    subowners,
  }

  await writePremiumProfiles(profiles)
  console.log(`[PremiumProfile] Datos guardados por 7 días: ${botNumber}`)
  return true
}

export const restorePremiumBotProfileByNumber = async (
  botNumberInput: string,
  botJidInput = "",
  ownerJidInput = "",
): Promise<boolean> => {
  const botNumber = premiumNumberKey(botNumberInput)
  if (!botNumber) return false

  const profiles = await cleanupExpiredPremiumProfiles()
  const profile = profiles.profiles[botNumber]
  if (!profile) return false

  const botJid = cleanProfileText(botJidInput) || premiumJidByNumber(botNumber)
  const ownerJid = cleanProfileText(ownerJidInput) || cleanProfileText(profile.bot.owner_jid) || botJid

  if (!(await hasActivePremiumTokenByNumber(botNumber))) {
    console.log(`[PremiumProfile] Perfil encontrado, pero no hay token premium activo para ${botNumber}`)
    return false
  }

  const assetBackupPath = profile.asset_backup_path || premiumProfileAssetsPath(botNumber)
  const assetRuntimePath = premiumRuntimeAssetsPath(botNumber)
  if (await pathExistsSafe(assetBackupPath)) {
    await fs.mkdir(path.dirname(assetRuntimePath), { recursive: true }).catch(() => {})
    await fs.rm(assetRuntimePath, { recursive: true, force: true }).catch(() => {})
    await fs.cp(assetBackupPath, assetRuntimePath, { recursive: true, force: true }).catch((error) => {
      console.error("[PremiumProfile] Error restaurando assets:", error)
    })
  }

  const restoredBot: Partial<types.BotDocument> = {
    ...profile.bot,
    bot_jid: botJid,
    owner_jid: ownerJid,
    bot_type: "premium",
    parent_bot_jid: "",
    setup_completed: profile.bot.setup_completed ?? 1,
    setup_step: Number(profile.bot.setup_step || 0),
  }

  await database.Bots.set(botJid, restoredBot)

  await dbRunSafe(`DELETE FROM bot_settings WHERE bot_jid = ?`, [botJid])
  for (const setting of profile.settings || []) {
    const key = cleanProfileText(setting.key)
    if (!key) continue
    await dbRunSafe(
      `INSERT INTO bot_settings (bot_jid, key, value)
       VALUES (?, ?, ?)
       ON CONFLICT(bot_jid, key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      [botJid, key, cleanProfileText(setting.value)],
    )
  }

  await dbRunSafe(`DELETE FROM bot_subowners WHERE bot_jid = ?`, [botJid])
  for (const subowner of profile.subowners || []) {
    const userJid = cleanProfileText(subowner.user_jid)
    if (!userJid) continue
    await dbRunSafe(
      `INSERT INTO bot_subowners (bot_jid, user_jid, added_by)
       VALUES (?, ?, ?)
       ON CONFLICT(bot_jid, user_jid) DO UPDATE SET added_by = excluded.added_by`,
      [botJid, userJid, cleanProfileText(subowner.added_by)],
    )
  }

  console.log(`[PremiumProfile] Datos restaurados por número: ${botNumber}`)
  return true
}

export class BotPersistence {
  private static readonly JSON_PATH = path.join(process.cwd(), "databot", "bots.json")

  static async initializeTables(): Promise<void> {
    return new Promise((resolve, reject) => {
      connect()
        .then((db) => {
          db.exec(`
            CREATE TABLE IF NOT EXISTS bot_sessions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              bot_id TEXT UNIQUE NOT NULL,
              bot_jid TEXT UNIQUE NOT NULL,
              bot_number TEXT NOT NULL,
              owner_jid TEXT NOT NULL,
              user_jid TEXT DEFAULT '',
              bot_type TEXT NOT NULL,
              parent_bot_jid TEXT DEFAULT '',
              session_path TEXT NOT NULL,
              is_active INTEGER DEFAULT 1,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP,
              expires_at TEXT,
              last_seen TEXT,
              UNIQUE(bot_jid)
            )
          `)

          db.run(`ALTER TABLE bot_sessions ADD COLUMN parent_bot_jid TEXT DEFAULT ''`, () => {})
          db.run(`ALTER TABLE bot_sessions ADD COLUMN user_jid TEXT DEFAULT ''`, () => {})
          db.run(`ALTER TABLE bot_sessions ADD COLUMN notified INTEGER DEFAULT 0`, () => {})
          db.run(`ALTER TABLE bot_sessions ADD COLUMN notifications_sent INTEGER DEFAULT 0`, () => {})
          db.run(`ALTER TABLE bot_sessions ADD COLUMN original_type TEXT DEFAULT ''`, () => {})

          db.exec(`
            CREATE INDEX IF NOT EXISTS idx_bot_sessions_bot_jid ON bot_sessions(bot_jid);
            CREATE INDEX IF NOT EXISTS idx_bot_sessions_owner_jid ON bot_sessions(owner_jid);
            CREATE INDEX IF NOT EXISTS idx_bot_sessions_bot_type ON bot_sessions(bot_type);
            CREATE INDEX IF NOT EXISTS idx_bot_sessions_is_active ON bot_sessions(is_active);
          `)

          this.ensureBotsFile()
            .then(() => resolve())
            .catch(reject)
        })
        .catch(reject)
    })
  }

  static async ensureBotsFile(): Promise<void> {
    try {
      await fs.access(this.JSON_PATH)
    } catch {
      await fs.mkdir(path.dirname(this.JSON_PATH), { recursive: true })
      const initialData: BotsData = {
        bots: [],
        last_updated: new Date().toISOString(),
        version: "1.0.0",
      }
      await fs.writeFile(this.JSON_PATH, JSON.stringify(initialData, null, 2))
    }
  }

  static async addBot(botData: Omit<BotSession, "created_at">): Promise<void> {
    return new Promise((resolve, reject) => {
      connect()
        .then((db) => {
          const now = new Date().toISOString()

          db.run(
            `
            INSERT INTO bot_sessions
            (bot_id, bot_jid, bot_number, owner_jid, user_jid, bot_type, parent_bot_jid, session_path, is_active, created_at, expires_at, last_seen)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(bot_jid) DO UPDATE SET
              bot_id = excluded.bot_id,
              bot_number = excluded.bot_number,
              owner_jid = COALESCE(NULLIF(excluded.owner_jid, ''), bot_sessions.owner_jid),
              user_jid = COALESCE(NULLIF(excluded.user_jid, ''), NULLIF(bot_sessions.user_jid, ''), excluded.owner_jid),
              bot_type = excluded.bot_type,
              parent_bot_jid = COALESCE(NULLIF(excluded.parent_bot_jid, ''), bot_sessions.parent_bot_jid),
              session_path = excluded.session_path,
              is_active = excluded.is_active,
              expires_at = COALESCE(excluded.expires_at, bot_sessions.expires_at),
              last_seen = excluded.last_seen
          `,
            [
              botData.bot_id,
              botData.bot_jid,
              botData.bot_number,
              botData.owner_jid,
              botData.user_jid || botData.owner_jid,
              botData.bot_type,
              botData.parent_bot_jid || "",
              botData.session_path,
              botData.is_active ? 1 : 0,
              now,
              botData.expires_at || null,
              now,
            ],
            (err) => {
              if (err) {
                reject(err)
              } else {
                this.syncToJSON()
                  .then(() => {
                    console.log(`[BotPersistence] Bot added: ${botData.bot_number}`)
                    resolve()
                  })
                  .catch(reject)
              }
            },
          )
        })
        .catch(reject)
    })
  }

  static async removeBot(botJid: string): Promise<void> {
    return new Promise((resolve, reject) => {
      connect()
        .then((db) => {
          db.run(`DELETE FROM bot_sessions WHERE bot_jid = ?`, [botJid], (err) => {
            if (err) {
              reject(err)
            } else {
              this.syncToJSON()
                .then(() => {
                  console.log(`[BotPersistence] Bot removed: ${botJid}`)
                  resolve()
                })
                .catch(reject)
            }
          })
        })
        .catch(reject)
    })
  }

  static async updateBotStatus(botJid: string, isActive: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      connect()
        .then((db) => {
          const now = new Date().toISOString()

          db.run(
            `
            UPDATE bot_sessions
            SET is_active = ?, last_seen = ?
            WHERE bot_jid = ?
          `,
            [isActive ? 1 : 0, now, botJid],
            (err) => {
              if (err) {
                reject(err)
              } else {
                this.syncToJSON()
                  .then(() => {
                    console.log(`[BotPersistence] Bot status updated: ${botJid} -> ${isActive ? "active" : "inactive"}`)
                    resolve()
                  })
                  .catch(reject)
              }
            },
          )
        })
        .catch(reject)
    })
  }

  static async loadBots(): Promise<BotSession[]> {
    return new Promise((resolve, reject) => {
      connect()
        .then((db) => {
          db.all(`SELECT * FROM bot_sessions ORDER BY created_at DESC`, [], (err, rows: any[]) => {
            if (err) {
              reject(err)
            } else {
              const bots = rows.map((row) => ({
                ...row,
                is_active: Boolean(row.is_active),
              }))
              resolve(bots)
            }
          })
        })
        .catch(reject)
    })
  }

  static async getActiveBots(): Promise<BotSession[]> {
    return new Promise((resolve, reject) => {
      connect()
        .then((db) => {
          db.all(
            `
            SELECT * FROM bot_sessions
            WHERE is_active = 1
            ORDER BY created_at DESC
          `,
            [],
            (err, rows: any[]) => {
              if (err) {
                reject(err)
              } else {
                const bots = rows.map((row) => ({
                  ...row,
                  is_active: Boolean(row.is_active),
                }))
                resolve(bots)
              }
            },
          )
        })
        .catch(reject)
    })
  }

  static async getBotByJid(botJid: string): Promise<BotSession | null> {
    return new Promise((resolve, reject) => {
      connect()
        .then((db) => {
          db.get(`SELECT * FROM bot_sessions WHERE bot_jid = ?`, [botJid], (err, row: any) => {
            if (err) {
              reject(err)
            } else if (row) {
              resolve({
                ...row,
                is_active: Boolean(row.is_active),
              })
            } else {
              resolve(null)
            }
          })
        })
        .catch(reject)
    })
  }

  static async syncToJSON(): Promise<void> {
    try {
      const bots = await this.loadBots()
      const data: BotsData = {
        bots,
        last_updated: new Date().toISOString(),
        version: "1.0.0",
      }

      await fs.mkdir(path.dirname(this.JSON_PATH), { recursive: true })
      await fs.writeFile(this.JSON_PATH, JSON.stringify(data, null, 2))
    } catch (error) {
      console.error("[BotPersistence] Error syncing to JSON:", error)
    }
  }

  static async saveBots(bots: BotSession[]): Promise<void> {
    try {
      const data: BotsData = {
        bots,
        last_updated: new Date().toISOString(),
        version: "1.0.0",
      }

      await fs.writeFile(this.JSON_PATH, JSON.stringify(data, null, 2))
    } catch (error) {
      console.error("[BotPersistence] Error saving bots:", error)
    }
  }

  static async getBotsFromJSON(): Promise<BotSession[]> {
    try {
      const data = await fs.readFile(this.JSON_PATH, "utf8")
      const parsed: BotsData = JSON.parse(data)
      return parsed.bots || []
    } catch (error) {
      return []
    }
  }

  static async getBotsByType(botType: "free" | "premium" | "main"): Promise<BotSession[]> {
    return new Promise((resolve, reject) => {
      connect()
        .then((db) => {
          db.all(`SELECT * FROM bot_sessions WHERE bot_type = ? AND is_active = 1`, [botType], (err, rows: any[]) => {
            if (err) {
              reject(err)
            } else {
              const bots = rows.map((row) => ({
                ...row,
                is_active: Boolean(row.is_active),
              }))
              resolve(bots)
            }
          })
        })
        .catch(reject)
    })
  }

  static async cleanupExpiredPremium(): Promise<void> {
    try {
      const bots = await this.loadBots()
      const now = new Date()
      let hasChanges = false

      for (const bot of bots) {
        if (bot.bot_type === "premium" && bot.expires_at) {
          const expiresAt = new Date(bot.expires_at)
          if (now > expiresAt) {
            await this.removeBot(bot.bot_jid)

            try {
              await fs.rm(bot.session_path, { recursive: true, force: true })
              console.log(`[BotPersistence] Removed expired premium session: ${bot.bot_number}`)
            } catch (error) {
              console.error(`[BotPersistence] Error removing session: ${error}`)
            }

            hasChanges = true
          }
        }
      }

      if (hasChanges) {
        console.log("[BotPersistence] Cleaned up expired premium bots")
      }
    } catch (error) {
      console.error("[BotPersistence] Error in cleanup:", error)
    }
  }
}

const clean = (value: unknown): string => String(value ?? "").trim()
const stripJidDevice = (jid?: string | null): string => clean(jid).split(":")[0].toLowerCase()
const jidServer = (jid?: string | null): string => stripJidDevice(jid).split("@")[1] || ""
const isLidJid = (jid?: string | null): boolean => jidServer(jid) === "lid"
const isPhoneJid = (jid?: string | null): boolean => jidServer(jid) === "s.whatsapp.net"

export const jidNumber = (jid?: string | null): string =>
  stripJidDevice(jid)
    .split("@")[0]
    .replace(/[^0-9]/g, "")

export const normalizeJid = (value?: string | null): string => {
  const text = stripJidDevice(value)
  if (!text) return ""
  if (/@(lid|s\.whatsapp\.net)$/i.test(text)) return text

  const number = jidNumber(text)
  return number ? `${number}@s.whatsapp.net` : ""
}

export const sameUser = (left?: string | null, right?: string | null): boolean => {
  const rawLeft = stripJidDevice(left)
  const rawRight = stripJidDevice(right)
  const a = normalizeJid(rawLeft) || rawLeft
  const b = normalizeJid(rawRight) || rawRight

  if (!a || !b) return false
  if (a === b) return true

  if (isLidJid(a) || isLidJid(b)) return false

  const aNumber = jidNumber(a)
  const bNumber = jidNumber(b)
  if (!aNumber || !bNumber) return false

  const aIsPhoneLike = isPhoneJid(a) || !jidServer(a)
  const bIsPhoneLike = isPhoneJid(b) || !jidServer(b)
  return aIsPhoneLike && bIsPhoneLike && aNumber === bNumber
}

export const getBotOwnerIdentityJids = (bot?: Partial<types.BotDocument> | null): string[] => {
  const values = [bot?.owner_jid, bot?.owner_lid, bot?.owner_pn]
  const number = jidNumber(bot?.owner_number || bot?.owner_pn || bot?.owner_jid || "")
  if (number) values.push(`${number}@s.whatsapp.net`)

  return Array.from(
    new Set(
      values
        .map((jid) => normalizeJid(String(jid || "")) || stripJidDevice(String(jid || "")))
        .filter(Boolean),
    ),
  )
}

export const isBotOwnerIdentity = (senderJid: string, bot?: Partial<types.BotDocument> | null): boolean => {
  const sender = normalizeJid(senderJid) || stripJidDevice(senderJid)
  if (!sender) return false
  return getBotOwnerIdentityJids(bot).some((ownerJid) => sameUser(sender, ownerJid) || sender === ownerJid)
}

export const isFreeBot = (bot?: Partial<types.BotDocument>): boolean => bot?.bot_type === "free"
export const isPremiumOrMainBot = (bot?: Partial<types.BotDocument>): boolean => bot?.bot_type === "main" || bot?.bot_type === "premium"

export const ownerIsConfigured = (ownerJid?: string | null): boolean => {
  const raw = stripJidDevice(ownerJid)
  return Boolean(raw && /@(lid|s\.whatsapp\.net)$/i.test(raw))
}

export const isEstablishedBotOwner = (senderJid: string, bot?: Partial<types.BotDocument>): boolean => {
  const runtimeOwners = [getRuntimeOwnerJid(), getRuntimeOwnerLid(), getRuntimeOwnerPn()]
  const hasBotOwnerId = getBotOwnerIdentityJids(bot).length > 0
  return (hasBotOwnerId && isBotOwnerIdentity(senderJid, bot)) || runtimeOwners.some((ownerJid) => sameUser(senderJid, ownerJid) || stripJidDevice(senderJid) === stripJidDevice(ownerJid))
}

export const denyFreeSocketMessage = (): string =>
  `「◈」 Sockets\n◈ Acceso › denegado\n◈ Motivo › los sockets gratis no pueden usar esta función.`

export const socketOwnerOnlyMessage = (): string =>
  `「◈」 Sockets\n◈ Acceso › denegado\n◈ Motivo › solo el owner establecido del bot oficial/premium puede usar esto.`

export const canManagePremiumTokens = (senderJid: string, bot?: Partial<types.BotDocument>): boolean => {
  if (!isPremiumOrMainBot(bot)) return false
  if (bot?.bot_type === "premium") return isBotOwnerIdentity(senderJid, bot)
  return isEstablishedBotOwner(senderJid, bot)
}

export const canManageSocket = (senderJid: string, bot?: Partial<types.BotDocument>): boolean => {
  if (!bot) return false
  if (isFreeBot(bot)) return isBotOwnerIdentity(senderJid, bot)
  return isEstablishedBotOwner(senderJid, bot)
}

export const isSameBotActor = (senderJid: string, bot?: Partial<types.BotDocument>): boolean => {
  if (!bot) return false
  return sameUser(senderJid, bot.bot_jid) || sameUser(senderJid, getEffectiveBotJid(bot))
}

export const canConfigureSocket = (senderJid: string, bot?: Partial<types.BotDocument>): boolean => {
  if (!bot || isFreeBot(bot)) return false
  if (isSameBotActor(senderJid, bot)) return true
  if (bot.bot_type === "premium") return isBotOwnerIdentity(senderJid, bot)
  return isEstablishedBotOwner(senderJid, bot)
}

export const denyFreeConfigMessage = (): string =>
  `「◈」 Sockets\n◈ Acceso › denegado\n◈ Tipo › free\n◈ Motivo › los sockets gratis no pueden cambiar nombre, moneda, imágenes ni ajustes.`

export const socketConfigOnlyMessage = (): string =>
  `「◈」 Sockets\n◈ Acceso › denegado\n◈ Motivo › solo el owner del socket premium/oficial puede cambiar su propia configuración.`

export const socketHeader = (title: string): string => `「◈」 ${title}`

export const socketUsage = (title: string, lines: string[]): string => {
  let text = `${socketHeader(title)}\n`
  for (const line of lines) text += `◈ ${line}\n`
  return text.trimEnd()
}

export type SocketAssetKind = "logo" | "banner" | "welcome" | "submenu" | "rpg"

const extensionFromMime = (mimetype: string): string => {
  const mime = clean(mimetype).toLowerCase()
  if (mime.includes("png")) return "png"
  if (mime.includes("webp")) return "webp"
  if (mime.includes("gif")) return "gif"
  return "jpg"
}

export const saveSocketAsset = async (
  botJid: string,
  kind: SocketAssetKind,
  buffer: Buffer,
  mimetype = "image/jpeg",
): Promise<string> => {
  const number = jidNumber(botJid) || "unknown"
  const ext = extensionFromMime(mimetype)
  const dir = path.join(process.cwd(), "database", "assets", "sockets", number)
  await fs.mkdir(dir, { recursive: true })

  await deleteAssetVariants(dir, kind)
  const filePath = path.join(dir, `${kind}.${ext}`)
  await fs.writeFile(filePath, buffer)
  return filePath
}

const officialFileBase: Record<SocketAssetKind, string> = {
  logo: "icono-bot",
  banner: "imagen-general",
  welcome: "imagen-bienvenidas-salidas",
  submenu: "imagen-sub-principal",
  rpg: "imagen-rpg",
}

const deleteAssetVariants = async (dir: string, fileBase: string) => {
  for (const ext of ["jpg", "jpeg", "png", "webp", "gif", "mp4"]) {
    await fs.rm(path.join(dir, `${fileBase}.${ext}`), { force: true }).catch(() => {})
  }
}

export const saveOfficialAsset = async (
  kind: SocketAssetKind,
  buffer: Buffer,
  mimetype = "image/jpeg",
): Promise<string> => {
  const ext = extensionFromMime(mimetype)
  const fileBase = officialFileBase[kind]
  const dir = path.join(process.cwd(), "base_zeta_assets", "oficial")
  await fs.mkdir(dir, { recursive: true })

  await deleteAssetVariants(dir, fileBase)
  const filePath = path.join(dir, `${fileBase}.${ext}`)
  await fs.writeFile(filePath, buffer)
  return filePath
}

export const extractInviteCode = (text: string): string => {
  const input = clean(text)
  const match = input.match(/(?:chat\.whatsapp\.com\/)?([A-Za-z0-9]{20,})/)
  return match?.[1] || ""
}

export const socketSetupGuide = (prefix: string, type = "premium"): string => {
  let text = `${socketHeader("Configura tu Socket")}\n`
  text += `│ Tipo 》 ${type}\n`
  text += `│ Permiso 》 solo premium/oficial\n`
  text += `│ 1 》 ${prefix}setname NombreCorto / Nombre largo\n`
  text += `│ 2 》 ${prefix}setbotowner @owner\n`
  text += `│ 3 》 ${prefix}setbotcurrency moneda\n`
  text += `│ 4 》 responde imagen con ${prefix}setpfp\n`
  text += `│ 5 》 responde imagen con ${prefix}setbanner\n`
  text += `│ 6 》 responde imagen con ${prefix}wellimg\n`
  text += `│ 7 》 ${prefix}setstatus estado\n`
  text += `│ 8 》 ${prefix}setusername nombre público\n`
  text += `╰ Inicio 》 escribe ${prefix}menu en el chat del bot.`
  return text
}

export const freeSocketConnectedMessage = (
  botNumber: string,
  ownerJid: string,
  parentBotJid = "",
): { text: string; mentions: string[] } => {
  const botPn = `${jidNumber(botNumber)}@s.whatsapp.net`
  const ownerPn = `${jidNumber(ownerJid)}@s.whatsapp.net`
  const parentPn = parentBotJid ? `${jidNumber(parentBotJid)}@s.whatsapp.net` : null
  const mentions = [botPn, ownerPn, ...(parentPn ? [parentPn] : [])].filter(Boolean)
  const text =
    `${socketHeader("Socket Gratis conectado")}\n` +
    `│ Bot 》 @${jidNumber(botNumber)}\n` +
    `│ Tipo 》 free\n` +
    `│ Oficial 》 ${parentPn ? `@${jidNumber(parentBotJid)}` : "principal/oficial"}\n` +
    `│ Duración 》 permanente\n` +
    `│ Owner 》 @${jidNumber(ownerJid)}\n` +
    `╰ Config 》 hereda nombre, moneda, prefijo e imágenes del oficial.`
  return { text, mentions }
}

export const socketStartMessage = (prefix = "#"): string => {
  return `${socketHeader("Socket listo")}\n│ Estado 》 conectado\n╰ Inicio 》 escribe ${prefix}menu para comenzar.`
}

export const getMotherBotJid = (bot?: Partial<types.BotDocument>): string => getEffectiveBotJid(bot)

interface PremiumCode {
  id: number
  code: string
  user_jid: string
  bot_number: string | null
  expires_at: string
  created_at: string
  used_at: string | null
  is_active: boolean
  notifications_sent: number
  bot_type: string
}

export class PremiumManager {
  private static notificationInterval: NodeJS.Timeout | null = null
  private static cleanupInterval: NodeJS.Timeout | null = null
  private static isRunning = false

  private static generateCode(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    let result = ""
    for (let i = 0; i < 12; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  static start(conn: any): void {
    if (this.isRunning) {
      console.log("[PremiumManager] Ya está ejecutándose")
      return
    }

    this.isRunning = true
    console.log("[PremiumManager] Iniciando sistema de notificaciones...")

    this.notificationInterval = setInterval(
      async () => {
        try {
          await this.sendExpirationNotifications()
        } catch (error) {
          console.error("[PremiumManager] Error en notificaciones:", error)
        }
      },
      6 * 60 * 60 * 1000,
    )

    this.cleanupInterval = setInterval(
      async () => {
        try {
          await this.cleanupExpiredTokens()
          await this.cleanupExpiredBots()
        } catch (error) {
          console.error("[PremiumManager] Error en limpieza:", error)
        }
      },
      12 * 60 * 60 * 1000,
    )

    setTimeout(async () => {
      try {
        await this.sendExpirationNotifications()
        await this.cleanupExpiredTokens()
        await this.cleanupExpiredBots()
      } catch (error) {
        console.error("[PremiumManager] Error en ejecución inicial:", error)
      }
    }, 5000)
  }

  static stop(): void {
    if (!this.isRunning) {
      return
    }

    console.log("[PremiumManager] Deteniendo sistema de notificaciones...")

    if (this.notificationInterval) {
      clearInterval(this.notificationInterval)
      this.notificationInterval = null
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }

    this.isRunning = false
    console.log("[PremiumManager] Sistema detenido")
  }

  static async createCode(userJid: string, months = 1): Promise<string> {
    return new Promise((resolve, reject) => {
      connect()
        .then((db) => {
          const code = this.generateCode()
          const expiresAt = new Date()
          expiresAt.setMonth(expiresAt.getMonth() + Math.max(1, Math.min(24, Math.floor(Number(months) || 1))))

          db.run(
            `INSERT INTO premium_codes (code, user_jid, expires_at, is_active, bot_type, notifications_sent) VALUES (?, ?, ?, 1, 'premium', 0)`,
            [code, userJid, expiresAt.toISOString()],
            (err) => {
              if (err) {
                console.error("[PremiumManager] Error creating code:", err)
                reject(err)
              } else {
                console.log(`[PremiumManager] Código premium creado: ${code} para ${userJid}`)
                resolve(code)
              }
            },
          )
        })
        .catch((error) => {
          reject(error)
        })
    })
  }

  static async getCodeOwner(code: string): Promise<{ success: boolean; message: string; userJid?: string }> {
    return new Promise((resolve) => {
      connect()
        .then((db) => {
          db.get(
            `SELECT * FROM premium_codes WHERE code = ? AND is_active = 1 AND bot_type = 'premium'`,
            [String(code || "").trim().toUpperCase()],
            (err, row: PremiumCode) => {
              if (err) {
                console.error("[PremiumManager] Error checking code owner:", err)
                resolve({ success: false, message: "Error al verificar el token" })
                return
              }

              if (!row) {
                resolve({ success: false, message: "Token premium inválido" })
                return
              }

              const now = new Date()
              const expiresAt = new Date(row.expires_at)

              if (now > expiresAt) {
                db.run(`UPDATE premium_codes SET is_active = 0 WHERE code = ?`, [row.code])
                resolve({ success: false, message: "El token ha expirado" })
                return
              }

              resolve({ success: true, message: "Token válido", userJid: row.user_jid })
            },
          )
        })
        .catch(() => {
          resolve({ success: false, message: "Error interno del sistema" })
        })
    })
  }

  static async useCode(
    code: string,
    botNumber: string,
  ): Promise<{ success: boolean; message: string; userJid?: string }> {
    return new Promise((resolve) => {
      connect()
        .then((db) => {
          db.get(
            `SELECT * FROM premium_codes WHERE code = ? AND is_active = 1 AND bot_type = 'premium'`,
            [code],
            async (err, row: PremiumCode) => {
              if (err) {
                console.error("[PremiumManager] Error checking code:", err)
                resolve({ success: false, message: "Error al verificar el código" })
                return
              }

              if (!row) {
                resolve({ success: false, message: "Código premium inválido o ya usado" })
                return
              }

              const now = new Date()
              const expiresAt = new Date(row.expires_at)

              if (now > expiresAt) {
                db.run(`UPDATE premium_codes SET is_active = 0 WHERE code = ?`, [code])
                resolve({ success: false, message: "El código ha expirado" })
                return
              }

              if (row.bot_number && row.bot_number !== botNumber) {
                resolve({ success: false, message: "Código ya vinculado a otro bot" })
                return
              }

              db.run(
                `UPDATE premium_codes SET bot_number = ?, used_at = ?, notifications_sent = 0 WHERE code = ?`,
                [botNumber, now.toISOString(), code],
                async (updateErr) => {
                  if (updateErr) {
                    console.error("[PremiumManager] Error updating code:", updateErr)
                    resolve({ success: false, message: "Error al activar el código" })
                  } else {
                    console.log(`[PremiumManager] Código activado: ${code} para bot ${botNumber}`)
                    resolve({
                      success: true,
                      message: `Código premium activado exitosamente. Válido hasta: ${expiresAt.toLocaleDateString()}`,
                      userJid: row.user_jid,
                    })
                  }
                },
              )
            },
          )
        })
        .catch((error) => {
          resolve({ success: false, message: "Error interno del sistema" })
        })
    })
  }

  static async extendPremium(botNumber: string): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
      connect()
        .then((db) => {
          db.get(
            `SELECT * FROM premium_codes WHERE bot_number = ? AND is_active = 1 ORDER BY expires_at DESC LIMIT 1`,
            [botNumber],
            async (err, row: PremiumCode) => {
              if (err) {
                console.error("[PremiumManager] Error finding premium:", err)
                resolve({ success: false, message: "Error al buscar el premium" })
                return
              }

              if (!row) {
                resolve({ success: false, message: "No se encontró premium activo para este bot" })
                return
              }

              const newExpiresAt = new Date(row.expires_at)
              newExpiresAt.setDate(newExpiresAt.getDate() + 30)

              db.run(
                `UPDATE premium_codes SET expires_at = ?, notifications_sent = 0 WHERE id = ?`,
                [newExpiresAt.toISOString(), row.id],
                async (updateErr) => {
                  if (updateErr) {
                    console.error("[PremiumManager] Error extending premium:", updateErr)
                    resolve({ success: false, message: "Error al extender el premium" })
                  } else {
                    const bots = await BotPersistence.loadBots()
                    const bot = bots.find((b) => b.bot_number === botNumber)
                    if (bot) {
                      bot.expires_at = newExpiresAt.toISOString()
                      await BotPersistence.saveBots(bots)
                    }

                    console.log(
                      `[PremiumManager] Premium extendido para bot ${botNumber} hasta ${newExpiresAt.toLocaleDateString()}`,
                    )
                    resolve({
                      success: true,
                      message: `Premium extendido hasta: ${newExpiresAt.toLocaleDateString()}`,
                    })
                  }
                },
              )
            },
          )
        })
        .catch((error) => {
          resolve({ success: false, message: "Error interno del sistema" })
        })
    })
  }

  static async deletePremium(botNumber: string): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
      connect()
        .then((db) => {
          db.get(
            `SELECT * FROM premium_codes WHERE bot_number = ? AND is_active = 1`,
            [botNumber],
            async (err, row: PremiumCode) => {
              if (err) {
                console.error("[PremiumManager] Error finding premium:", err)
                resolve({ success: false, message: "Error al buscar el premium" })
                return
              }

              if (!row) {
                resolve({ success: false, message: "No se encontró premium activo para este bot" })
                return
              }

              db.run(`UPDATE premium_codes SET is_active = 0 WHERE bot_number = ?`, [botNumber], async (updateErr) => {
                if (updateErr) {
                  console.error("[PremiumManager] Error deleting premium:", updateErr)
                  resolve({ success: false, message: "Error al eliminar el premium" })
                } else {
                  const botJid = `${botNumber}@s.whatsapp.net`
                  await BotPersistence.removeBot(botJid)

                  const bots = await BotPersistence.loadBots()
                  const bot = bots.find((b) => b.bot_number === botNumber)
                  if (bot?.session_path) {
                    try {
                      await fs.rm(bot.session_path, { recursive: true, force: true })
                      console.log(`[PremiumManager] Sesión eliminada: ${bot.session_path}`)
                    } catch (error) {
                      console.error("[PremiumManager] Error removing session:", error)
                    }
                  }

                  for (const [jid, botData] of Bot.bots) {
                    if (jid.includes(botNumber)) {
                      try {
                        await botData.wss.logout()
                        Bot.bots.delete(jid)
                        console.log(`[PremiumManager] Bot desconectado: ${botNumber}`)
                      } catch (error) {
                        console.log(`[PremiumManager] Error desconectando bot: ${error}`)
                      }
                      break
                    }
                  }

                  console.log(`[PremiumManager] Premium eliminado para bot: ${botNumber}`)
                  resolve({
                    success: true,
                    message: "Premium eliminado exitosamente",
                  })
                }
              })
            },
          )
        })
        .catch((error) => {
          resolve({ success: false, message: "Error interno del sistema" })
        })
    })
  }

  static async isPremiumActive(botNumber: string): Promise<boolean> {
    return new Promise((resolve) => {
      connect()
        .then((db) => {
          db.get(
            `SELECT * FROM premium_codes
           WHERE bot_number = ?
           AND is_active = 1
           AND bot_type = 'premium'
           AND expires_at > datetime('now')`,
            [botNumber],
            (err, row) => {
              if (err) {
                console.error("[PremiumManager] Error checking premium status:", err)
                resolve(false)
              } else {
                resolve(!!row)
              }
            },
          )
        })
        .catch((error) => {
          resolve(false)
        })
    })
  }

  static async deleteCodeByCode(code: string): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
      connect()
        .then((db) => {
          db.run(`UPDATE premium_codes SET is_active = 0 WHERE code = ? AND bot_number IS NULL`, [code], (err) => {
            if (err) {
              console.error("[PremiumManager] Error deleting code:", err)
              resolve({ success: false, message: "Error al eliminar el código" })
            } else {
              console.log(`[PremiumManager] Código eliminado: ${code}`)
              resolve({ success: true, message: "Código eliminado exitosamente" })
            }
          })
        })
        .catch((error) => {
          resolve({ success: false, message: "Error interno del sistema" })
        })
    })
  }

  static async sendExpirationNotifications(): Promise<void> {
    return new Promise((resolve) => {
      connect()
        .then((db) => {
          db.all(
            `SELECT * FROM premium_codes
           WHERE is_active = 1
           AND bot_number IS NOT NULL
           AND bot_type = 'premium'
           AND datetime(expires_at, '-7 days') <= datetime('now')
           AND expires_at > datetime('now')
           AND notifications_sent = 0`,
            [],
            async (err, rows: PremiumCode[]) => {
              if (err) {
                console.error("[PremiumManager] Error getting expiring codes:", err)
                resolve()
                return
              }

              console.log(`[PremiumManager] Enviando ${rows?.length || 0} notificaciones de expiración`)

              for (const code of rows || []) {
                try {
                  const expiresAt = new Date(code.expires_at)
                  const now = new Date()
                  const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

                  const botJid = `${code.bot_number}@s.whatsapp.net`
                  const botData = Bot.bots.get(botJid)

                  if (botData?.wss) {
                    const message =
                      `*｢⚠️ AVISO PREMIUM｣*\n\n` +
                      `Tu bot premium está próximo a expirar:\n\n` +
                      `> *📱 Bot:* @${code.bot_number}\n` +
                      `> *⏰ Expira en:* ${daysLeft} día${daysLeft !== 1 ? "s" : ""}\n` +
                      `> *📅 Fecha:* ${expiresAt.toLocaleDateString()}\n\n` +
                      `Si no renuevas, el bot se eliminará automáticamente al expirar.`

                    await botData.wss.sendMessage(code.user_jid, {
                      text: message,
                      mentions: [`${code.bot_number}@s.whatsapp.net`],
                    })

                    db.run(`UPDATE premium_codes SET notifications_sent = 1 WHERE id = ?`, [code.id])
                    console.log(
                      `[PremiumManager] Notificación enviada para bot: ${code.bot_number} (${daysLeft} días restantes)`,
                    )
                  } else {
                    console.log(`[PremiumManager] Bot no encontrado para notificación: ${code.bot_number}`)
                  }
                } catch (error) {
                  console.error(`[PremiumManager] Error enviando notificación para ${code.bot_number}:`, error)
                }
              }

              resolve()
            },
          )
        })
        .catch((error) => {
          console.error("[PremiumManager] Error in notification system:", error)
          resolve()
        })
    })
  }

  static async cleanupExpiredTokens(): Promise<void> {
    return new Promise((resolve) => {
      connect()
        .then((db) => {
          db.all(
            `SELECT * FROM premium_codes
           WHERE bot_type = 'premium'
           AND is_active = 1
           AND expires_at < datetime('now')`,
            [],
            async (err, rows: PremiumCode[]) => {
              if (err) {
                console.error("[PremiumManager] Error getting expired codes:", err)
                resolve()
                return
              }

              console.log(`[PremiumManager] Limpiando ${rows?.length || 0} tokens expirados`)

              for (const row of rows || []) {
                if (row.bot_number) {
                  try {
                    const botJid = `${row.bot_number}@s.whatsapp.net`
                    const botData = Bot.bots.get(botJid)

                    if (botData?.wss) {
                      const message =
                        `*｢❌ PREMIUM EXPIRADO｣*\n\n` +
                        `Tu bot premium ha expirado y será eliminado:\n\n` +
                        `> *📱 Bot:* @${row.bot_number}\n` +
                        `> *📅 Expiró:* ${new Date(row.expires_at).toLocaleDateString()}\n` +
                        `> *🗑️ Estado:* Eliminado automáticamente\n\n` +
                        `*｢💡 PARA REACTIVAR｣*\n` +
                        `Contacta al administrador para obtener un nuevo código premium.`

                      await botData.wss.sendMessage(row.user_jid, {
                        text: message,
                        mentions: [`${row.bot_number}@s.whatsapp.net`],
                      })
                    }

                    await this.deletePremium(row.bot_number)
                    console.log(`[PremiumManager] Token expirado eliminado: ${row.bot_number}`)
                  } catch (error) {
                    console.error(`[PremiumManager] Error eliminando token expirado ${row.bot_number}:`, error)
                  }
                }
              }

              resolve()
            },
          )
        })
        .catch((error) => {
          console.error("[PremiumManager] Error in cleanup:", error)
          resolve()
        })
    })
  }

  static async getPremiumStats(): Promise<{
    total: number
    active: number
    expired: number
    expiringSoon: number
  }> {
    return new Promise((resolve) => {
      connect()
        .then((db) => {
          db.all(`SELECT * FROM premium_codes WHERE bot_type = 'premium'`, [], (err, rows: PremiumCode[]) => {
            if (err) {
              console.error("[PremiumManager] Error getting stats:", err)
              resolve({ total: 0, active: 0, expired: 0, expiringSoon: 0 })
              return
            }

            const now = new Date()
            const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

            const stats = {
              total: rows.length,
              active: 0,
              expired: 0,
              expiringSoon: 0,
            }

            for (const row of rows) {
              const expiresAt = new Date(row.expires_at)

              if (row.is_active && expiresAt > now) {
                stats.active++
                if (expiresAt <= sevenDaysFromNow) {
                  stats.expiringSoon++
                }
              } else {
                stats.expired++
              }
            }

            resolve(stats)
          })
        })
        .catch((error) => {
          resolve({ total: 0, active: 0, expired: 0, expiringSoon: 0 })
        })
    })
  }

  static async getActiveBots(): Promise<any[]> {
    return new Promise((resolve) => {
      connect()
        .then((db) => {
          const query = `
            SELECT bot_number, bot_type, user_jid, expires_at
            FROM bot_sessions
            WHERE expires_at > datetime('now')
            ORDER BY created_at DESC
          `
          db.all(query, [], (err, rows) => {
            if (err) {
              console.error("[PremiumManager] Error getting active bots:", err)
              resolve([])
            } else {
              resolve(rows)
            }
          })
        })
        .catch(() => resolve([]))
    })
  }

  static async getUserPremiumInfo(userJid: string): Promise<any[]> {
    return new Promise((resolve) => {
      connect()
        .then((db) => {
          const query = `
            SELECT * FROM premium_codes
            WHERE user_jid = ? AND is_active = 1
            ORDER BY expires_at DESC
          `
          db.all(query, [userJid], (err, rows) => {
            if (err) {
              console.error("[PremiumManager] Error getting user premium info:", err)
              resolve([])
            } else {
              resolve(rows)
            }
          })
        })
        .catch(() => resolve([]))
    })
  }

  static async createPremiumBot(userJid: string, botNumber: string, botType: string): Promise<void> {
    return new Promise((resolve, reject) => {
      connect()
        .then((db) => {
          const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

          const query = `
            INSERT INTO bot_sessions (bot_id, bot_jid, bot_number, owner_jid, user_jid, bot_type, parent_bot_jid, session_path, is_active, expires_at, created_at, last_seen)
            VALUES (?, ?, ?, ?, ?, ?, '', ?, 1, ?, datetime('now'), datetime('now'))
            ON CONFLICT(bot_jid) DO UPDATE SET
              owner_jid = excluded.owner_jid,
              user_jid = excluded.user_jid,
              bot_type = excluded.bot_type,
              session_path = excluded.session_path,
              is_active = 1,
              expires_at = excluded.expires_at,
              last_seen = datetime('now')
          `
          const sessionPath = `${botType === "premium" ? "prembots/prem" : botType === "free" ? "freebots/free" : "mainbots/main"}-${botNumber}`
          db.run(query, [`${botType}-${botNumber}`, `${botNumber}@s.whatsapp.net`, botNumber, userJid, userJid, botType, sessionPath, expiresAt], (err) => {
            if (err) {
              reject(err)
            } else {
              resolve()
            }
          })
        })
        .catch(reject)
    })
  }

  static async extendPremiumByUser(userJid: string, days: number): Promise<void> {
    return new Promise((resolve, reject) => {
      connect()
        .then((db) => {
          const query = `
            UPDATE bot_sessions
            SET expires_at = datetime(expires_at, '+${days} days')
            WHERE user_jid = ? AND expires_at > datetime('now')
          `
          db.run(query, [userJid], (err) => {
            if (err) {
              reject(err)
            } else {
              resolve()
            }
          })
        })
        .catch(reject)
    })
  }

  static async deletePremiumByUser(userJid: string): Promise<void> {
    return new Promise((resolve, reject) => {
      connect()
        .then((db) => {
          const query = `DELETE FROM bot_sessions WHERE user_jid = ?`
          db.run(query, [userJid], (err) => {
            if (err) {
              reject(err)
            } else {
              resolve()
            }
          })
        })
        .catch(reject)
    })
  }

  static async getExpiringBots(days = 7): Promise<any[]> {
    return new Promise((resolve) => {
      connect()
        .then((db) => {
          const query = `
            SELECT * FROM bot_sessions
            WHERE expires_at BETWEEN datetime('now') AND datetime('now', '+${days} days')
          `
          db.all(query, [], (err, rows) => {
            if (err) {
              console.error("[PremiumManager] Error getting expiring bots:", err)
              resolve([])
            } else {
              resolve(rows)
            }
          })
        })
        .catch(() => resolve([]))
    })
  }

  static async markAsNotified(id: number): Promise<void> {
    return new Promise((resolve, reject) => {
      connect()
        .then((db) => {
          const query = `UPDATE bot_sessions SET notified = 1, notifications_sent = 1 WHERE id = ?`
          db.run(query, [id], (err) => {
            if (err) {
              reject(err)
            } else {
              resolve()
            }
          })
        })
        .catch(reject)
    })
  }

  static async cleanupExpiredBots(): Promise<void> {
    return new Promise((resolve, reject) => {
      connect()
        .then((db) => {
          const query = `DELETE FROM bot_sessions WHERE expires_at < datetime('now')`
          db.run(query, [], (err) => {
            if (err) {
              reject(err)
            } else {
              resolve()
            }
          })
        })
        .catch(reject)
    })
  }

  static async deleteSocket(botNumber: string): Promise<{ success: boolean; message: string }> {
    const result = await cleanupSocketCompletely(botNumber)
    return { success: result.ok, message: result.message }
  }

}

export class BotReconnection {
  private static reconnectionTimers = new Map<string, NodeJS.Timeout>()
  private static attemptCounts = new Map<string, number>()
  private static isInitialized = false
  private static cleanupInterval: NodeJS.Timeout | null = null

  private static readonly MAX_ATTEMPTS = {
    main: 999,
    premium: 999,
    free: 999,
  }

  private static readonly RECONNECTION_DELAYS = {
    initial: 5000,
    max: 300000,
    multiplier: 2,
  }

  static async initialize(): Promise<void> {
    if (this.isInitialized) return

    if (false) console.log("[BotReconnection] Inicializando sistema de reconexión...")

    try {
      await BotPersistence.initializeTables()
      await this.reconnectAllBots()
      await this.startCleanupScheduler()

      this.isInitialized = true
      if (false) console.log("[BotReconnection] Sistema de reconexión inicializado exitosamente")
    } catch (error) {
      console.error("[BotReconnection] Error inicializando sistema:", error)
      throw error
    }
  }

  static async reconnectAllBots(): Promise<void> {
    try {
      if (false) console.log("[BotReconnection] Iniciando reconexión de bots...")

      await BotPersistence.cleanupExpiredPremium()

      const bots = await BotPersistence.getActiveBots()
      if (false) console.log(`[BotReconnection] Encontrados ${bots.length} bots para reconectar`)

      for (const botData of bots) {
        if (botData.bot_type === "main") {
          continue
        }

        if (botData.bot_type === "premium") {
          const isActive = await PremiumManager.isPremiumActive(botData.bot_number)
          if (!isActive) {
            if (false) console.log(`[BotReconnection] Bot premium expirado: ${botData.bot_number}`)
            await PremiumManager.deletePremium(botData.bot_number)
            continue
          }
        }

        await this.reconnectBot(botData)
        await this.delay(2000)
      }

      if (false) console.log("[BotReconnection] Proceso de reconexión completado")
    } catch (error) {
      console.error("[BotReconnection] Error reconectando bots:", error)
    }
  }

  private static async reconnectBot(botData: any): Promise<void> {
    try {
      if (false) console.log(`[BotReconnection] Reconectando bot: ${botData.bot_number} (${botData.bot_type})`)

      const savedBot = await database.Bots.find(botData.bot_jid).catch(() => null)
      const config: types.BotConfiguration = {
        bot_id: botData.bot_id,
        bot_jid: botData.bot_jid,
        owner_jid: savedBot?.owner_jid || botData.owner_jid,
        bot_type: savedBot?.bot_type || botData.bot_type,
        parent_bot_jid: savedBot?.parent_bot_jid || botData.parent_bot_jid || "",
        connection_method: "existing",
        session_path: botData.session_path,
      }

      const bot = new Bot(config)

      bot.ev.on("bot.open", async (e) => {
        if (false) console.log(`[BotReconnection] ✅ Bot reconectado exitosamente: ${botData.bot_number}`)
        await BotPersistence.updateBotStatus(e.botjid, true)
        this.clearReconnectionData(e.botjid)
      })

      bot.ev.on("bot.close", async (e) => {
        if (false) console.log(`[BotReconnection] ❌ Bot desconectado: ${botData.bot_number}`)
        await BotPersistence.updateBotStatus(e.botjid, false)
        await this.scheduleReconnection(botData)
      })

      bot.ev.on("bot.error", (e) => {
        console.error(`[BotReconnection] Error en bot ${botData.bot_number}:`, e.error)
        this.scheduleReconnection(botData)
      })

      bot.ev.on("bot.logout", async (e) => {
        if (false) console.log(`[BotReconnection] Bot deslogueado: ${botData.bot_number} - ${e.reason}`)
        await BotPersistence.removeBot(botData.bot_jid)
        this.clearReconnectionData(botData.bot_jid)
      })

      await bot.connect()
    } catch (error) {
      console.error(`[BotReconnection] Error reconectando bot ${botData.bot_number}:`, error)
      await this.scheduleReconnection(botData)
    }
  }

  private static async scheduleReconnection(botData: any): Promise<void> {
    const maxAttempts = this.MAX_ATTEMPTS[botData.bot_type as keyof typeof this.MAX_ATTEMPTS]
    const currentAttempts = this.getAttemptCount(botData.bot_jid)

    if (currentAttempts >= maxAttempts) {
      if (false) console.log(
        `[BotReconnection] Máximo de intentos alcanzado para ${botData.bot_type} bot: ${botData.bot_number} (${currentAttempts}/${maxAttempts})`,
      )

      if (botData.bot_type === "free") {
        await BotPersistence.removeBot(botData.bot_jid)
        if (false) console.log(`[BotReconnection] Bot free eliminado: ${botData.bot_number}`)
      } else {
        await BotPersistence.updateBotStatus(botData.bot_jid, false)
        if (false) console.log(`[BotReconnection] Bot ${botData.bot_type} marcado como inactivo: ${botData.bot_number}`)
      }

      this.clearReconnectionData(botData.bot_jid)
      return
    }

    this.incrementAttemptCount(botData.bot_jid)
    const newAttemptCount = this.getAttemptCount(botData.bot_jid)

    const delay = Math.min(
      this.RECONNECTION_DELAYS.initial * Math.pow(this.RECONNECTION_DELAYS.multiplier, newAttemptCount - 1),
      this.RECONNECTION_DELAYS.max,
    )

    if (false) console.log(
      `[BotReconnection] Programando reconexión para ${botData.bot_type} bot ${botData.bot_number} en ${delay / 1000}s (intento ${newAttemptCount}/${maxAttempts})`,
    )

    const timer = setTimeout(async () => {
      await this.reconnectBot(botData)
    }, delay)

    this.reconnectionTimers.set(botData.bot_jid, timer)
  }

  private static getAttemptCount(botJid: string): number {
    return this.attemptCounts.get(botJid) || 0
  }

  private static incrementAttemptCount(botJid: string): void {
    const current = this.getAttemptCount(botJid)
    this.attemptCounts.set(botJid, current + 1)
  }

  private static clearReconnectionData(botJid: string): void {
    const timer = this.reconnectionTimers.get(botJid)
    if (timer) {
      clearTimeout(timer)
      this.reconnectionTimers.delete(botJid)
    }

    this.attemptCounts.delete(botJid)
  }

  private static async startCleanupScheduler(): Promise<void> {
    this.cleanupInterval = setInterval(async () => {
      try {
        if (false) console.log("[BotReconnection] Ejecutando limpieza programada...")
        await PremiumManager.cleanupExpiredTokens()
        await PremiumManager.sendExpirationNotifications()
        if (false) console.log("[BotReconnection] Limpieza completada")
      } catch (error) {
        console.error("[BotReconnection] Error en limpieza programada:", error)
      }
    }, 3600000)

    if (false) console.log("[BotReconnection] Programador de limpieza iniciado (cada 1 hora)")
  }

  private static delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  static async shutdown(): Promise<void> {
    if (false) console.log("[BotReconnection] Cerrando sistema de reconexión...")

    for (const timer of this.reconnectionTimers.values()) {
      clearTimeout(timer)
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }

    this.reconnectionTimers.clear()
    this.attemptCounts.clear()
    this.isInitialized = false

    if (false) console.log("[BotReconnection] Sistema de reconexión cerrado correctamente")
  }

  static getStatus(): {
    isInitialized: boolean
    activeReconnections: number
    totalAttempts: number
  } {
    return {
      isInitialized: this.isInitialized,
      activeReconnections: this.reconnectionTimers.size,
      totalAttempts: Array.from(this.attemptCounts.values()).reduce((sum, count) => sum + count, 0),
    }
  }
}

const MAX_MEDIA_SIZE = 25 * 1024 * 1024
const CACHE_TTL_MS = 5 * 60 * 1000

type AnyMessage = any

type SocketSetupStep =
  | { type: "bot_name"; prompt: string }
  | { type: "text"; field: string; prompt: string; required?: boolean }
  | { type: "asset"; field: string; kind: "banner" | "submenu" | "rpg" | "welcome"; label: string; prompt: string }
  | { type: "prefixes"; prompt: string }

type MediaCandidate = {
  message: baileys.WAMessage
  mimetype: string
  size: number
}

const steps: SocketSetupStep[] = [
  {
    type: "bot_name",
    prompt: "Ponga el nombre propio de este bot premium. Ejemplo: Zeta / Zeta Bot Premium. Ese nombre queda separado del bot oficial.",
  },
  { type: "text", field: "owner_name", prompt: "Ponga el nombre público del owner." },
  { type: "asset", field: "thumbnail_url", kind: "banner", label: "imagen general del menú", prompt: "Envía la imagen general del menú." },
  { type: "asset", field: "submenu_url", kind: "submenu", label: "imagen de submenú", prompt: "Envía la imagen de submenú." },
  { type: "asset", field: "rpg_url", kind: "rpg", label: "imagen RPG/Gacha", prompt: "Envía la imagen RPG/Gacha." },
  { type: "asset", field: "welcome_url", kind: "welcome", label: "imagen de bienvenida/salida", prompt: "Envía la imagen de bienvenida y salida." },
  { type: "text", field: "channel_url", prompt: "Envía el enlace del canal. Si no tienes, envía 0." },
  { type: "text", field: "facebook_url", prompt: "Envía el enlace de Facebook. Si no tienes, envía 0." },
  { type: "text", field: "instagram_url", prompt: "Envía el enlace de Instagram. Si no tienes, envía 0." },
  { type: "text", field: "tiktok_url", prompt: "Envía el enlace de TikTok. Si no tienes, envía 0." },
  { type: "text", field: "telegram_url", prompt: "Envía el enlace de Telegram. Si no tienes, envía 0." },
  { type: "text", field: "owner_number", prompt: "Ponga el número para el vCard/contacto del owner con prefijo. Esto NO cambia el ID/LID que usa permisos. También puedes enviar 0 para usar el número guardado." },
  { type: "prefixes", prompt: "Por último, envía los prefijos de comandos. Puedes mandar uno o varios separados por espacio, coma o salto de línea." },
]

const mediaCache = new Map<string, MediaCandidate>()
const savedSourceIds = new Set<string>()
const lastPrompts = new Map<string, string>()
const processingBots = new Set<string>()

const SETUP_PROMPT_LOCK_TTL_MS = 24 * 60 * 60 * 1000
const SETUP_PROMPT_SETTING_KEY = "premium_setup_prompt_lock_v3"
const SETUP_MESSAGE_DEDUPE_TTL_MS = 5 * 60 * 1000
const SETUP_OUTBOUND_DEDUPE_TTL_MS = 10 * 60 * 1000
const SETUP_AUTO_DEFAULT_MS = 10 * 60 * 1000
const processedSetupMessages = new Set<string>()
const localPromptLocks = new Map<string, number>()
const setupAutoDefaultTimers = new Map<string, ReturnType<typeof setTimeout>>()
const setupOutboundLocks = new Map<string, number>()

const cleanText = (value: unknown): string => String(value ?? "").trim()

const unwrapMessageContent = (content: AnyMessage): AnyMessage => {
  let current = content || {}

  for (let i = 0; i < 16; i++) {
    const next =
      current?.ephemeralMessage?.message ||
      current?.viewOnceMessage?.message ||
      current?.viewOnceMessageV2?.message ||
      current?.viewOnceMessageV2Extension?.message ||
      current?.documentWithCaptionMessage?.message ||
      current?.deviceSentMessage?.message?.message ||
      current?.deviceSentMessage?.message ||
      current?.editedMessage?.message ||
      current?.protocolMessage?.editedMessage

    if (!next || next === current) break
    current = next
  }

  return current || content || {}
}

const getMessageType = (content: AnyMessage): string =>
  Object.keys(content || {}).find((key) => key !== "senderKeyDistributionMessage" && key !== "messageContextInfo") || ""

const getTextFromContent = (content: AnyMessage): string => {
  const c = unwrapMessageContent(content)

  return cleanText(
    c?.conversation ||
      c?.extendedTextMessage?.text ||
      c?.imageMessage?.caption ||
      c?.videoMessage?.caption ||
      c?.documentMessage?.caption ||
      c?.documentWithCaptionMessage?.message?.documentMessage?.caption ||
      "",
  )
}

const safeNormalizeJid = (jid?: string | null): string => {
  if (!jid) return ""
  try {
    return baileys.jidNormalizedUser(jid)
  } catch {
    return String(jid)
  }
}

const digitsFromJid = (jid?: string | null): string =>
  String(jid || "")
    .split(":")[0]
    .split("@")[0]
    .replace(/[^0-9]/g, "")

const mexicanAlt = (number: string): string => (number.startsWith("521") ? `52${number.slice(3)}` : "")

const numberMatches = (value: string, expected: string): boolean => {
  if (!value || !expected) return false
  return value === expected || value === mexicanAlt(expected) || mexicanAlt(value) === expected
}

const sameJidOrNumber = (left?: string | null, right?: string | null): boolean => {
  const a = safeNormalizeJid(left)
  const b = safeNormalizeJid(right)
  if (!a || !b) return false
  if (a === b) return true

  const aDigits = digitsFromJid(a)
  const bDigits = digitsFromJid(b)
  return Boolean(aDigits && bDigits && (aDigits === bDigits || aDigits === mexicanAlt(bDigits) || mexicanAlt(aDigits) === bDigits))
}

const getBotPhoneNumber = (wss: types.WASocket): string => digitsFromJid((wss as any).user?.id)
const getBotLid = (wss: types.WASocket): string => safeNormalizeJid((wss as any).user?.lid)
const getBotPnJid = (wss: types.WASocket): string => {
  const number = getBotPhoneNumber(wss)
  return number ? `${number}@s.whatsapp.net` : ""
}

const getRawChatJid = (message: baileys.WAMessage): string => safeNormalizeJid(message.key.remoteJid)

const getBotJid = (wss: types.WASocket): string => safeNormalizeJid((wss as any).user?.id) || getBotLid(wss) || getBotPnJid(wss)

const getBotDocument = async (wss: types.WASocket): Promise<types.BotDocument | null> => {
  const ids = [getBotJid(wss), getBotLid(wss), getBotPnJid(wss)].filter(Boolean)

  for (const id of ids) {
    const bot = await database.Bots.find(id).catch(() => null)
    if (bot) return bot
  }

  return null
}

const getSetupStepIndex = (bot: Partial<types.BotDocument>): number => {
  const index = Number((bot as any).setup_step || 0)
  if (!Number.isFinite(index) || index < 0) return 0
  if (index > steps.length) return steps.length
  return index
}

const getCurrentStep = (bot: Partial<types.BotDocument>): SocketSetupStep | null => steps[getSetupStepIndex(bot)] || null

const parseBotNames = (raw: string): { ok: boolean; shortName: string; longName: string; error?: string } => {
  const input = cleanText(raw).replace(/\s+/g, " ")
  if (!input) return { ok: false, shortName: "", longName: "", error: "Ponga el nombre del bot. Ejemplo: Zeta / Zeta Bot Premium" }

  const [shortRaw, ...rest] = input.split("/").map((part) => cleanText(part))
  const longRaw = rest.join(" / ").trim()
  const shortName = shortRaw || longRaw
  const longName = longRaw || shortRaw

  if (!shortName) return { ok: false, shortName: "", longName: "", error: "Ponga un nombre válido para el bot." }
  if (shortName.length > 25) return { ok: false, shortName, longName, error: "El nombre corto no debe superar 25 caracteres." }
  if (longName.length > 60) return { ok: false, shortName, longName, error: "El nombre largo no debe superar 60 caracteres." }

  return { ok: true, shortName, longName }
}

const isSocketSetupNeeded = (bot?: Partial<types.BotDocument> | null): boolean => {
  if (!bot || bot.bot_type !== "premium") return false
  return !Boolean((bot as any).setup_completed)
}

const getPromptTarget = (wss: types.WASocket): string => getBotPnJid(wss) || getBotLid(wss) || getBotJid(wss)

const isOwnBotChat = (message: baileys.WAMessage, wss: types.WASocket): boolean => {
  const chatJid = getRawChatJid(message)
  if (!chatJid || chatJid.endsWith("@g.us") || chatJid.endsWith("@newsletter")) return false

  const chatNumber = digitsFromJid(chatJid)
  const botNumber = getBotPhoneNumber(wss)
  const botLidNumber = digitsFromJid(getBotLid(wss))

  return numberMatches(chatNumber, botNumber) || numberMatches(chatNumber, botLidNumber)
}

const getSetupOutboundKey = (jid: string, text: string): string => `${safeNormalizeJid(jid) || jid}:${cleanText(text)}`

const shouldSendSetupText = (jid: string, text: string): boolean => {
  const clean = cleanText(text)
  if (!jid || !clean) return false

  const now = Date.now()
  const key = getSetupOutboundKey(jid, clean)
  const lockedUntil = setupOutboundLocks.get(key) || 0

  if (lockedUntil > now) {
    if (false) console.log(`[PremiumSetup] Mensaje repetido silenciado para ${jid}: ${clean.slice(0, 120)}`)
    return false
  }

  setupOutboundLocks.set(key, now + SETUP_OUTBOUND_DEDUPE_TTL_MS)
  setTimeout(() => {
    if ((setupOutboundLocks.get(key) || 0) <= Date.now()) setupOutboundLocks.delete(key)
  }, SETUP_OUTBOUND_DEDUPE_TTL_MS + 1000)

  return true
}

const sendSafe = async (wss: types.WASocket, jid: string, text: string, _quoted?: baileys.WAMessage) => {
  if (!jid || !shouldSendSetupText(jid, text)) return
  try {
    await (wss as any).sendMessage(jid, { text })
  } catch {}
}

const currentOrDefault = (current: unknown, fallback: unknown): string => {
  const saved = cleanText(current)
  if (saved) return saved
  return cleanText(fallback)
}

const officialSetupDefaults = (currentBot?: Partial<types.BotDocument> | null): Partial<types.BotDocument> => {
  const socials = getRuntimeSocialLinks()
  const defaultPrefixes = getRuntimeCommandPrefixes().join(" ") || "."
  const defaultName = getRuntimeBotName()

  return {
    name: currentOrDefault(currentBot?.name, defaultName),
    username: currentOrDefault(currentBot?.username, defaultName),
    owner_name: currentOrDefault(currentBot?.owner_name, getRuntimeOwnerName()),
    owner_number: currentOrDefault(currentBot?.owner_number, getRuntimeReceptionNumber()),
    logo_url: currentOrDefault(currentBot?.logo_url, getRuntimeAssetPath("generalImage")),
    thumbnail_url: currentOrDefault(currentBot?.thumbnail_url, getRuntimeAssetPath("generalImage")),
    submenu_url: currentOrDefault(currentBot?.submenu_url, getRuntimeAssetPath("subMainImage")),
    welcome_url: currentOrDefault(currentBot?.welcome_url, getRuntimeAssetPath("welcomeImage")),
    rpg_url: currentOrDefault(currentBot?.rpg_url, getRuntimeAssetPath("rpgImage")),
    channel_url: currentOrDefault(currentBot?.channel_url, getRuntimeChannelUrl()),
    facebook_url: currentOrDefault(currentBot?.facebook_url, socials.facebook),
    instagram_url: currentOrDefault(currentBot?.instagram_url, socials.instagram),
    tiktok_url: currentOrDefault(currentBot?.tiktok_url, socials.tiktok),
    telegram_url: currentOrDefault(currentBot?.telegram_url, socials.telegram),
    prefixes: currentOrDefault(currentBot?.prefixes, defaultPrefixes),
    currency: currentOrDefault(currentBot?.currency, getRuntimeCurrencyName()),
    setup_step: steps.length,
    setup_completed: 1,
  }
}

const clearSetupAutoDefault = (botJid: string): void => {
  const timer = setupAutoDefaultTimers.get(botJid)
  if (timer) clearTimeout(timer)
  setupAutoDefaultTimers.delete(botJid)
}

const setupAutoDefaultMessage = (prefixes: string): string => {
  const firstPrefix = normalizePrefixes(prefixes)[0] || "."

  return (
    `「◈」 Premium configurado\n` +
    `◈ Estado › sin respuesta por 10 minutos\n` +
    `◈ Acción › usé los datos default del bot principal/oficial\n` +
    `◈ Prefijo › ${firstPrefix}\n` +
    `◈ Inicio › ${firstPrefix}menu\n` +
    `◈ Nota › puedes modificar tus datos con las funciones premium.`
  )
}

const scheduleSetupAutoDefault = (wss: types.WASocket, botJid: string, target: string, stepIndex: number): void => {
  if (!botJid || !target) return
  clearSetupAutoDefault(botJid)

  const timer = setTimeout(async () => {
    try {
      const currentBot = await database.Bots.get(botJid).catch(() => null)
      if (!isSocketSetupNeeded(currentBot)) return
      if (getSetupStepIndex(currentBot || {}) !== stepIndex) return

      const update = officialSetupDefaults(currentBot)
      await database.Bots.update(botJid, { $set: update })
      lastPrompts.delete(botJid)
      await clearSetupPromptLock(botJid)
      await sendSafe(wss, target, setupAutoDefaultMessage(String(update.prefixes || ".")))
    } finally {
      setupAutoDefaultTimers.delete(botJid)
    }
  }, SETUP_AUTO_DEFAULT_MS)

  setupAutoDefaultTimers.set(botJid, timer)
}

const isOwnSetupNoticeRaw = (message: baileys.WAMessage): boolean => {
  const text = getTextFromContent(message.message)



  return (
    text.startsWith("「◈」 Configura tu Premium") ||
    text.startsWith("「◈」 Premium configurado") ||
    text.startsWith("*Configuración Premium de ") ||
    text.startsWith("Envía la imagen") ||
    text.startsWith("Ponga el nombre") ||
    text.startsWith("Ponga el número") ||
    text.startsWith("Envía el enlace") ||
    text.startsWith("Por último") ||
    text.startsWith("Falta la ") ||
    text.startsWith("Número inválido") ||
    text.startsWith("Enlace inválido") ||
    text.startsWith("Envía al menos") ||
    text.startsWith("No pude guardar") ||
    text.startsWith("✅ ")
  )
}

const rememberSetupMessageOnce = (message: baileys.WAMessage, wss: types.WASocket): boolean => {
  const id = cleanText(message.key.id)
  if (!id) return true

  const key = [getBotJid(wss), getRawChatJid(message), id, message.key.participant || ""].join(":")
  if (processedSetupMessages.has(key)) return false

  processedSetupMessages.add(key)
  setTimeout(() => processedSetupMessages.delete(key), SETUP_MESSAGE_DEDUPE_TTL_MS)
  return true
}

const canSendSetupPromptNow = async (botJid: string, promptKey: string): Promise<boolean> => {
  const now = Date.now()
  const localLockKey = `${botJid}:${promptKey}`
  const localUntil = localPromptLocks.get(localLockKey) || 0
  if (localUntil > now) return false

  localPromptLocks.set(localLockKey, now + SETUP_PROMPT_LOCK_TTL_MS)
  setTimeout(() => {
    if ((localPromptLocks.get(localLockKey) || 0) <= Date.now()) localPromptLocks.delete(localLockKey)
  }, SETUP_PROMPT_LOCK_TTL_MS + 1000)

  try {
    const db = await connect()

    return await new Promise<boolean>((resolve) => {
      db.run(
        `INSERT INTO bot_settings (bot_jid, key, value, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(bot_jid, key) DO UPDATE SET
           value = excluded.value,
           updated_at = CURRENT_TIMESTAMP
         WHERE bot_settings.value <> excluded.value`,
        [botJid, SETUP_PROMPT_SETTING_KEY, promptKey],
        function (this: any, err: Error | null) {
          if (err) {
            console.error("[PremiumSetup] prompt lock error:", err)
            resolve(true)
            return
          }

          resolve(Number(this?.changes || 0) > 0)
        },
      )
    })
  } catch (error) {
    console.error("[PremiumSetup] prompt lock fallback:", error)
    return true
  }
}

const clearSetupPromptLock = async (botJid: string): Promise<void> => {
  try {
    const db = await connect()
    await new Promise<void>((resolve) => {
      db.run(
        `DELETE FROM bot_settings WHERE bot_jid = ? AND key = ?`,
        [botJid, SETUP_PROMPT_SETTING_KEY],
        () => resolve(),
      )
    })
  } catch {}
}

export const ensurePremiumSocketSetup = async (wss: types.WASocket, force = false) => {
  const bot = await getBotDocument(wss)
  if (!isSocketSetupNeeded(bot)) return false

  const step = getCurrentStep(bot!)
  if (!step) return false

  const target = getPromptTarget(wss)
  if (!target) return false

  const botJid = getBotJid(wss) || cleanText(bot?.bot_jid) || target
  const stepIndex = getSetupStepIndex(bot!)
  const promptText = `「◈」 Configura tu Premium\n◈ Bot › ${cleanText(bot?.name) || "Socket Premium"}\n◈ Paso › ${stepIndex + 1}/${steps.length}\n◈ ${step.prompt}`
  const promptKey = `${botJid}:${stepIndex}:${target}:${promptText}`

  scheduleSetupAutoDefault(wss, botJid, target, stepIndex)

  const canSendPrompt = await canSendSetupPromptNow(botJid, promptKey)
  if (!canSendPrompt) return true

  lastPrompts.set(botJid, promptKey)
  await sendSafe(wss, target, promptText)
  return true
}

const getMediaInfoFromContent = (content: AnyMessage): { mimetype: string; size: number } | null => {
  const c = unwrapMessageContent(content)
  const media = c?.imageMessage || c?.videoMessage || c?.stickerMessage || c?.documentMessage || c?.documentWithCaptionMessage?.message?.documentMessage
  if (!media) return null

  const mimetype = String(media.mimetype || "").toLowerCase()
  const size = Number(media.fileLength || 0)

  if (!(mimetype.startsWith("image/") || mimetype.startsWith("video/"))) return null
  if (size && size > MAX_MEDIA_SIZE) return null

  return { mimetype: mimetype || "application/octet-stream", size }
}

const extractCurrentMedia = (message: baileys.WAMessage): MediaCandidate | null => {
  const content = unwrapMessageContent(message.message)
  const info = getMediaInfoFromContent(content)
  if (!info) return null

  return { message: { ...message, message: content } as baileys.WAMessage, ...info }
}

const getContextInfoFromContent = (content: AnyMessage): AnyMessage => {
  const c = unwrapMessageContent(content)
  const type = getMessageType(c)

  return (
    c?.[type]?.contextInfo ||
    c?.extendedTextMessage?.contextInfo ||
    c?.imageMessage?.contextInfo ||
    c?.videoMessage?.contextInfo ||
    c?.documentMessage?.contextInfo ||
    c?.documentWithCaptionMessage?.message?.documentMessage?.contextInfo ||
    null
  )
}

const extractQuotedMedia = (message: baileys.WAMessage, wss: types.WASocket): MediaCandidate | null => {
  const contextInfo = getContextInfoFromContent(message.message)
  const quotedMessage = contextInfo?.quotedMessage
  if (!quotedMessage) return null

  const quotedContent = unwrapMessageContent(quotedMessage)
  const info = getMediaInfoFromContent(quotedContent)
  if (!info) return null

  const participant = safeNormalizeJid(contextInfo.participant)
  const botPn = safeNormalizeJid((wss as any).user?.id)
  const botLid = getBotLid(wss)

  const quoted: baileys.WAMessage = {
    key: {
      remoteJid: safeNormalizeJid(contextInfo.remoteJid || message.key.remoteJid),
      participant,
      fromMe: sameJidOrNumber(participant, botPn) || sameJidOrNumber(participant, botLid),
      id: contextInfo.stanzaId || "",
    },
    message: quotedContent,
  } as baileys.WAMessage

  return { message: quoted, ...info }
}

const streamToBuffer = async (stream: any): Promise<Buffer> => {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks)
}

const mediaNodeFromMessage = (message: baileys.WAMessage): { node: AnyMessage; type: string } | null => {
  const c = unwrapMessageContent(message.message)
  if (c?.imageMessage) return { node: c.imageMessage, type: "image" }
  if (c?.videoMessage) return { node: c.videoMessage, type: "video" }
  if (c?.stickerMessage) return { node: c.stickerMessage, type: "sticker" }
  if (c?.documentMessage) return { node: c.documentMessage, type: "document" }
  if (c?.documentWithCaptionMessage?.message?.documentMessage) return { node: c.documentWithCaptionMessage.message.documentMessage, type: "document" }
  return null
}

const downloadMediaBuffer = async (media: MediaCandidate): Promise<Buffer> => {
  const direct = await baileys.downloadMediaMessage(media.message, "buffer", {}).catch(() => null)
  if (Buffer.isBuffer(direct) && direct.length) return direct

  const node = mediaNodeFromMessage(media.message)
  if (node && typeof (baileys as any).downloadContentFromMessage === "function") {
    const stream = await (baileys as any).downloadContentFromMessage(node.node, node.type).catch(() => null)
    if (stream) {
      const buffer = await streamToBuffer(stream)
      if (buffer.length) return buffer
    }
  }

  throw new Error("No se pudo descargar el archivo.")
}

const getChatCacheKeys = (message: baileys.WAMessage, wss: types.WASocket): string[] => {
  const keys = new Set<string>()
  const chatJid = getRawChatJid(message)
  if (chatJid) keys.add(chatJid)

  const chatDigits = digitsFromJid(chatJid)
  if (chatDigits) keys.add(`num:${chatDigits}`)

  const botNumber = getBotPhoneNumber(wss)
  const botLidNumber = digitsFromJid(getBotLid(wss))
  if (botNumber) keys.add(`num:${botNumber}`)
  if (botLidNumber) keys.add(`num:${botLidNumber}`)

  return Array.from(keys).filter(Boolean)
}

const cacheMedia = (message: baileys.WAMessage, wss: types.WASocket, media: MediaCandidate | null) => {
  if (!media) return
  const keys = getChatCacheKeys(message, wss)
  for (const key of keys) mediaCache.set(key, media)

  setTimeout(() => {
    for (const key of keys) {
      const current = mediaCache.get(key)
      if (current?.message.key.id === media.message.key.id) mediaCache.delete(key)
    }
  }, CACHE_TTL_MS)
}

const getCachedMedia = (message: baileys.WAMessage, wss: types.WASocket): MediaCandidate | null => {
  for (const key of getChatCacheKeys(message, wss)) {
    const media = mediaCache.get(key)
    if (media) return media
  }
  return null
}

const clearCachedMedia = (message: baileys.WAMessage, wss: types.WASocket) => {
  for (const key of getChatCacheKeys(message, wss)) mediaCache.delete(key)
}

const advanceStep = async (botJid: string, update: Record<string, unknown>, nextStep: number) => {
  clearSetupAutoDefault(botJid)
  const setupCompleted = nextStep >= steps.length
  await database.Bots.update(botJid, { $set: { ...update, setup_step: nextStep, setup_completed: setupCompleted ? 1 : 0 } })
}

const completeSetup = async (wss: types.WASocket, botJid: string, chatJid: string, prefixes: string[]) => {
  const safePrefixes = prefixes.length ? prefixes : ["."]
  await advanceStep(botJid, { prefixes: safePrefixes.join(" ") }, steps.length)
  clearSetupAutoDefault(botJid)
  lastPrompts.delete(botJid)
  await clearSetupPromptLock(botJid)
  await sendSafe(wss, chatJid, `✅ Socket premium listo.\nPrefijos: ${safePrefixes.join(" ")}`)
}

export const handlePremiumSocketSetupRaw = async (message: baileys.WAMessage, wss: types.WASocket): Promise<boolean> => {
  const bot = await getBotDocument(wss)
  if (!isSocketSetupNeeded(bot)) return false
  if (!message?.message) return true
  if (isOwnSetupNoticeRaw(message)) return true
  if (!isOwnBotChat(message, wss)) return true
  if (!rememberSetupMessageOnce(message, wss)) return true

  const botJid = cleanText(bot?.bot_jid) || getBotJid(wss)
  if (!botJid) return true

  const text = getTextFromContent(message.message)
  const currentMedia = extractCurrentMedia(message)
  const quotedMedia = extractQuotedMedia(message, wss)
  cacheMedia(message, wss, currentMedia)

  if (processingBots.has(botJid)) return true
  processingBots.add(botJid)

  try {
    const currentBot = (await database.Bots.get(botJid)) || bot
    const stepIndex = getSetupStepIndex(currentBot!)
    const step = steps[stepIndex]
    const chatJid = getRawChatJid(message) || getPromptTarget(wss)

    if (!step) {
      await completeSetup(wss, botJid, chatJid, normalizePrefixes(currentBot?.prefixes || "."))
      return true
    }

    if (step.type === "asset") {
      const media = currentMedia || quotedMedia || getCachedMedia(message, wss)

      if (!media) {
        if (cleanText(text)) {
          await sendSafe(wss, chatJid, `Falta la ${step.label}.`, message)
          return true
        }

        await ensurePremiumSocketSetup(wss)
        return true
      }

      const sourceId = `${botJid}:${step.field}:${media.message.key.remoteJid || ""}:${media.message.key.id || ""}:${media.size}`
      if (savedSourceIds.has(sourceId)) return true

      try {
        const buffer = await downloadMediaBuffer(media)
        if (buffer.length > MAX_MEDIA_SIZE) throw new Error("Archivo pesado")

        const assetPath = await saveSocketAsset(botJid, step.kind, buffer, media.mimetype)
        savedSourceIds.add(sourceId)
        setTimeout(() => savedSourceIds.delete(sourceId), CACHE_TTL_MS)
        clearCachedMedia(message, wss)

        await advanceStep(botJid, { [step.field]: assetPath }, stepIndex + 1)
        await sendSafe(wss, chatJid, `✅ ${step.label} guardada.`)
        await ensurePremiumSocketSetup(wss, true)
        return true
      } catch {
        await sendSafe(wss, chatJid, "No pude guardar la imagen. Reenvíala.", message)
        return true
      }
    }

    if (step.type === "bot_name") {
      const parsedName = parseBotNames(text)
      if (!parsedName.ok) {
        await sendSafe(wss, chatJid, parsedName.error || "Ponga el nombre del bot.", message)
        return true
      }

      await advanceStep(
        botJid,
        {
          name: parsedName.shortName,
          username: parsedName.longName,
        },
        stepIndex + 1,
      )
      await sendSafe(
        wss,
        chatJid,
        `✅ Nombre premium guardado.\nCorto: ${parsedName.shortName}\nLargo: ${parsedName.longName}`,
      )
      await ensurePremiumSocketSetup(wss, true)
      return true
    }

    if (step.type === "text") {
      const raw = cleanText(text)
      if (!raw) {
        await ensurePremiumSocketSetup(wss)
        return true
      }

      if (step.field === "owner_name") {
        await advanceStep(botJid, { owner_name: raw }, stepIndex + 1)
        await sendSafe(wss, chatJid, "✅ Nombre del owner guardado.")
        await ensurePremiumSocketSetup(wss, true)
        return true
      }

      if (step.field === "owner_number") {
        const fallbackNumber = normalizeReceptionNumber(currentBot?.owner_number || currentBot?.owner_jid || chatJid)
        const ownerNumber = raw === "0" ? fallbackNumber : normalizeReceptionNumber(raw)
        if (!ownerNumber) {
          await sendSafe(wss, chatJid, "Número inválido. Ponga el número para el vCard del owner con prefijo. Esto no cambia permisos ni ID/LID.", message)
          return true
        }

        await advanceStep(botJid, { owner_number: ownerNumber }, stepIndex + 1)
        await sendSafe(wss, chatJid, "✅ Número para vCard del owner guardado. Los permisos siguen usando el ID/LID real.")
        await ensurePremiumSocketSetup(wss, true)
        return true
      }

      const parsed = parseOptionalUrl(raw)
      if (!parsed.ok) {
        await sendSafe(wss, chatJid, "Enlace inválido. Envía un link válido o 0 para omitirlo.", message)
        return true
      }

      await advanceStep(botJid, { [step.field]: parsed.value }, stepIndex + 1)
      await sendSafe(wss, chatJid, parsed.value ? "✅ Enlace guardado." : "✅ Omitido.")
      await ensurePremiumSocketSetup(wss, true)
      return true
    }

    if (step.type === "prefixes") {
      const prefixes = normalizePrefixes(cleanText(text).replace(/[,_|]+/g, " ").replace(/\n+/g, " "))
      if (!prefixes.length) {
        await sendSafe(wss, chatJid, "Envía al menos un prefijo. Ejemplo válido: . # !", message)
        return true
      }

      await completeSetup(wss, botJid, chatJid, prefixes)
      return true
    }

    return true
  } finally {
    processingBots.delete(botJid)
  }
}

const stoppedSocketNumbers = new Set<string>()

export const normalizeSocketNumber = (value?: string | null): string => jidNumber(value)
export const socketJidFromNumber = (value: string): string => `${normalizeSocketNumber(value)}@s.whatsapp.net`

export const markSocketStopped = (jidOrNumber?: string | null): void => {
  const number = normalizeSocketNumber(jidOrNumber)
  if (number) stoppedSocketNumbers.add(number)
}

export const unmarkSocketStopped = (jidOrNumber?: string | null): void => {
  const number = normalizeSocketNumber(jidOrNumber)
  if (number) stoppedSocketNumbers.delete(number)
}

export const isSocketStopped = (jidOrNumber?: string | null): boolean => {
  const number = normalizeSocketNumber(jidOrNumber)
  return Boolean(number && stoppedSocketNumbers.has(number))
}

export const cleanupSocketCompletely = async (jidOrNumber: string, options: { allowMain?: boolean } = {}) => {
  const number = normalizeSocketNumber(jidOrNumber)
  if (!number) return { ok: false, success: false, message: "número inválido", number: "" }

  const botJid = socketJidFromNumber(number)
  const botDoc = await database.Bots.find(botJid).catch(() => null)
  const allBots = await BotPersistence.loadBots().catch(() => [])
  const rows = allBots.filter((bot: any) => normalizeSocketNumber(bot.bot_number || bot.bot_jid) === number)
  const botType = String(rows[0]?.bot_type || botDoc?.bot_type || "").toLowerCase()

  if (botType === "main" && !options.allowMain) {
    return { ok: false, success: false, message: "no se puede borrar el bot principal", number }
  }

  markSocketStopped(number)

  for (const [jid, data] of Array.from(Bot.bots.entries())) {
    const current = normalizeSocketNumber(jid || data?.bot_jid)
    if (current !== number) continue
    try { await (data.wss as any)?.logout?.() } catch {}
    try { ;(data.wss as any)?.end?.(undefined) } catch {}
    Bot.bots.delete(jid)
  }

  const paths = new Set<string>()
  for (const row of rows as any[]) {
    if (row.session_path) paths.add(String(row.session_path))
  }
  paths.add(path.join(process.cwd(), "prembots", `prem-${number}`))
  paths.add(path.join(process.cwd(), "freebots", `free-${number}`))
  paths.add(path.join(process.cwd(), "mainbots", `main-${number}`))
  paths.add(path.join(process.cwd(), "backups", "premium-sockets", `prem-${number}`))
  paths.add(path.join(process.cwd(), "database", "assets", "sockets", number))

  for (const target of paths) {
    await fs.rm(target, { recursive: true, force: true }).catch(() => {})
  }

  await PremiumManager.deletePremium(number).catch(() => null)
  await BotPersistence.removeBot(botJid).catch(() => {})
  await database.Bots.delete(botJid).catch(() => false)
  await BotPersistence.syncToJSON().catch(() => {})

  return { ok: true, success: true, message: "socket eliminado completamente", number }
}
