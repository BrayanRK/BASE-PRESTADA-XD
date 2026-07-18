import { PremiumManager } from "../../../libs/socket-manager.js";
const command = {
    name: "myprem",
    alias: ["mitoken"],
    description: "Muestra información de tus códigos premium",
    category: "premb",
    flags: ["all.chats"],
    requires: [],
    hidden: false,
    execute: async (wss, { mctx }) => {
        try {
            await mctx.react("⏳");
            const premiumInfo = await PremiumManager.getUserPremiumInfo(mctx.sender.jid);
            if (!premiumInfo.length) {
                await mctx.react("❌");
                await mctx.reply("*｢✧｣* No tienes códigos premium activos");
                return;
            }
            let message = `*｢❀｣* Tus Códigos Premium\n\n`;
            for (let i = 0; i < premiumInfo.length; i++) {
                const prem = premiumInfo[i];
                message += `*${i + 1}.* Código: \`${prem.code}\`\n`;
                message += `> *✦* Bot: ${prem.bot_number ? `@${prem.bot_number}` : "Sin asignar"}\n`;
                message += `> *✦* Duración: permanente\n`;
                message += `> *✦* Backup: activo al vincular socket\n`;
                message += `> *✦* Estado: ✅ Activo\n\n`;
            }
            await wss.sendMessage(mctx.chat.jid, {
                text: message,
                mentions: premiumInfo.filter((p) => p.bot_number).map((p) => `${p.bot_number}@s.whatsapp.net`),
            }, {
                quoted: mctx.message.original,
            });
            await mctx.react("✅");
        }
        catch (error) {
            await mctx.react("❌");
            await mctx.reply(`*｢✧｣* Error: ${error.message}`);
        }
    },
};
export default command;
