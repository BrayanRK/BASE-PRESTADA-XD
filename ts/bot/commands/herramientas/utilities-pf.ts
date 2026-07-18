import type * as types from "../../../types/types.js"
import * as baileys from "baileys"

const resolveJid = (raw: string): string => {
  const clean = raw.replace(/[^0-9]/g, "")
  if (!clean) return ""
  return baileys.jidNormalizedUser(`${clean}@s.whatsapp.net`)
}

const extractMentionJid = (mctx: types.MessageContext): string | null => {
  const msg = mctx.message.original.message
  const ctx =
    msg?.extendedTextMessage?.contextInfo ??
    msg?.imageMessage?.contextInfo ??
    msg?.videoMessage?.contextInfo ??
    msg?.documentMessage?.contextInfo ??
    null

  const mentions = ctx?.mentionedJid ?? []
  return mentions[0] ?? null
}

export default {
  name: "pf",
  alias: ["wp", "foto", "fotoperfil"],
  description: "Obtiene la foto de perfil de un usuario de WhatsApp.",
  category: "utilities",
  using: "<número | @tag>",
  flags: ["all.chats"],
  requires: [],
  hidden: false,
  execute: async (wss, { mctx, args }) => {
    let jid: string | null = null

    const mention = extractMentionJid(mctx)
    if (mention) {
      jid = baileys.jidNormalizedUser(mention)
    } else if (args.length > 0) {
      const raw = args.join("").trim()
      jid = resolveJid(raw)
    } else if (mctx.quoted) {
      jid = baileys.jidNormalizedUser(mctx.quoted.sender.jid)
    }

    if (!jid) {
      await mctx.react("⚠️")
      await mctx.reply("「⚠」 Escribe un número, menciona a alguien o responde un mensaje.\nEj: .pf 51999000000")
      return
    }

    try {
      await mctx.react("⏳")

      const url = await wss.profilePictureUrl(jid, "image")

      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buffer = Buffer.from(await res.arrayBuffer())

      const number = baileys.jidDecode(jid)?.user ?? jid

      await wss.sendMessage(
        mctx.chat.jid,
        {
          image: buffer,
          caption: `「◈」 *Foto de perfil*\n✦ Número › +${number}`,
        },
        { quoted: mctx.message.original },
      )

      await mctx.react("✅")
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      const isPrivate = msg.includes("401") || msg.toLowerCase().includes("not authorized")

      await mctx.react("❌")
      await mctx.reply(
        isPrivate
          ? "「✖」 Este usuario tiene su foto de perfil privada."
          : "「✖」 No se pudo obtener la foto de perfil.",
      )
    }
  },
} as types.Command
