import { getEffectiveBotJid } from "../../../libs/bot-scope.js";
import { loadTagDesign, renderTagDesign } from "../../../libs/tag-design.js";
import { getTagMentionJids, markTagMessageText, rememberGeneratedTagText } from "../../../libs/lucasxt-moderation.js";
const unwrapContent = (content) => {
    let current = content || {};
    for (let i = 0; i < 10; i++) {
        const next = current?.ephemeralMessage?.message ||
            current?.viewOnceMessage?.message ||
            current?.viewOnceMessageV2?.message ||
            current?.viewOnceMessageV2Extension?.message ||
            current?.documentWithCaptionMessage?.message ||
            current?.editedMessage?.message ||
            current?.deviceSentMessage?.message;
        if (!next || next === current)
            break;
        current = next;
    }
    return current || {};
};
const rawTextFromContent = (content) => {
    const message = unwrapContent(content);
    return String(message?.conversation ??
        message?.extendedTextMessage?.text ??
        message?.imageMessage?.caption ??
        message?.videoMessage?.caption ??
        message?.documentMessage?.caption ??
        message?.documentWithCaptionMessage?.message?.documentMessage?.caption ??
        message?.locationMessage?.comment ??
        "");
};
const getOriginalMessageText = (mctx) => {
    const originalText = rawTextFromContent(mctx.message.original?.message);
    return originalText || String(mctx.message.text || "");
};
const getRawCommandText = (mctx, usedPrefix, commandName, args) => {
    const rawText = getOriginalMessageText(mctx);
    const leftTrimmed = rawText.trimStart();
    const fallback = args.join(" ");
    if (!usedPrefix || !leftTrimmed.startsWith(usedPrefix))
        return fallback;
    const body = leftTrimmed.slice(usedPrefix.length);
    const commandMatch = body.match(/^\S+/);
    if (!commandMatch)
        return fallback;
    return body.slice(commandMatch[0].length).replace(/^[ \t]*(?:\r?\n[ \t]*)?/, "");
};
const participantJid = (participant) => {
    return String(participant?.id || participant?.jid || participant?.lid || participant?.pn || "");
};
const mentionLabel = (jid) => {
    const digits = String(jid || "").split("@")[0].replace(/\D/g, "");
    return digits ? `@${digits}` : "@user";
};
const command = {
    name: "hidetag",
    alias: ["llamado", "todos", "ht"],
    description: "Menciona a todos usando el diseño configurado con settag.",
    category: "group",
    using: "[mensaje opcional]",
    flags: ["only.groups"],
    requires: ["administrator.user"],
    hidden: false,
    execute: async (wss, { mctx, args, groupMetadata, usedPrefix, commandName, bot }) => {
        if (!groupMetadata || !groupMetadata.participants) {
            const metadata = await wss.groupMetadata(mctx.chat.jid);
            if (!metadata || !metadata.participants) {
                await mctx.reply("「☄」 No se pudo obtener los metadatos del grupo, inténtalo de nuevo.");
                return;
            }
            groupMetadata = metadata;
        }
        const participants = groupMetadata.participants || [];
        const displayMentions = participants.map(participantJid).filter(Boolean);
        const mentions = getTagMentionJids(displayMentions, wss, mctx, bot);
        if (!displayMentions.length) {
            await mctx.reply("「☄」 No se encontraron participantes en el grupo.");
            return;
        }
        const message = getRawCommandText(mctx, usedPrefix, commandName, args) || mctx.quoted?.message.text || "";
        const botJid = getEffectiveBotJid(bot) || mctx.me.jids.lid || mctx.me.jids.pn;
        const design = await loadTagDesign(botJid);
        const renderedText = renderTagDesign(design, {
            botName: bot.name || mctx.me.name || "bot",
            groupName: mctx.chat.name || "grupo",
            message,
            users: displayMentions.map(mentionLabel),
        });
        await rememberGeneratedTagText(botJid, mctx.chat.jid, renderedText);
        const text = markTagMessageText(renderedText);
        await wss.sendMessage(mctx.chat.jid, {
            text,
            mentions,
            contextInfo: { mentionedJid: mentions },
            linkPreview: null,
        });
    },
};
export default command;
