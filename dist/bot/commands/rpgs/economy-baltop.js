import { formatMoney, getCurrency } from "../../../libs/economy.js";
const command = {
    name: "economyboard",
    alias: ["eboard", "baltop"],
    description: "Ver el ranking de usuarios con más {currency}.",
    category: "economy",
    using: "<pagina>",
    hidden: false,
    flags: ["only.groups"],
    requires: [],
    execute: async (wss, { mctx, group, bot, args }) => {
        const currency = getCurrency(bot);
        const page = Math.max(1, Number.parseInt(args[0], 10) || 1);
        const limit = 10;
        const skip = (page - 1) * limit;
        if (!group.users.length) {
            await mctx.reply(`「◈」 No hay participantes registrados en este grupo.`);
            return;
        }
        const allUsers = [...group.users].sort((a, b) => b.money + b.money_deposited - (a.money + a.money_deposited));
        const sortedUsers = allUsers.slice(skip, skip + limit);
        const totalPages = Math.max(1, Math.ceil(group.users.length / limit));
        if (!sortedUsers.length) {
            await mctx.reply(`「◈」 No hay participantes en la página *${page}* del ranking.`);
            return;
        }
        let message = `「◈」 Ranking Economía\n` +
            `⟡ Grupo » *${mctx.chat.name}*\n` +
            `⟡ Página » *${page}/${totalPages}*\n\n`;
        for (let i = 0; i < sortedUsers.length; i++) {
            const user = sortedUsers[i];
            const userName = await wss.getName(user.user_jid);
            const total = user.money + user.money_deposited;
            message += `⟡ ${(page - 1) * limit + i + 1} 》 *${userName}*\n`;
            message += `   Total » *${formatMoney(total, currency)}*\n`;
        }
        await mctx.reply(message.trim());
    },
};
export default command;
