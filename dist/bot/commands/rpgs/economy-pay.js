import { getConnection } from "../../../database/connect.js";
import { formatMoney, getAmountFromArgs, getCurrency, getGroupUser, getMentionedOrQuoted } from "../../../libs/economy.js";
import { getScopedGroupJid } from "../../../libs/bot-scope.js";
const command = {
    name: "givecoins",
    alias: ["pay", "coinsgive"],
    description: "Dar {currency} a un usuario. Ejemplo: @usuario 1000.",
    flags: ["only.groups"],
    requires: [],
    category: "economy",
    hidden: false,
    using: "[usuario] [cantidad] | ej: @user 1000",
    execute: async (_, { mctx, args, bot, group, usedPrefix }) => {
        const currency = getCurrency(bot);
        const scopedGroupJid = getScopedGroupJid(bot, mctx.chat.jid);
        const groupUser = getGroupUser(group, mctx.sender.jid);
        if (!groupUser) {
            await mctx.reply(`「◈」 No se pudo obtener tus datos en este grupo, vuelve a intentarlo.`);
            return;
        }
        const mentioned = getMentionedOrQuoted(mctx);
        const amount = getAmountFromArgs(args, groupUser.money);
        if (!mentioned || !amount) {
            await mctx.reply(`「◈」 Usa: *${usedPrefix}givecoins @user 1000* o responde un mensaje con *${usedPrefix}pay 1000*.`);
            return;
        }
        if (mentioned === mctx.sender.jid) {
            await mctx.reply(`「◈」 No puedes transferirte a ti mismo.`);
            return;
        }
        const groupTarget = getGroupUser(group, mentioned);
        if (!groupTarget) {
            await mctx.reply(`「◈」 El participante @${mentioned.split("@")[0]} no está registrado en este grupo.`);
            return;
        }
        if (groupUser.money < amount) {
            await mctx.reply(`「◈」 No tienes suficiente *${currency}*. Tienes *${formatMoney(groupUser.money, currency)}*.`);
            return;
        }
        try {
            const conn = getConnection();
            conn.serialize(() => {
                conn.run(`UPDATE group_users SET money = money - ? WHERE group_jid = ? AND user_jid = ?`, [amount, scopedGroupJid, mctx.sender.jid]);
                conn.run(`UPDATE group_users SET money = money + ? WHERE group_jid = ? AND user_jid = ?`, [amount, scopedGroupJid, mentioned]);
            });
            await mctx.reply(`✦ Enviaste *${formatMoney(amount, currency)}* a @${mentioned.split("@")[0]}.`);
        }
        catch (error) {
            console.error("[GiveCoins] Error:", error);
            await mctx.reply(`「◈」 Error al procesar el pago.`);
        }
    },
};
export default command;
