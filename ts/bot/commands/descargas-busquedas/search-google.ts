import type * as types from "../../../types/types.js"
import { googleSearch } from "../../../libs/downloads.js"
import { dvyerGet, dvyerUserError, evogbUserError } from "../../../libs/downloads.js"
import axios from "axios"

const usage = (): string => "「⚠」 Escribe qué buscar."
const clean = (v: unknown): string => String(v ?? "").replace(/\s+/g, " ").trim()
const pickRandom = <T>(list: T[]): T | undefined => list.length ? list[Math.floor(Math.random() * list.length)] : undefined

interface SearchResult { title: string; description: string; url: string }

const normalize = (data: unknown): SearchResult[] => {
  const list = Array.isArray(data) ? data
    : Array.isArray((data as any)?.results) ? (data as any).results
    : Array.isArray((data as any)?.data) ? (data as any).data
    : Array.isArray((data as any)?.items) ? (data as any).items
    : []
  return list.map((item: any) => ({
    title: clean(item.title || item.name || ""),
    description: clean(item.description || item.snippet || item.desc || item.body || ""),
    url: clean(item.url || item.link || item.href || ""),
  })).filter((r) => r.url)
}

const searchDvyer = async (query: string): Promise<SearchResult[]> => {
  try {
    const data = await dvyerGet<unknown>("/search/google", { query })
    const results = normalize(data)
    if (results.length) return results
  } catch {}
  return []
}

const searchFallback = async (query: string): Promise<SearchResult[]> => {
  try {
    const { data } = await axios.get(`https://api.alyachan.dev/api/google?q=${encodeURIComponent(query)}&apikey=Gata-Dios`, { timeout: 20_000 })
    const results = normalize(data)
    if (results.length) return results
  } catch {}
  try {
    const { data } = await axios.get(`https://api.dorratz.com/v3/googlesearch?q=${encodeURIComponent(query)}`, { timeout: 20_000 })
    const results = normalize(data)
    if (results.length) return results
  } catch {}
  return []
}

export default {
  name: "google",
  alias: ["buscar", "gsearch"],
  description: "Busca resultados web en Google.",
  category: "downloaders",
  using: "<texto>",
  flags: ["all.chats"],
  requires: [],
  hidden: false,
  execute: async (_wss, { mctx, args }) => {
    const query = args.join(" ").trim()
    if (!query) { await mctx.react("⚠️"); await mctx.reply(usage()); return }

    try {
      await mctx.react("🔎")

      let results = await searchDvyer(query)
      if (!results.length) results = await googleSearch(query).catch(() => [])
      if (!results.length) results = await searchFallback(query)

      if (!results.length) {
        await mctx.react("❌")
        await mctx.reply("「✖」 No encontré resultados.")
        return
      }

      const item = pickRandom(results.slice(0, 10))!
      const text = ["「◈」 *Búsqueda realizada*", [item.title, item.description, item.url].filter(Boolean).join("\n")].filter(Boolean).join("\n\n")
      await mctx.reply(text.slice(0, 3000))
      await mctx.react("✅")
    } catch (error) {
      console.error("[google] Error:", error instanceof Error ? error.message : error)
      await mctx.react("❌")
      await mctx.reply("「✖」 No se pudo realizar la búsqueda.")
    }
  },
} as types.Command
