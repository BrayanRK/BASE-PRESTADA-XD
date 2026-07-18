import type * as types from "../../../types/types.js"
import { evogbLink, evogbMediaUrl, evogbThumb, evogbUpload, evogbUserError, evogbWhatMusicShazam, findFirstUrl, toDataUrl } from "../../../libs/downloads.js"

const usage = (): string => "「⚠」 Responde a un audio/video o envía una URL."

const getMusicInputUrl = async (mctx: types.MessageContext, argsText: string): Promise<string> => {
  const directUrl = findFirstUrl(argsText) || findFirstUrl(mctx.quoted?.message?.text || "") || findFirstUrl(mctx.message.text || "")
  if (directUrl) return directUrl

  const source = mctx.quoted?.download ? mctx.quoted : mctx.download ? mctx : null
  if (!source?.download) throw new Error("Sin archivo")

  const buffer = await source.download().buffer()
  if (!buffer?.length) throw new Error("No se pudo descargar el archivo")

  const mimetype = source.message.mimetype || "audio/mpeg"
  const uploaded = await evogbUpload(toDataUrl(buffer, mimetype), "auto", "file")
  return evogbMediaUrl(uploaded)
}

const findValue = (value: unknown, keys: string[]): string => {
  if (!value) return ""

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findValue(item, keys)
      if (found) return found
    }
    return ""
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>
    for (const key of keys) {
      const raw = obj[key]
      if (typeof raw === "string" || typeof raw === "number") {
        const text = String(raw).replace(/\s+/g, " ").trim()
        if (text) return text
      }
    }

    for (const item of Object.values(obj)) {
      const found = findValue(item, keys)
      if (found) return found
    }
  }

  return ""
}

const caption = (data: Record<string, unknown>): string => {
  const title = findValue(data, ["title", "name", "track", "song"]) || "Desconocido"
  const artist = findValue(data, ["artist", "subtitle", "author", "singer", "creator"]) || "Desconocido"
  const album = findValue(data, ["album", "albumName"])
  const genre = findValue(data, ["genre", "genres"])
  const release = findValue(data, ["release", "released", "releaseDate", "release_date", "year"])
  const link = evogbLink(data) || findValue(data, ["url", "link", "youtube", "spotify"])

  return [
    "「🎵」 Música detectada",
    "",
    `✦ Título › ${title}`,
    `✦ Artista › ${artist}`,
    album ? `✦ Álbum › ${album}` : "",
    genre ? `✦ Género › ${genre}` : "",
    release ? `✦ Lanzamiento › ${release}` : "",
    link ? `✦ Link › ${link}` : "",
  ].filter(Boolean).join("\n")
}

export default {
  name: "whatmusic",
  alias: ["shazam", "quemusica", "whatmusic-shazam"],
  description: "Reconoce música con Shazam.",
  category: "utilities",
  using: "<url | responder audio/video>",
  flags: ["all.chats"],
  requires: [],
  hidden: false,
  execute: async (wss, { mctx, args }) => {
    try {
      const inputUrl = await getMusicInputUrl(mctx, args.join(" ").trim()).catch(() => "")
      if (!inputUrl) {
        await mctx.react("⚠️")
        await mctx.reply(usage())
        return
      }

      await mctx.react("🎵")
      const data = await evogbWhatMusicShazam(inputUrl)
      const text = caption(data)
      const cover = evogbThumb(data) || findValue(data, ["coverart", "cover", "image", "thumbnail", "thumb", "artwork"])

      if (cover && /^https?:\/\//i.test(cover)) {
        await wss.sendMessage(mctx.chat.jid, { image: { url: cover }, caption: text }, { quoted: mctx.message.original })
      } else {
        await mctx.reply(text)
      }

      await mctx.react("✅")
    } catch (error) {
      console.error("[whatmusic] Error:", error instanceof Error ? error.message : error)
      await mctx.react("❌")
      await mctx.reply(`「✖」 ${evogbUserError(error, "No se pudo reconocer la música.")}`)
    }
  },
} as types.Command
