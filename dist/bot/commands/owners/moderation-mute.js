import { getBotOwnerIdentityJids } from "../../../libs/socket-manager.js";
import { getBotScopeJid, getTargetJids, muteUserMany, refreshGroupMetadata, resolveGroupActionTarget, sameIdentity, } from "../../../libs/lucasxt-moderation.js";
export default {
    name: "mute",
    alias: ["castigar"],
    description: "Borra todo lo que escriba un usuario castigado.",
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
        const identities = resolved.jids.length ? resolved.jids : targets;
        if (identities.some((jid) => sameIdentity(jid, mctx.sender.jid)))
            return void await mctx.reply("「✖」 No puedes mutearte.");
        if (identities.some((jid) => getBotOwnerIdentityJids(bot).some((ownerJid) => sameIdentity(jid, ownerJid)) || sameIdentity(jid, bot.bot_jid))) {
            return void await mctx.reply("「✖」 Usuario protegido.");
        }
        await muteUserMany(getBotScopeJid(bot, mctx), mctx.chat.jid, identities);
        await mctx.reply("「✓」 Usuario muteado.");
    },
};
