import { PremiumManager } from "../../../libs/socket-manager.js";
import { canManagePremiumTokens, denyFreeSocketMessage, socketOwnerOnlyMessage } from "../../../libs/socket-manager.js";
import { box as sharedBox } from "../../../libs/zeta_texto.js";
const box = (lines) => sharedBox("TOKEN PREMIUM", lines);
const parseMonths = (args) => {
    const found = args.find((arg) => /^\d{1,2}$/.test(String(arg || "").trim()));
    const months = Number(found || 1);
    if (!Number.isFinite(months) || months <= 0)
        return 1;
    return Math.min(24, Math.floor(months));
};
const command = {
    name: "getprem",
    alias: ["token"],
    description: "Genera un token premium por meses.",
    category: "premb",
    flags: ["all.chats"],
    requires: ["bot.owner"],
    hidden: false,
    using: "[meses]",
    execute: async (wss, { mctx, args, bot, usedPrefix }) => {
        if (String(bot.bot_type) === "free") {
            await mctx.reply(denyFreeSocketMessage());
            return;
        }
        if (!canManagePremiumTokens(mctx.sender.jid, bot)) {
            await mctx.reply(socketOwnerOnlyMessage());
            return;
        }
        try {
            await mctx.react("⏳");
            const months = parseMonths(args);
            const code = await PremiumManager.createCode(mctx.sender.jid, months);
            const message = box([
                `Token › \`${code}\``,
                `Vigencia › ${months} mes${months === 1 ? "" : "es"}`,
                `Generado por › @${mctx.sender.jid.split("@")[0]}`,
                `QR › ${usedPrefix}qrpremium ${code}`,
                `Código › ${usedPrefix}codepremium ${code} <número>`,
            ]);
            await wss.sendMessage(mctx.chat.jid, {
                text: message,
                mentions: [mctx.sender.jid],
            }, {
                quoted: mctx.message.original,
            });
            await mctx.react("✅");
        }
        catch (error) {
            await mctx.react("❌");
            await mctx.reply(box([`Estado › error`, `Motivo › ${error?.message || error}`]));
        }
    },
};
export default command;
