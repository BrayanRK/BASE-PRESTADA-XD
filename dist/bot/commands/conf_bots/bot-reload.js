import * as libs from "../../../libs/libs.js";
const command = {
    name: "reload",
    alias: [],
    description: "Recargar la sesion del bot",
    category: "bot",
    hidden: false,
    requires: ["bot.owner"],
    flags: ["all.chats"],
    execute: async (_, { mctx }) => {
        await libs.Command.load();
        await mctx.reply(`「⚙」 Reload\n│ Estado › comandos recargados\n╰ Nota › sesión activa sin reinicio forzado.`);
    },
};
export default command;
