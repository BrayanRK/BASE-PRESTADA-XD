import type * as types from "../../../types/types.js"
import * as database from "../../../database/database.js"
import { canConfigureSocket, denyFreeConfigMessage, normalizeJid, socketConfigOnlyMessage } from "../../../libs/socket-manager.js"
import { normalizeOwnerNumber, updateUniversalConfig } from "../../../libs/zeta_cf.js"
import { box } from "../../../libs/zeta_texto.js"

const command: types.Command = {
  name: "setownernumber",
  alias: ["setownerphone", "setownercontact", "ownernumber"],
  description: "Cambia el número público del owner sin tocar permisos.",
  category: "bot",
  hidden: false,
  requires: ["bot.owner"],
  flags: ["all.chats"],
  using: "<número>",
  execute: async (_wss, { mctx, args, bot, userIsBotOwner, usedPrefix }) => {
    if (String(bot.bot_type) === "free") {
      await mctx.reply(denyFreeConfigMessage())
      return
    }

    const sameBotActor = Boolean(mctx.message.from_me || normalizeJid(mctx.sender.jid) === normalizeJid(bot.bot_jid))
    if (!userIsBotOwner && !sameBotActor && !canConfigureSocket(mctx.sender.jid, bot)) {
      await mctx.reply(socketConfigOnlyMessage())
      return
    }

    const number = normalizeOwnerNumber(args.join(" "))
    if (!number) {
      await mctx.reply(box("NÚMERO DEL OWNER", [`Uso › ${usedPrefix}setownernumber 51999999999`, "Nota › esto no cambia el ID/LID de permisos"]))
      return
    }

    const botKeys = Array.from(new Set([bot.bot_jid, mctx.me.jids.lid, mctx.me.jids.pn].filter(Boolean)))
    for (const botKey of botKeys) {
      await database.Bots.update(botKey, { $set: { owner_number: number } })
    }

    if (String(bot.bot_type) === "main") {
      try {
        updateUniversalConfig({ ownerNumber: number })
      } catch {}
    }

    await mctx.reply(
      box("NÚMERO DEL OWNER", [
        `Número › +${number}`,
        "Permisos › sin cambios",
        "Estado › actualizado",
      ]),
    )
  },
}

export default command
