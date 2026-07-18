import type * as types from "../../../types/types.js"
import * as database from "../../../database/database.js"
import {
  getRuntimeSocialLinks,
  parseOptionalUrl,
  updateUniversalConfig,
  type SocialLinks,
} from "../../../libs/zeta_cf.js"
import { getEffectiveBotJid } from "../../../libs/bot-scope.js"
import { canConfigureSocket, denyFreeConfigMessage, socketConfigOnlyMessage } from "../../../libs/socket-manager.js"

type SocialField = "channel_url" | "facebook_url" | "instagram_url" | "tiktok_url" | "telegram_url"
type UniversalSocialKey = "facebook" | "instagram" | "tiktok" | "telegram"
type UniversalTarget = "channelUrl" | UniversalSocialKey

type SocialDefinition = {
  key: string
  label: string
  aliases: string[]
  field: SocialField
  domains: string[]
  universal: UniversalTarget
}

const SOCIALS: SocialDefinition[] = [
  {
    key: "ws",
    label: "WhatsApp Canal",
    aliases: ["ws", "wsp", "whatsapp", "canal", "channel"],
    field: "channel_url",
    domains: ["whatsapp.com", "chat.whatsapp.com", "wa.me"],
    universal: "channelUrl",
  },
  {
    key: "fb",
    label: "Facebook",
    aliases: ["fb", "facebook", "face"],
    field: "facebook_url",
    domains: ["facebook.com", "fb.com"],
    universal: "facebook",
  },
  {
    key: "ig",
    label: "Instagram",
    aliases: ["ig", "instagram", "insta"],
    field: "instagram_url",
    domains: ["instagram.com"],
    universal: "instagram",
  },
  {
    key: "tt",
    label: "TikTok",
    aliases: ["tt", "tk", "tiktok"],
    field: "tiktok_url",
    domains: ["tiktok.com"],
    universal: "tiktok",
  },
  {
    key: "tg",
    label: "Telegram",
    aliases: ["tg", "telegram"],
    field: "telegram_url",
    domains: ["t.me", "telegram.me", "telegram.org"],
    universal: "telegram",
  },
]

const clearWords = new Set(["0", "off", "del", "delete", "remove", "borrar", "quitar", "limpiar", "none", "null"])

const cleanText = (value: unknown): string =>
  String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()

const normalizeKey = (value: string): string =>
  cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()

const findSocial = (value: string): SocialDefinition | undefined => {
  const key = normalizeKey(value)
  return SOCIALS.find((social) => social.key === key || social.aliases.includes(key))
}

const hostMatches = (urlValue: string, domains: string[]): boolean => {
  try {
    const host = new URL(urlValue).hostname.toLowerCase().replace(/^www\./, "")
    return domains.some((domain) => host === domain || host.endsWith(`.${domain}`))
  } catch {
    return false
  }
}

const validateLink = (social: SocialDefinition, rawValue: string): { ok: boolean; value: string; error?: string; cleared?: boolean } => {
  const raw = cleanText(rawValue)
  if (clearWords.has(normalizeKey(raw))) return { ok: true, value: "", cleared: true }
  if (!raw) return { ok: false, value: "", error: "falta el enlace" }
  if (raw.length > 500) return { ok: false, value: "", error: "el enlace es demasiado largo" }
  if (/javascript:|data:|file:/i.test(raw)) return { ok: false, value: "", error: "protocolo no permitido" }

  const parsed = parseOptionalUrl(raw)
  if (!parsed.ok || !parsed.value) return { ok: false, value: "", error: "enlace inválido" }

  if (!hostMatches(parsed.value, social.domains)) {
    return { ok: false, value: "", error: `ese enlace no pertenece a ${social.label}` }
  }

  return { ok: true, value: parsed.value }
}

const unique = (values: Array<string | undefined | null>): string[] =>
  Array.from(new Set(values.map((value) => cleanText(value).toLowerCase()).filter(Boolean)))

const getBotStorageKeys = (bot: types.BotDocument, mctx: types.MessageContext): string[] =>
  unique([
    getEffectiveBotJid(bot),
    bot.bot_jid,
    mctx.me.jids.pn,
    mctx.me.jids.lid,
    bot.parent_bot_jid,
  ])

const updateBotFieldEverywhere = async (keys: string[], field: SocialField, value: string) => {
  await Promise.all(keys.map((key) => database.Bots.update(key, { $set: { [field]: value } })))
}

const setUniversalSocialLink = (links: SocialLinks, key: UniversalSocialKey, value: string): SocialLinks => {

  if (key === "facebook") return { ...links, facebook: value }
  if (key === "instagram") return { ...links, instagram: value }
  if (key === "tiktok") return { ...links, tiktok: value }
  return { ...links, telegram: value }
}

const syncUniversalMain = (social: SocialDefinition, value: string, bot: types.BotDocument) => {
  if (String(bot.bot_type) !== "main") return

  try {
    if (social.universal === "channelUrl") {
      updateUniversalConfig({ channelUrl: value })
      return
    }

    updateUniversalConfig({
      socialLinks: setUniversalSocialLink(getRuntimeSocialLinks(), social.universal, value),
    })
  } catch {}
}

const usageText = (usedPrefix = ".") => `「◈」 REDES SETUP
◈ Uso › ${usedPrefix}rs fb link
◈ Borrar › ${usedPrefix}rs fb 0
◈ Redes disponibles › ws/canal, fb, ig, tt, tg`

const command: types.Command = {
  name: "rs",
  alias: ["setredes", "redsocial", "setsocial", "setsocials"],
  description: "Actualizar los links de redes pedidos en la configuración inicial",
  category: "bot",
  hidden: false,
  requires: ["bot.owner"],
  flags: ["all.chats"],
  using: "[red] [link|0]",
  execute: async (_wss, { mctx, args, bot, userIsBotOwner, usedPrefix }) => {
    if (String(bot.bot_type) === "free") {
      await mctx.reply(denyFreeConfigMessage())
      return
    }

    if (!userIsBotOwner && !canConfigureSocket(mctx.sender.jid, bot)) {
      await mctx.reply(socketConfigOnlyMessage())
      return
    }

    const social = findSocial(args[0] || "")
    const rawLink = args.slice(1).join(" ")

    if (!social || !rawLink) {
      await mctx.reply(usageText(usedPrefix || "."))
      return
    }

    const checked = validateLink(social, rawLink)
    if (!checked.ok) {
      await mctx.reply(`「◈」 RED SOCIAL
◈ Red › ${social.label}
◈ Estado › rechazado
◈ Motivo › ${checked.error || "link inválido"}`)
      return
    }

    const keys = getBotStorageKeys(bot, mctx)
    await updateBotFieldEverywhere(keys, social.field, checked.value)
    syncUniversalMain(social, checked.value, bot)

    await mctx.reply(`「◈」 RED SOCIAL
◈ Bot › ${cleanText(bot.name) || "Socket"}
◈ Red › ${social.label}
◈ Estado › ${checked.cleared ? "eliminado" : "guardado seguro"}
◈ Link › ${checked.value || "sin enlace"}`)
  },
}

export default command
