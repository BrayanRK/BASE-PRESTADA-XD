import { getConnection } from "../../../database/connect.js";
import { BET_EXAMPLE_AMOUNT, MIN_BET_AMOUNT, formatMoney, getCurrency, getGroupUser, minBetMessage, parseBetAmount, randomInt } from "../../../libs/economy.js";
import { getScopedGroupJid } from "../../../libs/bot-scope.js";
import { renderDiceAnimation } from "../../../libs/game-animations.js";
const DICE_EMOJI = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
const parityMap = { par: "par", pares: "par", even: "par", impar: "impar", impares: "impar", odd: "impar" };
const rangeMap = { alto: "alto", high: "alto", mayor: "alto", bajo: "bajo", low: "bajo", menor: "bajo" };
const parseMode = (raw) => {
    const value = String(raw ?? "").trim().toLowerCase();
    if (!value)
        return null;
    if (/^[1-6]$/.test(value)) {
        return { kind: "number", value: Number(value), payoutMultiplier: 5 };
    }
    if (parityMap[value]) {
        return { kind: "parity", value: parityMap[value], payoutMultiplier: 2 };
    }
    if (rangeMap[value]) {
        return { kind: "range", value: rangeMap[value], payoutMultiplier: 2 };
    }
    return null;
};
const command = {
    name: "dados",
    alias: ["dice", "dd"],
    description: "Apostar {currency} a los dados: número exacto (1-6), par/impar o alto/bajo. Ejemplo: 4 1000.",
    category: "economy",
    using: "[numero 1-6 | par | impar | alto | bajo] [cantidad] | ej: 4 1000",
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
        const firstMode = parseMode(args[0]);
        const mode = firstMode || parseMode(args[1]);
        const amount = firstMode ? parseBetAmount(args[1], groupUser.money) : parseBetAmount(args[0], groupUser.money);
        if (!amount || !mode) {
            const help = `「◈」 Dados\n` +
                `⟡ Número exacto » *${usedPrefix}dados 4 1000* — paga x5\n` +
                `⟡ Par / Impar » *${usedPrefix}dados par 1000* — paga x2\n` +
                `⟡ Alto / Bajo » *${usedPrefix}dados alto 1000* — paga x2 (alto: 8-12, bajo: 2-6, el 7 siempre pierde)\n` +
                `⟡ Mínimo » *${formatMoney(MIN_BET_AMOUNT, currency)}*\n` +
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
        const die1 = randomInt(1, 6);
        const die2 = randomInt(1, 6);
        const sum = die1 + die2;
        let won = false;
        let chosenLabel = "";
        if (mode.kind === "number") {
            won = die1 === mode.value || die2 === mode.value;
            chosenLabel = `número *${mode.value}*`;
        }
        else if (mode.kind === "parity") {
            const parity = sum % 2 === 0 ? "par" : "impar";
            won = sum !== 7 ? parity === mode.value : false;
            chosenLabel = `*${mode.value}*`;
        }
        else {
            const range = sum > 7 ? "alto" : sum < 7 ? "bajo" : "siete";
            won = range === mode.value;
            chosenLabel = `*${mode.value}*`;
        }
        const winnings = won ? amount * (mode.payoutMultiplier - 1) : -amount;
        const diceText = `${DICE_EMOJI[die1 - 1]} ${DICE_EMOJI[die2 - 1]}`;
        try {
            const conn = getConnection();
            conn.run(`UPDATE group_users SET money = money + ? WHERE group_jid = ? AND user_jid = ? AND money >= ?`, [winnings, scopedGroupJid, mctx.sender.jid, won ? 0 : amount]);
            const message = `「◈」 Dados\n` +
                `⟡ Apuesta » *${formatMoney(amount, currency)}* a ${chosenLabel}\n` +
                `⟡ Salieron » ${diceText} (${die1} + ${die2} = *${sum}*)\n` +
                `⟡ Premio » ${won ? `+*${formatMoney(amount * (mode.payoutMultiplier - 1), currency)}*` : `-*${formatMoney(amount, currency)}*`}\n` +
                `⟡ Resultado » *${won ? "Ganaste" : "Perdiste"}*`;
            try {
                const gif = await renderDiceAnimation(die1, die2);
                await wss.sendMessage(mctx.chat.jid, { video: gif, gifPlayback: true, caption: message }, { quoted: mctx.message.original });
            }
            catch (error) {
                console.error("[Dados] Error generando animación:", error);
                await mctx.reply(message);
            }
        }
        catch (error) {
            console.error("[Dados] Error:", error);
            await mctx.reply(`「◈」 Error al procesar la apuesta.`);
        }
    },
};
export default command;
