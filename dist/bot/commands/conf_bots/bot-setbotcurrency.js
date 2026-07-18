import * as database from "../../../database/database.js";
import { canConfigureSocket, denyFreeConfigMessage, socketConfigOnlyMessage, socketUsage } from "../../../libs/socket-manager.js";
export default {
    name: "setbotcurrency",
    alias: [],
    description: "Cambiar la moneda del bot",
    category: "bot",
    hidden: false,
    requires: ["bot.owner"],
    flags: ["all.chats"],
    using: "[nombre]",
    execute: async (_, { mctx, args, bot, userIsBotOwner }) => {
        if (String(bot.bot_type) === "free") {
            await mctx.reply(denyFreeConfigMessage());
            return;
        }
        if (!userIsBotOwner && !canConfigureSocket(mctx.sender.jid, bot)) {
            await mctx.reply(socketConfigOnlyMessage());
            return;
        }
        if (!args.length) {
            await mctx.reply(socketUsage("Set Currency", [`Uso 》 #setbotcurrency Coins`, `Uso 》 #setbotcurrency yenes`]));
            return;
        }
        const text = args.join(" ").trim();
        if (text.length > 20) {
            await mctx.reply("*｢✧｣* La moneda no debe superar los 20 caracteres.");
            return;
        }
        await database.Bots.update(bot.bot_jid || mctx.me.jids.lid, { $set: { currency: text } });
        await mctx.reply(`「◈」 Moneda\n◈ Nueva 》 ${text}\n◈ Estado 》 actualizada`);
    },
};
