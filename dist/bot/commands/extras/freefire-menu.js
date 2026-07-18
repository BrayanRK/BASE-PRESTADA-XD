import { freeFireMenu } from "../../../libs/freefire.js";
import { mergeCaptionWithMenuMedia } from "../../../libs/zeta_assets.js";
const command = {
    name: "ffmenu",
    alias: ["menuff", "freefiremenu", "menufreefire"],
    description: "Ver el menú propio de comandos Free Fire.",
    category: "extras",
    hidden: false,
    flags: ["only.groups"],
    requires: [],
    execute: async (wss, ctx) => {
        const text = await freeFireMenu(ctx);
        await wss.sendMessage(ctx.mctx.chat.jid, await mergeCaptionWithMenuMedia("submenu", text, ctx.bot), { quoted: ctx.mctx.message.original });
    },
};
export default command;
