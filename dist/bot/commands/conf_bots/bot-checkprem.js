import { PremiumManager } from "../../../libs/socket-manager.js";
import { canManagePremiumTokens, denyFreeSocketMessage, socketOwnerOnlyMessage } from "../../../libs/socket-manager.js";
const command = {
    name: "checkprem",
    alias: ["ctoken"],
    description: "Verifica el estado premium de un bot",
    category: "premb",
    flags: ["all.chats"],
    requires: ["bot.owner"],
    hidden: false,
    execute: async (wss, { mctx, args, bot }) => {
        if (String(bot.bot_type) === "free") {
            await mctx.reply(denyFreeSocketMessage());
            return;
        }
        if (!canManagePremiumTokens(mctx.sender.jid, bot)) {
            await mctx.reply(socketOwnerOnlyMessage());
            return;
        }
        if (!args.length) {
            await mctx.reply("*｢✧｣* Ingresa el número del bot\n\nEjemplo: /checkprem 000000000000");
            return;
        }
        const botNumber = args[0].replace(/[^0-9]/g, "");
        if (!botNumber) {
            await mctx.reply("*｢✧｣* Ingresa un número válido");
            return;
        }
        try {
            await mctx.react("⏳");
            const isActive = await PremiumManager.isPremiumActive(botNumber);
            if (isActive) {
                await mctx.react("✅");
                await mctx.reply(`*｢❀｣* Estado Premium\n\n> *✦* Bot › @${botNumber}\n> *✦* Estado › ✅ *Activo*\n> *✦* El bot tiene premium permanente`);
            }
            else {
                await mctx.react("❌");
                await mctx.reply(`*｢✧｣* Estado Premium\n\n> *✦* Bot › @${botNumber}\n> *✦* Estado › ❌ *Inactivo*\n> *✦* El bot no tiene premium activo`);
            }
        }
        catch (error) {
            await mctx.react("❌");
            await mctx.reply(`*｢✧｣* Error: ${error.message}`);
        }
    },
};
export default command;
