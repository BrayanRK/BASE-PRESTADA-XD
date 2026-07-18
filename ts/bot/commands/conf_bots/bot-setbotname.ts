import * as types from "../../../types/types.js"
import * as database from "../../../database/database.js"
import { canConfigureSocket, denyFreeConfigMessage, socketConfigOnlyMessage, socketUsage } from "../../../libs/socket-manager.js"

export default <types.Command>{
  name: "setbotname",
  alias: ["setname"],
  description: "Cambiar el nombre del bot",
  category: "bot",
  hidden: false,
  requires: ["bot.owner"],
  flags: ["all.chats"],
  using: "[nombre corto] / [nombre largo]",
  execute: async (wss, { mctx, args, bot, userIsBotOwner }) => {
    if (String(bot.bot_type) === "free") {
      await mctx.reply(denyFreeConfigMessage())
      return
    }

    if (!userIsBotOwner && !canConfigureSocket(mctx.sender.jid, bot)) {
      await mctx.reply(socketConfigOnlyMessage())
      return
    }

    const input = args.join(" ").trim()
    if (!input) {
      await mctx.reply(socketUsage("Set Name", [`Uso 》 #setname Zeta / Zeta Bot Oficial`, `Nota 》 antes del / va el nombre corto.`]))
      return
    }

    const [shortRaw, longRaw] = input.split("/").map((part) => part.trim())
    const shortName = shortRaw || longRaw
    const longName = longRaw || shortRaw

    if (!shortName || shortName.length > 25) {
      await mctx.reply("*｢✧｣* El nombre corto no debe superar 25 caracteres.")
      return
    }

    await database.Bots.update(bot.bot_jid || mctx.me.jids.lid, {
      $set: {
        name: shortName,
        username: longName,
      },
    })

    await mctx.reply(`「◈」 Nombre del bot\n◈ Corto 》 ${shortName}\n◈ Largo 》 ${longName}\n◈ Estado 》 actualizado`)
  },
}
