import { getBotOwnerIdentityJids } from "../../../libs/socket-manager.js";
import * as database from "../../../database/database.js";
import { getBotScopeJid, getTargetJids, isUserAdminInMetadata, refreshGroupMetadata, resolveGroupActionTarget, sameIdentity, } from "../../../libs/lucasxt-moderation.js";
const tryGroupUpdate = async (wss, groupJid, jids, action) => {
    const targets = Array.from(new Set(jids.filter(Boolean)));
    for (const jid of targets) {
        try {
            await wss.groupParticipantsUpdate(groupJid, [jid], action);
            return true;
        }
        catch (error) {
            console.log(`[${action}] falló con ${jid}:`, error?.message || error);
        }
    }
    return false;
};
export default {
    name: "kick",
    alias: ["kic", "sacar", "ban"],
    using: "@usuario",
    description: "Expulsar a un usuario del grupo.",
    hidden: false,
    flags: ["only.groups"],
    category: "group",
    requires: ["administrator", "administrator.user"],
    execute: async (wss, { mctx, args, groupMetadata, bot }) => {
        try {
            const targets = getTargetJids(mctx, args);
            if (!targets.length)
                return void await mctx.reply("「✖」 Menciona o responde un usuario.");
            const metadata = await refreshGroupMetadata(wss, mctx.chat.jid, groupMetadata);
            const resolved = await resolveGroupActionTarget(wss, metadata, targets);
            const allTargets = resolved.jids.length ? resolved.jids : targets;
            const botJids = [mctx.me.jids.lid, mctx.me.jids.pn, bot.bot_jid];
            const ownerGroup = metadata?.owner || mctx.chat.jid.split("-")[0] + "@s.whatsapp.net";
            const botScopeJid = getBotScopeJid(bot, mctx);
            if (allTargets.some((jid) => botJids.some((botJid) => sameIdentity(jid, botJid)))) {
                return void await mctx.reply("「✖」 Usuario protegido.");
            }
            if (allTargets.some((jid) => sameIdentity(jid, ownerGroup) || getBotOwnerIdentityJids(bot).some((ownerJid) => sameIdentity(jid, ownerJid)))) {
                return void await mctx.reply("「✖」 Usuario protegido.");
            }
            for (const jid of allTargets) {
                if (await database.BotSubOwners.has(botScopeJid, jid)) {
                    return void await mctx.reply("「✖」 Usuario protegido.");
                }
            }
            if (resolved.participant && isUserAdminInMetadata(metadata, resolved.participant.id || allTargets[0])) {
                return void await mctx.reply("「✖」 Usuario es admin.");
            }
            await mctx.react("⏳");
            const ok = await tryGroupUpdate(wss, mctx.chat.jid, allTargets, "remove");
            if (!ok) {
                await mctx.react("❌");
                return void await mctx.reply("「✖」 No se pudo expulsar.");
            }
            await mctx.react("✅");
            await mctx.reply("「✓」 Usuario expulsado.");
        }
        catch (error) {
            await mctx.react("❌");
            console.error("[Kick] Error:", error);
            await mctx.reply("「✖」 No se pudo expulsar.");
        }
    },
};
