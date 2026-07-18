import type * as types from "../../../types/types.js"
import { getBotOwnerIdentityJids } from "../../../libs/socket-manager.js"
import {
  getTargetJids,
  refreshGroupMetadata,
  resolveGroupActionTarget,
  sameIdentity,
} from "../../../libs/lucasxt-moderation.js"
import { resolveUserLid } from "../../../libs/lid-resolver.js"
import { wipeUserData } from "../../../libs/user-wipe.js"

const card = (title: string, lines: string[] = []): string => [`「◈」 *${title}*`, ...lines].join("\n")

export default {
  name: "deluser",
  alias: ["resetuser", "wipeuser", "borraruser"],
  description: "Elimina a un usuario de toda la base de datos: banco, gacha, pokemon, matrimonios y perfil.",
  using: "@usuario | responde un mensaje | número",
  category: "lucasxt",
  hidden: true,
  flags: ["all.chats"],
  requires: ["bot.owner"],
  execute: async (wss, { mctx, args, bot, groupMetadata }) => {
    const rawTargets = getTargetJids(mctx, args)

    if (!rawTargets.length) {
      await mctx.reply(
        card("deluser", [`Menciona, responde o pasa el número del usuario a eliminar.`]),
      )
      return
    }

    let identities: string[] = []

    if (mctx.is_group) {
      const metadata = await refreshGroupMetadata(wss, mctx.chat.jid, groupMetadata)
      const resolved = await resolveGroupActionTarget(wss, metadata, rawTargets)
      identities = resolved.jids.length ? resolved.jids : rawTargets
    } else {
      const resolved = await resolveUserLid(wss, rawTargets[0], { mctx })
      identities = [resolved.lidJid, resolved.phoneJid, resolved.bestJid, ...rawTargets].filter(Boolean)
    }

    identities = Array.from(new Set(identities))

    if (!identities.length) {
      await mctx.reply(card("deluser", [`No pude identificar a ese usuario.`]))
      return
    }

    if (
      identities.some(
        (jid) =>
          getBotOwnerIdentityJids(bot).some((ownerJid) => sameIdentity(jid, ownerJid)) ||
          sameIdentity(jid, bot.bot_jid) ||
          sameIdentity(jid, mctx.me?.jids?.lid) ||
          sameIdentity(jid, mctx.me?.jids?.pn),
      )
    ) {
      await mctx.reply(card("deluser", [`No puedes eliminar al owner ni al bot.`]))
      return
    }

    const summary = await wipeUserData(identities)
    const targetNumber = identities.find((jid) => jid.endsWith("@s.whatsapp.net"))?.split("@")[0] || identities[0]

    await mctx.reply(
      card("Usuario eliminado", [
        `Objetivo 》 @${targetNumber?.split("@")[0] || targetNumber}`,
        `Identidades borradas 》 ${summary.identities.length}`,
        `Perfil 》 ${summary.usersDeleted}`,
        `Economía/grupos 》 ${summary.groupUsersDeleted}`,
        `Pokemon 》 ${summary.pokemonDeleted}`,
        `Matrimonios 》 ${summary.marriagesDeleted}`,
        `Propuestas 》 ${summary.proposalsDeleted}`,
        `Gacha liberados 》 ${summary.gachaCharactersReleased}`,
        `Harem removido 》 ${summary.gachaHaremRemoved} (${summary.haremFilesTouched} archivos)`,
      ]),
    )
  },
} as types.Command
