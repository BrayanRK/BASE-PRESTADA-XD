import * as baileys from "baileys";
const unwrapMessageContent = (content) => {
    let current = content;
    for (let i = 0; i < 12; i++) {
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
    return current || content || {};
};
const toBuffer = (value) => {
    if (!value)
        return null;
    if (Buffer.isBuffer(value)) {
        return value.length ? value : null;
    }
    if (value instanceof ArrayBuffer) {
        const buffer = Buffer.from(value);
        return buffer.length ? buffer : null;
    }
    if (ArrayBuffer.isView(value)) {
        const buffer = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
        return buffer.length ? buffer : null;
    }
    if (typeof value === "object" && value !== null) {
        const data = value.data;
        if (data)
            return toBuffer(data);
    }
    return null;
};
const streamToBuffer = async (stream) => {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    return buffer.length ? buffer : null;
};
const getMediaNode = (content) => {
    const message = unwrapMessageContent(content);
    if (message?.imageMessage)
        return { node: message.imageMessage, kind: "image" };
    if (message?.videoMessage)
        return { node: message.videoMessage, kind: "video" };
    if (message?.audioMessage)
        return { node: message.audioMessage, kind: "audio" };
    if (message?.stickerMessage)
        return { node: message.stickerMessage, kind: "sticker" };
    if (message?.documentMessage)
        return { node: message.documentMessage, kind: "document" };
    return null;
};
const downloadByContextMethod = async (source) => {
    if (!source.download)
        return null;
    const raw = await source.download().buffer().catch(() => null);
    return toBuffer(raw);
};
const downloadByMediaMessage = async (source) => {
    const original = source.message.original;
    if (!original?.message)
        return null;
    const raw = await baileys.downloadMediaMessage(original, "buffer", {}).catch(() => null);
    return toBuffer(raw);
};
const downloadByContent = async (source) => {
    const media = getMediaNode(source.message.original?.message);
    if (!media)
        return null;
    const stream = await baileys.downloadContentFromMessage(media.node, media.kind).catch(() => null);
    if (!stream)
        return null;
    return streamToBuffer(stream);
};
export const downloadMediaBuffer = async (source, label = "archivo") => {
    const methods = [
        () => downloadByContextMethod(source),
        () => downloadByMediaMessage(source),
        () => downloadByContent(source),
    ];
    for (const method of methods) {
        const buffer = await method().catch(() => null);
        if (buffer?.length)
            return buffer;
    }
    throw new Error(`No pude descargar el ${label}. Reenvía la media y responde al mensaje nuevo.`);
};
export const hasMime = (mime, regex) => {
    return regex.test(String(mime || "").toLowerCase());
};
