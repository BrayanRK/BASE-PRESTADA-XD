import * as context from "../context/context_message.js";
import * as database from "../../database/database.js";
import * as libs from "../../libs/libs.js";
import { isOwner } from "../../libs/globals.js";
import { canConfigureSocket, extractInviteCode, isBotOwnerIdentity, isEstablishedBotOwner, ownerIsConfigured, sameUser } from "../../libs/socket-manager.js";
import { ensureScopedGroupSeed, getEffectiveBotJid, getInheritedBotConfig, getScopedGroupJid } from "../../libs/bot-scope.js";
import { getMatchedCommandPrefix, handlePostConnectionSetupRaw, isPostConnectionSetupComplete, } from "../../libs/zeta_setup.js";
import { handlePremiumSocketSetupRaw } from "../../libs/socket-manager.js";
import { handleWelcomeEvents } from "./group-participants.update.js";
import { cacheMessage, handleRevokeInUpsert } from "./messages.delete.js";
import { Bot } from "../bot.js";
import { findParticipant, getBotScopeJid, getBotScopeJids, getParticipantIdentityJids, isAllowedTagUserAny, isAntiTagEnabled, isBannedBotUserAny, isBotAdminInMetadata, shouldDeleteForwardedTag, isMutedUserAny, isUserAdminInMetadata, sameIdentity, } from "../../libs/lucasxt-moderation.js";
import { isTargetInGroupMetadata } from "../../libs/lid-resolver.js";
import { handleInscripcionReply } from "../../libs/freefire-inscripcion.js";
import { matchStandaloneCurp, runNssLookup } from "../commands/lucasxt/lucasxt-nss.js";
const processedMessages = new Set();
const LOG_MESSAGES = /^(1|true|yes)$/i.test(process.env.ZETA_LOG_MESSAGES || "");
const ALL_CHATS_SETTING_KEY = "allchats_enabled";
const PRIVATE_BOT_CATEGORIES = new Set(["bot", "premb"]);
const PRIVATE_GAME_COMMANDS = new Set([
    "ppt",
    "ttt",
    "tttlist",
    "delttt",
    "multijuegos",
]);
const FREE_RESTRICTED_COMMANDS = new Set([
    "setmenu",
    "settag",
    "setbotprefix",
    "setbotname",
    "setbotcurrency",
    "setstatus",
    "setusername",
    "setownernumber",
    "rs",
    "setbotbanner",
    "setboticon",
    "setwelcomeimage",
    "shop",
    "shopdel",
    "addfactura",
    "facturapaga",
    "delfactura",
    "setpago",
    "setstock",
    "setstock2",
    "setstock3",
    "setnetflix",
    "setpeliculas",
    "setpromo",
    "setsoporte",
    "setcanvas",
    "setcombos",
    "setdiamantes",
    "setseguidores",
    "setduos",
    "settrios",
    "setlotes",
    "settramites",
    "ff",
    "ffvs",
    "4vs4",
    "6vs6",
    "12vs12",
    "16vs16",
    "20vs20",
    "24vs24",
    "guerr",
    "ffhorario",
    "ffsorteo",
    "qr",
    "code",
    "qrpremium",
    "qrprem",
    "codepremium",
]);
const PRIMARY_OWNER_COMMANDS = new Set([
    "addowner",
    "delowner",
    "allchats",
    "autoadmin",
    "muteall",
    "getprem",
    "sumprem",
    "delprem",
    "checkprem",
    "reload",
    "update",
    "system",
    "updatedb",
    "logout",
    "startbot",
    "setprimary",
]);
const commandCanUsePrivateByDefault = (command) => {
    return command.flags.includes("only.private") || PRIVATE_BOT_CATEGORIES.has(command.category) || PRIVATE_GAME_COMMANDS.has(command.name);
};
const GROUP_METADATA_TTL_MS = 90_000;
const ANTI_SPAM_MESSAGE_WINDOW_MS = 10_000;
const ANTI_SPAM_STICKER_WINDOW_MS = 30_000;
const ANTI_SPAM_RESET_MS = 60_000;
const ANTI_SPAM_REPEAT_WINDOW_MS = 30_000;
const ANTI_SPAM_MESSAGE_THRESHOLD = 10;
const ANTI_SPAM_REPEAT_WARN_THRESHOLD = 3;
const ANTI_SPAM_REPEAT_KICK_THRESHOLD = 10;
const ANTI_SPAM_STICKER_THRESHOLD = 3;
const antiSpamState = new Map();
const pruneAntiSpamState = (state, now) => {
    const messages = state.messages.filter((ts) => now - ts <= ANTI_SPAM_MESSAGE_WINDOW_MS);
    const stickers = state.stickers.filter((ts) => now - ts <= ANTI_SPAM_STICKER_WINDOW_MS);
    const warnedAt = state.warnedAt && now - state.warnedAt <= ANTI_SPAM_RESET_MS ? state.warnedAt : undefined;
    const lastTextAt = state.lastTextAt && now - state.lastTextAt <= ANTI_SPAM_REPEAT_WINDOW_MS ? state.lastTextAt : undefined;
    const lastText = lastTextAt ? state.lastText : undefined;
    const repeatCount = lastTextAt ? state.repeatCount : 0;
    return { messages, stickers, lastText, repeatCount, lastTextAt, warnedAt };
};
const getAntiSpamKey = (groupJid, senderJid) => `${groupJid}:${senderJid}`;
const jidNumber = (jid) => String(jid || "")
    .split(":")[0]
    .split("@")[0]
    .replace(/[^0-9]/g, "");
