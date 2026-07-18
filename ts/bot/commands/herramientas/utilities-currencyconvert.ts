import type * as types from "../../../types/types.js"
import { CurrencyError, getRate } from "../../../libs/currency.js"

type CountryInfo = { code: string; flag: string; label: string }

const COUNTRIES: Record<string, CountryInfo> = {}

const normalizeKey = (raw: string): string =>
  raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, "")
    .trim()
    .replace(/\s+/g, " ")

const reg = (code: string, flag: string, label: string, aliases: string[]): void => {
  for (const alias of aliases) {
    const key = normalizeKey(alias)
    if (!key) continue
    if (!COUNTRIES[key]) COUNTRIES[key] = { code, flag, label }
    const noSpace = key.replace(/\s+/g, "")
    if (noSpace !== key && !COUNTRIES[noSpace]) COUNTRIES[noSpace] = { code, flag, label }
  }
}

// ── Lista de países / monedas soportadas (cada uno con varios pronombres) ──
reg("ARS", "🇦🇷", "Argentina", ["ar", "arg", "argentina", "pesoargentino", "ars"])
reg("MXN", "🇲🇽", "México", ["mx", "mex", "mexico", "méxico", "pesomexicano", "mxn"])
reg("COP", "🇨🇴", "Colombia", ["co", "col", "colombia", "pesocolombiano", "cop"])
reg("PEN", "🇵🇪", "Perú", ["pe", "per", "peru", "perú", "sol", "soles", "pen"])
reg("CLP", "🇨🇱", "Chile", ["cl", "chi", "chile", "pesochileno", "clp"])
reg("VES", "🇻🇪", "Venezuela", ["ve", "ven", "venezuela", "bolivar", "bolívar", "ves"])
reg("BOB", "🇧🇴", "Bolivia", ["bo", "bol", "bolivia", "boliviano", "bob"])
reg("PYG", "🇵🇾", "Paraguay", ["py", "par", "paraguay", "guarani", "guaraní", "pyg"])
reg("UYU", "🇺🇾", "Uruguay", ["uy", "uru", "uruguay", "pesouruguayo", "uyu"])
reg("BRL", "🇧🇷", "Brasil", ["br", "bra", "brasil", "brazil", "real", "brl"])
reg("USD", "🇪🇨", "Ecuador", ["ec", "ecu", "ecuador"])
reg("GTQ", "🇬🇹", "Guatemala", ["gt", "gua", "guatemala", "quetzal", "gtq"])
reg("HNL", "🇭🇳", "Honduras", ["hn", "hon", "honduras", "lempira", "hnl"])
reg("NIO", "🇳🇮", "Nicaragua", ["ni", "nic", "nicaragua", "cordoba", "córdoba", "nio"])
reg("CRC", "🇨🇷", "Costa Rica", ["cr", "cri", "costarica", "costa rica", "colon", "colón", "crc"])
reg("PAB", "🇵🇦", "Panamá", ["pa", "pan", "panama", "panamá", "balboa", "pab"])
reg("DOP", "🇩🇴", "República Dominicana", ["do", "rd", "dom", "republicadominicana", "republica dominicana", "dominicana", "pesodominicano", "dop"])
reg("CUP", "🇨🇺", "Cuba", ["cu", "cub", "cuba", "pesocubano", "cup"])
reg("USD", "🇸🇻", "El Salvador", ["sv", "sal", "elsalvador", "el salvador", "salvador"])
reg("USD", "🇺🇸", "Estados Unidos", ["us", "usa", "eeuu", "eeu", "estadosunidos", "estados unidos", "dolar", "dólar", "usd"])
reg("EUR", "🇪🇸", "España", ["es", "esp", "espana", "españa", "spain"])
reg("EUR", "🇪🇺", "Europa", ["eu", "ue", "euro", "europa", "eur"])
reg("GBP", "🇬🇧", "Reino Unido", ["gb", "uk", "reinounido", "reino unido", "inglaterra", "libra", "gbp"])
reg("JPY", "🇯🇵", "Japón", ["jp", "jap", "japon", "japón", "yen", "jpy"])
reg("CNY", "🇨🇳", "China", ["cn", "chn", "china", "yuan", "cny"])
reg("CAD", "🇨🇦", "Canadá", ["ca", "can", "canada", "canadá", "cad"])
reg("AUD", "🇦🇺", "Australia", ["au", "aus", "australia", "aud"])
reg("CHF", "🇨🇭", "Suiza", ["ch", "sui", "suiza", "franco", "chf"])
reg("INR", "🇮🇳", "India", ["in", "ind", "india", "rupia", "inr"])
reg("KRW", "🇰🇷", "Corea del Sur", ["kr", "cor", "corea", "coreadelsur", "corea del sur", "won", "krw"])
reg("RUB", "🇷🇺", "Rusia", ["ru", "rus", "rusia", "rublo", "rub"])
reg("TRY", "🇹🇷", "Turquía", ["tr", "tur", "turquia", "turquía", "lira", "try"])
reg("ZAR", "🇿🇦", "Sudáfrica", ["za", "suf", "sudafrica", "sudáfrica", "rand", "zar"])

