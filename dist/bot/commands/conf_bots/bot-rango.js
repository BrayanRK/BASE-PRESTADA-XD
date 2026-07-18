import * as database from "../../../database/database.js";
import { jidDigits, isValidPhoneNumber } from "../../../libs/lid-resolver.js";
const socketCard = (title, lines) => {
    return [`「✧」 ${title}`, ...lines.map((line) => `│ ${line}`)].join("\n");
};
const RANKS = ["main", "premium"];
const command = {
    name: "rango",
    alias: ["jerarquia", "setrango"],
    description: "Registra qué bots (main/premium) deben tener prioridad sobre este, aunque corran en otro servidor/contenedor.",
    category: "bot",
    flags: ["all.chats"],
    requires: ["bot.owner"],
    hidden: false,
    using: "<main|premium|quitar|lista> <número>",
    execute: async (_wss, { mctx, args, usedPrefix }) => {
        const sub = String(args[0] || "").toLowerCase();
        if (sub === "lista" || sub === "list") {
            const registered = await database.Bots.listByType(RANKS);
            if (!registered.length) {
                await mctx.reply(socketCard("JERARQUÍA DE BOTS", ["No hay bots registrados todavía.", `Uso › ${usedPrefix}rango main 595981902212`]));
                return;
            }
            const lines = registered.map((b) => `${b.bot_type === "main" ? "👑" : "⭐"} ${b.bot_type} › @${(b.bot_jid || "").split("@")[0]}`);
            await mctx.reply(socketCard("JERARQUÍA DE BOTS REGISTRADA", lines));
            return;
        }
        if (sub === "quitar" || sub === "remove" || sub === "del") {
            const digits = jidDigits(args[1]);
            if (!isValidPhoneNumber(digits)) {
                await mctx.reply(socketCard("JERARQUÍA DE BOTS", [`Uso › ${usedPrefix}rango quitar 595981902212`]));
                return;
            }
            const jid = `${digits}@s.whatsapp.net`;
            const removed = await database.Bots.remove(jid);
            await mctx.reply(socketCard("JERARQUÍA DE BOTS", [removed ? `Quitado › @${digits}` : `No estaba registrado › @${digits}`]));
            return;
        }
        if (sub !== "main" && sub !== "premium") {
            await mctx.reply(socketCard("JERARQUÍA DE BOTS", [
                `Uso › ${usedPrefix}rango main 595981902212`,
                `Uso › ${usedPrefix}rango premium 595981902212`,
                `Uso › ${usedPrefix}rango quitar 595981902212`,
                `Uso › ${usedPrefix}rango lista`,
                "",
                "Esto le dice a ESTE bot que ese número manda por encima de él,",
                "aunque corra en otro servidor/contenedor. No hace falta tocar .env.",
            ]));
            return;
        }
        const digits = jidDigits(args[1]);
        if (!isValidPhoneNumber(digits)) {
            await mctx.reply(socketCard("JERARQUÍA DE BOTS", [`Uso › ${usedPrefix}rango ${sub} 595981902212`]));
            return;
        }
        const jid = `${digits}@s.whatsapp.net`;
        await database.Bots.set(jid, { bot_jid: jid, bot_type: sub });
        await mctx.reply(socketCard("JERARQUÍA DE BOTS", [
            `Registrado › @${digits}`,
            `Rango › ${sub}`,
            "Este bot ahora se callará en los grupos donde ese número esté presente.",
        ]));
    },
};
export default command;
