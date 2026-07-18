import type * as types from "../../../types/types.js"
import * as database from "../../../database/database.js"
import { getScopedGroupJid } from "../../../libs/bot-scope.js"

const card = (text: string, lines: string[] = []): string => [`「◈」 *${text}*`, ...lines].join("\n")

export default {
  name: "setfarewellmsg",
  alias: ["setfarewell", "setdespedida"],
  description: "Modifica el mensaje de despedida del grupo",
  category: "group",
  hidden: false,
  using: "<mensaje>",
  flags: ["only.groups"],
  requires: ["administrator.user"],
  execute: async (_wss, { mctx, usedPrefix, bot }) => {
    const rawText = mctx.message.text
    const newFarewellMessage = rawText.replace(usedPrefix, "").replace(/setfarewellmsg|setfarewell|setdespedida/i, "").trim()

    if (!newFarewellMessage) {
      await mctx.reply(card("Coloca el mensaje de despedida", [
        "",
        `Uso: ${usedPrefix}setfarewell Adiós %participant_name%`,
        "Variables: %participant_jid% %participant_name% %group_subject% %group_size% %group_desc%",
      ]))
      return
    }

    await database.Groups.update(getScopedGroupJid(bot, mctx.chat.jid), {
      $set: {
        farewell_message: newFarewellMessage,
      },
    })

    await mctx.reply(card("Despedida actualizada para este grupo"))
  },
} as types.Command
