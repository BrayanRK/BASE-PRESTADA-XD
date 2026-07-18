import * as database from "../../../database/database.js";
import { canConfigureSocket, denyFreeConfigMessage, normalizeJid, ownerIsConfigured, socketConfigOnlyMessage } from "../../../libs/socket-manager.js";
import { updateUniversalConfig } from "../../../libs/zeta_cf.js";
import { resolveUserLid } from "../../../libs/lid-resolver.js";
import { getBotScopeJid, sameIdentity } from "../../../libs/lucasxt-moderation.js";
const cleanText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const stripJidDevice = (jid) => cleanText(jid).split(":")[0].toLowerCase();
const jidNumber = (jid) => stripJidDevice(String(jid || "")).split("@")[0].replace(/[^0-9]/g, "");
const isRawJid = (value) => /@(lid|s\.whatsapp\.net)$/i.test(stripJidDevice(value));
const isLidJid = (value) => /@lid$/i.test(stripJidDevice(String(value || "")));
const isPhoneJid = (value) => /@s\.whatsapp\.net$/i.test(stripJidDevice(String(value || "")));
const normalizeIdentityJid = (value) => {
    const raw = stripJidDevice(String(value || ""));
    if (!raw)
        return "";
    if (isRawJid(raw))
        return raw;
    return normalizeJid(raw);
};
const getPhoneNumberFromText = (text) => {
    const withoutJids = cleanText(text)
        .split(/\s+/)
        .filter((part) => !/@(lid|s\.whatsapp\.net)$/i.test(part))
        .join(" ");
    const match = withoutJids.match(/\+?\d[\d\s().-]{7,20}\d/);
    const digits = (match?.[0] || "").replace(/\D/g, "");
    return /^\d{8,15}$/.test(digits) ? digits : "";
};
const getNamedIdentityArg = (args) => {
    for (let i = 0; i < args.length; i++) {
        const arg = cleanText(args[i]);
        const lower = arg.toLowerCase();
        const inline = lower.match(/^(?:id|jid|lid|ownerid|owner_jid)[:=](.+)$/i);
        if (inline?.[1] && isRawJid(inline[1]))
            return inline[1];
        if (/^(id|jid|lid|ownerid|owner_jid)$/i.test(lower)) {
            const next = cleanText(args[i + 1]);
            if (next && isRawJid(next))
                return next;
        }
    }
    return "";
};
const getExplicitIdentityJid = (mctx, args) => {
    const mentioned = mctx.message.mentioned?.[0] || mctx.message.mentionedJid?.[0] || "";
    if (mentioned)
        return mentioned;
    const quoted = mctx.quoted?.sender?.jid || "";
    if (quoted)
        return quoted;
    const first = cleanText(args[0]).toLowerCase();
    if (first === "me" || first === "yo")
        return mctx.sender.jid;
    const namedIdentity = getNamedIdentityArg(args);
    if (namedIdentity)
        return namedIdentity;
    const rawJidArg = args.find((arg) => isRawJid(arg)) || "";
    if (rawJidArg)
        return rawJidArg;
    return "";
};
const getTypedName = (text) => cleanText(text)
    .replace(/\+?\d[\d\s().-]{7,20}\d/g, " ")
    .replace(/\S+@(lid|s\.whatsapp\.net)/gi, " ")
    .replace(/\b(id|jid|lid|ownerid|owner_jid)[:=]?\b/gi, " ")
    .replace(/@\S+/g, " ")
    .replace(/\b(me|yo)\b/gi, " ")
    .trim();
