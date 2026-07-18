import { shopMenu } from "../../../libs/shop.js";
import { mergeCaptionWithMenuMedia } from "../../../libs/zeta_assets.js";
const command = {
    name: "menushop",
    alias: ["shopmenu", "menutienda", "menuventas"],
    description: "Ver el menú propio de ventas/shop.",
    category: "extras",
    hidden: false,
    flags: ["only.groups"],
    requires: [],
    execute: async (wss, ctx) => {
        const text = await shopMenu(ctx);
        await wss.sendMessage(ctx.mctx.chat.jid, await mergeCaptionWithMenuMedia("submenu", text, ctx.bot), { quoted: ctx.mctx.message.original });
    },
};
export default command;
