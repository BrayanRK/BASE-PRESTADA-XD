import * as baileys from "baileys";
export const secretSettingKey = (groupJid) => `secret:${groupJid}`;
const unwrapViewOnceMessage = (content) => {
    let current = content;
    for (let i = 0; i < 10; i++) {
        const next = current?.viewOnceMessage?.message ||
            current?.viewOnceMessageV2?.message ||
            current?.viewOnceMessageV2Extension?.message ||
            current?.ephemeralMessage?.message ||
            current?.documentWithCaptionMessage?.message ||
            current?.editedMessage?.message ||
            current?.deviceSentMessage?.message;
        if (!next || next === current)
            break;
        current = next;
    }
    return current || content || {};
};
const getSourceContent = (message) => {
    return message?.__zetaOriginal?.message || message?.message || {};
};
const getInnerMessage = (message) => unwrapViewOnceMessage(getSourceContent(message));
const getMediaPayload = (message) => {
    const inner = getInnerMessage(message);
    const image = inner?.imageMessage;
    const video = inner?.videoMessage;
    const audio = inner?.audioMessage;
    if (image)
        return { type: "image", payload: image, inner };
    if (video)
        return { type: "video", payload: video, inner };
    if (audio)
        return { type: "audio", payload: audio, inner };
    return null;
};
export const isViewOnceMessage = (message) => {
    const content = getSourceContent(message);
    if (content?.viewOnceMessage ||
        content?.viewOnceMessageV2 ||
        content?.viewOnceMessageV2Extension) {
        return true;
    }
    const media = getMediaPayload(message);
    return Boolean(media?.payload?.viewOnce);
};
const jidNumber = (jid) => String(jid || "")
    .split(":")[0]
    .split("@")[0]
    .replace(/[^0-9]/g, "");
const getSenderJid = (message, fallback = "") => {
    return String(message?.key?.participant || message?.participant || message?.key?.remoteJid || fallback || "");
};
const buildCaption = (message, payload, fallbackSender = "") => {
    const sender = getSenderJid(message, fallbackSender);
    const number = jidNumber(sender);
    const originalCaption = String(payload?.caption || "").trim();
    const header = number
        ? `「✧」 Secret\n│ Revelado de › @${number}\n╰ Tipo › mensaje de una sola vez`
        : `「✧」 Secret\n╰ Tipo › mensaje de una sola vez`;
    return originalCaption ? `${header}\n\n${originalCaption}` : header;
};
export const revealViewOnceMessage = async (wss, chatJid, sourceMessage, quoted, fallbackSender = "") => {
    if (!sourceMessage)
        return { ok: false, reason: "No hay mensaje para revelar." };
    if (!isViewOnceMessage(sourceMessage)) {
        return { ok: false, reason: "El mensaje citado no es de una sola vez." };
    }
    const media = getMediaPayload(sourceMessage);
    if (!media) {
        return { ok: false, reason: "Solo puedo revelar imágenes, videos y audios de una sola vez." };
    }
    const downloadMessage = { ...sourceMessage, message: media.inner };
    let buffer = null;
    try {
        buffer = (await baileys.downloadMediaMessage(downloadMessage, "buffer", {}));
    }
    catch { }
    if (!buffer?.length) {
        return { ok: false, reason: "No pude descargar el contenido. Responde el mensaje justo después de recibirlo e inténtalo otra vez." };
    }
    const mentions = Array.from(new Set([
        getSenderJid(sourceMessage, fallbackSender),
        ...(media.payload?.contextInfo?.mentionedJid || []),
    ].filter(Boolean)));
    const mimetype = String(media.payload?.mimetype || "");
    if (media.type === "image") {
        await wss.sendMessage(chatJid, {
            image: buffer,
            mimetype: mimetype || "image/jpeg",
            caption: buildCaption(sourceMessage, media.payload, fallbackSender),
            mentions,
        }, { quoted: quoted || sourceMessage });
        return { ok: true, type: "image" };
    }
    if (media.type === "video") {
        await wss.sendMessage(chatJid, {
            video: buffer,
            mimetype: mimetype || "video/mp4",
            caption: buildCaption(sourceMessage, media.payload, fallbackSender),
            mentions,
        }, { quoted: quoted || sourceMessage });
        return { ok: true, type: "video" };
    }
    await wss.sendMessage(chatJid, {
        audio: buffer,
        mimetype: mimetype || "audio/ogg; codecs=opus",
        ptt: /ogg|opus/i.test(mimetype),
        mentions,
    }, { quoted: quoted || sourceMessage });
    return { ok: true, type: "audio" };
};
