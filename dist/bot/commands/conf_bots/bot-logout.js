const command = {
    name: "logout",
    alias: [],
    description: "Cerrar sesion del bot",
    category: "bot",
    hidden: false,
    requires: ["bot.owner"],
    flags: ["all.chats"],
    execute: async (wss, { mctx }) => {
        await mctx.reply(`「⚙」 Logout\n│ Estado › cerrando sesión\n╰ Nota › tendrás que volver a vincular este socket.`);
        await wss.logout();
    },
};
export default command;
