import type * as types from "../../../types/types.js"
import { Bot } from "../../bot.js"
import { getBotType } from "../../../libs/libs.js"

const formatUptime = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  parts.push(`${seconds}s`)

  return parts.join(" ")
}

const command: types.Command = {
  name: "timebots",
  alias: ["botstime", "uptime", "uptimebots", "botuptime"],
  description: "Muestra el tiempo de conexión de cada socket activo desde que se conectaron.",
  category: "bot",
  hidden: false,
  requires: ["owner.user"],
  flags: ["all.chats"],
  execute: async (wss, { mctx }) => {
    if (Bot.bots.size === 0) {
      await mctx.reply("「✧」 No hay sockets activos en memoria.")
      return
    }

    const now = Date.now()

    // Ordenar: main primero, luego premium, luego free; dentro de cada tipo por uptime desc
    const entries = Array.from(Bot.bots.entries()).sort(([, a], [, b]) => {
      const typeOrder = (t: string) => (t === "main" ? 0 : t === "premium" ? 1 : 2)
      const typeDiff = typeOrder(a.bot_type) - typeOrder(b.bot_type)
      if (typeDiff !== 0) return typeDiff
      const aUp = a.connected_at ?? 0
      const bUp = b.connected_at ?? 0
      return aUp - bUp // más antiguo primero
    })

    const lines: string[] = [`「⏱」 Tiempo de conexión — ${entries.length} socket${entries.length !== 1 ? "s" : ""}`]

    for (const [, botData] of entries) {
      const botJid = botData.bot_jid || ""
      const botNumber = botJid.split("@")[0].split(":")[0] || "?"
      const name = await wss.getName(botJid).catch(() => "") || botNumber
      const type = getBotType((botData.bot_type as types.TypeBots) || "free")

      let uptimeStr: string
      if (botData.connected_at) {
        const elapsed = now - botData.connected_at
        uptimeStr = formatUptime(elapsed)
      } else {
        uptimeStr = "desconocido"
      }

      lines.push(`│`)
      lines.push(`│ @${botNumber} — ${name}`)
      lines.push(`│ Tipo › ${type}`)
      lines.push(`│ Uptime › ${uptimeStr}`)
    }

    lines.push(`╰ Hora › ${new Date().toLocaleTimeString("es-PE", { hour12: false })}`)

    await mctx.reply(lines.join("\n"), "s.whatsapp.net")
  },
}

export default command
