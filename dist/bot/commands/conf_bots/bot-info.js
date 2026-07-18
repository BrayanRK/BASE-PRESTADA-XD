import * as botRuntime from "../../bot.js";
import * as libs from "../../../libs/libs.js";
const command = {
    name: "botinfo",
    alias: ["infobot"],
    description: "Obtener informacion del bot",
    category: "bot",
    hidden: false,
    requires: [],
    flags: ["all.chats"],
    execute: async (_, { mctx, bot, usedPrefix }) => {
        const active = botRuntime.Bot.bots.size;
        const owner = bot.owner_jid ? `@${bot.owner_jid.split("@")[0]}` : "sin owner";
        let text = `「⚙」 Bot Info\n`;
        text += `│ Nombre › ${bot.name || mctx.me.name}\n`;
        text += `│ Tipo › ${libs.getBotType(bot.bot_type)}\n`;
        text += `│ Owner › ${owner}\n`;
        text += `│ Moneda › ${bot.currency || "Coins"}\n`;
        text += `│ Autojoin › ${bot.autojoin_enabled ? "activado" : "desactivado"}\n`;
        text += `│ Sockets › ${active.toLocaleString("en-US")} conectados\n`;
        text += `╰ Prefijo › ${usedPrefix}`;
        await mctx.reply(text);
    },
};
export default command;
