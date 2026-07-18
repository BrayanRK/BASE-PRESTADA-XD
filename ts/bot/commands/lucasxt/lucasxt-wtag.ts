import type * as types from "../../../types/types.js"
import {
  allowTagUserMany,
  getAllowedTagUsers,
  getBotScopeJid,
  getTargetJids,
  mentionNumber,
  refreshGroupMetadata,
  removeAllowedTagUserMany,
  resolveGroupActionTarget,
} from "../../../libs/lucasxt-moderation.js"

const uniqueMentions = (list: string[]): string[] => {
  return Array.from(new Set(list.map((jid) => mentionNumber(jid)).filter((num) => /^\d{5,}$/.test(num))))
}

export default {
  name: "wtag",
  alias: ["whitelisttag"],
  description: "Permite que un usuario reenvíe tags.",
  using: "@usuario | del @usuario | list",
  category: "lucasxt",
  hidden: true,
  flags: ["only.groups"],
  requires: ["administrator.user"],
  execute: async (wss, { mctx, args, bot, groupMetadata }) => {
    const botJid = getBotScopeJid(bot, mctx)
    const action = String(args[0] || "").toLowerCase()

    if (action === "list") {
      const list = uniqueMentions(await getAllowedTagUsers(botJid, mctx.chat.jid))
      const text = list.length ? list.map((num) => `• @${num}`).join("\n") : "vacío"
      return void await mctx.reply(`「✓」 wtag\n${text}`)
    }

    const targetArgs = /^(del|remove|rm|off)$/i.test(action) ? args.slice(1) : args
    const targets = getTargetJids(mctx, targetArgs)
    if (!targets.length) return void await mctx.reply("「✖」 Menciona o responde un usuario.")

    const metadata = await refreshGroupMetadata(wss, mctx.chat.jid, groupMetadata)
    const resolved = await resolveGroupActionTarget(wss, metadata, targets)
    const identities = resolved.jids.length ? resolved.jids : targets

    if (/^(del|remove|rm|off)$/i.test(action)) {
      await removeAllowedTagUserMany(botJid, mctx.chat.jid, identities)
      return void await mctx.reply("「✓」 Usuario removido.")
    }

    await allowTagUserMany(botJid, mctx.chat.jid, identities)
    await mctx.reply("「✓」 Usuario permitido.")
  },
} as types.Command
