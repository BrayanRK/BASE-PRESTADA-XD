import type * as types from "../../../types/types.js"
import { getRuntimeChannelUrl, getRuntimeOwnerName, getRuntimeSocialLinks } from "../../../libs/zeta_cf.js"

const cleanText = (value: unknown, fallback = ""): string => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim()
  return text || fallback
}

const jidNumber = (jid?: string | null): string => String(jid || "").split(":")[0].split("@")[0].replace(/[^0-9]/g, "")

export default {
  name: "redes",
  alias: ["rd"],
  description: "Muestra las redes configuradas del owner",
  category: "main",
  hidden: false,
  flags: ["all.chats"],
  requires: [],
  execute: async (wss, { mctx, bot }) => {
    const runtimeLinks = getRuntimeSocialLinks()
    const useRuntimeFallback = String(bot.bot_type) === "main"
    const channelUrl = cleanText((bot as any).channel_url, useRuntimeFallback ? getRuntimeChannelUrl() : "")
    const links = {
      facebook: cleanText((bot as any).facebook_url, useRuntimeFallback ? runtimeLinks.facebook : ""),
      instagram: cleanText((bot as any).instagram_url, useRuntimeFallback ? runtimeLinks.instagram : ""),
      tiktok: cleanText((bot as any).tiktok_url, useRuntimeFallback ? runtimeLinks.tiktok : ""),
      telegram: cleanText((bot as any).telegram_url, useRuntimeFallback ? runtimeLinks.telegram : ""),
    }
    const ownerName = cleanText(bot.owner_name, getRuntimeOwnerName() || "Owner")
    const ownerNumber = jidNumber(bot.owner_jid)

    const rows: Array<[string, string]> = []
    if (channelUrl) rows.push(["Canal", channelUrl])
    if (links.facebook) rows.push(["Facebook", links.facebook])
    if (links.instagram) rows.push(["Instagram", links.instagram])
    if (links.tiktok) rows.push(["TikTok", links.tiktok])
    if (links.telegram) rows.push(["Telegram", links.telegram])

    let text = `「♛」 Redes del Owner\n`
    text += `│ Owner › ${ownerName}\n`
    if (ownerNumber) text += `│ Contacto › @${ownerNumber}\n`

    if (!rows.length) {
      text += `│ Estado › sin redes configuradas\n`
      text += `╰────────────`
      await mctx.reply(text)
      return
    }

    text += `│ Estado › disponibles\n`
    text += `├───────────────\n`
    for (const [name, url] of rows) text += `│ ${name} › ${url}\n`
    text += `╰────────────`

    await wss.sendMessage(mctx.chat.jid, { text, mentions: ownerNumber ? [bot.owner_jid] : [] }, { quoted: mctx.message.original })
  },
} as types.Command
