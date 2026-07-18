import { getConnection } from "../../../database/connect.js";
import { BET_EXAMPLE_AMOUNT, MIN_BET_AMOUNT, formatMoney, getCurrency, getGroupUser, minBetMessage, parseBetAmount } from "../../../libs/economy.js";
import { getScopedGroupJid } from "../../../libs/bot-scope.js";
const sideMap = {
    cara: "cara",
    caras: "cara",
    head: "cara",
    heads: "cara",
    cruz: "cruz",
    sello: "cruz",
    tail: "cruz",
    tails: "cruz",
};
const getSide = (value) => sideMap[String(value ?? "").trim().toLowerCase()] || null;
const command = {
    name: "coinflip",
    alias: ["flip", "cf"],
    description: "Apostar {currency} en un cara o cruz. Ejemplo: 1000 cara. Si ganas recibes x2.",
    category: "economy",
    using: "[cantidad] <cara/cruz> | ej: 1000 cara",
    hidden: false,
    flags: ["only.groups"],
    requires: [],
    execute: async (_, { mctx, args, group, bot, usedPrefix }) => {
        const currency = getCurrency(bot);
        const scopedGroupJid = getScopedGroupJid(bot, mctx.chat.jid);
        const groupUser = getGroupUser(group, mctx.sender.jid);
        if (!groupUser) {
            await mctx.reply(`「◈」 No se pudo obtener tus datos en este grupo, vuelve a intentarlo.`);
            return;
        }
        const firstSide = getSide(args[0]);
        const chosenSide = firstSide || getSide(args[1]);
        const amount = firstSide ? parseBetAmount(args[1], groupUser.money) : parseBetAmount(args[0], groupUser.money);
        if (!amount || !chosenSide) {
            const help = `「◈」 Cara o cruz\n` +
                `⟡ Uso » *${usedPrefix}coinflip 1000 cara*\n` +
                `⟡ Alias » *${usedPrefix}cf 1000 cruz*\n` +
                `⟡ Mínimo » *${formatMoney(MIN_BET_AMOUNT, currency)}*\n` +
                `⟡ Premio » ganas +*${formatMoney(BET_EXAMPLE_AMOUNT, currency)}* con apuesta de *${formatMoney(BET_EXAMPLE_AMOUNT, currency)}*`;
            await mctx.reply(help);
            return;
        }
        if (amount < MIN_BET_AMOUNT) {
            await mctx.reply(minBetMessage(currency));
            return;
        }
        if (amount > groupUser.money) {
            await mctx.reply(`「◈」 No tienes suficiente *${currency}*. Tienes *${formatMoney(groupUser.money, currency)}*.`);
            return;
        }
        const result = Math.random() < 0.5 ? "cara" : "cruz";
        const won = result === chosenSide;
        const delta = won ? amount : -amount;
        try {
            const conn = getConnection();
            conn.run(`UPDATE group_users SET money = money + ? WHERE group_jid = ? AND user_jid = ? AND money >= ?`, [delta, scopedGroupJid, mctx.sender.jid, won ? 0 : amount]);
            const message = `「◈」 Cara o cruz\n` +
                `⟡ Apuesta » *${formatMoney(amount, currency)}*\n` +
                `⟡ Elegiste » *${chosenSide}*\n` +
                `⟡ Cayó » *${result}*\n` +
                `⟡ Premio » ${won ? `+*${formatMoney(amount, currency)}*` : `-*${formatMoney(amount, currency)}*`}\n` +
                `⟡ Resultado » *${won ? "Ganaste" : "Perdiste"}*`;
            await mctx.reply(message);
        }
        catch (error) {
            console.error("[Coinflip] Error:", error);
            await mctx.reply(`「◈」 Error al procesar la apuesta.`);
        }
    },
};
export default command;
