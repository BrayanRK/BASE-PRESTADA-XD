import * as database from "../../../database/database.js";
import { getScopedGroupJid } from "../../../libs/bot-scope.js";
const parseState = (value) => {
    const text = String(value || "").toLowerCase().trim();
    if (["on", "true", "1", "si", "sí", "activar", "enable"].includes(text))
        return true;
    if (["off", "false", "0", "no", "desactivar", "disable"].includes(text))
        return false;
    return null;
};
const command = {
    name: "muteall",
    alias: ["botdead", "silencioall", "deadgroup"],
    description: "Apaga por completo el bot en este grupo hasta que el owner lo reactive.",
    category: "moderation",
    hidden: false,
    flags: ["only.groups"],
    requires: ["bot.owner"],
    using: "on/off",
    execute: async (_, { mctx, args, group, bot, userIsPrimaryBotOwner }) => {
        if (!userIsPrimaryBotOwner)
            return void await mctx.reply("「✖」 Solo owner.");
        const requested = parseState(args[0]);
        const shouldEnable = requested ?? !group.mute_all_enabled;
        if (requested === null && args[0])
            return void await mctx.reply("「✖」 Usa on/off.");
        if (Boolean(group.mute_all_enabled) === shouldEnable) {
            return void await mctx.reply(`「✓」 Muteall ya estaba ${shouldEnable ? "activo" : "desactivado"}.`);
        }
        await database.Groups.update(getScopedGroupJid(bot, mctx.chat.jid), {
            $set: { mute_all_enabled: shouldEnable },
        });
        await mctx.reply(`「✓」 Muteall ${shouldEnable ? "activo" : "desactivado"}.`);
    },
};
export default command;
