import type * as types from "../../../types/types.js"
import { getBotScopeJid, isAntiTagEnabled, setAntiTag } from "../../../libs/lucasxt-moderation.js"

const statusText = (enabled: boolean): string => enabled ? "activo" : "desactivado"

export default {
  name: "antitag",
  alias: [],
  description: "Borra tags reenviados.",
  using: "on/off",
  category: "lucasxt",
  hidden: true,
  flags: ["only.groups"],
  requires: ["administrator.user"],
  execute: async (_wss, { mctx, args, bot }) => {
    const botJid = getBotScopeJid(bot, mctx)
    const arg = String(args[0] || "").toLowerCase().trim()
    const enabled = await isAntiTagEnabled(botJid, mctx.chat.jid)

    if (!arg) return void await mctx.reply(`「✧」 Antitag ${statusText(enabled)}.`)
    if (!/^(on|off)$/i.test(arg)) return void await mctx.reply("「✖」 Usa on/off.")

    const next = arg === "on"
    if (enabled === next) return void await mctx.reply(`「✓」 Antitag ya estaba ${statusText(next)}.`)

    await setAntiTag(botJid, mctx.chat.jid, next)
    await mctx.reply(`「✓」 Antitag ${statusText(next)}.`)
  },
} as types.Command
