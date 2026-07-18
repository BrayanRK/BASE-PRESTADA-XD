import type * as types from "../../../types/types.js"
import {
  getTargetJids,
  participantIsAdmin,
  refreshGroupMetadata,
  resolveGroupActionTarget,
  sameIdentity,
} from "../../../libs/lucasxt-moderation.js"

const tryGroupUpdate = async (
  wss: types.WASocket,
  groupJid: string,
  jids: string[],
  action: "promote" | "demote" | "remove",
): Promise<boolean> => {
  const targets = Array.from(new Set(jids.filter(Boolean)))
  for (const jid of targets) {
    try {
      await wss.groupParticipantsUpdate(groupJid, [jid], action)
      return true
    } catch (error: any) {
      console.log(`[${action}] falló con ${jid}:`, error?.message || error)
    }
  }
  return false
}

export default {
  name: "demote",
  alias: ["unadmin"],
  description: "Descender a un usuario de administrador.",
  category: "group",
  using: "@usuario",
  hidden: false,
  flags: ["only.groups"],
  requires: ["administrator", "administrator.user"],
  execute: async (wss, { mctx, args, groupMetadata }) => {
    try {
      const targets = getTargetJids(mctx, args)
      if (!targets.length) return void await mctx.reply("「✖」 Menciona o responde un usuario.")

      const metadata = await refreshGroupMetadata(wss, mctx.chat.jid, groupMetadata)
      const resolved = await resolveGroupActionTarget(wss, metadata, targets)
      const ownerGroup = metadata?.owner || mctx.chat.jid.split("-")[0] + "@s.whatsapp.net"

      if (resolved.jids.some((jid) => sameIdentity(jid, ownerGroup))) {
        return void await mctx.reply("「✖」 Usuario protegido.")
      }

      if (resolved.participant && !participantIsAdmin(resolved.participant)) {
        return void await mctx.reply("「✖」 Usuario no es admin.")
      }

      await mctx.react("⏳")
      const ok = await tryGroupUpdate(wss, mctx.chat.jid, resolved.jids.length ? resolved.jids : targets, "demote")

      if (!ok) {
        await mctx.react("❌")
        return void await mctx.reply("「✖」 No se pudo degradar.")
      }

      await mctx.react("✅")
      await mctx.reply("「✓」 Usuario degradado.")
    } catch (error: any) {
      await mctx.react("❌")
      console.error("[Demote] Error:", error)
      await mctx.reply("「✖」 No se pudo degradar.")
    }
  },
} as types.Command
