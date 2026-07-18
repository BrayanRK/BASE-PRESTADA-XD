import type * as types from "../../../types/types.js"
import { BotSettings } from "../../../database/database.js"
import { getEffectiveBotJid } from "../../../libs/bot-scope.js"
import {
  dvyerYtMp4, dvyerMediaUrl, dvyerTikTokMp4, dvyerFacebook, dvyerInstagram, dvyerSpotify, dvyerMediafire,
  evogbYtMp4, evogbMediaUrl, evogbTikTok, evogbSpotifyDl,
  downloadTikTokRaw, downloadInstagram, downloadFacebook, downloadPinterest,
  type DownloadedMedia, type DownloadResult,
} from "../../../libs/downloads.js"

export const DW_KEY = "lucasxt:dw:enabled"

const url = (text: string): string =>
  text.match(/https?:\/\/\S+/i)?.[0]?.replace(/[>)\].,;]+$/, "") ?? ""

const platform = (text: string): string | null => {
  const u = url(text) || text
  if (/(?:youtube\.com\/(?:watch|shorts|live)|youtu\.be\/)/i.test(u))  return "youtube"
  if (/(?:www\.|vm\.|vt\.|m\.)?tiktok\.com\//i.test(u))               return "tiktok"
  if (/(?:facebook\.com|fb\.watch|fb\.com)\//i.test(u))               return "facebook"
  if (/instagram\.com\//i.test(u))                                     return "instagram"
  if (/(?:pinterest\.[a-z.]+\/|pin\.it\/)/i.test(u))                  return "pinterest"
  if (/open\.spotify\.com\//i.test(u))                                 return "spotify"
  if (/(?:twitter\.com|x\.com)\/[^\s]+\/status\//i.test(u))           return "twitter"
  if (/mediafire\.com\/file\//i.test(u))                               return "mediafire"
  return null
}

const send = async (wss: types.WASocket, mctx: types.MessageContext, media: DownloadedMedia, caption: string): Promise<void> => {
  const opts = { quoted: mctx.message.original }
  const mime = media.mime || ""

  if (media.buffer?.length) {
    if (mime.startsWith("audio/"))
      await wss.sendMessage(mctx.chat.jid, { audio: media.buffer, mimetype: mime, ptt: false }, opts)
    else if (mime.startsWith("image/"))
      await wss.sendMessage(mctx.chat.jid, { image: media.buffer, caption, mimetype: mime }, opts)
    else
      await wss.sendMessage(mctx.chat.jid, { video: media.buffer, caption, mimetype: mime || "video/mp4" }, opts)
    return
  }

  const link = String(media.url || (media as any).directUrl || "")
  if (!link) return
  if (mime.startsWith("audio/"))
    await wss.sendMessage(mctx.chat.jid, { audio: { url: link }, mimetype: mime, ptt: false }, opts)
  else
    await wss.sendMessage(mctx.chat.jid, { video: { url: link }, caption, mimetype: mime || "video/mp4" }, opts)
}

// Adapta el shape de DownloadResult (de las funciones *Raw, basadas en yt-dlp)
// al shape DownloadedMedia que espera send(). Si viene un álbum, toma el primer item.
const toMedia = (r: DownloadResult): DownloadedMedia => {
  const first = r.kind === "album" ? r.items?.[0] : undefined
  const kind = first?.kind ?? r.kind
  const buffer = first?.buffer ?? r.buffer
  return {
    type: kind === "image" ? "image" : "video",
    url: buffer ? undefined : (r.directUrl || r.url),
    buffer,
    mime: first?.mime ?? r.mime,
    caption: "",
    fileName: first?.filename ?? r.filename ?? "file",
  }
}

const sendUrl = async (wss: types.WASocket, mctx: types.MessageContext, link: string, mime: string, caption: string): Promise<void> => {
  const opts = { quoted: mctx.message.original }
  if (mime.startsWith("audio/"))
    await wss.sendMessage(mctx.chat.jid, { audio: { url: link }, mimetype: mime, ptt: false }, opts)
  else
    await wss.sendMessage(mctx.chat.jid, { video: { url: link }, caption, mimetype: mime || "video/mp4" }, opts)
}

export const handleAutoDownload = async (wss: types.WASocket, mctx: types.MessageContext, bot: types.BotDocument | null): Promise<void> => {
  const botJid = getEffectiveBotJid(bot)
  if (!botJid || mctx.message.from_me) return

  const enabled = await BotSettings.getBool(botJid, DW_KEY, false)
  if (!enabled) return

  const text = String(mctx.message.text || "").trim()
  const plat = platform(text)
  if (!plat) return

  const link = url(text)
  if (!link) return

  await mctx.react("⏳")

  try {
    if (plat === "youtube") {
      let mediaUrl = ""
      try { mediaUrl = dvyerMediaUrl(await dvyerYtMp4(link, "720")) } catch {
        mediaUrl = evogbMediaUrl(await evogbYtMp4(link, "720"))
      }
      await sendUrl(wss, mctx, mediaUrl, "video/mp4", "「◈」 YouTube")

    } else if (plat === "tiktok") {
      try { await send(wss, mctx, toMedia(await downloadTikTokRaw(link)), "「◈」 TikTok"); }
      catch {
        let mediaUrl = ""
        try { mediaUrl = evogbMediaUrl(await evogbTikTok(link)) } catch {
          mediaUrl = dvyerMediaUrl(await dvyerTikTokMp4(link))
        }
        await sendUrl(wss, mctx, mediaUrl, "video/mp4", "「◈」 TikTok")
      }

    } else if (plat === "facebook") {
      try { await send(wss, mctx, await downloadFacebook(link), "「◈」 Facebook") }
      catch { await sendUrl(wss, mctx, dvyerMediaUrl(await dvyerFacebook(link)), "video/mp4", "「◈」 Facebook") }

    } else if (plat === "instagram") {
      try {
        const medias = await downloadInstagram(link)
        const media = medias[0]
        if (!media) throw new Error("Sin media")
        await send(wss, mctx, media, "「◈」 Instagram")
      }
      catch { await sendUrl(wss, mctx, dvyerMediaUrl(await dvyerInstagram(link)), "video/mp4", "「◈」 Instagram") }

    } else if (plat === "pinterest") {
      const medias = await downloadPinterest(link)
      const media = medias[0]
      if (!media) throw new Error("Sin media de Pinterest")
      await send(wss, mctx, media, "「◈」 Pinterest")

    } else if (plat === "spotify") {
      let mediaUrl = ""
      try { mediaUrl = dvyerMediaUrl(await dvyerSpotify(link)) } catch {
        mediaUrl = evogbMediaUrl(await evogbSpotifyDl(link))
      }
      await sendUrl(wss, mctx, mediaUrl, "audio/mpeg", "「◈」 Spotify")

    } else if (plat === "twitter") {
      const res = await fetch(`https://api.vxtwitter.com/Twitter/status/${link.match(/status\/(\d+)/)?.[1] ?? ""}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json() as any
      const mediaUrl = json?.media_extended?.[0]?.url ?? json?.mediaURLs?.[0] ?? ""
      if (!mediaUrl) throw new Error("Sin media")
      await sendUrl(wss, mctx, mediaUrl, "video/mp4", `「◈」 Twitter/X`)

    } else if (plat === "mediafire") {
      const mediaUrl = dvyerMediaUrl(await dvyerMediafire(link))
      await wss.sendMessage(mctx.chat.jid,
        { document: { url: mediaUrl }, mimetype: "application/octet-stream", fileName: "mediafire-file" },
        { quoted: mctx.message.original })
    }

    await mctx.react("✅")
  } catch (e) {
    console.error("[dw] Error:", e instanceof Error ? e.message : e)
    await mctx.react("❌")
  }
}

export default {
  name: "dw",
  alias: ["autodownload", "autodl"],
  description: "Activa/desactiva descarga automática de links.",
  category: "lucasxt",
  hidden: true,
  flags: ["all.chats"],
  requires: ["owner.user"],
  using: "<on | off>",

  execute: async (_wss, { mctx, args, bot }) => {
    const botJid = getEffectiveBotJid(bot)
    const arg = args[0]?.toLowerCase().trim()

    if (!arg || (arg !== "on" && arg !== "off")) {
      const current = await BotSettings.getBool(botJid, DW_KEY, false)
      await mctx.reply(`「◈」 *Auto-descarga*\n✦ Estado › *${current ? "Activado ✅" : "Desactivado ❌"}*\n✦ Uso › .dw on / .dw off`)
      return
    }

    const enable = arg === "on"
    await BotSettings.setBool(botJid, DW_KEY, enable)
    await mctx.react(enable ? "✅" : "❌")
    await mctx.reply(`「◈」 *Auto-descarga ${enable ? "activada ✅" : "desactivada ❌"}*`)
  },
} as types.Command
      
