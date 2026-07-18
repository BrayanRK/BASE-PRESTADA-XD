import { Bot } from "../../bot.js";
import { BotPersistence } from "../../../libs/socket-manager.js";
import { markSocketStopped, normalizeSocketNumber } from "../../../libs/socket-manager.js";
import { sameUser } from "../../../libs/socket-manager.js";
import * as database from "../../../database/database.js";
const box = (title, lines) => [`╭─〔 ${title} 〕`, ...lines.map((line) => `│ ${line}`), "╰────────────"].join("\n");
const resolveTargetBotType = async (targetNumber, targetJid) => {
    const activeEntry = Array.from(Bot.bots.entries()).find(([jid, data]) => normalizeSocketNumber(jid || data.bot_jid) === targetNumber);
    if (activeEntry?.[1]?.bot_type)
        return activeEntry[1].bot_type;
    const persisted = await database.Bots.find(targetJid).catch(() => null);
    if (persisted?.bot_type)
        return persisted.bot_type;
    const sessions = await BotPersistence.loadBots().catch(() => []);
    const saved = sessions.find((item) => normalizeSocketNumber(item.bot_number || item.bot_jid) === targetNumber);
    return saved?.bot_type || "";
};
const command = {
    name: "stop",
    alias: ["stopbot", "pausarbot"],
    description: "Detiene tu socket (premium o free) sin borrar sesión.",
    category: "bot",
    flags: ["all.chats"],
    requires: ["bot.owner"],
    hidden: false,
    using: "[número opcional]",
    execute: async (_wss, { mctx, args, bot, userIsOwner }) => {
        const requested = normalizeSocketNumber(args[0] || bot.bot_jid || mctx.me.jids.pn);
        const current = normalizeSocketNumber(bot.bot_jid || mctx.me.jids.pn);
        const targetNumber = requested || current;
        if (!targetNumber) {
            await mctx.reply(box("DETENER SOCKET", ["Estado › número inválido"]));
            return;
        }
        const targetJid = `${targetNumber}@s.whatsapp.net`;
        // El chequeo de "es el bot principal" debe mirar al OBJETIVO (args[0] o el actual),
        // no al bot que recibe el mensaje. Si hablas con el bot oficial para detener un
        // subbot puntual, el objetivo es el subbot y esto debe funcionar igual.
        const targetType = await resolveTargetBotType(targetNumber, targetJid);
        if (targetType === "main") {
            await mctx.reply(box("DETENER SOCKET", [
                "Estado › comando solo para subbots (premium/free)",
                `Bot principal › @${targetNumber} no se detiene desde aquí`,
            ]));
            return;
        }
        if (targetNumber !== current && !userIsOwner) {
            await mctx.reply(box("DETENER SOCKET", ["Permiso › solo puedes detener tu propio socket"]));
            return;
        }
        const active = Array.from(Bot.bots.entries()).find(([jid, data]) => {
            const n = normalizeSocketNumber(jid || data.bot_jid);
            return n === targetNumber;
        });
        if (active?.[1]?.owner_jid && !sameUser(active[1].owner_jid, bot.owner_jid) && !userIsOwner) {
            await mctx.reply(box("DETENER SOCKET", ["Permiso › ese socket no te pertenece"]));
            return;
        }
        markSocketStopped(targetNumber);
        await BotPersistence.updateBotStatus(targetJid, false).catch(() => { });
        await mctx.reply(box("SOCKET DETENIDO", [
            `Bot › @${targetNumber}`,
            "Estado › detenido",
            "Sesión › guardada",
            "Activar › usa startbot número desde el oficial",
        ]));
        setTimeout(() => {
            try {
                active?.[1]?.wss && active[1].wss.end?.(undefined);
            }
            catch { }
            if (active)
                Bot.bots.delete(active[0]);
        }, 800);
    },
};
export default command;
