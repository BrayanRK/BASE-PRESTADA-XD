import type * as types from "../../../types/types.js"
import { downloadYouTube, resolveYoutubeInfo, sendYoutubeInfoCard, dvyerYtMp3, dvyerAudioFile, dvyerUserError, evogbYtMp3, evogbYoutubePlay, evogbMediaUrl, evogbUserError } from "../../../libs/downloads.js"

export default {
  name: "play", alias: ["playaudio","playmp3"],
  description: "Busca y descarga audio MP3 de YouTube.",
  category: "downloaders", using: "<nombre | link>", flags: ["all.chats"], requires: [], hidden: false,
  execute: async (wss, { mctx, args }) => {
    const query = args.join(" ").trim()
    if (!query) { await mctx.react("⚠️"); await mctx.reply("「⚠」 Escribe un nombre o link."); return }

    let video: Awaited<ReturnType<typeof resolveYoutubeInfo>> | null = null
    let err1: unknown, err2: unknown

    try { await mctx.react("🔎"); video = await resolveYoutubeInfo(query); await sendYoutubeInfoCard(wss, mctx, video, "audio") } catch {}

    try {
      await mctx.react("🎧")
      if (!video) video = await resolveYoutubeInfo(query)
      const data = await dvyerYtMp3(video.url)
      const audio = dvyerAudioFile(data, "audio")
      await wss.sendMessage(mctx.chat.jid, { audio: { url: audio.mediaUrl }, mimetype: audio.mimetype, fileName: audio.fileName }, { quoted: mctx.message.original })
      await mctx.react("✅"); return
    } catch (e) { err1 = e; console.error("[play] DV-YER falló:", e instanceof Error ? e.message : e) }

    try {
      if (!video) video = await resolveYoutubeInfo(query)
      const data = await evogbYtMp3(video.url).catch(() => evogbYoutubePlay(query, "audio"))
      await wss.sendMessage(mctx.chat.jid, { audio: { url: evogbMediaUrl(data) }, mimetype: "audio/mpeg", fileName: String((data as any).fileName || (data as any).filename || "audio.mp3") }, { quoted: mctx.message.original })
      await mctx.react("✅"); return
    } catch (e) { err2 = e; console.error("[play] EVOGB falló:", e instanceof Error ? e.message : e) }

    try {
      if (!video) video = await resolveYoutubeInfo(query)
      const r = await downloadYouTube(video, "audio")
      await wss.sendMessage(mctx.chat.jid, { audio: r.buffer, mimetype: r.mime || "audio/mpeg", fileName: `${r.filename}${(r as any).ext || ".mp3"}` }, { quoted: mctx.message.original })
      await mctx.react("✅")
    } catch (e) {
      await mctx.react("❌"); await mctx.reply(`「✖」 ${dvyerUserError(err1, evogbUserError(err2, "No se pudo realizar la descarga."))}`)
    }
  },
} as types.Command
