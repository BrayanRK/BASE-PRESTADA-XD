import type * as types from "../../../types/types.js"
import * as database from "../../../database/database.js"
import { canConfigureSocket, denyFreeConfigMessage, socketConfigOnlyMessage, socketUsage } from "../../../libs/socket-manager.js"

const command: types.Command = {
  name: "setusername",
  alias: [],
  description: "Cambiar el nombre de usuario.",
  category: "bot",
  hidden: false,
  requires: ["bot.owner"],
  flags: ["all.chats"],
  using: "[nombre]",
  execute: async (wss, { mctx, args, bot, userIsBotOwner }) => {
    if (String(bot.bot_type) === "free") {
      await mctx.reply(denyFreeConfigMessage())
      return
    }

    if (!userIsBotOwner && !canConfigureSocket(mctx.sender.jid, bot)) {
      await mctx.reply(socketConfigOnlyMessage())
      return
    }

    const username = args.join(" ").trim()
    if (!username) {
      await mctx.reply(socketUsage("Set Username", [`Uso 》 #setusername Nombre público`]))
      return
    }

    try {
      await wss.updateProfileName(username)
    } catch {}

    await database.Bots.update(bot.bot_jid || mctx.me.jids.lid, { $set: { username, name: username } })
    await mctx.reply(`「◈」 Username\n◈ Nuevo 》 ${username}\n◈ Estado 》 actualizado`)
  },
}

export default command
