import * as database from "../../../database/database.js";
import { getScopedGroupJid } from "../../../libs/bot-scope.js";
const groupCard = (title, lines = []) => [`「☄」 ${title}`, ...lines.map((line) => `│ ${line}`)].join("\n");
export default {
    name: "welcomes",
    alias: ["bienvenidas", "welcome"],
    description: "Activa o desactiva las bienvenidas del grupo",
    using: "<on|off>",
    category: "group",
    hidden: false,
    flags: ["only.groups"],
    requires: ["administrator.user"],
    execute: async (_wss, { mctx, args, group, commandName, usedPrefix, bot }) => {
        const current = Boolean(group.welcomes_enabled);
        if (!args.length) {
            await mctx.reply(groupCard("Bienvenidas", [
                `Grupo › ${mctx.chat.name.trim()}`,
                `Estado › ${current ? "activadas" : "desactivadas"}`,
                "Función › mensaje al entrar un participante",
                `Uso › ${usedPrefix + commandName} ${current ? "off" : "on"}`,
            ]));
            return;
        }
        if (!/o(n|ff)/i.test(args[0])) {
            await mctx.reply(groupCard("Formato inválido.", [
                "Permitido › on / off",
                `Uso › ${usedPrefix + commandName} on`,
            ]));
            return;
        }
        const shouldEnable = /on/i.test(args[0]);
        if (current === shouldEnable) {
            await mctx.reply(groupCard("Sin cambios.", [
                "Función › bienvenidas",
                `Estado › ya estaba ${shouldEnable ? "activadas" : "desactivadas"}`,
            ]));
            return;
        }
        await database.Groups.update(getScopedGroupJid(bot, mctx.chat.jid), {
            $set: {
                welcomes_enabled: shouldEnable,
            },
        });
        await mctx.reply(groupCard("Ajuste actualizado.", [
            "Función › bienvenidas",
            `Estado › ${shouldEnable ? "activadas" : "desactivadas"}`,
        ]));
    },
};
