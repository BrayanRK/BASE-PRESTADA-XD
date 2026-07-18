import path from "path"
import { fileURLToPath } from "url"
import { createRequire } from "node:module"
import { Bot } from "../bot/bot.js"
import { PremiumManager } from "../libs/socket-manager.js"
import type * as types from "../types/types.js"

const require = createRequire(import.meta.url)
const pino = require("pino") as (options?: any) => any

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export class BotManager {
  private static instance: BotManager
  private activeBots = new Map<string, Bot>()
  private logger = pino({ level: "silent" })

  static getInstance(): BotManager {
    if (!BotManager.instance) {
      BotManager.instance = new BotManager()
    }
    return BotManager.instance
  }

  async startBot(config: types.BotConfiguration): Promise<Bot> {
    const bot = new Bot(config)

    bot.ev.on("bot.open", (e) => {
      this.activeBots.set(e.botjid, bot)
      console.log(`[BotManager] Bot ${config.bot_type} ${e.botjid.split("@")[0]} conectado`)
    })

    bot.ev.on("bot.logout", () => {
      this.activeBots.delete(config.bot_jid || "")
      console.log(`[BotManager] Bot ${config.bot_type} desconectado`)
    })

    await bot.connect()
    return bot
  }

  async loadExistingBots(): Promise<void> {
    try {
      const existingBots = await PremiumManager.getActiveBots()

      for (const botData of existingBots) {
        try {
          const sessionPath = this.getSessionPath(botData.bot_type, botData.bot_number)

          const config: types.BotConfiguration = {
            bot_id: `${botData.bot_type}-${botData.bot_number}-${Date.now()}`,
            bot_jid: `${botData.bot_number}@s.whatsapp.net`,
            owner_jid: botData.user_jid,
            bot_type: botData.bot_type as types.TypeBots,
            connection_method: "existing" as types.ConnectionMethod,
            session_path: sessionPath,
          }

          await this.startBot(config)
          await new Promise((resolve) => setTimeout(resolve, 2000))
        } catch (error) {
          console.error(`[BotManager] Error reconectando bot ${botData.bot_number}:`, error)
        }
      }
    } catch (error) {
      console.error("[BotManager] Error cargando bots existentes:", error)
    }
  }

  private getSessionPath(botType: string, botNumber: string): string {
    const projectRoot = path.resolve(process.cwd())

    switch (botType) {
      case "main":
        return path.join(projectRoot, "mainbots", `main-${botNumber}`)
      case "premium":
        return path.join(projectRoot, "prembots", `prem-${botNumber}`)
      case "free":
        return path.join(projectRoot, "freebots", `free-${botNumber}`)
      default:
        return path.join(projectRoot, "sessions", `bot-${botNumber}`)
    }
  }

  getActiveBot(jid: string): Bot | undefined {
    return this.activeBots.get(jid)
  }

  getAllActiveBots(): Map<string, Bot> {
    return new Map(this.activeBots)
  }

  async stopBot(jid: string): Promise<boolean> {
    const bot = this.activeBots.get(jid)
    if (bot) {
      this.activeBots.delete(jid)
      return true
    }
    return false
  }

  async stopAllBots(): Promise<void> {
    for (const [jid, bot] of this.activeBots) {
      await this.stopBot(jid)
    }
    this.activeBots.clear()
  }
}
