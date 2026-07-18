import { getScopedGroupJid } from "../../../libs/bot-scope.js";
import { createMarriageProposal, formatProposalTimeLeft, getActiveMarriageByUser, getMarriageBetween, getPartnerJid, getPendingMarriageProposalBetween, } from "../../../libs/marriage.js";
const getTargetJid = (mctx) => {
    return mctx.message.mentioned?.[0] || mctx.message.mentionedJid?.[0] || mctx.quoted?.sender?.jid || null;
};
const mention = (jid) => `@${jid.split("@")[0]}`;
const command = {
    name: "marry",
    alias: ["casar", "casarse", "matrimonio"],
    description: "Casarte con alguien.",
    using: "<@Mencion>",
    category: "main",
    flags: ["only.groups"],
    requires: [],
    hidden: false,
    execute: async (wss, { mctx, usedPrefix, bot }) => {
        const scopedGroupJid = getScopedGroupJid(bot, mctx.chat.jid);
        const targetJid = getTargetJid(mctx);
        if (!targetJid) {
            await mctx.reply(`「◈」 Uso: *${usedPrefix}casar @usuario*\nTambién puedes responder su mensaje.`);
            return;
        }
        if (targetJid === mctx.sender.jid) {
            await mctx.reply(`「◈」 No puedes casarte contigo mismo.`);
            return;
        }
        const alreadyTogether = await getMarriageBetween(scopedGroupJid, mctx.sender.jid, targetJid);
        if (alreadyTogether) {
            await mctx.reply(`✦ Ya estás casado con ${mention(targetJid)}.`, "s.whatsapp.net");
            return;
        }
        const senderMarriage = await getActiveMarriageByUser(scopedGroupJid, mctx.sender.jid);
        if (senderMarriage) {
            const partner = getPartnerJid(senderMarriage, mctx.sender.jid);
            await mctx.reply(`「◈」 Ya tienes pareja: ${mention(partner)}. Usa *${usedPrefix}divorcio* primero.`, "s.whatsapp.net");
            return;
        }
        const targetMarriage = await getActiveMarriageByUser(scopedGroupJid, targetJid);
        if (targetMarriage) {
            const partner = getPartnerJid(targetMarriage, targetJid);
            await mctx.reply(`「◈」 ${mention(targetJid)} ya está casado/a con ${mention(partner)}.`, "s.whatsapp.net");
            return;
        }
        const pending = await getPendingMarriageProposalBetween(scopedGroupJid, mctx.sender.jid, targetJid);
        if (pending) {
            await wss.sendMessage(mctx.chat.jid, {
                text: `「◈」 Ya hay una propuesta pendiente.\n${mention(pending.proposer_jid)} → ${mention(pending.target_jid)}\nExpira en 》 *${formatProposalTimeLeft(pending.expires_at_ms)}*`,
                mentions: [pending.proposer_jid, pending.target_jid],
            }, { quoted: mctx.message.original });
            return;
        }
        const proposal = await createMarriageProposal(scopedGroupJid, mctx.sender.jid, targetJid);
        if (!proposal) {
            await mctx.reply(`「◈」 No se pudo crear la propuesta, intenta otra vez.`);
            return;
        }
        const senderName = await wss.getName(mctx.sender.jid).catch(() => mention(mctx.sender.jid));
        const targetName = await wss.getName(targetJid).catch(() => mention(targetJid));
        const message = `「◈」 Propuesta enviada\n` +
            `${mention(mctx.sender.jid)} le pidió matrimonio a ${mention(targetJid)}\n` +
            `⟡ Pareja 》 *${senderName} + ${targetName}*\n` +
            `⟡ Expira 》 *${formatProposalTimeLeft(proposal.expires_at_ms)}*\n` +
            `⟡ Estado 》 *pendiente*\n\n` +
            `» ${mention(targetJid)} responde con:\n` +
            `*${usedPrefix}aceptarcasar* para aceptar\n` +
            `*${usedPrefix}rechazarcasar* para rechazar`;
        await wss.sendMessage(mctx.chat.jid, {
            text: message,
            mentions: [mctx.sender.jid, targetJid],
        }, { quoted: mctx.message.original });
    },
};
export default command;