const candidateJids = (jid) => {
    const number = jidNumber(jid);
    return Array.from(new Set([
        jid,
        jid.replace("@lid", "@s.whatsapp.net"),
        number ? `${number}@s.whatsapp.net` : "",
        number ? `${number}@lid` : "",
    ].filter(Boolean)));
};
const promoteGroupParticipant = async (wss, groupJid, userJid, metadata) => {
    const participant = metadata?.participants?.find((item) => sameUser(item.id, userJid));
    if (participant?.admin)
        return true;
    const targets = participant?.id ? [participant.id, ...candidateJids(userJid)] : candidateJids(userJid);
    for (const target of Array.from(new Set(targets))) {
        try {
            await wss.groupParticipantsUpdate(groupJid, [target], "promote");
            groupMetadataCache.delete(groupJid);
            return true;
        }
        catch {
            continue;
        }
    }
    return false;
};
const groupMetadataCache = new Map();
const getSafeGroupMetadata = async (wss, jid, force = false) => {
    if (!/@g\.us$/i.test(jid || ""))
        return null;
    const cached = groupMetadataCache.get(jid);
    if (!force && cached && cached.expiresAt > Date.now())
        return cached.metadata;
    try {
        const metadata = await wss.groupMetadata(jid);
        groupMetadataCache.set(jid, { metadata, expiresAt: Date.now() + GROUP_METADATA_TTL_MS });
        return metadata;
    }
    catch (error) {
        if (LOG_MESSAGES)
            console.error("[GroupMetadata] Error:", error);
        return cached?.metadata || null;
    }
};
const BLOCKED_LINK_REGEX = /\b(?:(?:https?:\/\/|www\.)[^\s]+|(?:chat\.whatsapp\.com|wa\.me|wa\.link|whatsapp\.com\/channel)\/[^\s]+|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|io|app|gg|me|tv|co|ly|info|biz|xyz|link|site|online|store|shop|dev|edu|gov|us|uk|br|mx|es|ar|pe|cl|ec|ve|uy|py|bo|do)(?:\/[^\s]*)?)/i;
const containsBlockedLink = (text) => {
    return BLOCKED_LINK_REGEX.test(String(text || "").trim());
};
const AI_COMMAND_NAME = "bot";
const normalizeAiTriggerText = (value) => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
const cleanAiAlias = (value) => String(value || "")
    .replace(/\s+/g, " ")
    .trim();