const findCountry = (raw: string): CountryInfo | null => {
  const key = normalizeKey(raw)
  if (!key) return null
  return COUNTRIES[key] || COUNTRIES[key.replace(/\s+/g, "")] || null
}

const normalizeAmount = (raw: string): number | null => {
  let s = raw.trim().replace(/[^\d.,]/g, "")
  if (!s) return null

  const lastComma = s.lastIndexOf(",")
  const lastDot = s.lastIndexOf(".")

  if (lastComma !== -1 && lastDot !== -1) {
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "")
  } else if (lastComma !== -1) {
    s = s.replace(",", ".")
  }

  const n = Number(s)
  return Number.isFinite(n) && n > 0 ? n : null
}

type ParsedQuery = { amount: number; fromRaw: string; toRaw: string }

const parseQuery = (raw: string): ParsedQuery | null => {
  const text = raw.trim()
  if (!text.includes("-")) return null

  const dashIndex = text.indexOf("-")
  const leftRaw = text.slice(0, dashIndex).trim()
  const rightRaw = text.slice(dashIndex + 1).trim()
  if (!leftRaw || !rightRaw) return null

  const leftTokens = leftRaw.split(/\s+/).filter(Boolean)
  let amount = 1
  let countryTokens: string[] = []

  if (leftTokens.length === 1) {
    const token = leftTokens[0]
    const lettersFirst = token.match(/^([a-zA-Záéíóúñ]+)([\d.,]+)$/)
    const numbersFirst = token.match(/^([\d.,]+)([a-zA-Záéíóúñ]+)$/)

    if (lettersFirst) {
      countryTokens = [lettersFirst[1]]
      amount = normalizeAmount(lettersFirst[2]) ?? 1
    } else if (numbersFirst) {
      amount = normalizeAmount(numbersFirst[1]) ?? 1
      countryTokens = [numbersFirst[2]]
    } else {
      countryTokens = [token]
    }
  } else {
    const amountToken = leftTokens.find((t) => /^[\d.,]+$/.test(t))
    if (amountToken) {
      amount = normalizeAmount(amountToken) ?? 1
      countryTokens = leftTokens.filter((t) => t !== amountToken)
    } else {
      countryTokens = leftTokens
    }
  }

  const fromRaw = countryTokens.join(" ")
  if (!fromRaw) return null

  return { amount, fromRaw, toRaw: rightRaw }
}

const formatNumber = (n: number): string =>
  new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const usage = (): string =>
  [
    "「💱」 Conversor de moneda en tiempo real",
    "",
    "✦ Uso › .cv <país origen> <monto> - <país destino>",
    "✦ Ejemplo › .cv arg 5 - mx",
    "✦ Ejemplo › .cv 10 usd - pe",
    "",
    "✦ Usa *.listcb* para ver la lista de países disponibles.",
  ].join("\n")

export default {
  name: "cv",
  alias: [
    "cb", "cvb", "convertir", "conversor", "convertidor",
    "cambio", "exchange", "currency", "divisa", "divisas",
    "monedas", "convertmoneda", "cambiomoneda", "tasacambio", "convertcurrency",
  ],
  description: "Convierte un monto de una moneda a otra en tiempo real.",
  category: "utilities",
  using: "<país origen> <monto> - <país destino>",
  flags: ["all.chats"],
  requires: [],
  hidden: false,

  execute: async (_wss, { mctx, args }) => {
    const raw = args.join(" ").trim()

    if (!raw) {
      await mctx.reply(usage())
      return
    }

    const parsed = parseQuery(raw)
    if (!parsed) {
      await mctx.reply(`「⚠」 Falta el separador "-".\n\n${usage()}`)
      return
    }

    const fromCountry = findCountry(parsed.fromRaw)
    const toCountry = findCountry(parsed.toRaw)

    if (!fromCountry || !toCountry) {
      const cualNoExiste = !fromCountry && !toCountry
        ? `${parsed.fromRaw} y ${parsed.toRaw}`
        : !fromCountry ? parsed.fromRaw : parsed.toRaw

      await mctx.reply(
        `「✖」 País no reconocido › ${cualNoExiste}\n✦ Usa *.listcb* para ver la lista de países disponibles.`,
      )
      return
    }

    try {
      await mctx.react("💱")

      const rate = await getRate(fromCountry.code, toCountry.code)
      const result = parsed.amount * rate

      const text = [
        "「💱」 Conversión de moneda",
        "",
        `✦ De › ${fromCountry.flag} ${fromCountry.label} (${fromCountry.code}) ${formatNumber(parsed.amount)}`,
        `✦ A › ${toCountry.flag} ${toCountry.label} (${toCountry.code}) ${formatNumber(result)}`,
        `✦ Tasa › 1 ${fromCountry.code} = ${formatNumber(rate)} ${toCountry.code}`,
      ].join("\n")

      await mctx.reply(text)
      await mctx.react("✅")
    } catch (error) {
      console.error("[cv] Error:", error instanceof Error ? error.message : error)
      await mctx.react("❌")
      const msg = error instanceof CurrencyError ? error.userMessage : "No se pudo realizar la conversión, intenta de nuevo."
      await mctx.reply(`「✖」 ${msg}`)
    }
  },
} as types.Command
