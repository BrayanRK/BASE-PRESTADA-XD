import type * as types from "../../../types/types.js"
import { getScopedGroupJid } from "../../../libs/bot-scope.js"
import {
  createMarriage,
  formatMarriageDate,
  getActiveMarriageByUser,
  getPendingMarriageProposal,
  updateMarriageProposalStatus,
} from "../../../libs/marriage.js"

const getProposerJid = (mctx: types.MessageContext): string | undefined => {
  return mctx.message.mentioned?.[0] || mctx.message.mentionedJid?.[0] || mctx.quoted?.sender?.jid || undefined
}

const mention = (jid: string): string => `@${jid.split("@")[0]}`

const command: types.Command = {
  name: "acceptmarry",
  alias: ["aceptarcasar", "aceptarmatrimonio", "aceptarpareja", "marryaccept"],
  description: "Aceptar una propuesta de matrimonio pendiente.",
  using: "<@usuario opcional>",
  category: "main",
  flags: ["only.groups"],
  requires: [],
  hidden: true,
  execute: async (wss, { mctx, usedPrefix, bot }) => {
    const scopedGroupJid = getScopedGroupJid(bot, mctx.chat.jid)
    const proposerJid = getProposerJid(mctx)
    const proposal = await getPendingMarriageProposal(scopedGroupJid, mctx.sender.jid, proposerJid)

    if (!proposal) {
      await mctx.reply(`「◈」 No tienes propuestas pendientes.\nUsa *${usedPrefix}casar @usuario*`)
      return
    }

    const accepterMarriage = await getActiveMarriageByUser(scopedGroupJid, mctx.sender.jid)
    if (accepterMarriage) {
      await updateMarriageProposalStatus(proposal.id, "rejected")
      await mctx.reply(`「◈」 Ya tienes pareja. Se rechazó la propuesta pendiente.`)
      return
    }

    const proposerMarriage = await getActiveMarriageByUser(scopedGroupJid, proposal.proposer_jid)
    if (proposerMarriage) {
      await updateMarriageProposalStatus(proposal.id, "rejected")
      await mctx.reply(`「◈」 ${mention(proposal.proposer_jid)} ya tiene pareja. Se rechazó la propuesta.`, "s.whatsapp.net")
      return
    }

    const marriage = await createMarriage(scopedGroupJid, proposal.proposer_jid, mctx.sender.jid)
    if (!marriage) {
      await mctx.reply(`「◈」 No se pudo registrar el matrimonio, intenta otra vez.`)
      return
    }

    await updateMarriageProposalStatus(proposal.id, "accepted")

    const proposerName = await wss.getName(proposal.proposer_jid).catch(() => mention(proposal.proposer_jid))
    const targetName = await wss.getName(mctx.sender.jid).catch(() => mention(mctx.sender.jid))

    const message = `「◈」 Matrimonio aceptado\n` +
      `${mention(mctx.sender.jid)} aceptó la propuesta de ${mention(proposal.proposer_jid)}\n` +
      `⟡ Pareja 》 *${proposerName} + ${targetName}*\n` +
      `⟡ Estado 》 *casados*\n` +
      `⟡ Desde 》 *${formatMarriageDate(marriage.married_at)}*\n\n` +
      `Usa *${usedPrefix}pareja* para ver el tiempo juntos.`

    await wss.sendMessage(
      mctx.chat.jid,
      {
        text: message,
        mentions: [proposal.proposer_jid, mctx.sender.jid],
      },
      { quoted: mctx.message.original },
    )
  },
}

export default command
