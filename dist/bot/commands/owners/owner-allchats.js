import * as database from "../../../database/database.js";
import { jidNumber } from "../../../libs/socket-manager.js";
import { getEffectiveBotJid } from "../../../libs/bot-scope.js";
const parseState = (value) => {
    const text = String(value || "").toLowerCase().trim();
    if (["on", "true", "1", "si", "sí", "activar", "enable"].includes(text))
        return true;
    if (["off", "false", "0", "no", "desactivar", "disable"].includes(text))
        return false;
    return null;
};
const command = {
    name: "allchats",
    alias: ["allchat", "modochats", "generalchats"],
    description: "Activa o desactiva comandos en chats privados/general",
    category: "owner",
    hidden: false,
    flags: ["only.groups"],
    requires: ["bot.owner"],
    using: "on/off",
    execute: async (wss, { mctx, args, bot, usedPrefix, userIsPrimaryBotOwner }) => {
        if (!userIsPrimaryBotOwner) {
            await mctx.reply(`*｢✧｣* Solo el owner principal/oficial del bot puede cambiar el modo general.`);
            return;
        }
        const state = parseState(args[0]);
        const botJid = getEffectiveBotJid(bot) || mctx.me.jids.lid || mctx.me.jids.pn;
        if (state === null) {
            const current = await database.BotSettings.getBool(botJid, "allchats_enabled", false);
            await mctx.reply(`「◈」 All Chats\n◈ Estado › ${current ? "on" : "off"}\n◈ Uso › ${usedPrefix}allchats on/off\n◈ Bot › @${jidNumber(botJid)}`);
            return;
        }
        const saved = await database.BotSettings.setBool(botJid, "allchats_enabled", state);
        if (!saved) {
            await mctx.reply(`「◈」 All Chats\n◈ Estado › no se pudo guardar en DB.`);
            return;
        }
        await mctx.reply(`「◈」 All Chats\n◈ Estado › ${state ? "on" : "off"}\n◈ Bot › @${jidNumber(botJid)}\n◈ Modo › ${state ? "comandos generales permitidos" : "por defecto solo grupos"}`);
    },
};
export default command;
