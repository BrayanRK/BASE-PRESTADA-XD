import * as stream from "node:stream";
import * as libs from "../../../libs/libs.js";
import { getBotScopeJid, getTagMentionJids, markTagMessageText, rememberGeneratedTagText } from "../../../libs/lucasxt-moderation.js";
const getRawCommandText = (mctx, usedPrefix, commandName, args) => {
    const rawText = String(mctx.message.text || "");
    const leftTrimmed = rawText.trimStart();
    const fallback = args.join(" ");
    if (!usedPrefix || !leftTrimmed.startsWith(usedPrefix))
        return fallback;
    const body = leftTrimmed.slice(usedPrefix.length);
    const commandMatch = body.match(/^\S+/);
    if (!commandMatch)
        return fallback;
    return body.slice(commandMatch[0].length).replace(/^[ \t\r\n]/, "");
};
const getSource = (mctx) => mctx.quoted || mctx;
const participantJid = (participant) => {
    return String(participant?.id || participant?.jid || participant?.lid || participant?.pn || "");
};
const command = {
    name: "tag",
    alias: ["n", "notify", "tagall"],
    description: "Envía texto o media mencionando a todos sin cambiar el diseño del mensaje.",
    category: "group",
    using: "[mensaje]",
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
        const groupParticipants = groupMetadata.participants || [];
        const mentions = getTagMentionJids(groupParticipants.map(participantJid).filter(Boolean), wss, mctx, bot);
        if (!groupParticipants.length || !mentions.length) {
            await mctx.reply("「☄」 No se encontraron participantes en el grupo.");
            return;
        }
        const directText = getRawCommandText(mctx, usedPrefix, commandName, args);
        const source = getSource(mctx);
        const mimetype = source.message.mimetype || "text/plain";
        const quotedText = mctx.quoted?.message.text || "";
        const textFromMessage = directText || quotedText;
        const botJid = getBotScopeJid(bot, mctx);
        if (textFromMessage)
            await rememberGeneratedTagText(botJid, mctx.chat.jid, textFromMessage);
        if (/text\/plain/.test(mimetype) || !mimetype) {
            if (!textFromMessage) {
                await mctx.reply("「☄」 Ingresa un texto o cita un mensaje que contenga texto.");
                return;
            }
            await wss.sendMessage(mctx.chat.jid, {
                text: markTagMessageText(textFromMessage),
                mentions,
                contextInfo: { mentionedJid: mentions },
                linkPreview: null,
            });
            return;
        }
        if (/^image/.test(mimetype)) {
            const input = await source.download().stream();
            if (!stream.isReadable(input)) {
                await mctx.reply("「☄」 No se pudo descargar el archivo.");
                return;
            }
            if (/webp$/i.test(mimetype)) {
                await wss.sendMessage(mctx.chat.jid, {
                    sticker: { stream: input },
                    mentions,
                    contextInfo: { mentionedJid: mentions },
                    linkPreview: null,
                });
                return;
            }
            await wss.sendMessage(mctx.chat.jid, {
                image: { stream: input },
                mimetype,
                caption: textFromMessage ? markTagMessageText(textFromMessage) : markTagMessageText(""),
                mentions,
                contextInfo: { mentionedJid: mentions },
                linkPreview: null,
            });
            return;
        }
        if (/^video/.test(mimetype)) {
            if (source.message.size > 25_600_000) {
                await mctx.reply(`「☄」 El video no tiene que superar los 25 MB (${libs.formatByteSize(source.message.size)})`);
                return;
            }
            const input = await source.download().stream();
            if (!stream.isReadable(input)) {
                await mctx.reply("「☄」 No se pudo descargar el archivo.");
                return;
            }
            await wss.sendMessage(mctx.chat.jid, {
                video: { stream: input },
                mimetype,
                caption: textFromMessage ? markTagMessageText(textFromMessage) : markTagMessageText(""),
                mentions,
                contextInfo: { mentionedJid: mentions },
                linkPreview: null,
            });
            return;
        }
        if (/^audio/.test(mimetype)) {
            if (source.message.size > 25_600_000) {
                await mctx.reply(`「☄」 El audio no tiene que superar los 25 MB (${libs.formatByteSize(source.message.size)})`);
                return;
            }
            const input = await source.download().stream();
            if (!stream.isReadable(input)) {
                await mctx.reply("「☄」 No se pudo descargar el audio.");
                return;
            }
            await wss.sendMessage(mctx.chat.jid, {
                audio: { stream: input },
                mimetype: mimetype || "audio/ogg; codecs=opus",
                ptt: /ogg|opus/i.test(mimetype),
                mentions,
                contextInfo: { mentionedJid: mentions },
                linkPreview: null,
            });
            return;
        }
        if (/^document/.test(mimetype)) {
            if (source.message.size > 51_200_000) {
                await mctx.reply(`「☄」 El documento no tiene que superar los 50 MB (${libs.formatByteSize(source.message.size)})`);
                return;
            }
            const input = await source.download().stream();
            if (!stream.isReadable(input)) {
                await mctx.reply("「☄」 No se pudo descargar el archivo.");
                return;
            }
            await wss.sendMessage(mctx.chat.jid, {
                document: { stream: input },
                mimetype,
                fileName: `${Date.now()}.${mimetype.split("/")[1] || "bin"}`,
                caption: textFromMessage ? markTagMessageText(textFromMessage) : markTagMessageText(""),
                mentions,
                contextInfo: { mentionedJid: mentions },
                linkPreview: null,
            });
            return;
        }
        await mctx.reply(`「☄」 El mensaje de tipo *${mimetype}* no es compatible con este comando.`);
    },
};
export default command;
