import { extractInviteCode, socketUsage } from "../../../libs/socket-manager.js";
const command = {
    name: "join",
    alias: [],
    description: "Unir al bot a un grupo",
    category: "bot",
    hidden: false,
    requires: ["bot.owner"],
    flags: ["all.chats"],
    using: "[Invitacion]",
    execute: async (wss, { mctx, args }) => {
        const inviteCode = extractInviteCode(args.join(" "));
        if (!inviteCode) {
            await mctx.reply(socketUsage("Join", [`Uso 》 #join <link de invitación>`]));
            return;
        }
        try {
            const groupJid = await wss.groupAcceptInvite(inviteCode);
            await mctx.reply(`「◈」 Join\n◈ Estado 》 unido correctamente\n◈ Grupo 》 ${groupJid || "aceptado"}`);
        }
        catch (error) {
            await mctx.reply(`「◈」 Join\n◈ Estado 》 no pude unirme\n◈ Error 》 ${error?.message || error}`);
        }
    },
};
export default command;
