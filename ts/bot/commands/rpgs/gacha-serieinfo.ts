import type * as types from "../../../types/types.js"
import {
  formatNumber,
  getDisplayName,
  getRuntimeGacha,
  sendText,
  usageBlock,
  type Character,
} from "../../../libs/gacha.js"

type PageResult<T> = {
  page: number
  pages: number
  total: number
  start: number
  items: T[]
}

const normalizeSearch = (value: string): string => {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

const parsePageArgs = (args: string[]): { page: number; query: string } => {
  const clean = [...args]
  let page = 1

  const pageIndex = clean.findIndex((arg) => {
    return /^(?:p|pg|pag|pagina|page)[:=]?\d+$/i.test(arg) || /^--?(?:p|pg|pag|pagina|page)=?\d+$/i.test(arg)
  })

  if (pageIndex >= 0) {
    const match = clean[pageIndex].match(/\d+/)
    page = Math.max(1, Number(match?.[0]) || 1)
    clean.splice(pageIndex, 1)
  } else {
    const last = clean[clean.length - 1]
    if (clean.length > 1 && /^\d+$/.test(last || "")) {
      page = Math.max(1, Number(last) || 1)
      clean.pop()
    }
  }

  return {
    page,
    query: clean.join(" ").trim(),
  }
}

const paginate = <T>(items: T[], inputPage = 1, pageSize = 14): PageResult<T> => {
  const total = items.length
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(Math.max(1, inputPage || 1), pages)
  const start = (page - 1) * pageSize

  return {
    page,
    pages,
    total,
    start,
    items: items.slice(start, start + pageSize),
  }
}

const percent = (value: number, total: number): string => {
  if (!total) return "0%"
  return `${Math.round((value / total) * 100)}%`
}

const findSourceTitle = (characters: Character[], query: string): string => {
  const normalizedQuery = normalizeSearch(query)
  const exact = characters.find((char) => normalizeSearch(char.source) === normalizedQuery)

  return exact?.source || characters[0]?.source || query
}

const isSameSerie = (source: string, query: string): boolean => {
  const a = normalizeSearch(source)
  const b = normalizeSearch(query)

  if (!a || !b) return false

  return a === b || a.includes(b) || b.includes(a)
}

const formatOwnerStatus = async (
  wss: types.WASocket,
  mctx: types.MessageContext,
  owner?: string | null,
): Promise<string> => {
  if (!owner) return "Libre."

  const nick = await getDisplayName(wss, mctx, owner)
  return `Reclamado por ${nick}`
}

export default {
  name: "serieinfo",
  alias: ["ainfo", "animeinfo"],
  description: "Lista personajes registrados de una serie/anime.",
  category: "games",
  using: "<nombre> <página>",
  flags: ["only.groups"],
  requires: [],
  hidden: false,
  execute: async (wss, { mctx, args, bot, group, usedPrefix }) => {
    const { page: requestedPage, query } = parsePageArgs(args)

    if (!query) {
      await mctx.react("⚠️")
      await mctx.reply(usageBlock("Info de anime", [
        `*${usedPrefix}ainfo* _D.Gray-man_`,
        `*${usedPrefix}ainfo* _Jujutsu Kaisen_ 2`,
        `*${usedPrefix}animeinfo* _One Piece_ page=3`,
      ]))
      return
    }

    try {
      await mctx.react("🔎")

      const db = getRuntimeGacha(bot, group)
      const characters = db
        .loadCharacters()
        .filter((char) => isSameSerie(char.source, query))
        .sort((a, b) => Number(b.value || 0) - Number(a.value || 0))

      if (!characters.length) {
        await mctx.react("⚠️")
        await sendText(
          wss,
          mctx,
          `✿ *Nombre:* ‹*${query}*›\n\n` +
          `▢ Personajes » *0*\n` +
          `♡ Reclamados » *0/0 (0%)*\n` +
          `▢ Lista de personajes:\n\n` +
          `» No hay personajes registrados para esta serie.\n\n` +
          `▏▱ Página *1* de *1*`,
        )
        return
      }

      const title = findSourceTitle(characters, query)
      const claimed = characters.filter((char) => Boolean(db.getCharacterOwner(char.id))).length
      const page = paginate(characters, requestedPage, 14)

      const lines = await Promise.all(page.items.map(async (char) => {
        const owner = db.getCharacterOwner(char.id)
        const status = await formatOwnerStatus(wss, mctx, owner)

        return `» *${char.name}* (${formatNumber(char.value)}) • ${status}`
      }))

      let text =
        `✿ *Nombre:* ‹*${title}*›\n\n` +
        `▢ Personajes » *${characters.length}*\n` +
        `♡ Reclamados » *${claimed}/${characters.length} (${percent(claimed, characters.length)})*\n` +
        `▢ Lista de personajes:\n\n` +
        `${lines.join("\n")}\n\n` +
        `▏▱ Página *${page.page}* de *${page.pages}*`

      if (page.pages > 1) {
        text += `\n> Usa *${usedPrefix}ainfo ${title} ${Math.min(page.page + 1, page.pages)}* para ver otra página.`
      }

      await sendText(wss, mctx, text)
      await mctx.react("✅")
    } catch (error) {
      console.error("[Gacha ainfo]", error)
      await mctx.react("❌")
      await mctx.reply(`「❀」 No pude mostrar la lista de personajes.`)
    }
  },
} as types.Command
