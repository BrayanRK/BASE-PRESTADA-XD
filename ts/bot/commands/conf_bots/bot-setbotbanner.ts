import type * as types from "../../../types/types.js"
import * as database from "../../../database/database.js"
import * as libs from "../../../libs/libs.js"
import { canConfigureSocket, denyFreeConfigMessage, saveOfficialAsset, saveSocketAsset, socketConfigOnlyMessage, socketUsage } from "../../../libs/socket-manager.js"
import { updateUniversalConfig } from "../../../libs/zeta_cf.js"

export default {
  name: "setbotbanner",
  alias: ["setbanner", "setmenubanner", "setbaner", "srtbaner"],
  description: "Cambiar el banner del menu",
  category: "bot",
  hidden: false,
  requires: ["bot.owner"],
  flags: ["all.chats"],
  execute: async (_, { mctx, bot, userIsBotOwner }) => {
    if (String(bot.bot_type) === "free") {
      await mctx.reply(denyFreeConfigMessage())
      return
    }

    if (!userIsBotOwner && !canConfigureSocket(mctx.sender.jid, bot)) {
      await mctx.reply(socketConfigOnlyMessage())
      return
    }

    const target = mctx.quoted ?? mctx
    const mimetype = target.message.mimetype
    const size = target.message.size

    if (!/^image/.test(mimetype)) {
      await mctx.reply(socketUsage("Set Banner", [`Responde una imagen con #setbanner`, `También sirve #setmenubanner`]))
      return
    }

    if (size > 10_485_760) {
      await mctx.reply(`*｢✧｣* La imagen no debe superar 10 MB (${libs.formatByteSize(size)}).`)
      return
    }

    const input = await target.download().buffer()
    if (!Buffer.isBuffer(input)) throw new Error("The media file could not be downloaded.")

    const isMainBot = String(bot.bot_type) === "main"
    const assetPath = isMainBot
      ? await saveOfficialAsset("banner", input, mimetype)
      : await saveSocketAsset(bot.bot_jid || mctx.me.jids.lid, "banner", input, mimetype)

    if (isMainBot) {
      updateUniversalConfig({
        setup: {
          assets: {
            generalImage: {
              path: assetPath,
              mimetype,
              size: input.length,
              savedAt: new Date().toISOString(),
            },
          },
          updatedAt: new Date().toISOString(),
        },
      })
    }

    await database.Bots.update(bot.bot_jid || mctx.me.jids.lid, { $set: { thumbnail_url: assetPath } })
    await mctx.reply(`「◈」 Banner\n◈ Imagen 》 actualizada\n◈ Estado 》 listo`)
  },
} as types.Command
