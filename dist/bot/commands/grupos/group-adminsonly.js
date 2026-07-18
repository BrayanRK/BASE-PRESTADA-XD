import * as database from "../../../database/database.js";
import { getScopedGroupJid } from "../../../libs/bot-scope.js";
const groupCard = (title, lines = []) => [`「☄」 ${title}`, ...lines.map((line) => `│ ${line}`)].join("\n");
export default {
    name: "adminsonly",
    alias: ["onlyadmins"],
    description: "Activa o desactiva el modo solo administradores del grupo",
    using: "<on|off>",
    category: "group",
    hidden: false,
    flags: ["only.groups"],
    requires: ["administrator.user"],
    execute: async (_wss, { mctx, args, group, commandName, usedPrefix, bot }) => {
        const current = Boolean(group.admins_only_enabled);
        if (!args.length) {
            await mctx.reply(groupCard("Solo Administradores", [
                `Grupo › ${mctx.chat.name.trim()}`,
                `Estado › ${current ? "activado" : "desactivado"}`,
                "Función › solo admins pueden usar comandos",
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
                "Función › modo solo administradores",
                `Estado › ya estaba ${shouldEnable ? "activado" : "desactivado"}`,
            ]));
            return;
        }
        await database.Groups.update(getScopedGroupJid(bot, mctx.chat.jid), {
            $set: {
                admins_only_enabled: shouldEnable,
            },
        });
        await mctx.reply(groupCard("Ajuste actualizado.", [
            "Función › modo solo administradores",
            `Estado › ${shouldEnable ? "activado" : "desactivado"}`,
        ]));
    },
};
