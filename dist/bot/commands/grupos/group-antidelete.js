import * as database from "../../../database/database.js";
import { getScopedGroupJid } from "../../../libs/bot-scope.js";
const groupCard = (title, lines = []) => [`「◈」 ${title}`, ...lines.map((line) => `│ ${line}`)].join("\n");
const parseState = (value) => {
    const text = String(value || "").toLowerCase().trim();
    if (["on", "true", "1", "si", "sí", "activar", "enable"].includes(text))
        return true;
    if (["off", "false", "0", "no", "desactivar", "disable"].includes(text))
        return false;
    return null;
};
export default {
    name: "antidelete",
    alias: ["antiborrado", "antiborrar"],
    description: "Activa o desactiva el anti delete del grupo.",
    using: "<on|off>",
    category: "group",
    hidden: false,
    flags: ["only.groups"],
    requires: ["administrator.user"],
    execute: async (_wss, { mctx, args, group, commandName, usedPrefix, bot }) => {
        const current = Boolean(group.antidelete_enabled);
        if (!args.length) {
            await mctx.reply(groupCard("Anti Delete", [
                `Grupo › ${mctx.chat.name.trim()}`,
                `Estado › ${current ? "activado" : "desactivado"}`,
                `Uso › ${usedPrefix + commandName} ${current ? "off" : "on"}`,
            ]));
            return;
        }
        if (parseState(args[0]) === null) {
            await mctx.reply(groupCard("Formato inválido.", [
                "Permitido › on / off",
                `Uso › ${usedPrefix + commandName} on`,
            ]));
            return;
        }
        const shouldEnable = parseState(args[0]);
        if (current === shouldEnable) {
            await mctx.reply(groupCard("Sin cambios.", [
                "Función › anti delete",
                `Estado › ya estaba ${shouldEnable ? "activado" : "desactivado"}`,
            ]));
            return;
        }
        await database.Groups.update(getScopedGroupJid(bot, mctx.chat.jid), {
            $set: {
                antidelete_enabled: shouldEnable,
            },
        });
        await mctx.reply(groupCard("Ajuste actualizado.", [
            "Función › anti delete",
            `Estado › ${shouldEnable ? "activado" : "desactivado"}`,
        ]));
    },
};
