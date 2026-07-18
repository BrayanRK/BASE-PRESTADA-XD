import * as database from "../../../database/database.js";
import { getEffectiveBotJid } from "../../../libs/bot-scope.js";
import { secretSettingKey } from "../../../libs/secret.js";
const parseState = (value) => {
    const text = String(value || "").toLowerCase().trim();
    if (["on", "true", "1", "si", "sí", "activar", "enable"].includes(text))
        return true;
    if (["off", "false", "0", "no", "desactivar", "disable"].includes(text))
        return false;
    return null;
};
export default {
    name: "secret",
    alias: ["antiveruna", "antiviewonce"],
    description: "Activa o desactiva el uso del comando .ver para revelar mensajes de una sola vez.",
    category: "group",
    using: "on/off",
    flags: ["only.groups"],
    requires: ["administrator.user"],
    hidden: false,
    execute: async (wss, { mctx, args, bot, usedPrefix }) => {
        const state = parseState(args[0]);
        const botJid = getEffectiveBotJid(bot) || mctx.me.jids.lid || mctx.me.jids.pn;
        const key = secretSettingKey(mctx.chat.jid);
        if (state === null) {
            const current = await database.BotSettings.getBool(botJid, key, false);
            await mctx.reply(`「☄」 Secret\n│ Estado › ${current ? "on" : "off"}\n│ Uso › ${usedPrefix}secret on/off\n╰ Acción › habilita o bloquea el comando .ver`);
            return;
        }
        const saved = await database.BotSettings.setBool(botJid, key, state);
        if (!saved) {
            await mctx.reply("「☄」 Secret\n╰ Estado › no se pudo guardar en DB.");
            return;
        }
        await mctx.reply(`「☄」 Secret\n│ Estado › ${state ? "on" : "off"}\n╰ Acción › ${state ? "comando .ver habilitado" : "comando .ver deshabilitado"}`);
    },
};
