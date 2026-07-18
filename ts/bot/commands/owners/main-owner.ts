import type * as types from "../../../types/types.js"
import { getRuntimeOwnerJid, getRuntimeOwnerName, getRuntimeOwnerNumber } from "../../../libs/zeta_cf.js"

const cleanText = (value: unknown, fallback = ""): string => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim()
  return text || fallback
}

const jidNumber = (jid?: string | null): string =>
  String(jid || "")
    .split(":")[0]
    .split("@")[0]
    .replace(/[^0-9]/g, "")

const isPhoneJid = (jid?: string | null): boolean => /@s\.whatsapp\.net$/i.test(String(jid || ""))
const isValidPhoneNumber = (digits: string): boolean => /^\d{8,15}$/.test(digits)

const pickOwnerPhone = (...values: Array<string | undefined | null>): string => {
  for (const value of values) {
    const raw = cleanText(value)
    const digits = jidNumber(raw)
    if (!digits || !isValidPhoneNumber(digits)) continue


    if (/@lid$/i.test(raw) && !isPhoneJid(raw)) continue
    return digits
  }

  return ""
}

const formatPhone = (digits: string): string => digits ? `+${digits}` : ""

const buildVcard = (name: string, number: string): string => {
  const safeName = cleanText(name, "Owner").replace(/[\r\n;]/g, " ")
  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:;${safeName};;;`,
    `FN:${safeName}`,
    `TEL;type=CELL;type=VOICE;waid=${number}:${formatPhone(number)}`,
    "END:VCARD",
  ].join("\n")
}

export default {
  name: "owner",
  alias: ["dueño", "creador", "contactowner"],
  description: "Manda el contacto directo del owner del bot",
  category: "main",
  hidden: false,
  flags: ["all.chats"],
  requires: [],
  execute: async (wss, { mctx, bot }) => {
    const isMain = String(bot.bot_type) === "main"
    const runtimeOwnerJid = getRuntimeOwnerJid()
    const runtimeOwnerName = getRuntimeOwnerName()
    const runtimeOwnerNumber = getRuntimeOwnerNumber()

    const ownerNumber = pickOwnerPhone(
      bot.owner_number,
      isMain ? runtimeOwnerNumber : "",
      isMain ? runtimeOwnerJid : "",
      bot.owner_jid,
      runtimeOwnerJid,
    )
    const ownerName = cleanText(
      isMain ? runtimeOwnerName || bot.owner_name : bot.owner_name || runtimeOwnerName,
      "Owner",
    )

    if (!ownerNumber) {
      await mctx.reply(
        `「♛」 Owner\n│ Estado › sin número válido\n╰ Configura el owner usando número real, ejemplo: *${mctx.message.text?.[0] || "."}setbotowner 573161325891*`,
      )
      return
    }

    await wss.sendMessage(
      mctx.chat.jid,
      {
        contacts: {
          displayName: ownerName,
          contacts: [{ vcard: buildVcard(ownerName, ownerNumber) }],
        },
      },
      { quoted: mctx.message.original },
    )
  },
} as types.Command
