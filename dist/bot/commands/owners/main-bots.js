import * as bot from "../../bot.js";
export default {
    name: "bots",
    alias: ["sockets"],
    description: "Ver sockets activos actualmente.",
    flags: ["all.chats"],
    requires: [],
    hidden: true,
    category: "bot",
    execute: async (_, { mctx }) => {
        const counts = {
            main: 0,
            premium: 0,
            free: 0,
        };
        bot.Bot.bots.forEach((v) => {
            counts[v.bot_type]++;
        });
        let message = `「♛」 Sockets\n`;
        message += `│ Total › ${bot.Bot.bots.size.toLocaleString("en-US")}\n`;
        message += `│ Oficiales › ${counts.main.toLocaleString("en-US")}\n`;
        message += `│ Premium › ${counts.premium.toLocaleString("en-US")}\n`;
        message += `╰ Gratis › ${counts.free.toLocaleString("en-US")}`;
        await mctx.reply(message);
    },
};
