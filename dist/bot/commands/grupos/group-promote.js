import { getTargetJids, participantIsAdmin, refreshGroupMetadata, resolveGroupActionTarget, } from "../../../libs/lucasxt-moderation.js";
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
    name: "promote",
    alias: ["admin"],
    description: "Ascender a un usuario a administrador.",
    category: "group",
    using: "@usuario",
    hidden: false,
    flags: ["only.groups"],
    requires: ["administrator", "administrator.user"],
    execute: async (wss, { mctx, args, groupMetadata }) => {
        try {
            const targets = getTargetJids(mctx, args);
            if (!targets.length)
                return void await mctx.reply("「✖」 Menciona o responde un usuario.");
            const metadata = await refreshGroupMetadata(wss, mctx.chat.jid, groupMetadata);
            const resolved = await resolveGroupActionTarget(wss, metadata, targets);
            if (participantIsAdmin(resolved.participant)) {
                return void await mctx.reply("「✖」 Usuario ya es admin.");
            }
            await mctx.react("⏳");
            const ok = await tryGroupUpdate(wss, mctx.chat.jid, resolved.jids.length ? resolved.jids : targets, "promote");
            if (!ok) {
                await mctx.react("❌");
                return void await mctx.reply("「✖」 No se pudo promover.");
            }
            await mctx.react("✅");
            await mctx.reply("「✓」 Usuario promovido.");
        }
        catch (error) {
            await mctx.react("❌");
            console.error("[Promote] Error:", error);
            await mctx.reply("「✖」 No se pudo promover.");
        }
    },
};
