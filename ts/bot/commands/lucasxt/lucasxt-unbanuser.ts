import type * as types from "../../../types/types.js"
import {
  getBotScopeJids,
  getTargetJids,
  refreshGroupMetadata,
  resolveGroupActionTarget,
  unbanBotUserMany,
} from "../../../libs/lucasxt-moderation.js"

export default {
  name: "unbanuser",
  alias: ["unbanbot"],
  description: "Desbanea a un usuario del uso del bot.",
  using: "@usuario",
  category: "lucasxt",
  hidden: true,
  flags: ["all.chats"],
  requires: ["bot.owner"],
  execute: async (wss, { mctx, args, bot, groupMetadata }) => {
    const targets = getTargetJids(mctx, args)
    if (!targets.length) return void await mctx.reply("「✖」 Menciona o responde un usuario.")

    const metadata = mctx.is_group ? await refreshGroupMetadata(wss, mctx.chat.jid, groupMetadata) : null
    const resolved = mctx.is_group ? await resolveGroupActionTarget(wss, metadata, targets) : { jids: targets }
    const identities = resolved.jids.length ? resolved.jids : targets

    for (const botJid of getBotScopeJids(bot, mctx)) await unbanBotUserMany(botJid, identities)
    await mctx.reply("「✓」 Usuario desbaneado.")
  },
} as types.Command
