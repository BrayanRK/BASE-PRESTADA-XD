import type * as types from "../../../types/types.js"
import * as database from "../../../database/database.js"
import { canConfigureSocket, denyFreeConfigMessage, socketConfigOnlyMessage, socketUsage } from "../../../libs/socket-manager.js"

const command: types.Command = {
  name: "autojoin",
  alias: [],
  description: "Unirse automáticamente a grupos enviados por el dueño del bot en privado.",
  category: "bot",
  hidden: false,
  requires: ["bot.owner"],
  flags: ["all.chats"],
  using: "[enable/disable]",
  execute: async (_, { mctx, args, bot, userIsBotOwner }) => {
    if (String(bot.bot_type) === "free") {
      await mctx.reply(denyFreeConfigMessage())
      return
    }

    if (!userIsBotOwner && !canConfigureSocket(mctx.sender.jid, bot)) {
      await mctx.reply(socketConfigOnlyMessage())
      return
    }

    const value = String(args[0] || "").toLowerCase()

    if (!/^(?:on|off|enable|disable)$/i.test(value)) {
      await mctx.reply(socketUsage("Autojoin", [`Estado 》 ${bot.autojoin_enabled ? "activado" : "desactivado"}`, `Uso 》 #autojoin enable`, `Uso 》 #autojoin disable`]))
      return
    }

    const enabled = /^(?:on|enable)$/i.test(value)
    await database.Bots.update(bot.bot_jid || mctx.me.jids.lid, { $set: { autojoin_enabled: enabled ? 1 : 0 } })
    await mctx.reply(`「◈」 Autojoin\n◈ Estado 》 ${enabled ? "activado" : "desactivado"}\n◈ Nota 》 envía links de grupos por privado al bot.`)
  },
}

export default command
