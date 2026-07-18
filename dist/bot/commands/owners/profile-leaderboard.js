import * as database from "../../../database/database.js";
const PAGE_SIZE = 10;
export default {
    name: "leaderboard",
    alias: ["lboard", "top"],
    description: "Top de usuarios con más experiencia.",
    category: "main",
    using: "<pagina>",
    hidden: false,
    requires: [],
    flags: ["only.groups"],
    execute: async (wss, { mctx, args }) => {
        const page = Math.max(1, Number.parseInt(args[0], 10) || 1);
        const users = (await database.Users.values()).sort((a, b) => Number(b.level || 0) - Number(a.level || 0) || Number(b.experience || 0) - Number(a.experience || 0));
        if (!users.length) {
            await mctx.reply(`「♛」 No hay usuarios registrados todavía.`);
            return;
        }
        const totalPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
        const pageUsers = users.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
        if (!pageUsers.length) {
            await mctx.reply(`「♛」 No hay usuarios en la página *${page}*.`);
            return;
        }
        let message = `「◈」 Top Experiencia\n`;
        message += `◈ Página 》 *${page}/${totalPages}*\n`;
        message += `◈ Usuarios 》 *${users.length.toLocaleString("en-US")}*\n\n`;
        for (let i = 0; i < pageUsers.length; i++) {
            const user = pageUsers[i];
            const name = await wss.getName(user.user_jid).catch(() => user.name || `@${user.user_jid.split("@")[0]}`);
            message += `⟡ #${(page - 1) * PAGE_SIZE + i + 1} 》 *${name}*\n`;
            message += `╎ Nivel 》 *${Number(user.level || 1).toLocaleString("en-US")}* · Exp 》 *${Number(user.experience || 0).toLocaleString("en-US")}*\n`;
        }
        await mctx.reply(message.trim());
    },
};
