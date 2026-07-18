import fs from "node:fs/promises"
import path from "node:path"
import type * as types from "../../../types/types.js"
import * as database from "../../../database/database.js"
import * as libs from "../../../libs/libs.js"
import { getScopedGroupJid } from "../../../libs/bot-scope.js"
import { canConfigureSocket, socketUsage } from "../../../libs/socket-manager.js"

const card = (text: string): string => `「◈」 *${text}*`

const extensionFromMime = (mimetype: string): string => {
  const mime = String(mimetype || "").toLowerCase()
  if (mime.includes("png")) return "png"
  if (mime.includes("webp")) return "webp"
  if (mime.includes("gif")) return "gif"
  return "jpg"
}

const safePart = (value: string): string => String(value || "unknown").replace(/[^a-zA-Z0-9._-]/g, "_")

const saveGroupImage = async (botJid: string, groupJid: string, buffer: Buffer, mimetype: string): Promise<string> => {
  const ext = extensionFromMime(mimetype)
  const dir = path.join(process.cwd(), "database", "assets", "groups", safePart(botJid), safePart(groupJid))
  await fs.mkdir(dir, { recursive: true })

  for (const oldExt of ["jpg", "jpeg", "png", "webp", "gif"]) {
    await fs.rm(path.join(dir, `welcome.${oldExt}`), { force: true }).catch(() => undefined)
  }

  const filePath = path.join(dir, `welcome.${ext}`)
  await fs.writeFile(filePath, buffer)
  return filePath
}

export default {
  name: "wellimg",
  alias: ["imgwell", "setwellimg", "setwelcomeimg", "setwelcomeimage", "setwelcomebanner"],
  description: "Cambiar la imagen de bienvenida del grupo",
  category: "group",
  hidden: false,
  flags: ["only.groups"],
  requires: ["administrator.user"],
  execute: async (_, { mctx, bot, userIsBotOwner, userIsAdmin, userIsOwner }) => {
    const target = mctx.quoted ?? mctx
    const mimetype = String(target.message?.mimetype || "")
    const size = Number(target.message?.size || 0)

    if (!/^image/.test(mimetype)) {
      await mctx.reply(socketUsage("Welcome Img", ["Responde una imagen con #setwelcomeimage", "También sirve #wellimg"]))
      return
    }

    if (size > 10_485_760) {
      await mctx.reply(card(`La imagen no debe superar 10 MB (${libs.formatByteSize(size)})`))
      return
    }

    if (!userIsAdmin && !userIsOwner && !userIsBotOwner && !canConfigureSocket(mctx.sender.jid, bot)) {
      await mctx.reply(card("Solo admins del grupo pueden cambiar la imagen de bienvenida"))
      return
    }

    const input = await target.download().buffer()
    if (!Buffer.isBuffer(input)) throw new Error("The media file could not be downloaded.")

    const botJid = bot.bot_jid || mctx.me.jids.lid
    const groupJid = getScopedGroupJid(bot, mctx.chat.jid)
    const assetPath = await saveGroupImage(botJid, groupJid, input, mimetype)

    await database.Groups.update(groupJid, {
      $set: {
        welcome_image_url: assetPath,
      },
    })

    await mctx.reply(card("Imagen de bienvenida actualizada para este grupo"))
  },
} as types.Command
