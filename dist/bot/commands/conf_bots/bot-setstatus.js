import * as database from "../../../database/database.js";
import { canConfigureSocket, denyFreeConfigMessage, socketConfigOnlyMessage, socketUsage } from "../../../libs/socket-manager.js";
const command = {
    name: "setstatus",
    alias: [],
    description: "Cambiar el estado del bot",
    category: "bot",
    hidden: false,
    requires: ["bot.owner"],
    flags: ["all.chats"],
    using: "[estado]",
    execute: async (wss, { mctx, args, bot, userIsBotOwner, usedPrefix }) => {
        if (String(bot.bot_type) === "free") {
            await mctx.reply(denyFreeConfigMessage());
            return;
        }
        if (!userIsBotOwner && !canConfigureSocket(mctx.sender.jid, bot)) {
            await mctx.reply(socketConfigOnlyMessage());
            return;
        }
        const _raw = mctx.message.text || "";
        const _cmd = `${usedPrefix}setstatus`;
        const _idx = _raw.toLowerCase().indexOf(_cmd.toLowerCase());
        const status = (_idx >= 0 ? _raw.slice(_idx + _cmd.length).replace(/^[ \t]/, "").trimEnd() : args.join(" ").trim());
        if (!status) {
            await mctx.reply(socketUsage("Set Status", [`Uso 》 #setstatus Trabajando 24/7`]));
            return;
        }
        try {
            await wss.updateProfileStatus(status);
        }
        catch { }
        await database.Bots.update(bot.bot_jid || mctx.me.jids.lid, { $set: { status } });
        await mctx.reply(`「◈」 Estado\n◈ Nuevo 》 ${status}\n◈ Estado 》 actualizado`);
    },
};
export default command;
