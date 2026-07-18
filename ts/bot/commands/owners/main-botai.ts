import type * as types from "../../../types/types.js"
import { askBotAi } from "../../../libs/apifree-ai.js"
import { getRuntimeBotName, getRuntimeOwnerName } from "../../../libs/zeta_cf.js"

const cleanText = (value: unknown, fallback = ""): string => {
  const text = String(value ?? "")
    .replace(/\r/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim()

  return text || fallback
}

const formatAiReply = (botName: string, answer: string): string => {
  const safeBotName = cleanText(botName, "Bot")
  const safeAnswer = cleanText(answer, "No pude generar una respuesta.")

  return `「♛」 ${safeBotName} IA\n${safeAnswer}\n╰────────────`
}

const command: types.Command = {
  name: "bot",
  alias: [],
  description: "Pregunta a la IA etiquetando primero al bot",
  using: "@bot <pregunta>",
  category: "main",
  flags: ["only.groups"],
  requires: [],
  hidden: false,
  execute: async (wss, { mctx, args, bot, usedPrefix, commandName }) => {
    if (usedPrefix) return

    const question = cleanText(args.join(" "))
    const botName = cleanText(
      bot.name || bot.username || (String(bot.bot_type) === "main" ? getRuntimeBotName() : "") || mctx.me.name,
      "Bot",
    )
    const ownerName = cleanText(
      bot.owner_name || (String(bot.bot_type) === "main" ? getRuntimeOwnerName() : "") || "mi owner",
      "mi owner",
    )

    if (!question) {
      await mctx.reply(
        `「♛」 ${botName} IA
│ Uso › etiqueta primero al bot y luego escribe tu pregunta.
╰ Ejemplo › @${mctx.me.jids.pn.split("@")[0] || "bot"} dime una idea para mi grupo`,
      )
      return
    }

    try {
      await wss.sendPresenceUpdate("composing", mctx.chat.jid).catch(() => undefined)
      const answer = await askBotAi({
        question,
        botName,
        ownerName,
        userName: mctx.sender.name,
        chatName: mctx.chat.name,
      })

      await mctx.reply(formatAiReply(botName, answer))
    } catch (error: any) {
      const message = cleanText(error?.message || error, "Error desconocido")
      await mctx.reply(`「♛」 ${botName} IA\n│ Estado › no pude responder ahora\n╰ Error › ${message}`)
    } finally {
      await wss.sendPresenceUpdate("paused", mctx.chat.jid).catch(() => undefined)
    }
  },
}

export default command
