import type * as types from "../../../types/types.js"
import { formatViews } from "../../../libs/downloads.js"
import { dvyerYtSearch, dvyerTitle, dvyerAuthor, dvyerDuration, dvyerLink, dvyerThumb, dvyerUserError, evogbSearchYt, evogbTitle, evogbAuthor, evogbDuration, evogbLink, evogbThumb, evogbUserError } from "../../../libs/downloads.js"

const short = (v: string, max = 1800) => v.length > max ? `${v.slice(0, max - 3)}...` : v
const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim()
const views = (v: unknown) => { const n = Number(clean(v).replace(/[^\d]/g, "")) || 0; return n ? formatViews(n) : clean(v) || "N/A" }

const buildText = (items: any[], getTitle: Function, getAuthor: Function, getDuration: Function, getLink: Function) =>
  items.slice(0, 5).map((item, i) => [
    `${i + 1}. ${getTitle(item)}`,
    `Canal: ${getAuthor(item)}`,
    getDuration(item) ? `Duración: ${getDuration(item)}` : "",
    `Vistas: ${views((item as any).views || (item as any).viewCount)}`,
    getLink(item) ? `Link: ${getLink(item)}` : "",
  ].filter(Boolean).join("\n")).join("\n\n")

export default {
  name: "ytsearch", alias: ["yts","youtube"],
  description: "Busca videos en YouTube.",
  category: "downloaders", using: "<texto>", flags: ["all.chats"], requires: [], hidden: false,
  execute: async (wss, { mctx, args }) => {
    const query = args.join(" ").trim()
    if (!query) { await mctx.react("⚠️"); await mctx.reply("「⚠」 Escribe qué buscar."); return }
    try {
      await mctx.react("🔎")


      let items: any[] | null = null
      try {
        items = await dvyerYtSearch(query)
        if (!items.length) items = null
      } catch {}

      if (items) {
        const text = buildText(items, dvyerTitle, dvyerAuthor, dvyerDuration, dvyerLink)
        const thumb = dvyerThumb(items[0])
        if (thumb && /^https?:\/\//i.test(thumb)) {
          await wss.sendMessage(mctx.chat.jid, { image: { url: thumb }, caption: short(text) }, { quoted: mctx.message.original })
        } else { await mctx.reply(short(text)) }
        await mctx.react("✅"); return
      }


      const evItems = await evogbSearchYt(query)
      if (!evItems.length) { await mctx.react("❌"); await mctx.reply("「✖」 No encontré resultados."); return }
      const text = buildText(evItems, evogbTitle, evogbAuthor, evogbDuration, evogbLink)
      const thumb = evogbThumb(evItems[0])
      if (thumb && /^https?:\/\//i.test(thumb)) {
        await wss.sendMessage(mctx.chat.jid, { image: { url: thumb }, caption: short(text) }, { quoted: mctx.message.original })
      } else { await mctx.reply(short(text)) }
      await mctx.react("✅")
    } catch (e) {
      console.error("[ytsearch] Error:", e instanceof Error ? e.message : e)
      await mctx.react("❌"); await mctx.reply(`「✖」 ${dvyerUserError(e, "No se pudo realizar la búsqueda.")}`)
    }
  },
} as types.Command
