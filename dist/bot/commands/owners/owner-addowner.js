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
    name: "addowner",
    alias: ["addsubowner", "addownerbot", "addbotowner"],
    description: "Agrega un subowner al bot actual",
    category: "owner",
    hidden: false,
    flags: ["only.groups"],
    requires: ["bot.owner"],
    using: "@usuario",
    execute: async (wss, { mctx, args, bot, userIsPrimaryBotOwner }) => {
        if (!userIsPrimaryBotOwner) {
            await mctx.reply(`*｢✧｣* Solo el owner principal/oficial del bot puede agregar subowners.`);
            return;
        }
        const targetJid = targetFromMessage(mctx, args);
        if (!targetJid) {
            await mctx.reply(`「◈」 Subowners\n◈ Uso 》 .addowner @usuario\n◈ Tip 》 también puedes responder el mensaje del usuario.`);
            return;
        }
        if (getBotOwnerIdentityJids(bot).some((ownerJid) => sameUser(targetJid, ownerJid))) {
            await mctx.reply(`「◈」 Subowners\n◈ Usuario 》 @${jidNumber(targetJid)}\n◈ Estado 》 ya es el owner principal.`);
            return;
        }
        if (sameUser(targetJid, bot.bot_jid) || sameUser(targetJid, mctx.me.jids.lid) || sameUser(targetJid, mctx.me.jids.pn)) {
            await mctx.reply(`「◈」 Subowners\n◈ Estado 》 no puedes agregar al mismo bot como subowner.`);
            return;
        }
        const botScopeJid = getEffectiveBotJid(bot) || mctx.me.jids.lid || mctx.me.jids.pn;
        const saved = await database.BotSubOwners.add(botScopeJid, targetJid, mctx.sender.jid);
        if (!saved) {
            await mctx.reply(`「◈」 Subowners\n◈ Usuario 》 @${jidNumber(targetJid)}\n◈ Estado 》 no se pudo guardar.`);
            return;
        }
        await mctx.reply(`「◈」 Subowners\n◈ Bot 》 @${jidNumber(botScopeJid)}\n◈ Usuario 》 @${jidNumber(targetJid)}\n◈ Estado 》 agregado y guardado en DB.`);
    },
};
export default command;
