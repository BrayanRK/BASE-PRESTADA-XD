import { getConnection } from "../database/connect.js";
import { getRuntimeAssetPath, getRuntimeBotName, getRuntimeChannelUrl, getRuntimeCommandPrefixes, getRuntimeCurrencyName, getRuntimeOwnerLid, getRuntimeOwnerName, getRuntimeOwnerPn, getRuntimeReceptionNumber, getRuntimeSocialLinks } from "./zeta_cf.js";
const SCOPE_SEPARATOR = "::";
export const normalizeStorageJid = (jid) => String(jid || "").trim().toLowerCase();
export const isScopedGroupJid = (groupJid) => String(groupJid || "").includes(SCOPE_SEPARATOR);
export const getPublicGroupJid = (groupJid) => {
    const value = String(groupJid || "");
    if (!value.includes(SCOPE_SEPARATOR))
        return value;
    return value.split(SCOPE_SEPARATOR).slice(1).join(SCOPE_SEPARATOR);
};
export const getEffectiveBotJid = (bot) => {
    const ownJid = normalizeStorageJid(bot?.bot_jid);
    const parentJid = normalizeStorageJid(bot?.parent_bot_jid);
    if (bot?.bot_type === "free" && parentJid)
        return parentJid;
    return ownJid || parentJid || "default@lid";
};
export const getScopedGroupJid = (bot, groupJid) => {
    if (!groupJid || isScopedGroupJid(groupJid))
        return groupJid;
    const botJid = typeof bot === "string" ? normalizeStorageJid(bot) : getEffectiveBotJid(bot);
    return `${botJid}${SCOPE_SEPARATOR}${groupJid}`;
};
const getOne = (sql, params = []) => {
    return new Promise((resolve) => {
        try {
            getConnection().get(sql, params, (error, row) => {
                if (error) {
                    console.error("[BotScope.getOne]", error);
                    resolve(null);
                    return;
                }
                resolve(row || null);
            });
        }
        catch (error) {
            console.error("[BotScope.getOne]", error);
            resolve(null);
        }
    });
};
const run = (sql, params = []) => {
    return new Promise((resolve) => {
        try {
            getConnection().run(sql, params, (error) => {
                if (error)
                    console.error("[BotScope.run]", error);
                resolve();
            });
        }
        catch (error) {
            console.error("[BotScope.run]", error);
            resolve();
        }
    });
};
export const ensureScopedGroupSeed = async (bot, realGroupJid) => {
    const scopedGroupJid = getScopedGroupJid(bot, realGroupJid);
    if (!realGroupJid || isScopedGroupJid(realGroupJid))
        return scopedGroupJid;
    const exists = await getOne("SELECT COUNT(*) as count FROM groups_table WHERE group_jid = ?", [
        scopedGroupJid,
    ]);
    if (Number(exists?.count || 0) > 0)
        return scopedGroupJid;
    const legacy = await getOne("SELECT * FROM groups_table WHERE group_jid = ?", [realGroupJid]);
    const effectiveBotJid = typeof bot === "string" ? normalizeStorageJid(bot) : getEffectiveBotJid(bot);
    await run(`INSERT OR IGNORE INTO groups_table (
      group_jid, admins_only_enabled, primary_bot, moderators_only_enabled, mute_all_enabled, autoadmin_enabled, antilinks_enabled,
      welcomes_enabled, welcome_message, welcome_image_url, farewells_enabled, farewell_message, farewell_image_url, alerts_enabled
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        scopedGroupJid,
        legacy?.admins_only_enabled || 0,
        legacy?.primary_bot || effectiveBotJid,
        legacy?.moderators_only_enabled || 0,
        legacy?.mute_all_enabled || 0,
        legacy?.autoadmin_enabled || 0,
        legacy?.antilinks_enabled || 0,
        legacy?.welcomes_enabled || 0,
        legacy?.welcome_message || "",
        legacy?.welcome_image_url || "",
        legacy?.farewells_enabled || 0,
        legacy?.farewell_message || "",
        legacy?.farewell_image_url || "",
        legacy?.alerts_enabled || 0,
    ]);
    await run(`INSERT OR IGNORE INTO group_users (
      group_jid, user_jid, money, money_deposited, berries, enhancers, cookies, potions,
      last_hunt_ago, last_work_ago, last_mining_ago, last_daily_ago, last_robbery_ago,
      last_crime_ago, last_slut_ago, last_trivia_ago
    )
    SELECT ?, user_jid, money, money_deposited, berries, enhancers, cookies, potions,
      last_hunt_ago, last_work_ago, last_mining_ago, last_daily_ago, last_robbery_ago,
      COALESCE(last_crime_ago, 0), COALESCE(last_slut_ago, 0), COALESCE(last_trivia_ago, 0)
    FROM group_users WHERE group_jid = ?`, [scopedGroupJid, realGroupJid]);
    return scopedGroupJid;
};
const officialDefaultsForFree = (bot) => {
    const socials = getRuntimeSocialLinks();
    const prefixes = getRuntimeCommandPrefixes().join(" ") || ".";
    return {
        ...bot,
        parent_bot_jid: "",
        name: getRuntimeBotName() || bot.name || "",
        owner_lid: getRuntimeOwnerLid() || bot.owner_lid || "",
        owner_pn: getRuntimeOwnerPn() || bot.owner_pn || "",
        owner_name: getRuntimeOwnerName() || bot.owner_name || "",
        owner_number: getRuntimeReceptionNumber() || bot.owner_number || "",
        logo_url: getRuntimeAssetPath("generalImage") || bot.logo_url || "",
        thumbnail_url: getRuntimeAssetPath("generalImage") || bot.thumbnail_url || "",
        submenu_url: getRuntimeAssetPath("subMainImage") || bot.submenu_url || "",
        welcome_url: getRuntimeAssetPath("welcomeImage") || bot.welcome_url || "",
        rpg_url: getRuntimeAssetPath("rpgImage") || bot.rpg_url || "",
        channel_url: getRuntimeChannelUrl() || bot.channel_url || "",
        facebook_url: socials.facebook || bot.facebook_url || "",
        instagram_url: socials.instagram || bot.instagram_url || "",
        tiktok_url: socials.tiktok || bot.tiktok_url || "",
        telegram_url: socials.telegram || bot.telegram_url || "",
        prefixes,
        currency: getRuntimeCurrencyName() || bot.currency || "",
        autojoin_enabled: false,
    };
};
export const getInheritedBotConfig = async (bot) => {
    if (!bot)
        return null;
    if (bot.bot_type !== "free")
        return bot;
    if (!bot.parent_bot_jid)
        return officialDefaultsForFree(bot);
    const parent = await getOne("SELECT * FROM bots WHERE bot_jid = ?", [bot.parent_bot_jid]);
    if (!parent || parent.bot_type === "premium")
        return officialDefaultsForFree(bot);
    return {
        ...parent,
        bot_jid: bot.bot_jid,
        bot_type: "free",
        parent_bot_jid: bot.parent_bot_jid,
        owner_jid: bot.owner_jid || parent.owner_jid || "",
        owner_lid: bot.owner_lid || parent.owner_lid || "",
        owner_pn: bot.owner_pn || parent.owner_pn || "",
        owner_name: bot.owner_name || parent.owner_name || "",
        logo_url: bot.logo_url || parent.logo_url || "",
        thumbnail_url: bot.thumbnail_url || parent.thumbnail_url || "",
        submenu_url: bot.submenu_url || parent.submenu_url || "",
        welcome_url: bot.welcome_url || parent.welcome_url || "",
        rpg_url: bot.rpg_url || parent.rpg_url || "",
        channel_url: bot.channel_url || parent.channel_url || "",
        facebook_url: bot.facebook_url || parent.facebook_url || "",
        instagram_url: bot.instagram_url || parent.instagram_url || "",
        tiktok_url: bot.tiktok_url || parent.tiktok_url || "",
        telegram_url: bot.telegram_url || parent.telegram_url || "",
        prefixes: bot.prefixes || parent.prefixes || "",
        autojoin_enabled: Boolean(parent.autojoin_enabled),
    };
};
