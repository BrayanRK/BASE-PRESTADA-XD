import type * as types from "../../../types/types.js"
import { downloadYouTube, resolveYoutubeInfo, sendYoutubeInfoCard, dvyerYtMp4, dvyerMediaUrl, dvyerUserError, evogbYtMp4, evogbYoutubePlay, evogbMediaUrl, evogbUserError, verifyMediaUrl } from "../../../libs/downloads.js"

type RaceResult = { provider: "DV-YER" | "EVOGB"; mediaUrl: string; fileName: string }

const HEDGE_DELAY_MS = 4000
class HedgeTimeout extends Error {}

export default {
  name: "play2", alias: ["playvideo","playmp4"],
  description: "Busca y descarga video MP4 de YouTube.",
  category: "downloaders", using: "<nombre | link>", flags: ["all.chats"], requires: [], hidden: false,
  execute: async (wss, { mctx, args }) => {
    const query = args.join(" ").trim()
    if (!query) { await mctx.react("⚠️"); await mctx.reply("「⚠」 Escribe un nombre o link."); return }

    let video: Awaited<ReturnType<typeof resolveYoutubeInfo>> | null = null
    try { await mctx.react("🔎"); video = await resolveYoutubeInfo(query); await sendYoutubeInfoCard(wss, mctx, video, "video") } catch {}
    if (!video) { try { video = await resolveYoutubeInfo(query) } catch { await mctx.react("❌"); await mctx.reply("「✖」 No se pudo encontrar ese video."); return } }

    await mctx.react("🎬")

    let dvyerErr: unknown, evogbErr: unknown

    const dvyerTask = (async (): Promise<RaceResult> => {
      try {
        const data = await dvyerYtMp4(video!.url, "720")
        const mediaUrl = dvyerMediaUrl(data)
        await verifyMediaUrl(mediaUrl)
        return { provider: "DV-YER", mediaUrl, fileName: String((data as any).fileName || (data as any).filename || "video.mp4") }
      } catch (e) { dvyerErr = e; throw e }
    })()

    const runEvogb = (): Promise<RaceResult> =>
      (async () => {
        try {
          const data = await evogbYtMp4(video!.url, "720").catch(() => evogbYoutubePlay(query, "video"))
          const mediaUrl = evogbMediaUrl(data)
          await verifyMediaUrl(mediaUrl)
          return { provider: "EVOGB" as const, mediaUrl, fileName: String((data as any).fileName || (data as any).filename || "video.mp4") }
        } catch (e) { evogbErr = e; throw e }
      })()

    let won: RaceResult | null = null
    try {
      won = await Promise.race([dvyerTask, new Promise<RaceResult>((_, reject) => setTimeout(() => reject(new HedgeTimeout()), HEDGE_DELAY_MS))])
    } catch (e) {
      try {
        won = e instanceof HedgeTimeout ? await Promise.any([dvyerTask, runEvogb()]) : await runEvogb()
      } catch { /* ambas fallaron, sigue al fallback local */ }
    }

    if (won) {
      await wss.sendMessage(mctx.chat.jid, { video: { url: won.mediaUrl }, mimetype: "video/mp4", fileName: won.fileName, caption: `by: ${won.provider}` }, { quoted: mctx.message.original })
      await mctx.react("✅"); return
    }

    console.error("[play2] DV-YER/EVOGB fallaron:", dvyerErr instanceof Error ? dvyerErr.message : dvyerErr, "|", evogbErr instanceof Error ? evogbErr.message : evogbErr)
    try {
      const r = await downloadYouTube(video, "video")
      await wss.sendMessage(mctx.chat.jid, { video: r.buffer, mimetype: r.mime || "video/mp4", fileName: `${r.filename}${(r as any).ext || ".mp4"}`, caption: "by: Local" }, { quoted: mctx.message.original })
      await mctx.react("✅")
    } catch (e) {
      console.error("[play2] local falló:", e instanceof Error ? e.message : e)
      await mctx.react("❌")
      await mctx.reply(`「✖」 ${dvyerUserError(dvyerErr, evogbUserError(evogbErr, "No se pudo realizar la descarga."))}`)
    }
  },
} as types.Command
