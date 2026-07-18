import * as libs from "../../../libs/libs.js";
import { formatMoney, getCurrency, getGroupUser } from "../../../libs/economy.js";
const cooldownLeft = (last, interval) => {
    const left = interval - (Date.now() - (last || 0));
    return left > 0 ? libs.formatDuration(left) : "Disponible";
};
const command = {
    name: "economyinfo",
    alias: ["einfo"],
    description: "Ver tu información de economía en el grupo.",
    category: "economy",
    hidden: false,
    flags: ["only.groups"],
    requires: [],
    execute: async (_, { mctx, group, bot }) => {
        const currency = getCurrency(bot);
        const groupUser = getGroupUser(group, mctx.sender.jid);
        if (!groupUser) {
            await mctx.reply(`「◈」 No se pudo obtener tus datos en este grupo, vuelve a intentarlo.`);
            return;
        }
        const total = groupUser.money + groupUser.money_deposited;
        const ranking = [...group.users]
            .sort((a, b) => b.money + b.money_deposited - (a.money + a.money_deposited))
            .findIndex((user) => user.user_jid === mctx.sender.jid) + 1;
        const userWithExtraCooldowns = groupUser;
        const message = `「◈」 Economía personal\n` +
            `⟡ Usuario » *${mctx.sender.name || "user"}*\n` +
            `⟡ Grupo » *${mctx.chat.name}*\n` +
            `⟡ Ranking » *#${ranking || "?"}*\n\n` +
            `⟡ Dinero 》 *${formatMoney(groupUser.money, currency)}*\n` +
            `⟡ Banco  》 *${formatMoney(groupUser.money_deposited, currency)}*\n` +
            `⟡ Total  》 *${formatMoney(total, currency)}*\n\n` +
            `⟡ Cooldowns:\n` +
            `   Daily 》 *${cooldownLeft(groupUser.last_daily_ago, 86_400_000)}*\n` +
            `   Work  》 *${cooldownLeft(groupUser.last_work_ago, 600_000)}*\n` +
            `   Crime 》 *${cooldownLeft(userWithExtraCooldowns.last_crime_ago, 1_800_000)}*\n` +
            `   Slut  》 *${cooldownLeft(userWithExtraCooldowns.last_slut_ago, 1_200_000)}*\n` +
            `   Rob   》 *${cooldownLeft(groupUser.last_robbery_ago, 1_800_000)}*`;
        await mctx.reply(message);
    },
};
export default command;
