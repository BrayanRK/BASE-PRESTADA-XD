import type * as types from "../../../types/types.js"
import { getBotOwnerIdentityJids } from "../../../libs/socket-manager.js"
import {
  banBotUserMany,
  getBotScopeJids,
  getTargetJids,
  refreshGroupMetadata,
  resolveGroupActionTarget,
  sameIdentity,
} from "../../../libs/lucasxt-moderation.js"

export default {
  name: "banuser",
  alias: ["banbot"],
  description: "Banea a un usuario del uso del bot.",
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

    if (identities.some((jid) => getBotOwnerIdentityJids(bot).some((ownerJid) => sameIdentity(jid, ownerJid)) || sameIdentity(jid, bot.bot_jid))) {
      return void await mctx.reply("「✖」 Usuario protegido.")
    }

    for (const botJid of getBotScopeJids(bot, mctx)) await banBotUserMany(botJid, identities)
    await mctx.reply("「✓」 Usuario baneado.")
  },
} as types.Command
