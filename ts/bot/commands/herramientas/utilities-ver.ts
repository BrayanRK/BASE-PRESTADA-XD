import type * as types from "../../../types/types.js"
import * as database from "../../../database/database.js"
import { getEffectiveBotJid } from "../../../libs/bot-scope.js"
import { revealViewOnceMessage, secretSettingKey } from "../../../libs/secret.js"

export default {
  name: "ver",
  alias: ["revelar", "vv"],
  description: "Revela una imagen, video o audio enviado para ver una sola vez.",
  category: "utilities",
  using: "responde a un view-once",
  flags: ["only.groups"],
  requires: ["administrator.user"],
  hidden: false,
  execute: async (wss, { mctx, bot, usedPrefix }) => {
    const botJid = getEffectiveBotJid(bot) || mctx.me.jids.lid || mctx.me.jids.pn
    const enabled = await database.BotSettings.getBool(botJid, secretSettingKey(mctx.chat.jid), false)

    if (!enabled) {
      await mctx.reply(`「🛠」 El comando ${usedPrefix}ver está desactivado en este grupo. Usa ${usedPrefix}secret on para habilitarlo.`)
      return
    }

    const quoted = mctx.quoted?.message?.original
    if (!quoted) {
      await mctx.reply(`「🛠」 Responde a una imagen, video o audio de una sola vez para revelarlo.`)
      return
    }

    const result = await revealViewOnceMessage(wss, mctx.chat.jid, quoted, mctx.message.original, mctx.quoted?.sender?.jid)
    if (!result.ok) {
      await mctx.reply(`「🛠」 ${result.reason || "No pude revelar ese mensaje."}`)
    }
  },
} as types.Command
