import { getConnection } from "../../../database/connect.js";
import { BET_EXAMPLE_AMOUNT, MIN_BET_AMOUNT, formatMoney, getCurrency, getGroupUser, minBetMessage, parseBetAmount, randomInt } from "../../../libs/economy.js";
import { getScopedGroupJid } from "../../../libs/bot-scope.js";
import { renderSlotsAnimation } from "../../../libs/game-animations.js";
const REELS = ["🍒", "🍋", "🍇", "🔔", "⭐", "💎"];
const TRIPLE_MULTIPLIER = {
    "💎": 15,
    "⭐": 10,
    "🔔": 8,
    "🍇": 6,
    "🍋": 4,
    "🍒": 3,
};
const PAIR_MULTIPLIER = 2;
const spinReel = () => REELS[randomInt(0, REELS.length - 1)];
const command = {
    name: "slots",
    alias: ["tragamonedas", "maquinita"],
    description: "Apostar {currency} en la tragamonedas. Tres iguales paga hasta x15, dos iguales paga x2.",
    category: "economy",
    using: "[cantidad] | ej: 1000",
    hidden: false,
    flags: ["only.groups"],
    requires: [],
    execute: async (wss, { mctx, args, group, bot, usedPrefix }) => {
        const currency = getCurrency(bot);
        const scopedGroupJid = getScopedGroupJid(bot, mctx.chat.jid);
        const groupUser = getGroupUser(group, mctx.sender.jid);
        if (!groupUser) {
            await mctx.reply(`「◈」 No se pudo obtener tus datos en este grupo, vuelve a intentarlo.`);
            return;
        }
        const amount = parseBetAmount(args[0], groupUser.money);
        if (!amount) {
            const help = `「◈」 Tragamonedas\n` +
                `⟡ Uso » *${usedPrefix}slots 1000*\n` +
                `⟡ Alias » *${usedPrefix}maquinita 1000*\n` +
                `⟡ Mínimo » *${formatMoney(MIN_BET_AMOUNT, currency)}*\n` +
                `⟡ Pagos » 💎💎💎 x15, ⭐⭐⭐ x10, 🔔🔔🔔 x8, 🍇🍇🍇 x6, 🍋🍋🍋 x4, 🍒🍒🍒 x3, dos iguales x2\n` +
                `⟡ Ejemplo » apuesta de *${formatMoney(BET_EXAMPLE_AMOUNT, currency)}*`;
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
        const a = spinReel();
        const b = spinReel();
        const c = spinReel();
        let multiplier = 0;
        if (a === b && b === c) {
            multiplier = TRIPLE_MULTIPLIER[a] || 3;
        }
        else if (a === b || b === c || a === c) {
            multiplier = PAIR_MULTIPLIER;
        }
        const won = multiplier > 0;
        const winnings = won ? amount * (multiplier - 1) : -amount;
        try {
            const conn = getConnection();
            conn.run(`UPDATE group_users SET money = money + ? WHERE group_jid = ? AND user_jid = ? AND money >= ?`, [winnings, scopedGroupJid, mctx.sender.jid, won ? 0 : amount]);
            const message = `「◈」 Tragamonedas\n` +
                `⟡ [ ${a} | ${b} | ${c} ]\n` +
                `⟡ Apuesta » *${formatMoney(amount, currency)}*\n` +
                `⟡ Premio » ${won ? `+*${formatMoney(amount * (multiplier - 1), currency)}* (x${multiplier})` : `-*${formatMoney(amount, currency)}*`}\n` +
                `⟡ Resultado » *${won ? "Ganaste" : "Perdiste"}*`;
            try {
                const gif = await renderSlotsAnimation(a, b, c);
                await wss.sendMessage(mctx.chat.jid, { video: gif, gifPlayback: true, caption: message }, { quoted: mctx.message.original });
            }
            catch (error) {
                console.error("[Slots] Error generando animación:", error);
                await mctx.reply(message);
            }
        }
        catch (error) {
            console.error("[Slots] Error:", error);
            await mctx.reply(`「◈」 Error al procesar la apuesta.`);
        }
    },
};
export default command;
