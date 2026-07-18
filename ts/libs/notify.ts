import type * as types from "../types/types.js"
import { PremiumManager } from "./socket-manager.js"

export class PremiumNotifier {
  private static interval: NodeJS.Timeout | null = null
  private static conn: types.WASocket | null = null

  static start(connection: types.WASocket): void {
    this.conn = connection

    if (this.interval) {
      clearInterval(this.interval)
    }

    this.interval = setInterval(
      async () => {
        await this.checkExpiringBots()
      },
      24 * 60 * 60 * 1000,
    )

    this.checkExpiringBots()
    console.log("[PremiumNotifier] Sistema de notificaciones iniciado")
  }

  static stop(): void {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
    this.conn = null
    console.log("[PremiumNotifier] Sistema de notificaciones detenido")
  }

  private static async checkExpiringBots(): Promise<void> {
    if (!this.conn) return

    try {
      const expiringBots = await PremiumManager.getExpiringBots(7)

      for (const bot of expiringBots) {
        const expiresAt = new Date(bot.expires_at)
        const now = new Date()
        const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

        const message =
          `*｢⚠️ AVISO DE EXPIRACIÓN｣*\n\n` +
          `Tu bot premium expirará pronto:\n\n` +
          `> *📱 Bot:* ${bot.bot_number}\n` +
          `> *⏰ Expira en:* ${daysLeft} día${daysLeft !== 1 ? "s" : ""}\n` +
          `> *📅 Fecha:* ${expiresAt.toLocaleDateString()}\n` +
          `> *🔄 Tipo:* ${bot.bot_type}\n\n` +
          `*｢💡 SOLUCIÓN｣*\n` +
          `Para extender tu premium, usa:\n` +
          `\`/sumprem ${bot.bot_number}\`\n\n` +
          `*｢⚠️ IMPORTANTE｣*\n` +
          `¡No pierdas tu bot premium!`

        await this.conn.sendMessage(bot.user_jid, { text: message })
        await PremiumManager.markAsNotified(bot.id)
        console.log(`[PremiumNotifier] Notificación enviada para bot: ${bot.bot_number}`)
      }
    } catch (error) {
      console.error("[PremiumNotifier] Error enviando notificaciones:", error)
    }
  }
}
