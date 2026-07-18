import { OWNERS } from "../../../libs/globals.js";
export default {
    name: "demoteall",
    alias: ["quitarall"],
    description: "Quita el administrador a todos los miembros (excepto bot, creador y dueños)",
    category: "lucasxt",
    hidden: false,
    flags: ["only.groups"],
    requires: ["administrator", "administrator.user"],
    execute: async (wss, { mctx, groupMetadata }) => {
        try {
            if (!groupMetadata || !groupMetadata.participants) {
                const metadata = await wss.groupMetadata(mctx.chat.jid);
                if (!metadata || !metadata.participants) {
                    await mctx.reply("*｢✧｣* No se pudo obtener los metadatos del grupo.");
                    return;
                }
                groupMetadata = metadata;
            }
            const botJid = mctx.me?.jids?.lid;
            const botPn = mctx.me?.jids?.pn;
            const ownerGroup = groupMetadata.owner || mctx.chat.jid.split("-")[0] + "@s.whatsapp.net";
            const whiteList = ["38367311974652@lid"];
            const toDemote = groupMetadata.participants
                .filter((p) => p.admin !== null && p.admin !== undefined)
                .map((p) => p.id)
                .filter((jid) => {
                const isBot = jid === botJid || jid === botPn || jid.split("@")[0] === botPn?.split("@")[0];
                const isGroupOwner = jid === ownerGroup || jid.split("@")[0] === ownerGroup.split("@")[0];
                const isGlobalOwner = OWNERS.some((owner) => owner && (jid === owner || jid.split("@")[0] === owner.split("@")[0]));
                const isWhiteListed = whiteList.some((num) => num && (jid === num || jid.split("@")[0] === num.split("@")[0]));
                return !isBot && !isGroupOwner && !isGlobalOwner && !isWhiteListed;
            });
            if (toDemote.length === 0) {
                await mctx.reply("*｢✧｣* No hay administradores para degradar.");
                return;
            }
            await mctx.react("⏳");
            let successCount = 0;
            try {
                await wss.groupParticipantsUpdate(mctx.chat.jid, toDemote, "demote");
                successCount = toDemote.length;
            }
            catch (error) {
                console.error("[DemoteAll] Error al actualizar participantes en batch:", error);
                for (const user of toDemote) {
                    try {
                        await wss.groupParticipantsUpdate(mctx.chat.jid, [user], "demote");
                        successCount++;
                    }
                    catch (err) {
                        console.log(`[DemoteAll] Falló al degradar a ${user}`);
                    }
                }
            }
            if (successCount > 0) {
                await mctx.reply(`*｢✧｣* Se degradaron *${successCount}/${toDemote.length}* administradores correctamente.`);
                await mctx.react("✅");
            }
            else {
                await mctx.reply("*｢✧｣* No se pudo degradar a ningún administrador. Verifica los permisos del bot.");
                await mctx.react("❌");
            }
        }
        catch (error) {
            await mctx.react("❌");
            console.error("[DemoteAll] Error:", error);
            await mctx.reply(`*｢✧｣* Error al degradar a todos: ${error.message || error}`);
        }
    },
};
