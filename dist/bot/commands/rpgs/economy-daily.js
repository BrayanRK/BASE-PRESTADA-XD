import { getConnection } from "../../../database/connect.js";
import * as libs from "../../../libs/libs.js";
import { cooldownMessage, formatMoney, getCurrency, getGroupUser, randomInt } from "../../../libs/economy.js";
import { getScopedGroupJid } from "../../../libs/bot-scope.js";
const dailyTitles = [
    "Reclamaste tu recompensa diaria", "El sistema te premió por volver hoy", "Recibiste tu bono diario", "Cobraste tu paga del día",
    "Recogiste tu recompensa de cada día", "Te llevaste el premio diario", "Tu constancia fue recompensada hoy", "Recibiste tu sueldo diario",
    "El bot te premió por tu visita diaria", "Cobraste tu incentivo diario", "Recibiste tu bono por entrar hoy", "Tu recompensa diaria llegó a tiempo",
    "Te llevaste el regalo del día", "Cobraste tu paga de hoy", "El sistema reconoció tu constancia hoy", "Recibiste tu propina diaria",
    "Tu lealtad diaria fue recompensada", "Cobraste tu bono de asistencia", "Recibiste tu pago por seguir activo", "Reclamaste tu regalo de cada día",
    "Tu visita de hoy generó tu recompensa", "Activaste tu bono diario", "El día de hoy trajo tu recompensa", "Recibiste el pago por tu constancia diaria",
    "Tu rutina diaria fue recompensada", "Cobraste el incentivo de hoy", "Reclamaste el regalo que te corresponde hoy", "Tu esfuerzo diario tuvo su pago",
    "El sistema liberó tu recompensa de hoy", "Cobraste tu cuota diaria",
];
const dailyClosings = [
    "Vuelve mañana y reclama más.", "No olvides volver mañana.", "Sigue así y reclama mañana de nuevo.",
    "Mañana podrás reclamar otra vez.", "Vuelve en 24 horas por más.", "Tu próxima recompensa estará lista mañana.",
];
const command = {
    name: "daily",
    alias: [],
    description: "Reclamar tu recompensa diaria. Ganas aprox. 2,500 a 6,500.",
    category: "economy",
    hidden: false,
    flags: ["only.groups"],
    requires: [],
    execute: async (_, { mctx, group, bot, usedPrefix }) => {
        const currency = getCurrency(bot);
        const scopedGroupJid = getScopedGroupJid(bot, mctx.chat.jid);
        const groupUser = getGroupUser(group, mctx.sender.jid);
        if (!groupUser) {
            await mctx.reply(`「◈」 No se pudo obtener tus datos en este grupo, vuelve a intentarlo.`);
            return;
        }
        const now = Date.now();
        const dailyInterval = 86_400_000;
        const timeDifference = now - (groupUser.last_daily_ago || 0);
        if (timeDifference < dailyInterval) {
            await mctx.reply(cooldownMessage(usedPrefix, "daily", libs.formatDuration(dailyInterval - timeDifference)));
            return;
        }
        const reward = randomInt(2500, 6500);
        try {
            const conn = getConnection();
            conn.run(`UPDATE group_users SET money = money + ?, last_daily_ago = ? WHERE group_jid = ? AND user_jid = ?`, [reward, now, scopedGroupJid, mctx.sender.jid]);
            const message = `「◈」 ${libs.pickRandom(dailyTitles)}\n` +
                `⟡ Has reclamado » *${formatMoney(reward, currency)}*\n` +
                `⟡ ${libs.pickRandom(dailyClosings)}\n` +
                `⟡ Sigue así.`;
            await mctx.reply(message);
        }
        catch (error) {
            console.error("[Daily] Error:", error);
            await mctx.reply(`「◈」 Error al procesar la recompensa diaria.`);
        }
    },
};
export default command;
