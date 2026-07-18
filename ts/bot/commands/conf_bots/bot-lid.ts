import type * as types from "../../../types/types.js"
import { formatLidResolution, jidDigits, resolveUserLid } from "../../../libs/lid-resolver.js"

const clean = (value: unknown): string => String(value ?? "").replace(/\s+/g, " ").trim()

const getTarget = (mctx: types.MessageContext, args: string[]): string => {
  const mentioned = mctx.message.mentioned?.[0] || mctx.message.mentionedJid?.[0] || ""
  if (mentioned) return mentioned

  const quoted = mctx.quoted?.sender?.jid || ""
  if (quoted) return quoted

  const rawText = clean(args.join(" "))
  if (/^(me|yo)$/i.test(rawText)) return mctx.sender.jid
  if (rawText) return rawText

  return mctx.sender.jid
}

const command: types.Command = {
  name: "lid",
  alias: ["getlid", "idlid", "userlid", "verlid"],
  description: "Muestra el ID/LID real de un usuario",
  category: "utilities",
  hidden: false,
  flags: ["all.chats"],
  requires: [],
  using: "[@usuario/responder/número]",
  execute: async (wss, { mctx, args, groupMetadata }) => {
    const target = getTarget(mctx, args)
    const result = await resolveUserLid(wss, target, { mctx, groupMetadata, preferLid: true })

    const mentionTarget = result.lidJid || result.phoneJid || result.bestJid || target
    const mentionNumber = jidDigits(result.phoneJid || result.lidJid || result.bestJid || target)
    const mentionLine = mentionNumber ? `│ Usuario › @${mentionNumber}\n` : ""

    const text = formatLidResolution(result).replace("│ LID", `${mentionLine}│ LID`)

    await wss.sendMessage(
      mctx.chat.jid,
      {
        text,
        mentions: mentionTarget ? [mentionTarget] : [],
      },
      { quoted: mctx.message.original },
    )
  },
}

export default command
