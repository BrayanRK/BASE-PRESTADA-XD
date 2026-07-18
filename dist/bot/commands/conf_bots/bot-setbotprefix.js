import * as database from "../../../database/database.js";
import { normalizePrefixes, updateUniversalConfig } from "../../../libs/zeta_cf.js";
import { canConfigureSocket, denyFreeConfigMessage, socketConfigOnlyMessage, socketUsage } from "../../../libs/socket-manager.js";
const command = {
    name: "setbotprefix",
    alias: ["setprefix", "setprefixes", "setprefijo", "setprefijos", "setbotprefijo"],
    description: "Cambiar prefijos propios del bot",
    category: "bot",
    hidden: false,
    requires: ["bot.owner"],
    flags: ["all.chats"],
    using: "[prefijos]",
    execute: async (_wss, { mctx, args, bot, userIsBotOwner }) => {
        if (String(bot.bot_type) === "free") {
            await mctx.reply(denyFreeConfigMessage());
            return;
        }
        if (!userIsBotOwner && !canConfigureSocket(mctx.sender.jid, bot)) {
            await mctx.reply(socketConfigOnlyMessage());
            return;
        }
        const prefixes = normalizePrefixes(args.join(" ").replace(/[,_|]+/g, " ").replace(/\n+/g, " "));
        if (!prefixes.length) {
            await mctx.reply(socketUsage("Set Prefix", [
                `Uso 》 ${mctx.message.text?.charAt(0) || "."}setprefix .`,
                `Uso 》 #setprefix . # !`,
                "Nota 》 quedan guardados solo para este bot.",
            ]));
            return;
        }
        const uniquePrefixes = prefixes.slice(0, 20);
        await database.Bots.update(bot.bot_jid || mctx.me.jids.lid || mctx.me.jids.pn, {
            $set: {
                prefixes: uniquePrefixes.join(" "),
            },
        });
        if (String(bot.bot_type) === "main") {
            try {
                updateUniversalConfig({ setup: { prefixes: uniquePrefixes } });
            }
            catch { }
        }
        await mctx.reply(`「◈」 Prefijos del bot\n◈ Bot 》 ${bot.name || "Socket"}\n◈ Prefijos 》 ${uniquePrefixes.join(" ")}\n◈ Estado 》 guardado solo para este socket`);
    },
};
export default command;
