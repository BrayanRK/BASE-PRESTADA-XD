import { PremiumManager } from "../../../libs/socket-manager.js";
import { canManagePremiumTokens, denyFreeSocketMessage, socketOwnerOnlyMessage } from "../../../libs/socket-manager.js";
import { box } from "../../../libs/zeta_texto.js";
const command = {
    name: "delprem",
    alias: ["deltoken", "delsocket", "deletesocket", "delsock"],
    description: "Elimina totalmente un socket del sistema.",
    category: "premb",
    flags: ["all.chats"],
    requires: ["bot.owner"],
    hidden: false,
    using: "<número>",
    execute: async (_wss, { mctx, args, bot, usedPrefix }) => {
        if (String(bot.bot_type) === "free") {
            await mctx.reply(denyFreeSocketMessage());
            return;
        }
        if (!canManagePremiumTokens(mctx.sender.jid, bot)) {
            await mctx.reply(socketOwnerOnlyMessage());
            return;
        }
        if (!args.length) {
            await mctx.reply(box("BORRAR SOCKET", [`Uso › ${usedPrefix}delsocket 595xxxxxxxx`, "Acción › borra sesión, token, backup y registro"]));
            return;
        }
        const botNumber = args[0].replace(/[^0-9]/g, "");
        if (!botNumber) {
            await mctx.reply(box("BORRAR SOCKET", ["Estado › número inválido", `Uso › ${usedPrefix}delsocket 595xxxxxxxx`]));
            return;
        }
        try {
            await mctx.react("⏳");
            const result = await PremiumManager.deleteSocket(botNumber);
            if (!result.success) {
                await mctx.react("❌");
                await mctx.reply(box("BORRAR SOCKET", [`Bot › @${botNumber}`, `Estado › ${result.message}`]));
                return;
            }
            await mctx.react("✅");
            await mctx.reply(box("SOCKET ELIMINADO", [
                `Bot › @${botNumber}`,
                "Sesión › eliminada",
                "Token › desactivado",
                "Backup › eliminado",
                "Registro › limpiado",
            ]));
        }
        catch (error) {
            await mctx.react("❌");
            await mctx.reply(box("BORRAR SOCKET", [`Estado › error`, `Motivo › ${error?.message || error}`]));
        }
    },
};
export default command;
