import type * as types from "../../../types/types.js"
import * as database from "../../../database/database.js"
import { getScopedGroupJid } from "../../../libs/bot-scope.js"
import { jidNumber, sameUser } from "../../../libs/socket-manager.js"

const parseState = (value?: string): boolean | null => {
  const text = String(value || "").toLowerCase().trim()
  if (["on", "true", "1", "si", "sí", "activar", "enable"].includes(text)) return true
  if (["off", "false", "0", "no", "desactivar", "disable"].includes(text)) return false
  return null
}

const candidateJids = (jid: string): string[] => {
  const number = jidNumber(jid)
  return Array.from(
    new Set(
      [
        jid,
        jid.replace("@lid", "@s.whatsapp.net"),
        number ? `${number}@s.whatsapp.net` : "",
        number ? `${number}@lid` : "",
      ].filter(Boolean),
    ),
  )
}

const promoteOwnerNow = async (
  wss: types.WASocket,
  groupJid: string,
  ownerJid: string,
  groupMetadata?: types.CommandExecuteContext["groupMetadata"],
): Promise<boolean> => {
  const metadata = groupMetadata?.participants?.length ? groupMetadata : await wss.groupMetadata(groupJid)
  const participant = metadata.participants.find((item) => sameUser(item.id, ownerJid))

  if (participant?.admin) return true

  const targets = participant?.id ? [participant.id, ...candidateJids(ownerJid)] : candidateJids(ownerJid)

  for (const target of Array.from(new Set(targets))) {
    try {
      await wss.groupParticipantsUpdate(groupJid, [target], "promote")
      return true
    } catch {
      continue
    }
  }

  return false
}

const command: types.Command = {
  name: "autoadmin",
  alias: ["autoowneradmin", "owneradmin"],
  description: "Activa o desactiva auto-admin para el owner del bot en este grupo.",
  category: "owner",
  hidden: false,
  flags: ["only.groups"],
  requires: ["bot.owner"],
  using: "on/off",
  execute: async (wss, { mctx, args, group, bot, userIsPrimaryBotOwner, botIsAdmin, groupMetadata }) => {
    if (!userIsPrimaryBotOwner) {
      await mctx.reply("「✖」 Solo owner.")
      return
    }

    const requested = parseState(args[0])

    if (requested === null && args[0]) return void await mctx.reply("「✖」 Usa on/off.")

    if (requested === null) return void await mctx.reply(`「✧」 AutoAdmin ${group.autoadmin_enabled ? "activo" : "desactivado"}.`)

    if (requested && !botIsAdmin) {
      await mctx.reply("「✖」 Bot sin admin.")
      return
    }

    if (Boolean(group.autoadmin_enabled) === requested) {
      await mctx.reply(`「✓」 AutoAdmin ya estaba ${requested ? "activo" : "desactivado"}.`)
      return
    }

    await database.Groups.update(getScopedGroupJid(bot, mctx.chat.jid), {
      $set: {
        autoadmin_enabled: requested,
      },
    })

    if (requested) await promoteOwnerNow(wss, mctx.chat.jid, mctx.sender.jid, groupMetadata).catch(() => false)
    await mctx.reply(`「✓」 AutoAdmin ${requested ? "activo" : "desactivado"}.`)
  },
}

export default command
