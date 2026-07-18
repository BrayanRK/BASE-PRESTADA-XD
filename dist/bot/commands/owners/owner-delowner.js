import * as database from "../../../database/database.js";
import { getBotOwnerIdentityJids, normalizeJid, sameUser, jidNumber } from "../../../libs/socket-manager.js";
import { getEffectiveBotJid } from "../../../libs/bot-scope.js";
const targetFromMessage = (mctx, args) => {
    return normalizeJid(mctx.message.mentioned?.[0] ||
        mctx.quoted?.sender?.jid ||
        args.find((arg) => /\d{5,}/.test(arg)) ||
        "");
};
const command = {
    name: "delowner",
    alias: ["delsubowner", "removeowner", "rmowner"],
    description: "Quita un subowner del bot actual",
    category: "owner",
    hidden: false,
    flags: ["only.groups"],
    requires: ["bot.owner"],
    using: "@usuario",
    execute: async (wss, { mctx, args, bot, userIsPrimaryBotOwner }) => {
        if (!userIsPrimaryBotOwner) {
            await mctx.reply(`*｢✧｣* Solo el owner principal/oficial del bot puede quitar subowners.`);
            return;
        }
        const targetJid = targetFromMessage(mctx, args);
        if (!targetJid) {
            await mctx.reply(`「◈」 Subowners\n◈ Uso 》 .delowner @usuario\n◈ Tip 》 también puedes responder el mensaje del usuario.`);
            return;
        }
        if (getBotOwnerIdentityJids(bot).some((ownerJid) => sameUser(targetJid, ownerJid))) {
            await mctx.reply(`「◈」 Subowners\n◈ Usuario 》 @${jidNumber(targetJid)}\n◈ Estado 》 no puedes quitar al owner principal.`);
            return;
        }
        const botScopeJid = getEffectiveBotJid(bot) || mctx.me.jids.lid || mctx.me.jids.pn;
        const removed = await database.BotSubOwners.remove(botScopeJid, targetJid);
        if (!removed) {
            await mctx.reply(`「◈」 Subowners\n◈ Usuario 》 @${jidNumber(targetJid)}\n◈ Estado 》 no estaba como subowner de este bot.`);
            return;
        }
        await mctx.reply(`「◈」 Subowners\n◈ Bot 》 @${jidNumber(botScopeJid)}\n◈ Usuario 》 @${jidNumber(targetJid)}\n◈ Estado 》 eliminado de la DB.`);
    },
};
export default command;