const botText = (text) => `「◈」 *${text}*`;
const ownerIdUsage = (usedPrefix = ".") => botText(`Uso: ${usedPrefix}setbotowner @usuario 573161325891`);
const command = {
    name: "setbotowner",
    alias: ["setowner", "ownerbot", "setbptowner", "setownerid", "setbotownerid", "ownerid"],
    description: "Cambiar el ID real del owner del bot",
    category: "bot",
    hidden: false,
    requires: [],
    flags: ["all.chats"],
    using: "[@usuario/id/lid/número] [número público opcional]",
    execute: async (wss, { mctx, args, bot, userIsBotOwner, usedPrefix, groupMetadata }) => {
        if (String(bot.bot_type) === "free") {
            await mctx.reply(denyFreeConfigMessage());
            return;
        }
        const sameBotActor = Boolean(mctx.message.from_me ||
            sameIdentity(mctx.sender.jid, bot.bot_jid) ||
            sameIdentity(mctx.sender.jid, getBotScopeJid(bot, mctx)) ||
            sameIdentity(mctx.sender.jid, mctx.me.jids.lid) ||
            sameIdentity(mctx.sender.jid, mctx.me.jids.pn));
        const bootstrapOwner = (bot.bot_type === "main" || bot.bot_type === "premium") &&
            !ownerIsConfigured(bot.owner_jid) &&
            (sameBotActor || userIsBotOwner);
        if (!userIsBotOwner && !sameBotActor && !canConfigureSocket(mctx.sender.jid, bot) && !bootstrapOwner) {
            await mctx.reply(socketConfigOnlyMessage());
            return;
        }
        const rawText = args.join(" ");
        const explicitIdentity = getExplicitIdentityJid(mctx, args);
        let targetJid = normalizeIdentityJid(explicitIdentity);
        let ownerNumber = getPhoneNumberFromText(rawText);
        let ownerLid = isLidJid(targetJid) ? targetJid : "";
        let ownerPn = isPhoneJid(targetJid) ? targetJid : "";
        let lidNote = "";
        if (!targetJid && !ownerNumber) {
            await mctx.reply(ownerIdUsage(usedPrefix));
            return;
        }
        if (!targetJid && ownerNumber) {
            const resolved = await resolveUserLid(wss, ownerNumber, { mctx, groupMetadata, preferLid: true });
            if (resolved.lidJid) {
                targetJid = resolved.lidJid;
                ownerLid = resolved.lidJid;
                ownerPn = resolved.phoneJid || (resolved.phoneNumber ? `${resolved.phoneNumber}@s.whatsapp.net` : ownerPn);
                ownerNumber = ownerNumber || resolved.phoneNumber;
                lidNote = resolved.note;
            }
            else {
                targetJid = normalizeIdentityJid(resolved.bestJid || `${ownerNumber}@s.whatsapp.net`);
                ownerLid = resolved.lidJid || ownerLid;
                ownerPn = resolved.phoneJid || (resolved.phoneNumber || ownerNumber ? `${resolved.phoneNumber || ownerNumber}@s.whatsapp.net` : ownerPn);
                ownerNumber = ownerNumber || resolved.phoneNumber || resolved.inputNumber;
                lidNote = resolved.note || "ID por número.";
            }
        }
        if (targetJid) {
            const resolved = await resolveUserLid(wss, targetJid, { mctx, groupMetadata, preferLid: true });
            if (resolved.lidJid) {
                targetJid = resolved.lidJid;
                ownerLid = resolved.lidJid;
                ownerPn = resolved.phoneJid || (resolved.phoneNumber ? `${resolved.phoneNumber}@s.whatsapp.net` : ownerPn);
                ownerNumber = ownerNumber || resolved.phoneNumber;
                lidNote = resolved.note;
            }
            else if (!isRawJid(targetJid) && resolved.bestJid) {
                targetJid = normalizeIdentityJid(resolved.bestJid);
            }
            ownerLid = resolved.lidJid || ownerLid || (isLidJid(targetJid) ? targetJid : "");
            ownerPn = resolved.phoneJid || ownerPn || (isPhoneJid(targetJid) ? targetJid : "");
            ownerNumber = ownerNumber || resolved.phoneNumber || resolved.inputNumber || (ownerPn ? jidNumber(ownerPn) : "");
        }
        if (!isRawJid(targetJid)) {
            await mctx.reply(ownerIdUsage(usedPrefix));
            return;
        }
        ownerLid = ownerLid || (isLidJid(targetJid) ? targetJid : "");
        ownerPn = ownerPn || (isPhoneJid(targetJid) ? targetJid : ownerNumber ? `${ownerNumber}@s.whatsapp.net` : "");
        targetJid = ownerLid || ownerPn || targetJid;
        const typedName = getTypedName(rawText);
        const ownerName = (await wss.getName(targetJid).catch(() => typedName)) || typedName || jidNumber(targetJid) || "Owner";
        const updatePayload = {
            owner_jid: targetJid,
            owner_lid: ownerLid,
            owner_pn: ownerPn,
            owner_name: ownerName,
        };
        if (ownerNumber)
            updatePayload.owner_number = ownerNumber;
        const botKeys = Array.from(new Set([bot.bot_jid, mctx.me.jids.lid, mctx.me.jids.pn].filter(Boolean)));
        for (const botKey of botKeys) {
            await database.Bots.update(botKey, { $set: updatePayload });
        }
        if (String(bot.bot_type) === "main") {
            try {
                updateUniversalConfig({ ownerJid: targetJid, ownerLid, ownerPn, ownerName, ownerNumber: ownerNumber || bot.owner_number });
            }
            catch { }
        }
        const publicNumber = ownerNumber || bot.owner_number || jidNumber(ownerPn) || jidNumber(targetJid);
        const mentionJid = ownerPn || targetJid;
        const mentionTag = publicNumber ? `@${publicNumber}` : mentionJid;
        await mctx.reply(`「◈」 *Owner cambiado con éxito*\n` +
            `*Nick:* ${ownerName}\n` +
            `*User:* ${mentionJid}\n` +
            `*Etiqueta:* ${mentionTag}`);
    },
};
export default command;
