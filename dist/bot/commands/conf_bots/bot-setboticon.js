import * as database from "../../../database/database.js";
import * as libs from "../../../libs/libs.js";
import { canConfigureSocket, denyFreeConfigMessage, saveOfficialAsset, saveSocketAsset, socketConfigOnlyMessage, socketUsage } from "../../../libs/socket-manager.js";
export default {
    name: "setboticon",
    alias: ["setpfp", "setimage", "seticon", "icon"],
    description: "Cambiar la imagen de perfil",
    category: "bot",
    hidden: false,
    requires: ["bot.owner"],
    flags: ["all.chats"],
    execute: async (wss, { mctx, bot, userIsBotOwner }) => {
        if (String(bot.bot_type) === "free") {
            await mctx.reply(denyFreeConfigMessage());
            return;
        }
        if (!userIsBotOwner && !canConfigureSocket(mctx.sender.jid, bot)) {
            await mctx.reply(socketConfigOnlyMessage());
            return;
        }
        const target = mctx.quoted ?? mctx;
        const mimetype = target.message.mimetype;
        const size = target.message.size;
        if (!/^image/.test(mimetype)) {
            await mctx.reply(socketUsage("Set PFP", [`Responde una imagen con #setpfp`, `También sirve #setimage`]));
            return;
        }
        if (size > 5_242_880) {
            await mctx.reply(`*｢✧｣* La imagen no debe superar 5 MB (${libs.formatByteSize(size)}).`);
            return;
        }
        const input = await target.download().buffer();
        if (!Buffer.isBuffer(input))
            throw new Error("The media file could not be downloaded.");
        try {
            await wss.updateProfilePicture(mctx.me.jids.pn || mctx.me.jids.lid, input);
        }
        catch { }
        const assetPath = String(bot.bot_type) === "main"
            ? await saveOfficialAsset("logo", input, mimetype)
            : await saveSocketAsset(bot.bot_jid || mctx.me.jids.lid, "logo", input, mimetype);
        await database.Bots.update(bot.bot_jid || mctx.me.jids.lid, { $set: { logo_url: assetPath } });
        await mctx.reply(`「◈」 Perfil\n◈ Imagen 》 actualizada\n◈ Estado 》 listo`);
    },
};
