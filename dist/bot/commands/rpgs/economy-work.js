import { getConnection } from "../../../database/connect.js";
import * as libs from "../../../libs/libs.js";
import { cooldownMessage, formatMoney, getCurrency, getGroupUser, randomInt } from "../../../libs/economy.js";
import { getScopedGroupJid } from "../../../libs/bot-scope.js";
const command = {
    name: "work",
    alias: ["w"],
    description: "Ganar {currency} trabajando. Ganas aprox. 1,000 a 5,000.",
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
        const workingInterval = 600_000;
        const timeDifference = now - (groupUser.last_work_ago || 0);
        if (timeDifference < workingInterval) {
            await mctx.reply(cooldownMessage(usedPrefix, "work", libs.formatDuration(workingInterval - timeDifference)));
            return;
        }
        const messages = [
            "Trabajaste en una mina y ganaste",
            "Recolectaste hierbas raras y las vendiste por",
            "Luchaste contra bandidos y te pagaron",
            "Ayudaste en una herrería y recibiste",
            "Vendiste pociones mágicas y obtuviste",
            "Fuiste escolta de un mercader y te pagaron",
            "Repartiste pedidos por la ciudad y ganaste",
            "Cuidaste el ganado del pueblo y te pagaron",
            "Reparaste un techo y te dieron",
            "Lavaste autos todo el día y juntaste",
            "Hiciste de mesero en una taberna y ganaste",
            "Cortaste leña en el bosque y vendiste por",
            "Pescaste en el río y vendiste lo capturado por",
            "Cuidaste niños del vecindario y te pagaron",
            "Pintaste una casa entera y recibiste",
            "Arreglaste computadoras del barrio y cobraste",
            "Hiciste delivery en bicicleta y ganaste",
            "Trabajaste de guardia nocturno y te pagaron",
            "Vendiste artesanías en la plaza y obtuviste",
            "Cosechaste el campo todo el día y ganaste",
            "Hiciste de guía turístico y te dieron de propina",
            "Lavaste platos en un restaurante y ganaste",
            "Repartiste volantes publicitarios y cobraste",
            "Cuidaste una tienda mientras el dueño salía y te pagaron",
            "Ayudaste a mudar muebles y recibiste",
            "Hiciste un trabajo de jardinería y te pagaron",
            "Diste clases particulares y cobraste",
            "Trabajaste en la construcción y ganaste",
            "Vendiste comida casera y obtuviste",
            "Hiciste reparaciones eléctricas y cobraste",
            "Cuidaste mascotas del vecindario y te pagaron",
            "Trabajaste como cajero por unas horas y ganaste",
            "Ayudaste a cargar camiones y te pagaron",
            "Hiciste de fotógrafo en un evento y cobraste",
            "Vendiste boletos en la feria y ganaste",
            "Trabajaste limpiando oficinas y recibiste",
            "Hiciste entregas urgentes en moto y ganaste",
            "Atendiste un puesto de comida y ganaste",
            "Ayudaste en la cosecha de uvas y te pagaron",
            "Hiciste mantenimiento de jardines y cobraste",
            "Trabajaste de barbero por el día y ganaste",
            "Vendiste flores en el mercado y obtuviste",
            "Hiciste reparaciones de plomería y cobraste",
            "Cuidaste un estacionamiento y te pagaron",
            "Trabajaste lavando ropa ajena y ganaste",
            "Ayudaste a organizar un evento y te pagaron",
            "Hiciste de DJ en una fiesta y cobraste",
            "Vendiste software básico a un cliente y ganaste",
            "Trabajaste haciendo encuestas y te pagaron",
            "Repartiste el periódico al amanecer y ganaste",
        ];
        const reward = randomInt(1000, 5000);
        try {
            const conn = getConnection();
            conn.run(`UPDATE group_users SET money = money + ?, last_work_ago = ? WHERE group_jid = ? AND user_jid = ?`, [reward, now, scopedGroupJid, mctx.sender.jid]);
            await mctx.reply(`✦ ${libs.pickRandom(messages)} *${formatMoney(reward, currency)}*.`);
        }
        catch (error) {
            console.error("[Work] Error:", error);
            await mctx.reply(`「◈」 Error al procesar el trabajo.`);
        }
    },
};
export default command;
