import { getBotScopeJid, getTargetJids, refreshGroupMetadata, resolveGroupActionTarget, unmuteUserMany, } from "../../../libs/lucasxt-moderation.js";
export default {
    name: "unmute",
    alias: ["desmute", "perdonar"],
    description: "Quita el castigo de borrado automático.",
    using: "@usuario",
    category: "moderation",
    hidden: false,
    flags: ["only.groups"],
    requires: ["administrator", "administrator.user"],
    execute: async (wss, { mctx, args, bot, groupMetadata }) => {
        const targets = getTargetJids(mctx, args);
        if (!targets.length)
            return void await mctx.reply("「✖」 Menciona o responde un usuario.");
        const metadata = await refreshGroupMetadata(wss, mctx.chat.jid, groupMetadata);
        const resolved = await resolveGroupActionTarget(wss, metadata, targets);
        await unmuteUserMany(getBotScopeJid(bot, mctx), mctx.chat.jid, resolved.jids.length ? resolved.jids : targets);
        await mctx.reply("「✓」 Usuario desmuteado.");
    },
};