const uniqueBotNameAliases = (bot, mctx) => {
    const values = [
        bot?.name,
        bot?.username,
        mctx?.me?.name,
    ]
        .map((value) => cleanAiAlias(value))
        .filter(Boolean);
    return Array.from(new Set(values));
};
const extractBotNamePrompt = (commandBody, bot, mctx) => {
    const body = cleanAiAlias(commandBody);
    if (!body)
        return null;
    const bodyLower = body.toLowerCase();
    const firstToken = body.split(/\s+/)[0] || "";
    const firstTokenKey = normalizeAiTriggerText(firstToken);
    for (const alias of uniqueBotNameAliases(bot, mctx).sort((a, b) => b.length - a.length)) {
        const aliasLower = alias.toLowerCase();
        const aliasKey = normalizeAiTriggerText(alias);
        if (!aliasKey)
            continue;
        if (bodyLower === aliasLower)
            return "";
        if (bodyLower.startsWith(`${aliasLower} `))
            return body.slice(alias.length).trim();
        if (firstTokenKey === aliasKey)
            return body.slice(firstToken.length).trim();
    }
    return null;
};
const getBotMentionJids = (mctx, wss) => {
    return Array.from(new Set([mctx.me.jids.lid, mctx.me.jids.pn, wss.user?.id].filter(Boolean)));
};
const isBotMentionedJid = (jid, botJids) => {
    return botJids.some((botJid) => sameUser(jid, botJid));
};
const extractLeadingMention = (text) => {
    const cleanText = String(text || "").trimStart();
    const match = cleanText.match(/^@([0-9]{1,30})(?=\s|$)/);
    if (!match)
        return null;
    return {
        number: match[1],
        rest: cleanText.slice(match[0].length).replace(/^[:,-]?\s*/, "").trim(),
    };
};
const removeExtraBotMentions = (text, botJids) => {
    const botNumbers = botJids.map((jid) => jidNumber(jid)).filter(Boolean);
    let output = String(text || "");
    for (const number of Array.from(new Set(botNumbers))) {
        output = output.replace(new RegExp(`@${number}\\b`, "g"), "");
    }
    return output.replace(/\s+/g, " ").trim();
};
const extractMentionAiPrompt = (text, mctx, wss) => {
    if (!mctx.is_group || mctx.message.from_me)
        return null;
    const leadingMention = extractLeadingMention(text);
    if (!leadingMention)
        return null;
    const botJids = getBotMentionJids(mctx, wss);
    const mentioned = mctx.message.mentionedJid || mctx.message.mentioned || [];
    const botMentioned = mentioned.some((jid) => isBotMentionedJid(jid, botJids));
    if (!botMentioned)
        return null;
    const botNumbers = botJids.map((jid) => jidNumber(jid)).filter(Boolean);
    const leadingIsBot = leadingMention.number === "0" ||
        botNumbers.includes(leadingMention.number) ||
        mentioned.some((jid) => isBotMentionedJid(jid, botJids) && jidNumber(jid) === leadingMention.number);
    if (!leadingIsBot)
        return null;
    return removeExtraBotMentions(leadingMention.rest, botJids);
};
export const messagesUpsert = async (upsert, wss, instance) => {
    try {
        if (!upsert.messages.length) {
            return;
        }
        const setupPending = !isPostConnectionSetupComplete();
        const hasRevoke = upsert.messages.some((m) => m.message?.protocolMessage != null);
        if (upsert.type !== "notify" && !setupPending && !upsert.messages.some((m) => m.key.fromMe) && !hasRevoke) {
            return;
        }
        for (const message of upsert.messages) {
            if (!isPostConnectionSetupComplete()) {
                const consumedBySetup = await handlePostConnectionSetupRaw(message, wss);
                if (consumedBySetup) {
                    continue;
                }
            }
            const consumedByPremiumSetup = await handlePremiumSocketSetupRaw(message, wss);
            if (consumedByPremiumSetup) {
                continue;
            }
            const ownerBotJid = (wss.user?.id || "unknown").toLowerCase();
            const messageId = [ownerBotJid, message.key.remoteJid || "", message.key.id || "", message.key.participant || ""].join(":");
            if (messageId && processedMessages.has(messageId)) {
                continue;
            }
            if (messageId) {
                processedMessages.add(messageId);
                setTimeout(() => processedMessages.delete(messageId), 30000);
            }
            if (message.message?.protocolMessage != null) {
                await handleRevokeInUpsert(message, wss);
                continue;
            }
            cacheMessage(message);
            const mctx = await context.contextMessage(message, wss);
            if (!mctx) {
                continue;
            }
            if (mctx.is_group && mctx.sender?.jid) {
                let isSiblingBotSender = false;
                for (const [botKey, runtimeBot] of Bot.bots) {
                    if (botKey === ownerBotJid)
                        continue;
                    const liveUser = runtimeBot.wss?.user;
                    const candidates = [liveUser?.id, liveUser?.lid, runtimeBot.bot_jid].filter(Boolean);
                    if (candidates.some((c) => sameUser(mctx.sender.jid, c) || mctx.sender.jid.toLowerCase() === c.toLowerCase())) {
                        isSiblingBotSender = true;
                        break;
                    }
                }
                if (!isSiblingBotSender) {
                    const registeredBots = await database.Bots.listByType(["main", "premium"]).catch(() => []);
                    const myOwnJids = [wss.user?.id, wss.user?.lid].filter(Boolean).map((j) => String(j).toLowerCase());
                    for (const registered of registeredBots) {
                        const candidates = [registered.bot_jid].filter(Boolean);
                        if (candidates.some((c) => myOwnJids.includes(c.toLowerCase())))
                            continue;
                        if (candidates.some((c) => sameUser(mctx.sender.jid, c) || mctx.sender.jid.toLowerCase() === c.toLowerCase())) {
                            isSiblingBotSender = true;
                            break;
                        }
                    }
                }
                if (isSiblingBotSender) {
                    if (LOG_MESSAGES)
                        console.log(`[SiblingGuard] Ignorando mensaje de otro bot propio: ${mctx.sender.jid}`);
                    continue;
                }
            }
            if (upsert.type !== "notify" && !message.key.fromMe) {
                continue;
            }
            handleInscripcionReply(wss, mctx).catch((error) => {
                console.error("[FreeFireVS] Error registrando inscripción por respuesta:", error);
            });
            let runtimeBotCache = null;
            const getRuntimeBot = async () => {
                if (runtimeBotCache)
                    return runtimeBotCache;
                const botLookupJid = (mctx.me.jids.lid && (await database.Bots.has(mctx.me.jids.lid))) ? mctx.me.jids.lid : mctx.me.jids.pn;
                const rawBot = await database.Bots.get(botLookupJid);
                const bot = await getInheritedBotConfig(rawBot);
                runtimeBotCache = { botLookupJid, rawBot, bot };
                return runtimeBotCache;
            };
            if (mctx.is_group) {
                const { bot: earlyBot } = await getRuntimeBot();
                const earlyScopedGroupJid = await ensureScopedGroupSeed(earlyBot, mctx.chat.jid);
                const earlyGroup = await database.Groups.get(earlyScopedGroupJid);
                if (earlyGroup?.mute_all_enabled) {
                    const rawText = String(mctx.message.text || "").trim();
                    const earlyPrefix = rawText ? getMatchedCommandPrefix(rawText, earlyBot) : "";
                    const earlyCommandName = earlyPrefix ? rawText.slice(earlyPrefix.length).trimStart().split(/\s+/)[0]?.toLowerCase() || "" : "";
                    const earlyCommand = earlyCommandName ? libs.Command.get(earlyCommandName) : undefined;
                    const earlyBotOwnerJid = earlyBot?.owner_jid || "";
                    const earlySameBotActor = mctx.message.from_me ||
                        sameIdentity(mctx.sender.jid, earlyBot?.bot_jid) ||
                        sameIdentity(mctx.sender.jid, getBotScopeJid(earlyBot, mctx)) ||
                        sameIdentity(mctx.sender.jid, mctx.me.jids.lid) ||
                        sameIdentity(mctx.sender.jid, mctx.me.jids.pn);
                    const earlyOfficialBootstrapOwner = (earlyBot?.bot_type === "main" || earlyBot?.bot_type === "premium") &&
                        !ownerIsConfigured(earlyBotOwnerJid) &&
                        (earlySameBotActor || isOwner(mctx.sender.jid));
                    const earlyCanDisable = earlyCommand?.name === "muteall" &&
                        (isOwner(mctx.sender.jid) || isEstablishedBotOwner(mctx.sender.jid, earlyBot) || earlyOfficialBootstrapOwner || canConfigureSocket(mctx.sender.jid, earlyBot));
                    if (!earlyCanDisable) {
                        continue;
                    }
                }
            }
            await handleWelcomeEvents(message, wss);
            if (mctx.is_group && !mctx.message.from_me) {
                const { bot: guardBot } = await getRuntimeBot();
                const guardBotJid = getBotScopeJid(guardBot, mctx);
                const senderIsBot = mctx.message.from_me ||
                    sameIdentity(mctx.sender.jid, guardBot?.bot_jid) ||
                    sameIdentity(mctx.sender.jid, getBotScopeJid(guardBot, mctx)) ||
                    sameIdentity(mctx.sender.jid, mctx.me.jids.lid) ||
                    sameIdentity(mctx.sender.jid, mctx.me.jids.pn);
                if (guardBotJid && !senderIsBot) {
                    const guardMetadata = await getSafeGroupMetadata(wss, mctx.chat.jid);
                    const senderParticipant = findParticipant(guardMetadata, mctx.sender.jid);
                    const senderIdentities = getParticipantIdentityJids(senderParticipant, [mctx.sender.jid]);
                    const senderCheckJids = senderIdentities.length ? senderIdentities : [mctx.sender.jid];
                    const antiScopedGroupJid = await ensureScopedGroupSeed(guardBot, mctx.chat.jid);
                    const guardGroup = await database.Groups.get(antiScopedGroupJid);
                    const userIsAdmin = isUserAdminInMetadata(guardMetadata, mctx.sender.jid);
                    if (guardGroup?.antispam_enabled && !userIsAdmin) {
                        const now = Date.now();
                        const key = getAntiSpamKey(mctx.chat.jid, mctx.sender.jid);
                        const previousState = antiSpamState.get(key) || { messages: [], stickers: [], repeatCount: 0 };
                        const updatedState = pruneAntiSpamState(previousState, now);
                        updatedState.messages.push(now);
                        const messageText = String(mctx.message.text || "").trim();
                        const normalizedText = messageText.toLowerCase();
                        if (normalizedText) {
                            if (updatedState.lastText === normalizedText) {
                                updatedState.repeatCount += 1;
                            }
                            else {
                                updatedState.lastText = normalizedText;
                                updatedState.repeatCount = 1;
                            }
                            updatedState.lastTextAt = now;
                        }
                        else {
                            updatedState.lastText = undefined;
                            updatedState.repeatCount = 0;
                            updatedState.lastTextAt = undefined;
                        }
                        if (mctx.message.type === "stickerMessage") {
                            updatedState.stickers.push(now);
                        }
                        const isStickerSpam = updatedState.stickers.length >= ANTI_SPAM_STICKER_THRESHOLD;
                        const isRepeatedTextKick = updatedState.repeatCount >= ANTI_SPAM_REPEAT_KICK_THRESHOLD;
                        const isRepeatedTextWarn = updatedState.repeatCount >= ANTI_SPAM_REPEAT_WARN_THRESHOLD && updatedState.repeatCount < ANTI_SPAM_REPEAT_KICK_THRESHOLD;
                        const isMessageSpam = false;
                        const hasSpam = isStickerSpam || isRepeatedTextWarn || isRepeatedTextKick;
                        const shouldKick = updatedState.warnedAt && (isStickerSpam || isRepeatedTextKick);
                        const shouldWarn = !updatedState.warnedAt && hasSpam;
                        if (hasSpam) {
                            const reason = isStickerSpam ? "stickers" : isRepeatedTextKick || isRepeatedTextWarn ? "mensajes repetidos" : "mensajes";
                            if (shouldWarn) {
                                updatedState.warnedAt = now;
                                antiSpamState.set(key, updatedState);
                                try {
                                    await mctx.delete();
                                }
                                catch { }
                                await wss.sendMessage(mctx.chat.jid, {
                                    text: `*｢✧｣* @${mctx.sender.jid.split("@")[0]} advertencia por spam de ${reason}. Si continúas, serás expulsado.`,
                                    mentions: [mctx.sender.jid],
                                });
                                continue;
                            }
                            try {
                                await mctx.delete();
                            }
                            catch { }
                            if (!shouldKick) {
                                antiSpamState.set(key, updatedState);
                                continue;
                            }
                            if (LOG_MESSAGES)
                                console.log(`[AntiSpam] Spam detectado: ${mctx.sender.jid}`);
                            let kicked = false;
                            const senderJid = mctx.sender.jid;
                            const kickMethods = [
                                () => wss.groupParticipantsUpdate(mctx.chat.jid, [senderJid], "remove"),
                                () => wss.groupParticipantsUpdate(mctx.chat.jid, [senderJid.replace("@lid", "@s.whatsapp.net")], "remove"),
                                () => wss.groupParticipantsUpdate(mctx.chat.jid, [senderJid.split("@")[0] + "@s.whatsapp.net"], "remove"),
                            ];
                            for (const method of kickMethods) {
                                try {
                                    await method();
                                    kicked = true;
                                    break;
                                }
                                catch (error) {
                                    if (LOG_MESSAGES)
                                        console.log(`[AntiSpam] Método de expulsión falló:`, error?.message || error);
                                    continue;
                                }
                            }
                            const messageText = kicked
                                ? `*｢✧｣* @${senderJid.split("@")[0]} fue expulsado por spam de ${reason}.`
                                : `*｢✧｣* @${senderJid.split("@")[0]} fue detectado por spam de ${reason}, pero no pude expulsarlo.`;
                            await wss.sendMessage(mctx.chat.jid, {
                                text: messageText,
                                mentions: [senderJid],
                            });
                            antiSpamState.delete(key);
                            continue;
                        }
                        antiSpamState.set(key, updatedState);
                    }
                    const antiTagEnabled = await isAntiTagEnabled(guardBotJid, mctx.chat.jid);
                    if (antiTagEnabled) {
                        const allowedTagUser = await isAllowedTagUserAny(guardBotJid, mctx.chat.jid, senderCheckJids);
                        if (!allowedTagUser &&
                            await shouldDeleteForwardedTag(mctx, guardBotJid, [guardBotJid, guardBot?.bot_jid || "", mctx.me.jids.lid, mctx.me.jids.pn])) {
                            try {
                                await mctx.delete();
                                if (LOG_MESSAGES)
                                    console.log(`[AntiTag] Tag reenviado borrado: ${mctx.sender.jid}`);
                            }
                            catch (error) {
                                if (LOG_MESSAGES)
                                    console.log(`[AntiTag] No pude borrar:`, error?.message || error);
                            }
                            continue;
                        }
                    }
                    if (await isMutedUserAny(guardBotJid, mctx.chat.jid, senderCheckJids)) {
                        try {
                            await mctx.delete();
                            if (LOG_MESSAGES)
                                console.log(`[MuteUser] Mensaje borrado: ${mctx.sender.jid}`);
                        }
                        catch (error) {
                            if (LOG_MESSAGES)
                                console.log(`[MuteUser] No pude borrar:`, error?.message || error);
                        }
                        continue;
                    }
                }
            }
            if (mctx.is_private && mctx.message.text) {
                const { rawBot: botDoc } = await getRuntimeBot();
                const inviteCode = extractInviteCode(mctx.message.text);
                if (botDoc?.autojoin_enabled && botDoc.bot_type !== "free" && inviteCode && isBotOwnerIdentity(mctx.sender.jid, botDoc)) {
                    try {
                        await wss.groupAcceptInvite(inviteCode);
                        await mctx.reply(`「◈」 Autojoin
◈ Estado 》 unido correctamente
◈ Grupo 》 invitación aceptada`);
                    }
                    catch (error) {
                        await mctx.reply(`「◈」 Autojoin
◈ Estado 》 no pude unirme
◈ Error 》 ${error?.message || error}`);
                    }
                    continue;
                }
            }
            if (mctx.is_group && mctx.message.text) {
                const { bot: antiBotDoc } = await getRuntimeBot();
                const antiScopedGroupJid = await ensureScopedGroupSeed(antiBotDoc, mctx.chat.jid);
                const group = await database.Groups.get(antiScopedGroupJid);
                if (group?.antilinks_enabled) {
                    if (containsBlockedLink(mctx.message.text)) {
                        try {
                            const groupMetadata = await getSafeGroupMetadata(wss, mctx.chat.jid);
                            if (groupMetadata && groupMetadata.participants) {
                                const senderJid = mctx.sender.jid;
                                const userIsAdmin = isUserAdminInMetadata(groupMetadata, senderJid);
                                let botIsAdmin = isBotAdminInMetadata(groupMetadata, wss, mctx, antiBotDoc);
                                if (!botIsAdmin) {
                                    const freshMetadata = await getSafeGroupMetadata(wss, mctx.chat.jid, true);
                                    botIsAdmin = isBotAdminInMetadata(freshMetadata || groupMetadata, wss, mctx, antiBotDoc);
                                }
                                if (!userIsAdmin && botIsAdmin) {
                                    await mctx.delete();
                                    const kickMethods = [
                                        () => wss.groupParticipantsUpdate(mctx.chat.jid, [senderJid], "remove"),
                                        () => wss.groupParticipantsUpdate(mctx.chat.jid, [senderJid.replace("@lid", "@s.whatsapp.net")], "remove"),
                                        () => wss.groupParticipantsUpdate(mctx.chat.jid, [senderJid.split("@")[0] + "@s.whatsapp.net"], "remove"),
                                    ];
                                    let kicked = false;
                                    for (const method of kickMethods) {
                                        try {
                                            await method();
                                            kicked = true;
                                            break;
                                        }
                                        catch (error) {
                                            if (LOG_MESSAGES)
                                                console.log(`[Antilinks] Método de expulsión falló:`, error?.message || error);
                                            continue;
                                        }
                                    }
                                    if (kicked) {
                                        await wss.sendMessage(mctx.chat.jid, {
                                            text: `*｢✧｣* @${mctx.sender.jid.split("@")[0]} fue expulsado por enviar enlaces prohibidos (webs, redes sociales o WhatsApp).`,
                                            mentions: [senderJid],
                                        });
                                    }
                                    else {
                                        await wss.sendMessage(mctx.chat.jid, {
                                            text: `*｢✧｣* @${mctx.sender.jid.split("@")[0]} envió un enlace prohibido (web, red social o WhatsApp) pero no pudo ser expulsado.`,
                                            mentions: [senderJid],
                                        });
                                    }
                                    continue;
                                }
                            }
                        }
                        catch (error) {
                            console.error("[Antilinks] Error:", error);
                        }
                    }
                }
            }
            if (!mctx.message.text) {
                continue;
            }
            const text = mctx.message.text.trim();
            // .nss sin comando: si el mensaje completo es una CURP con forma válida, se procesa directo.
            if (!mctx.message.from_me) {
                const standaloneCurp = matchStandaloneCurp(text);
                if (standaloneCurp) {
                    await runNssLookup(wss, mctx, standaloneCurp);
                    continue;
                }
            }
            const { botLookupJid: prefixBotLookupJid, rawBot: prefixRawBot, bot: prefixBot } = await getRuntimeBot();
            const usedPrefix = getMatchedCommandPrefix(text, prefixBot);
            const mentionAiPrompt = !usedPrefix ? extractMentionAiPrompt(text, mctx, wss) : null;
            if (usedPrefix || mentionAiPrompt !== null) {
                if (mctx.is_group) {
                    const { rawBot: priorityRawBot } = await getRuntimeBot();
                    const currentBotType = priorityRawBot?.bot_type || "free";
                    // Jerarquía: main > premium > free. Cada tipo se calla si hay uno de mayor rango en el grupo.
                    const higherRanks = currentBotType === "main" ? [] : currentBotType === "premium" ? ["main"] : ["main", "premium"];
                    if (higherRanks.length > 0) {
                        try {
                            const groupMetadata = await getSafeGroupMetadata(wss, mctx.chat.jid);
                            if (groupMetadata?.participants?.length) {
                                // Identidades de rango superior: primero las conectadas en este mismo proceso (Bot.bots),
                                // más las registradas manualmente vía el comando .rango (cross-proceso, guardadas en la BD local de este bot)
                                const higherBotIdentities = [];
                                for (const [, runtimeBot] of Bot.bots) {
                                    if (!higherRanks.includes(runtimeBot.bot_type))
                                        continue;
                                    const liveUser = runtimeBot.wss?.user;
                                    if (liveUser?.id)
                                        higherBotIdentities.push(liveUser.id);
                                    if (liveUser?.lid)
                                        higherBotIdentities.push(liveUser.lid);
                                    if (runtimeBot.bot_jid)
                                        higherBotIdentities.push(runtimeBot.bot_jid);
                                }
                                const registeredHigherBots = await database.Bots.listByType(higherRanks).catch(() => []);
                                for (const registered of registeredHigherBots) {
                                    if (registered.bot_jid)
                                        higherBotIdentities.push(registered.bot_jid);
                                }
                                // Cadena de padres automática: todo bot creado con .qr/.code bajo otro bot ya guarda
                                // quién lo creó (parent_bot_jid) sin que nadie tenga que configurar nada a mano.
                                let parentJid = priorityRawBot?.hierarchy_parent_jid || priorityRawBot?.parent_bot_jid || "";
                                let hops = 0;
                                while (parentJid && hops < 4) {
                                    const parentDoc = await database.Bots.find(parentJid).catch(() => null);
                                    if (!parentDoc) {
                                        higherBotIdentities.push(parentJid);
                                        break;
                                    }
                                    if (higherRanks.includes(parentDoc.bot_type)) {
                                        if (parentDoc.bot_jid)
                                            higherBotIdentities.push(parentDoc.bot_jid);
                                    }
                                    parentJid = parentDoc.hierarchy_parent_jid || parentDoc.parent_bot_jid || "";
                                    hops++;
                                }
                                // Coincidencia robusta lid/número usando el mismo resolver que .lid y .fantasmas ya usan
                                const higherBotInGroup = higherBotIdentities.some((identity) => isTargetInGroupMetadata(identity, groupMetadata));
                                if (LOG_MESSAGES) {
                                    console.log(`[BotPriority] bot=${currentBotType} grupo=${mctx.chat.jid} identities=${JSON.stringify(Array.from(new Set(higherBotIdentities)))} silenciado=${higherBotInGroup}`);
                                }
                                if (higherBotInGroup) {
                                    continue;
                                }
                            }
                        }
                        catch (error) {
                            console.error("[BotPriority] Error verificando jerarquía de bots:", error);
                        }
                    }
                }
                const commandBody = usedPrefix ? text.slice(usedPrefix.length).trimStart() : AI_COMMAND_NAME;
                if (!commandBody) {
                    continue;
                }
                let commandName = AI_COMMAND_NAME;
                let args = mentionAiPrompt !== null ? mentionAiPrompt.split(/\s+/).filter(Boolean) : [];
                if (usedPrefix) {
                    const textSplit = commandBody.split(/\s+/);
                    commandName = (textSplit.shift() || "").toLowerCase();
                    args = textSplit;
                }
                let commandUsed = libs.Command.get(commandName);
                if (commandUsed) {
                    if (LOG_MESSAGES)
                        console.log(`[Commands] Ejecutando: ${commandUsed.name}`);
                    const botLookupJid = prefixBotLookupJid;
                    const rawBot = prefixRawBot;
                    const bot = prefixBot;
                    const scopedGroupJid = mctx.is_group ? await ensureScopedGroupSeed(bot, mctx.chat.jid) : mctx.chat.jid;
                    let [user, group] = await Promise.all([
                        database.Users.get(mctx.sender.jid),
                        mctx.is_group ? database.Groups.get(scopedGroupJid) : database.Groups.get(mctx.chat.jid),
                    ]);
                    if (!user) {
                        user = await database.Users.set(mctx.sender.jid, {
                            user_jid: mctx.sender.jid,
                            name: mctx.sender.name,
                        });
                        if (!user) {
                            continue;
                        }
                    }
                    else if (mctx.sender.name && mctx.sender.name !== "~" && user.name !== mctx.sender.name) {
                        user = await database.Users.update(mctx.sender.jid, {
                            $set: {
                                name: mctx.sender.name,
                            },
                        }) || user;
                    }
                    let groupMetadata = null;
                    if (mctx.is_group) {
                        if (!group) {
                            group = await database.Groups.set(scopedGroupJid, {
                                group_jid: scopedGroupJid,
                                primary_bot: getScopedGroupJid(bot, mctx.chat.jid).split("::")[0],
                            });
                        }
                        if (!group) {
                            continue;
                        }
                        if (!group.users.some((v) => v.user_jid === mctx.sender.jid)) {
                            group = await database.Groups.update(scopedGroupJid, {
                                $push: {
                                    users: {
                                        user_jid: mctx.sender.jid,
                                    },
                                },
                            });
                        }
                        try {
                            groupMetadata = await getSafeGroupMetadata(wss, mctx.chat.jid);
                        }
                        catch (error) {
                            console.error("[Messages] Error obteniendo metadatos del grupo:", error);
                        }
                    }
                    const userIsOwner = user.range === "Owner" || isOwner(mctx.sender.jid);
                    const botOwnerJid = bot?.owner_jid || "";
                    const currentBotScopeJid = getEffectiveBotJid(bot) || botLookupJid || mctx.me.jids.lid || mctx.me.jids.pn;
                    const sameBotActor = mctx.message.from_me ||
                        sameIdentity(mctx.sender.jid, bot?.bot_jid) ||
                        sameIdentity(mctx.sender.jid, currentBotScopeJid) ||
                        sameIdentity(mctx.sender.jid, mctx.me.jids.lid) ||
                        sameIdentity(mctx.sender.jid, mctx.me.jids.pn);
                    const officialBootstrapOwner = (bot?.bot_type === "main" || bot?.bot_type === "premium") &&
                        !ownerIsConfigured(botOwnerJid) &&
                        (sameBotActor || isOwner(mctx.sender.jid));
                    const userIsPrimaryBotOwner = userIsOwner ||
                        isEstablishedBotOwner(mctx.sender.jid, bot) ||
                        officialBootstrapOwner;
                    const userIsBotSubOwner = !userIsPrimaryBotOwner
                        ? await database.BotSubOwners.has(currentBotScopeJid, mctx.sender.jid)
                        : false;
                    const userIsBotOwner = userIsPrimaryBotOwner || userIsBotSubOwner;
                    let userIsAdmin = false;
                    let botIsAdmin = false;
                    if (mctx.is_group) {
                        if (!groupMetadata || !groupMetadata.participants?.length) {
                            groupMetadata = await getSafeGroupMetadata(wss, mctx.chat.jid);
                        }
                        userIsAdmin = userIsOwner || isUserAdminInMetadata(groupMetadata, mctx.sender.jid);
                        botIsAdmin = isBotAdminInMetadata(groupMetadata, wss, mctx, bot);
                        if (!botIsAdmin || !userIsAdmin) {
                            groupMetadata = await getSafeGroupMetadata(wss, mctx.chat.jid, true) || groupMetadata;
                            botIsAdmin = isBotAdminInMetadata(groupMetadata, wss, mctx, bot);
                            userIsAdmin = userIsOwner || isUserAdminInMetadata(groupMetadata, mctx.sender.jid);
                        }
                        if (LOG_MESSAGES) {
                            console.log(`[BotAdmin] Bot Is Admin: ${botIsAdmin}`);
                            console.log(`[BotAdmin] User Is Admin: ${userIsAdmin}`);
                            console.log(`[BotAdmin] Group Owner: ${groupMetadata?.owner || ""}`);
                        }
                    }
                    if (mctx.is_group && group?.autoadmin_enabled && userIsPrimaryBotOwner && botIsAdmin && !userIsAdmin) {
                        const promoted = await promoteGroupParticipant(wss, mctx.chat.jid, mctx.sender.jid, groupMetadata);
                        if (promoted) {
                            userIsAdmin = true;
                            groupMetadata = (await getSafeGroupMetadata(wss, mctx.chat.jid)) || groupMetadata;
                            if (LOG_MESSAGES)
                                console.log(`[AutoAdmin] Owner promovido/verificado: ${mctx.sender.jid}`);
                        }
                    }
                    if (!userIsOwner && !userIsBotOwner && currentBotScopeJid) {
                        const senderIdentities = mctx.is_group
                            ? getParticipantIdentityJids(findParticipant(groupMetadata, mctx.sender.jid), [mctx.sender.jid])
                            : [mctx.sender.jid];
                        const senderCheckJids = senderIdentities.length ? senderIdentities : [mctx.sender.jid];
                        let blockedByBanUser = false;
                        for (const botJid of getBotScopeJids(bot, mctx)) {
                            if (await isBannedBotUserAny(botJid, senderCheckJids)) {
                                blockedByBanUser = true;
                                break;
                            }
                        }
                        if (blockedByBanUser) {
                            if (LOG_MESSAGES)
                                console.log(`[BanUser] Comando ignorado: ${mctx.sender.jid}`);
                            continue;
                        }
                    }
                    if (mctx.is_private && !commandCanUsePrivateByDefault(commandUsed)) {
                        const allChatsEnabled = await database.BotSettings.getBool(currentBotScopeJid, ALL_CHATS_SETTING_KEY, false);
                        const canRunInPrivate = allChatsEnabled && !commandUsed.flags.includes("only.groups");
                        if (!canRunInPrivate) {
                            await mctx.reply(`「◈」 CHAT PRIVADO
◈ Comando › ${usedPrefix + commandName}
◈ Estado › disponible en grupos
◈ Activar › ${usedPrefix}allchats on`);
                            continue;
                        }
                    }
                    if (commandUsed.flags.includes("only.groups") && !mctx.is_group && !commandCanUsePrivateByDefault(commandUsed)) {
                        await mctx.reply(`「◈」 SOLO GRUPOS
◈ Comando › ${usedPrefix + commandName}
◈ Estado › usa este comando en un grupo`);
                        continue;
                    }
                    if (commandUsed.flags.includes("only.private") && !mctx.is_private) {
                        await mctx.reply(`*｢✧｣* El comando *${usedPrefix + commandName}* solo puede ser utilizado en el chat privado del bot.`);
                        continue;
                    }
                    if (PRIMARY_OWNER_COMMANDS.has(commandUsed.name) && !userIsOwner) {
                        await mctx.reply(`「◈」 ACCESO DENEGADO
◈ Comando › ${usedPrefix + commandName}
◈ Permiso › owner principal del sistema
◈ Estado › bloqueado`);
                        continue;
                    }
                    if (String(bot?.bot_type || "") === "free" && FREE_RESTRICTED_COMMANDS.has(commandUsed.name) && !userIsOwner) {
                        await mctx.reply(`「◈」 ACCESO LIMITADO
◈ Socket › free
◈ Comando › ${usedPrefix + commandName}
◈ Permiso › no puede modificar configuración
◈ Requiere › premium u oficial`);
                        continue;
                    }
                    if (commandUsed.requires.includes("bot.owner") && !userIsBotOwner) {
                        await mctx.reply(`*｢✧｣* Solo owner del bot.`);
                        continue;
                    }
                    if (commandUsed.requires.includes("owner.user") && !userIsOwner) {
                        await mctx.reply(`*｢✧｣* Este comando solo puede ser utilizado por owners del sistema.`);
                        continue;
                    }
                    if (commandUsed.requires.includes("moderator.user") && !(user.range === "Mod" || userIsOwner)) {
                        await mctx.reply(`*｢✧｣* Este comando solo puede ser utilizado por moderadores.`);
                        continue;
                    }
                    if (commandUsed.requires.includes("premium.user") && !(user.range === "Premium" || userIsOwner || userIsBotOwner)) {
                        await mctx.reply(`*｢✧｣* Este comando solo puede ser utilizado por usuarios premium o el owner del bot.`);
                        continue;
                    }
                    if (commandUsed.requires.includes("administrator") && !botIsAdmin) {
                        await mctx.reply(`*｢✧｣* Necesito ser administrador del grupo para ejecutar este comando.`);
                        continue;
                    }
                    if (commandUsed.requires.includes("administrator.user") && !userIsAdmin) {
                        await mctx.reply(`*｢✧｣* Necesitas ser administrador del grupo para ejecutar este comando.`);
                        continue;
                    }
                    if (group?.admins_only_enabled && !userIsAdmin && !userIsBotOwner) {
                        await mctx.reply(`*｢✧｣* Este grupo tiene activado el modo solo administradores.`);
                        continue;
                    }
                    try {
                        const commandExecuteContext = {
                            mctx: mctx,
                            commandName: commandName,
                            usedPrefix,
                            args: args,
                            group: group || {},
                            user: user,
                            bot: bot || {
                                bot_jid: mctx.me.jids.lid,
                                name: mctx.me.name,
                                owner_jid: "",
                                owner_name: "",
                                logo_url: "",
                                thumbnail_url: "",
                                bot_type: "main",
                                parent_bot_jid: "",
                                currency: "",
                            },
                            groupMetadata: groupMetadata || {},
                            userIsBotOwner: userIsBotOwner,
                            userIsPrimaryBotOwner,
                            userIsBotSubOwner,
                            botIsAdmin: botIsAdmin,
                            userIsAdmin: userIsAdmin,
                            userIsMod: user.range === "Mod" || userIsOwner || userIsBotSubOwner,
                            userIsOwner: userIsOwner,
                            userIsPremium: user.range === "Premium" || userIsOwner || userIsBotSubOwner,
                        };
                        await commandUsed.execute(wss, commandExecuteContext);
                        if (LOG_MESSAGES)
                            console.log(`[Commands] ✅ ${commandUsed.name}`);
                    }
                    catch (error) {
                        console.error(`[Commands] ❌ Error:`, error);
                        await mctx.reply(`*｢✧｣* Error ejecutando comando: ${error}`);
                    }
                }
            }
        }
    }
    catch (error) {
        console.error(`[Messages] ❌ Error:`, error);
    }
};
