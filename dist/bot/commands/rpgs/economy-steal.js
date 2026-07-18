import { getConnection } from "../../../database/connect.js";
import * as libs from "../../../libs/libs.js";
import { cooldownMessage, formatMoney, getCurrency, getGroupUser, getMentionedOrQuoted, percent, randomInt } from "../../../libs/economy.js";
import { getScopedGroupJid } from "../../../libs/bot-scope.js";
const successMessages = [
    "Le robaste", "Le sacaste el dinero del bolsillo a", "Aprovechaste un descuido y le robaste", "Le vaciaste la billetera a",
    "Le quitaste sin que se diera cuenta", "Le robaste discretamente", "Le hurtaste el dinero a", "Le sustrajiste",
    "Le robaste con maestría a", "Te llevaste el dinero de", "Le robaste mientras dormía a", "Le robaste en plena calle a",
    "Le birlaste el efectivo a", "Le robaste el bolso a", "Le sacaste el dinero sin que opusiera resistencia a",
    "Le hiciste el robo perfecto a", "Le quitaste el dinero distraídamente a", "Le tomaste prestado para siempre el dinero de",
    "Le robaste con maña a", "Le vaciaste los bolsillos a", "Le arrebataste el dinero a", "Le sacaste todo a",
];
const failMessages = [
    "Te descubrieron robando y pagaste", "Te atraparon con las manos en la masa y pagaste", "La víctima reaccionó a tiempo y pagaste",
    "Activaste una alarma y pagaste", "Te delataron unos testigos y pagaste", "Fallaste el robo y pagaste",
    "Te enfrentaron y tuviste que pagar", "Llegó la policía y pagaste", "El intento salió mal y pagaste", "Te reconocieron y pagaste",
    "Te denunciaron de inmediato y pagaste", "La víctima pidió ayuda y pagaste", "Tropezaste al huir y pagaste",
    "Un guardia te vio y pagaste", "Te delató una cámara de seguridad y pagaste", "Fuiste demasiado obvio y pagaste",
    "Se resistió más de lo esperado y pagaste", "Apareció gente y tuviste que huir, pagaste", "Te identificaron luego y pagaste",
    "El plan se complicó y pagaste",
];
const command = {
    name: "steal",
    alias: ["robar", "rob"],
    description: "Intentar robar {currency} a un usuario. Puedes ganar 1,000 a 5,000 o pagar multa.",
    requires: [],
    flags: ["only.groups"],
    hidden: false,
    category: "economy",
    using: "[@mencion]",
    execute: async (_, { mctx, group, bot, usedPrefix }) => {
        const currency = getCurrency(bot);
        const scopedGroupJid = getScopedGroupJid(bot, mctx.chat.jid);
        const groupUser = getGroupUser(group, mctx.sender.jid);
        if (!groupUser) {
            await mctx.reply(`「◈」 No se pudo obtener tus datos en este grupo, vuelve a intentarlo.`);
            return;
        }
        const now = Date.now();
        const stealInterval = 1_800_000;
        const timeDifference = now - (groupUser.last_robbery_ago || 0);
        if (timeDifference < stealInterval) {
            await mctx.reply(cooldownMessage(usedPrefix, "steal", libs.formatDuration(stealInterval - timeDifference)));
            return;
        }
        const mentioned = getMentionedOrQuoted(mctx);
        if (!mentioned) {
            await mctx.reply(`「◈」 Etiqueta o responde al participante que quieras robar.`);
            return;
        }
        if (mentioned === mctx.sender.jid) {
            await mctx.reply(`「◈」 No puedes robarte a ti mismo.`);
            return;
        }
        const target = getGroupUser(group, mentioned);
        if (!target) {
            await mctx.reply(`「◈」 El participante @${mentioned.split("@")[0]} no está registrado en este grupo.`);
            return;
        }
        if (target.money < 500) {
            await mctx.reply(`「◈」 Ese participante casi no tiene *${currency}* para robarle.`);
            return;
        }
        const amount = Math.min(target.money, randomInt(1000, 5000));
        const success = percent(58);
        const failPenalty = Math.min(groupUser.money, randomInt(400, 1800));
        try {
            const conn = getConnection();
            if (success) {
                conn.serialize(() => {
                    conn.run(`UPDATE group_users SET money = money + ?, last_robbery_ago = ? WHERE group_jid = ? AND user_jid = ?`, [amount, now, scopedGroupJid, mctx.sender.jid]);
                    conn.run(`UPDATE group_users SET money = money - ? WHERE group_jid = ? AND user_jid = ? AND money >= ?`, [amount, scopedGroupJid, mentioned, amount]);
                });
                await mctx.reply(`✦ ${libs.pickRandom(successMessages)} *${formatMoney(amount, currency)}* a @${mentioned.split("@")[0]}.`);
                return;
            }
            conn.run(`UPDATE group_users SET money = money - ?, last_robbery_ago = ? WHERE group_jid = ? AND user_jid = ? AND money >= ?`, [failPenalty, now, scopedGroupJid, mctx.sender.jid, failPenalty]);
            await mctx.reply(`「◈」 ${libs.pickRandom(failMessages)} *${formatMoney(failPenalty, currency)}*.`);
        }
        catch (error) {
            console.error("[Steal] Error:", error);
            await mctx.reply(`「◈」 Error al procesar el robo.`);
        }
    },
};
export default command;
