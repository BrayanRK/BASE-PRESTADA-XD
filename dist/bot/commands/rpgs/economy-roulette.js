import { getConnection } from "../../../database/connect.js";
import { BET_EXAMPLE_AMOUNT, MIN_BET_AMOUNT, formatMoney, getCurrency, getGroupUser, minBetMessage, parseBetAmount, randomInt } from "../../../libs/economy.js";
import { getScopedGroupJid } from "../../../libs/bot-scope.js";
const colorMap = {
    red: "red",
    rojo: "red",
    black: "black",
    negro: "black",
};
const getColor = (value) => colorMap[String(value ?? "").trim().toLowerCase()] || null;
const command = {
    name: "roulette",
    alias: ["rt"],
    description: "Apostar {currency} en una ruleta. Ejemplo: red 1000. Si ganas recibes x2.",
    category: "economy",
    using: "[red/black] [cantidad] | ej: red 1000",
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
        const firstColor = getColor(args[0]);
        const chosenColor = firstColor || getColor(args[1]);
        const amount = firstColor ? parseBetAmount(args[1], groupUser.money) : parseBetAmount(args[0], groupUser.money);
        if (!amount || !chosenColor) {
            const help = `「◈」 Ruleta\n` +
                `⟡ Uso » *${usedPrefix}roulette red 1000*\n` +
                `⟡ Alias » *${usedPrefix}rt black 1000*\n` +
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
        const number = randomInt(0, 36);
        const resultColor = number === 0 ? "green" : number % 2 === 0 ? "black" : "red";
        const won = resultColor === chosenColor;
        const delta = won ? amount : -amount;
        try {
            const conn = getConnection();
            conn.run(`UPDATE group_users SET money = money + ? WHERE group_jid = ? AND user_jid = ? AND money >= ?`, [delta, scopedGroupJid, mctx.sender.jid, won ? 0 : amount]);
            const message = `「◈」 Ruleta\n` +
                `⟡ Apuesta » *${formatMoney(amount, currency)}*\n` +
                `⟡ Elegiste » *${chosenColor}*\n` +
                `⟡ Salió » *${number} ${resultColor}*\n` +
                `⟡ Premio » ${won ? `+*${formatMoney(amount, currency)}*` : `-*${formatMoney(amount, currency)}*`}\n` +
                `⟡ Resultado » *${won ? "Ganaste" : "Perdiste"}*`;
            await mctx.reply(message);
        }
        catch (error) {
            console.error("[Roulette] Error:", error);
            await mctx.reply(`「◈」 Error al procesar la ruleta.`);
        }
    },
};
export default command;
