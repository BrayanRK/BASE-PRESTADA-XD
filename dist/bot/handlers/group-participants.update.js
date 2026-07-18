import { jidNormalizedUser } from "baileys";
import { getBotOwnerIdentityJids, jidNumber, sameUser } from "../../libs/socket-manager.js";
import * as database from "../../database/database.js";
import { ensureScopedGroupSeed, getInheritedBotConfig } from "../../libs/bot-scope.js";
import { mergeCaptionWithMenuMedia } from "../../libs/zeta_assets.js";
import { isTargetInGroupMetadata } from "../../libs/lid-resolver.js";
import { Bot } from "../bot.js";
const eventCache = new Set();
const candidateJids = (jid) => {
    const number = jidNumber(jid);
    return Array.from(new Set([
        jid,
        jid.replace("@lid", "@s.whatsapp.net"),
        number ? `${number}@s.whatsapp.net` : "",
        number ? `${number}@lid` : "",
    ].filter(Boolean)));
};
const promoteOwnerIfNeeded = async (groupJid, participant, groupMetadata, wss, bot) => {
    if (!bot || !getBotOwnerIdentityJids(bot).some((ownerJid) => sameUser(participant, ownerJid) || participant === ownerJid))
        return;
    const botParticipant = groupMetadata.participants.find((item) => sameUser(item.id, wss.user?.id) || sameUser(item.id, wss.user?.lid));
    const ownerParticipant = groupMetadata.participants.find((item) => sameUser(item.id, participant));
    if (!botParticipant?.admin || ownerParticipant?.admin)
        return;
    const targets = ownerParticipant?.id ? [ownerParticipant.id, ...candidateJids(participant)] : candidateJids(participant);
    for (const target of Array.from(new Set(targets))) {
        try {
            await wss.groupParticipantsUpdate(groupJid, [target], "promote");
            return;
        }
        catch {
            continue;
        }
    }
};
const getParticipantJid = (participant) => {
    if (typeof participant === "string")
        return participant;
    return participant?.id || participant?.jid || "";
};
const LOG_MESSAGES = /^(1|true|yes)$/i.test(process.env.ZETA_LOG_MESSAGES || "");
const isSilencedByHigherRank = async (currentBotType, parentBotJid, groupMetadata) => {
    const higherRanks = currentBotType === "main" ? [] : currentBotType === "premium" ? ["main"] : ["main", "premium"];
    if (higherRanks.length === 0)
        return false;
    if (!groupMetadata?.participants?.length)
        return false;
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
    // Cadena de padres automática: bots creados con .qr/.code bajo otro bot ya guardan quién los creó
    let parentJid = parentBotJid || "";
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
    if (higherBotIdentities.length === 0)
        return false;
    const silenced = higherBotIdentities.some((identity) => isTargetInGroupMetadata(identity, groupMetadata));
    if (LOG_MESSAGES) {
        console.log(`[BotPriority] (welcome) bot=${currentBotType} grupo=${groupMetadata.id} identities=${JSON.stringify(Array.from(new Set(higherBotIdentities)))} silenciado=${silenced}`);
    }
    return silenced;
};
const getScopeForSocket = async (wss, groupJid) => {
    const lid = jidNormalizedUser(wss.user?.lid || "");
    const pn = jidNormalizedUser(wss.user?.id || "");
    const botLookupJid = lid && (await database.Bots.has(lid)) ? lid : pn;
    const botDoc = await getInheritedBotConfig(await database.Bots.get(botLookupJid));
    return { scopedGroupJid: await ensureScopedGroupSeed(botDoc, groupJid), bot: botDoc };
};
export const groupParticipantsUpdate = async (update, wss) => {
    try {
        if (!update.id || !update.participants?.length)
            return;
        const participants = update.participants
            .map(getParticipantJid)
            .filter(Boolean)
            .map((jid) => jidNormalizedUser(jid));
        if (!participants.length)
            return;
        console.log(`[GroupParticipants] Event: ${update.action} in ${update.id} for ${participants.join(", ")}`);
        const scope = await getScopeForSocket(wss, update.id);
        const scopedGroupJid = scope.scopedGroupJid;
        const [groupMetadata, group] = await Promise.all([
            wss.groupMetadata(update.id, false).catch(() => null),
            database.Groups.get(scopedGroupJid),
        ]);
        if (!group || !groupMetadata)
            return;
        if (group.mute_all_enabled)
            return;
        const currentBotType = scope.bot?.bot_type || "free";
        const silencedByHigherRank = await isSilencedByHigherRank(currentBotType, scope.bot?.hierarchy_parent_jid || scope.bot?.parent_bot_jid, groupMetadata);
        for (const participant of participants) {
            const eventKey = `${update.id}_${participant}_${update.action}`;
            if (eventCache.has(eventKey))
                continue;
            eventCache.add(eventKey);
            setTimeout(() => eventCache.delete(eventKey), 3000);
            if (update.action === "add") {
                if (group.autoadmin_enabled)
                    await promoteOwnerIfNeeded(update.id, participant, groupMetadata, wss, scope.bot);
                if (silencedByHigherRank)
                    continue;
                if (!group.welcomes_enabled)
                    continue;
                if (participant === jidNormalizedUser(wss.user.lid) || participant === jidNormalizedUser(wss.user.id))
                    continue;
                await sendWelcomeMessage(update.id, participant, group, groupMetadata, wss, scope.bot);
            }
            else if (update.action === "remove") {
                if (silencedByHigherRank)
                    continue;
                if (!group.farewells_enabled)
                    continue;
                if (participant === jidNormalizedUser(wss.user.lid) || participant === jidNormalizedUser(wss.user.id))
                    continue;
                await sendFarewellMessage(update.id, participant, group, groupMetadata, wss, scope.bot);
            }
            else if (update.action === "promote") {
                if (silencedByHigherRank)
                    continue;
                if (!group.alerts_enabled)
                    continue;
                const promoteMessage = `*｢❀｣* El participante @${participant.split("@")[0]} ha sido promovido a administrador${update.author ? ` por @${update.author.split("@")[0]}` : ""}`;
                await wss.sendMessage(update.id, {
                    text: promoteMessage,
                    mentions: [participant, ...(update.author ? [update.author] : [])],
                });
            }
            else if (update.action === "demote") {
                if (silencedByHigherRank)
                    continue;
                if (!group.alerts_enabled)
                    continue;
                const demoteMessage = `*｢✧｣* El participante @${participant.split("@")[0]} ha sido degradado de administrador${update.author ? ` por @${update.author.split("@")[0]}` : ""}`;
                await wss.sendMessage(update.id, {
                    text: demoteMessage,
                    mentions: [participant, ...(update.author ? [update.author] : [])],
                });
            }
        }
    }
    catch (error) {
        console.error("[GroupParticipants] Error:", error);
    }
};
const sendWelcomeMessage = async (groupJid, participant, group, groupMetadata, wss, bot) => {
    try {
        let defaultWelcomeMessage = "「◈」 *BIENVENIDO 👋😺*\n";
        defaultWelcomeMessage += "> *· A ›* %group_subject%\n";
        defaultWelcomeMessage += "> *· Participante ›* %participant_name%\n";
        defaultWelcomeMessage += "> ­\n";
        defaultWelcomeMessage += "> *· Ahora somos ›* %group_size% participantes\n";
        defaultWelcomeMessage += "> _*Disfruta tu estadía en el grupo.*_\n";
        defaultWelcomeMessage += "◈ ━ ─ ━ ─ ☞︎︎︎ ✰ ☜︎︎︎ ─ ━ ─ ━";
        let welcomeMessage = group.welcome_message || defaultWelcomeMessage;
        welcomeMessage = welcomeMessage.replace(/\\n/g, '\n');
        const userName = await wss.getName(participant);
        const userNumber = participant.split("@")[0];
        welcomeMessage = welcomeMessage
            .replace(/%participant_jid%/g, userNumber)
            .replace(/%participant_name%/g, userName)
            .replace(/%group_subject%/g, groupMetadata.subject || "Grupo")
            .replace(/%group_size%/g, String(groupMetadata.participants?.length || 0))
            .replace(/%group_desc%/g, groupMetadata.desc || "Sin descripción");
        const welcomeBot = group.welcome_image_url ? { ...(bot || {}), welcome_url: group.welcome_image_url } : bot;
        const welcomeContent = await mergeCaptionWithMenuMedia("welcome", welcomeMessage, welcomeBot);
        await wss.sendMessage(groupJid, {
            ...welcomeContent,
            mentions: [participant],
        });
        console.log(`[Welcome] Sent for ${participant} in ${groupJid}`);
    }
    catch (error) {
        console.error("[Welcome] Error:", error);
    }
};
const sendFarewellMessage = async (groupJid, participant, group, groupMetadata, wss, bot) => {
    try {
        let defaultFarewellMessage = "「◈」 *ADIÓS 👋😿*\n";
        defaultFarewellMessage += "> *· De ›* %group_subject%\n";
        defaultFarewellMessage += "> *· Participante ›* %participant_name%\n";
        defaultFarewellMessage += "> ­\n";
        defaultFarewellMessage += "> *· Ahora somos ›* %group_size% participantes\n";
        defaultFarewellMessage += "> _*Ojalá volver a verte de nuevo por aquí.*_\n";
        defaultFarewellMessage += "◈ ━ ─ ━ ─ ☞︎︎︎ ✰ ☜︎︎︎ ─ ━ ─ ━";
        let farewellMessage = group.farewell_message || defaultFarewellMessage;
        farewellMessage = farewellMessage.replace(/\\n/g, '\n');
        const userName = await wss.getName(participant);
        const userNumber = participant.split("@")[0];
        farewellMessage = farewellMessage
            .replace(/%participant_jid%/g, userNumber)
            .replace(/%participant_name%/g, userName)
            .replace(/%group_subject%/g, groupMetadata.subject || "Grupo")
            .replace(/%group_size%/g, String(groupMetadata.participants?.length || 0))
            .replace(/%group_desc%/g, groupMetadata.desc || "Sin descripción");
        const farewellBot = group.farewell_image_url ? { ...(bot || {}), welcome_url: group.farewell_image_url } : bot;
        const farewellContent = await mergeCaptionWithMenuMedia("welcome", farewellMessage, farewellBot);
        await wss.sendMessage(groupJid, {
            ...farewellContent,
            mentions: [participant],
        });
        console.log(`[Farewell] Sent for ${participant} in ${groupJid}`);
    }
    catch (error) {
        console.error("[Farewell] Error:", error);
    }
};
export const handleWelcomeEvents = async (message, wss) => {
    try {
        if (!message.messageStubType || !message.key.remoteJid?.endsWith("@g.us")) {
            return;
        }
        const groupJid = message.key.remoteJid;
        const stubType = message.messageStubType;
        const participants = message.messageStubParameters || [];
        console.log(`[StubMessage] Type: ${stubType} in ${groupJid} for ${participants.join(", ")}`);
        if (![27, 28, 32].includes(stubType)) {
            return;
        }
        const scope = await getScopeForSocket(wss, groupJid);
        const group = await database.Groups.get(scope.scopedGroupJid);
        if (!group)
            return;
        const isWelcomeEvent = stubType === 27;
        const isFarewellEvent = [28, 32].includes(stubType);
        if (isWelcomeEvent && !group.welcomes_enabled)
            return;
        if (isFarewellEvent && !group.farewells_enabled)
            return;
        const groupMetadata = await wss.groupMetadata(groupJid).catch(() => null);
        if (!groupMetadata)
            return;
        for (const participantJid of participants) {
            if (!participantJid)
                continue;
            const eventKey = `stub_${groupJid}_${participantJid}_${stubType}`;
            if (eventCache.has(eventKey))
                continue;
            eventCache.add(eventKey);
            setTimeout(() => eventCache.delete(eventKey), 3000);
            if (isWelcomeEvent) {
                await sendWelcomeMessage(groupJid, participantJid, group, groupMetadata, wss, scope.bot);
            }
            else if (isFarewellEvent) {
                await sendFarewellMessage(groupJid, participantJid, group, groupMetadata, wss, scope.bot);
            }
        }
    }
    catch (error) {
        console.error("[StubMessage] Error:", error);
    }
};
