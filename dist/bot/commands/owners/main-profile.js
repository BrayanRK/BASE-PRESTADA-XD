import * as database from "../../../database/database.js";
import { formatMoney, getCurrency, getGroupUser } from "../../../libs/economy.js";
import { formatNumber, getRuntimeGacha } from "../../../libs/gacha.js";
import { formatMarriageDuration, getActiveMarriageByUser, getPartnerJid } from "../../../libs/marriage.js";
import { getScopedGroupJid } from "../../../libs/bot-scope.js";
const cleanName = (value, fallback = "Usuario") => {
    const text = String(value ?? "")
        .replace(/\s+/g, " ")
        .trim();
    return text && text !== "~" ? text : fallback;
};
const percent = (current, total) => {
    if (!total || total <= 0)
        return "0%";
    return `${Math.min(100, Math.floor((current / total) * 100))}%`;
};
const getTargetJid = (mctx) => {
    return mctx.message.mentioned?.[0] || mctx.message.mentionedJid?.[0] || mctx.quoted?.sender?.jid || mctx.sender.jid;
};
export default {
    name: "profile",
    alias: ["perfil"],
    description: "Ver tu perfil.",
    category: "main",
    using: "<@mencion>",
    hidden: false,
    requires: [],
    flags: ["only.groups"],
    execute: async (wss, { mctx, group, bot }) => {
        const scopedGroupJid = getScopedGroupJid(bot, mctx.chat.jid);
        const targetJid = getTargetJid(mctx);
        let user = await database.Users.get(targetJid);
        if (!user) {
            user = await database.Users.set(targetJid, { user_jid: targetJid, name: "~", range: "User", level: 1, experience: 0 });
        }
        if (!user) {
            await mctx.reply(`「♛」 No se pudo obtener el perfil del usuario.`);
            return;
        }
        const currency = getCurrency(bot);
        const targetName = targetJid === mctx.sender.jid
            ? cleanName(mctx.sender.name, user.name)
            : cleanName(await wss.getName(targetJid).catch(() => ""), user.name || `@${targetJid.split("@")[0]}`);
        const nextLevelExp = 50 * Math.pow(Number(user.level || 1) + 1, 2);
        const levelUsers = await database.Users.values();
        const levelRank = [...levelUsers]
            .sort((a, b) => Number(b.level || 0) - Number(a.level || 0) || Number(b.experience || 0) - Number(a.experience || 0))
            .findIndex((item) => item.user_jid === targetJid) + 1;
        const groupUser = getGroupUser(group, targetJid);
        const economyTotal = groupUser ? Number(groupUser.money || 0) + Number(groupUser.money_deposited || 0) : 0;
        const economyRank = groupUser
            ? [...group.users]
                .sort((a, b) => Number(b.money || 0) + Number(b.money_deposited || 0) - (Number(a.money || 0) + Number(a.money_deposited || 0)))
                .findIndex((item) => item.user_jid === targetJid) + 1
            : 0;
        const gacha = getRuntimeGacha(bot, group);
        const gachaStats = gacha.getUserStats(targetJid);
        const favoriteName = cleanName(user.favorite_character_name, "Sin favorito");
        const marriage = await getActiveMarriageByUser(scopedGroupJid, targetJid);
        const partnerJid = marriage ? getPartnerJid(marriage, targetJid) : "";
        const partnerName = partnerJid
            ? cleanName(await wss.getName(partnerJid).catch(() => ""), "@" + partnerJid.split("@")[0])
            : "Soltero/a";
        let message = `「◈」 Perfil\n`;
        message += `◈ Usuario 》 *${targetName}*\n`;
        message += `◈ Rango   》 *${user.range || "User"}*\n`;
        message += `◈ Género  》 *${user.genre || "No definido"}*\n`;
        message += `◈ Pareja  》 *${partnerName}*\n`;
        message += `◈ Tiempo  》 *${marriage ? formatMarriageDuration(marriage.married_at) : "sin relación"}*\n\n`;
        message += `「◈」 Datos\n`;
        message += `◈ Descripción 》 *${cleanName(user.description, "Sin descripción")}*\n`;
        message += `◈ Favorito    》 *${favoriteName}*\n\n`;
        message += `⟡ Nivel       》 *${Number(user.level || 1).toLocaleString("en-US")}*\n`;
        message += `⟡ Experiencia 》 *${Number(user.experience || 0).toLocaleString("en-US")}*\n`;
        message += `⟡ Progreso    》 *${Number(user.experience || 0).toLocaleString("en-US")} / ${nextLevelExp.toLocaleString("en-US")}* (${percent(Number(user.experience || 0), nextLevelExp)})\n`;
        message += `⟡ Puesto      》 *#${levelRank || "?"}*\n\n`;
        message += `「◈」 Economía\n`;
        message += `◈ Dinero 》 *${formatMoney(Number(groupUser?.money || 0), currency)}*\n`;
        message += `◈ Banco  》 *${formatMoney(Number(groupUser?.money_deposited || 0), currency)}*\n`;
        message += `◈ Total  》 *${formatMoney(economyTotal, currency)}*\n`;
        message += `◈ Puesto 》 *#${economyRank || "?"}*\n\n`;
        message += `「◈」 Gacha\n`;
        message += `◈ Harem     》 *${formatNumber(gachaStats.count)}*\n`;
        message += `◈ Valor     》 *${formatNumber(gachaStats.value)} ${currency}*\n`;
        message += `◈ Votos     》 *${formatNumber(gachaStats.votes)}*\n`;
        message += `◈ En venta  》 *${formatNumber(gachaStats.saleCount)}*`;
        await wss.sendMessage(mctx.chat.jid, {
            text: message,
            mentions: [targetJid, ...(partnerJid ? [partnerJid] : [])],
        }, {
            quoted: mctx.message.original,
        });
    },
};
