import { getPendingMarriageProposal, updateMarriageProposalStatus } from "../../../libs/marriage.js";
import { getScopedGroupJid } from "../../../libs/bot-scope.js";
const getProposerJid = (mctx) => {
    return mctx.message.mentioned?.[0] || mctx.message.mentionedJid?.[0] || mctx.quoted?.sender?.jid || undefined;
};
const mention = (jid) => `@${jid.split("@")[0]}`;
const command = {
    name: "rejectmarry",
    alias: ["rechazarcasar", "rechazarmatrimonio", "rechazarpareja", "marryreject"],
    description: "Rechazar una propuesta de matrimonio pendiente.",
    using: "<@usuario opcional>",
    category: "main",
    flags: ["only.groups"],
    requires: [],
    hidden: true,
    execute: async (wss, { mctx, usedPrefix, bot }) => {
        const scopedGroupJid = getScopedGroupJid(bot, mctx.chat.jid);
        const proposerJid = getProposerJid(mctx);
        const proposal = await getPendingMarriageProposal(scopedGroupJid, mctx.sender.jid, proposerJid);
        if (!proposal) {
            await mctx.reply(`「◈」 No tienes propuestas pendientes.\nUsa *${usedPrefix}casar @usuario*`);
            return;
        }
        await updateMarriageProposalStatus(proposal.id, "rejected");
        await wss.sendMessage(mctx.chat.jid, {
            text: `「◈」 ${mention(mctx.sender.jid)} rechazó la propuesta de ${mention(proposal.proposer_jid)}\nEstado 》 *rechazada*`,
            mentions: [proposal.proposer_jid, mctx.sender.jid],
        }, { quoted: mctx.message.original });
    },
};
export default command;
