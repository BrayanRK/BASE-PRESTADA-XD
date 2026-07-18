import * as baileys from "baileys";
import chalk from "chalk";
import { getRuntimeBotName } from "../../libs/zeta_cf.js";
import { getPcoConfig, isTextOnlyPayload, wrapAsLocation, fetchThumbnail } from "../../libs/pco.js";
const LOG_MESSAGES = !/^(0|false|no|off)$/i.test(process.env.ZETA_LOG_MESSAGES || "true");
const asWAMessage = (message) => message;
const safeNormalizeJid = (jid) => {
    if (!jid)
        return "";
    try {
        return baileys.jidNormalizedUser(jid);
    }
    catch {
        return String(jid);
    }
};
const sameJid = (a, b) => {
    const na = safeNormalizeJid(a);
    const nb = safeNormalizeJid(b);
    if (!na || !nb)
        return false;
    return na === nb || na.split("@")[0] === nb.split("@")[0];
};
const mentionFromJid = (jid) => {
    const user = safeNormalizeJid(jid).split("@")[0];
    return user ? `@${user}` : "";
};
const cleanDisplayName = (name, fallback = "") => {
    const value = String(name || "")
        .replace(/[`*_~]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    if (!value || value === "~")
        return fallback;
    if (/^(usuario|user|unknown|desconocido)$/i.test(value))
        return fallback;
    if (/^@?\d{5,}($|\D)/.test(value))
        return fallback;
    if (/@(s\.whatsapp\.net|lid|g\.us)$/i.test(value))
        return fallback;
    return value;
};
const getParticipantName = (metadata, jid) => {
    const participant = metadata?.participants?.find((p) => sameJid(p?.id || p?.jid, jid));
    return cleanDisplayName(participant?.name || participant?.notify || participant?.verifiedName || participant?.pushName, "");
};
const formatJidNumber = (jid) => {
    const normalized = safeNormalizeJid(jid);
    return normalized.split("@")[0] || "desconocido";
};
const formatBytes = (bytes) => {
    const size = Number(bytes || 0);
    if (!Number.isFinite(size) || size <= 0)
        return "0 B";
    if (size >= 1024 * 1024)
        return `${(size / 1024 / 1024).toFixed(2)} MB`;
    if (size >= 1024)
        return `${(size / 1024).toFixed(1)} kB`;
    return `${size} B`;
};
const normalizeLogText = (value, maxLength = 650) => {
    const text = String(value || "")
        .replace(/\r/g, "")
        .replace(/\t/g, " ")
        .trim();
    if (!text)
        return "";
    return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
};
const wrapLogText = (text, maxLineLength = 78) => {
    const safeText = normalizeLogText(text);
    if (!safeText)
        return [];
    const lines = [];
    for (const rawLine of safeText.split("\n")) {
        const words = rawLine.split(/\s+/).filter(Boolean);
        let current = "";
        for (const word of words) {
            if (!current) {
                current = word;
                continue;
            }
            if ((current + " " + word).length > maxLineLength) {
                lines.push(current);
                current = word;
            }
            else {
                current += " " + word;
            }
        }
        if (current)
            lines.push(current);
    }
    return lines.length ? lines : [safeText];
};
const getCommandPreview = (text) => {
    const cleanText = normalizeLogText(text, 220);
    const match = cleanText.match(/^([^\w\s])([^\s]+)(?:\s+(.*))?$/);
    if (!match)
        return "";
    const prefix = match[1];
    const command = match[2];
    const args = normalizeLogText(match[3] || "", 120);
    return args ? `${prefix}${command} ${chalk.gray(args)}` : `${prefix}${command}`;
};
const printMessageLog = (mctx) => {
    const accent = chalk.hex("#FE0041");
    const softAccent = chalk.hex("#FF4F7B");
    const timestamp = new Date().toLocaleTimeString("es-ES", { hour12: false });
    const botNumber = formatJidNumber(mctx.me.jids.lid || mctx.me.jids.pn);
    const senderNumber = formatJidNumber(mctx.sender.jid);
    const chatNumber = formatJidNumber(mctx.chat.jid);
    const botName = cleanDisplayName(getRuntimeBotName() || mctx.me.name, "ZETA");
    const senderName = cleanDisplayName(mctx.sender.name, senderNumber);
    const chatName = cleanDisplayName(mctx.chat.name, mctx.is_group ? chatNumber : "privado");
    const messageType = String(mctx.message.type || "message").replace(/Message$/i, "").toLowerCase();
    const chatType = mctx.is_group ? "GRUPO" : mctx.is_newsletter ? "CANAL" : "DM";
    const direction = mctx.message.from_me ? "Enviado" : "Recibido";
    const size = formatBytes(mctx.message.size);
    const text = normalizeLogText(mctx.message.text);
    const commandPreview = getCommandPreview(text);
    const quotedText = normalizeLogText(mctx.message.quoted?.text, 180);
    const messageLines = wrapLogText(text);
    const line = accent.bold("┃");
    console.log(accent.bold("┏━━━─━─━─━─━─━─━━〔 𖤐 ZETA TS 𖤐 〕━━─━─━─━─━─━─━━┓"));
    console.log(`${line} ${chalk.cyanBright("🤖 Bot")}     ${chalk.whiteBright(botName)} ${chalk.gray("@")} ${chalk.cyan(botNumber)}`);
    console.log(`${line} ${chalk.greenBright("⏱ Hora")}    ${chalk.black(chalk.bgGreen(` ${timestamp} `))} ${chalk.gray("•")} ${softAccent.bold(direction)} ${chalk.gray(`[${size}]`)}`);
    console.log(`${line} ${chalk.yellowBright("💬 Chat")}    ${chalk.black(chalk.bgYellow(` ${chatType} `))} ${chalk.greenBright(chatName)} ${mctx.is_group ? chalk.gray(`(${chatNumber})`) : chalk.gray("(privado)")}`);
    console.log(`${line} ${chalk.magentaBright("👤 User")}    ${chalk.whiteBright(senderName)} ${chalk.gray("@")} ${chalk.redBright(senderNumber)}`);
    console.log(`${line} ${chalk.blueBright("📦 Tipo")}    ${chalk.blueBright(messageType)}`);
    if (commandPreview) {
        console.log(`${line} ${chalk.redBright("⚡ Cmd")}     ${chalk.whiteBright(commandPreview)}`);
    }
    if (quotedText) {
        console.log(`${line} ${chalk.gray("↪ Cita")}    ${chalk.gray(quotedText)}`);
    }
    if (messageLines.length) {
        console.log(`${line} ${chalk.whiteBright("📝 Mensaje")}`);
        for (const msgLine of messageLines) {
            console.log(`${line}   ${chalk.white(msgLine)}`);
        }
    }
    else {
        console.log(`${line} ${chalk.whiteBright("📝 Mensaje")} ${chalk.gray("sin texto")}`);
    }
    console.log(accent.bold("┗━━━─━─━─━─━─━─━━━━━━━━━━━━━━━━━━━━━━━━─━─━─━─━─━─━━┛"));
};
const resolveDisplayName = async (wss, jid, options = {}) => {
    const normalizedJid = safeNormalizeJid(jid);
    const fallbackMention = mentionFromJid(normalizedJid);
    if (options.isBot) {
        return cleanDisplayName(options.botName, "Bot") || "Bot";
    }
    const directName = cleanDisplayName(options.fallbackName, "");
    if (directName)
        return directName;
    const metadataName = getParticipantName(options.groupMetadata, normalizedJid);
    if (metadataName)
        return metadataName;
    if (options.groupJid && /\@g\.us$/.test(safeNormalizeJid(options.groupJid))) {
        try {
            const metadata = await wss.groupMetadata(safeNormalizeJid(options.groupJid));
            const groupName = getParticipantName(metadata, normalizedJid);
            if (groupName)
                return groupName;
        }
        catch { }
    }
    try {
        const socketName = await wss.getName(normalizedJid);
        const cleanSocketName = cleanDisplayName(socketName, "");
        if (cleanSocketName)
            return cleanSocketName;
    }
    catch { }
    return fallbackMention || "@0";
};
const unwrapMessageContent = (content) => {
    let current = content;
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
    return current || content || {};
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const deleteJidCandidates = (jid) => {
    const raw = safeNormalizeJid(jid);
    const number = raw.split("@")[0].replace(/\D/g, "");
    return Array.from(new Set([
        raw,
        number ? `${number}@s.whatsapp.net` : "",
        number ? `${number}@lid` : "",
    ].filter(Boolean)));
};
const deleteKeyCandidates = (baseKey, senderJid, fallbackParticipant) => {
    const remoteJid = safeNormalizeJid(baseKey.remoteJid);
    const id = baseKey.id || "";
    if (!remoteJid || !id)
        return [];
    const participants = new Set();
    for (const jid of [baseKey.participant, fallbackParticipant, senderJid]) {
        for (const candidate of deleteJidCandidates(jid))
            participants.add(candidate);
    }
    const keys = [{ ...baseKey, remoteJid, id }];
    for (const participant of participants) {
        keys.push({ remoteJid, fromMe: false, id, participant });
    }
    return keys.filter((key, index, list) => {
        const token = `${key.remoteJid}|${key.id}|${key.fromMe ? 1 : 0}|${key.participant || ""}`;
        return list.findIndex((item) => `${item.remoteJid}|${item.id}|${item.fromMe ? 1 : 0}|${item.participant || ""}` === token) === index;
    });
};
const forceDeleteMessage = async (wss, chatJid, baseKey, senderJid, fallbackParticipant) => {
    let lastError = null;
    const keys = deleteKeyCandidates(baseKey, senderJid, fallbackParticipant);
    for (const key of keys) {
        try {
            await wss.sendMessage(chatJid, { delete: key });
            return;
        }
        catch (error) {
            lastError = error;
        }
    }
    await sleep(250);
    for (const key of keys) {
        try {
            await wss.sendMessage(chatJid, { delete: key });
            return;
        }
        catch (error) {
            lastError = error;
        }
    }
    throw lastError || new Error("No se pudo borrar el mensaje");
};
const MESSAGE_CACHE_LIMIT = 5000;
const GROUP_METADATA_TTL_MS = 90_000;
const messageCache = new Map();
const groupMetadataCache = new Map();
const getCachedGroupMetadata = async (wss, groupJid) => {
    const jid = safeNormalizeJid(groupJid);
    if (!/@g\.us$/.test(jid))
        return null;
    const cached = groupMetadataCache.get(jid);
    if (cached && cached.expiresAt > Date.now())
        return cached.metadata;
    try {
        const metadata = await wss.groupMetadata(jid);
        groupMetadataCache.set(jid, { metadata, expiresAt: Date.now() + GROUP_METADATA_TTL_MS });
        return metadata;
    }
    catch {
        return cached?.metadata || null;
    }
};
const cacheKey = (remoteJid, id, participant) => {
    return [safeNormalizeJid(remoteJid), id || "", safeNormalizeJid(participant)].join("|");
};
const rememberMessage = (message) => {
    const remoteJid = safeNormalizeJid(message.key.remoteJid);
    const id = message.key.id || "";
    const participant = safeNormalizeJid(message.key.participant || message.participant);
    if (!remoteJid || !id)
        return;
    messageCache.set(cacheKey(remoteJid, id), message);
    if (participant) {
        messageCache.set(cacheKey(remoteJid, id, participant), message);
    }
    while (messageCache.size > MESSAGE_CACHE_LIMIT) {
        const firstKey = messageCache.keys().next().value;
        if (!firstKey)
            break;
        messageCache.delete(firstKey);
    }
};
const getCachedMessage = (remoteJid, id, participant) => {
    if (!remoteJid || !id)
        return null;
    return (messageCache.get(cacheKey(remoteJid, id, participant)) ||
        messageCache.get(cacheKey(remoteJid, id)) ||
        null);
};
export const contextMessage = async (message, wss) => {
    if (!message || !message.message)
        return null;
    const content = unwrapMessageContent(message.message);
    const mediaSourceMessage = { ...message, message: content };
    mediaSourceMessage.__zetaOriginal = message;
    rememberMessage(mediaSourceMessage);
    const mctx = {
        sender: {
            jid: '',
            name: '',
        },
        chat: {
            jid: '',
            name: '',
        },
        message: {
            type: 'conversation',
            from_me: false,
            id: '',
            mentioned: [],
            text: '',
            mimetype: '',
            size: 0,
            original: null,
        },
        is_group: false,
        is_private: false,
        is_newsletter: false,
        me: {
            name: '',
            jids: {
                pn: '',
                lid: '',
            },
        },
    };
    mctx.sender.jid = safeNormalizeJid(message.key.fromMe ? (wss.user?.lid || wss.user?.id || message.key.remoteJid) : message.participant || message.key.participant || message.key.remoteJid);
    mctx.chat.jid = safeNormalizeJid(message.key.remoteJid);
    const groupMetadataForNames = /\@g\.us$/.test(mctx.chat.jid) ? await getCachedGroupMetadata(wss, mctx.chat.jid) : null;
    mctx.sender.name = await resolveDisplayName(wss, mctx.sender.jid, {
        fallbackName: message.pushName || message.verifiedBizName,
        groupJid: mctx.chat.jid,
        groupMetadata: groupMetadataForNames,
        botName: wss.user.name || wss.user.verifiedName || '',
        isBot: Boolean(message.key.fromMe),
    });
    mctx.chat.name = /\@g\.us$/.test(mctx.chat.jid) ? groupMetadataForNames?.subject || '~' : '~';
    mctx.message.type = Object.keys(content).find((v) => v !== 'senderKeyDistributionMessage' && v !== 'messageContextInfo') || 'conversation';
    mctx.message.from_me = message.key.fromMe;
    mctx.message.id = message.key.id;
    mctx.message.original = message;
    const context = content[mctx.message.type]?.contextInfo || null;
    const mentionedJids = context?.mentionedJid || [];
    mctx.message.mentioned = mentionedJids;
    mctx.message.mentionedJid = mentionedJids;
    mctx.is_group = /\@g\.us$/.test(mctx.chat.jid);
    mctx.is_newsletter = /\@newsletter$/.test(mctx.chat.jid);
    mctx.is_private = !mctx.is_group && !mctx.is_newsletter;
    mctx.me.name = wss.user.name || wss.user.verifiedName || '';
    mctx.me.jids.pn = safeNormalizeJid(wss.user?.id);
    mctx.me.jids.lid = safeNormalizeJid(wss.user?.lid || wss.user?.id);
    mctx.conn = wss;
    mctx.reply = async (text, server) => {
        try {
            const botJid = wss.user?.id
                ? wss.user.id.split(":")[0] + "@s.whatsapp.net"
                : "";
            if (botJid && isTextOnlyPayload({ text })) {
                const cfg = await getPcoConfig(botJid);
                if (cfg.enabled && cfg.title && cfg.image_url) {
                    const thumb = await fetchThumbnail(cfg.image_url).catch(() => null);
                    const wrapped = wrapAsLocation(text, cfg, thumb);
                    return wss.sendMessage(mctx.chat.jid, wrapped, { quoted: asWAMessage(message) });
                }
            }
        }
        catch (pcoErr) {
            console.error("[PCO] reply error:", pcoErr);
        }
        return wss.sendMessage(mctx.chat.jid, {
            text,
            mentions: text.match(/@([0-9]{5,16}|0)/g)?.map(v => v.replace('@', '') + '@' + (server || 'lid')) || [],
        }, {
            quoted: asWAMessage(message),
        });
    };
    mctx.react = async (emogi) => {
        try {
            return await wss.sendMessage(mctx.chat.jid, {
                react: {
                    key: message.key,
                    text: emogi,
                },
            });
        }
        catch (error) {
            console.error('[React] No se pudo reaccionar al mensaje:', error);
            return null;
        }
    };
    mctx.edit = async (text, server) => {
        if (!mctx.message.from_me) {
            throw new Error('You cannot edit another users message.');
        }
        return wss.sendMessage(mctx.chat.jid, {
            edit: message,
            text,
            mentions: text.match(/@([0-9]{5,16}|0)/g)?.map(v => v.replace('@', '') + '@' + (server || 'lid')) || [],
        }, {
            quoted: asWAMessage(message),
        });
    };
    mctx.delete = async () => {
        await forceDeleteMessage(wss, mctx.chat.jid, message.key, mctx.sender.jid, message.participant || message.key.participant);
        return;
    };
    mctx.download = () => {
        return {
            buffer: async () => {
                return baileys.downloadMediaMessage(mediaSourceMessage, 'buffer', {}).catch(() => (null));
            },
            stream: async () => {
                return baileys.downloadMediaMessage(mediaSourceMessage, 'stream', {}).catch(() => (null));
            },
        };
    };
    if (content.conversation) {
        mctx.message.text = content.conversation;
        mctx.message.mimetype = 'text/plain';
        mctx.message.size = mctx.message.text.length;
        delete mctx.download;
    }
    else if (content.extendedTextMessage) {
        mctx.message.text = content.extendedTextMessage.text || '';
        mctx.message.mimetype = 'text/plain';
        mctx.message.size = mctx.message.text.length;
        delete mctx.download;
    }
    else if (content.videoMessage) {
        mctx.message.text = content.videoMessage.caption || '';
        mctx.message.mimetype = content.videoMessage.mimetype || 'video/mp4';
        mctx.message.size = Number(content.videoMessage.fileLength || '0');
    }
    else if (content.imageMessage) {
        mctx.message.text = content.imageMessage.caption || '';
        mctx.message.mimetype = content.imageMessage.mimetype || 'image/jpeg';
        mctx.message.size = Number(content.imageMessage.fileLength || '0');
    }
    else if (content.documentMessage) {
        mctx.message.text = content.documentMessage.caption || '';
        mctx.message.mimetype = content.documentMessage.mimetype || 'application/octet-stream';
        mctx.message.size = Number(content.documentMessage.fileLength || '0');
    }
    else if (content.documentWithCaptionMessage?.message?.documentMessage) {
        mctx.message.text = content.documentWithCaptionMessage.message.documentMessage.caption || '';
        mctx.message.mimetype = content.documentWithCaptionMessage.message.documentMessage.mimetype || 'application/octet-stream';
        mctx.message.size = Number(content.documentWithCaptionMessage.message.documentMessage.fileLength || '0');
    }
    else if (content.audioMessage) {
        mctx.message.text = '';
        mctx.message.mimetype = content.audioMessage.mimetype || 'audio/ogg; codecs=opus';
        mctx.message.size = Number(content.audioMessage.fileLength || '0');
    }
    else if (content.reactionMessage) {
        mctx.message.text = content.reactionMessage.text || '';
        mctx.message.mimetype = 'text/plain';
        mctx.message.size = mctx.message.text.length;
        delete mctx.download;
    }
    else if (content.locationMessage) {
        mctx.message.text = content.locationMessage.comment || '';
        mctx.message.mimetype = 'text/plain';
        mctx.message.size = mctx.message.text.length;
        delete mctx.download;
    }
    else if (content.viewOnceMessage?.message?.imageMessage) {
        mctx.message.text = content.viewOnceMessage.message.imageMessage.caption || '';
        mctx.message.mimetype = content.viewOnceMessage.message.imageMessage.mimetype || 'image/jpeg';
        mctx.message.size = Number(content.viewOnceMessage.message.imageMessage.fileLength || '0');
    }
    else if (content.viewOnceMessage?.message?.videoMessage) {
        mctx.message.text = content.viewOnceMessage.message.videoMessage.caption || '';
        mctx.message.mimetype = content.viewOnceMessage.message.videoMessage.mimetype || 'video/mp4';
        mctx.message.size = Number(content.viewOnceMessage.message.videoMessage.fileLength || '0');
    }
    else if (content.viewOnceMessageV2?.message?.imageMessage) {
        mctx.message.text = content.viewOnceMessageV2.message.imageMessage.caption || '';
        mctx.message.mimetype = content.viewOnceMessageV2.message.imageMessage.mimetype || 'image/jpeg';
        mctx.message.size = Number(content.viewOnceMessageV2.message.imageMessage.fileLength || '0');
    }
    else if (content.viewOnceMessageV2?.message?.videoMessage) {
        mctx.message.text = content.viewOnceMessageV2.message.videoMessage.caption || '';
        mctx.message.mimetype = content.viewOnceMessageV2.message.videoMessage.mimetype || 'video/mp4';
        mctx.message.size = Number(content.viewOnceMessageV2.message.videoMessage.fileLength || '0');
    }
    else if (content.viewOnceMessageV2Extension?.message?.audioMessage) {
        mctx.message.text = '';
        mctx.message.mimetype = content.viewOnceMessageV2Extension.message.audioMessage.mimetype || 'audio/ogg; codecs=opus';
        mctx.message.size = Number(content.viewOnceMessageV2Extension.message.audioMessage.fileLength || '0');
    }
    else if (content.stickerMessage) {
        mctx.message.mimetype = content.stickerMessage.mimetype || 'image/webp';
        mctx.message.size = Number(content.stickerMessage.fileLength || '0');
    }
    if (context?.quotedMessage) {
        const quotedRemoteJid = safeNormalizeJid(context.remoteJid || mctx.chat.jid || mctx.sender.jid);
        const quotedParticipant = safeNormalizeJid(context.participant);
        const cachedQuotedMessage = getCachedMessage(quotedRemoteJid, context.stanzaId, quotedParticipant);
        const quotedContent = unwrapMessageContent(cachedQuotedMessage?.message || context.quotedMessage);
        const quoted = {
            message: quotedContent,
            key: {
                remoteJid: safeNormalizeJid(cachedQuotedMessage?.key.remoteJid || quotedRemoteJid),
                participant: safeNormalizeJid(cachedQuotedMessage?.key.participant || cachedQuotedMessage?.participant || quotedParticipant),
                fromMe: Boolean(cachedQuotedMessage?.key.fromMe) || quotedParticipant === safeNormalizeJid(wss.user?.lid || wss.user?.id),
                id: cachedQuotedMessage?.key.id || context.stanzaId || '',
            },
        };
        const quotedOriginalMessage = cachedQuotedMessage || asWAMessage(quoted);
        const quotedSenderName = await resolveDisplayName(wss, quoted.key.participant || quoted.key.remoteJid, {
            fallbackName: quoted.key.fromMe
                ? wss.user.name || wss.user.verifiedName || ''
                : cachedQuotedMessage?.pushName || cachedQuotedMessage?.verifiedBizName,
            groupJid: quoted.key.remoteJid || mctx.chat.jid,
            groupMetadata: groupMetadataForNames,
            botName: wss.user.name || wss.user.verifiedName || '',
            isBot: Boolean(quoted.key.fromMe),
        });
        mctx.quoted = {
            sender: {
                jid: quoted.key.participant || quoted.key.remoteJid,
                name: quotedSenderName,
            },
            chat: {
                jid: quoted.key.remoteJid,
                name: '',
            },
            message: {
                type: 'conversation',
                from_me: quoted.key.fromMe,
                id: '',
                mentioned: [],
                text: '',
                mimetype: '',
                size: 0,
                original: null,
            }
        };
        mctx.quoted.sender.jid = safeNormalizeJid(quoted.key.participant || quoted.key.remoteJid);
        mctx.quoted.sender.name = quotedSenderName;
        mctx.quoted.chat.jid = safeNormalizeJid(quoted.key.remoteJid);
        mctx.quoted.chat.name = /\@g\.us$/.test(mctx.quoted.chat.jid) ? groupMetadataForNames?.subject || (await getCachedGroupMetadata(wss, mctx.quoted.chat.jid))?.subject || '~' : '~';
        mctx.quoted.message.type = Object.keys(quoted.message).find((v) => v !== 'senderKeyDistributionMessage' && v !== 'messageContextInfo') || 'conversation';
        mctx.quoted.message.from_me = quoted.key.fromMe;
        mctx.quoted.message.id = quoted.key.id;
        mctx.quoted.message.original = quotedOriginalMessage;
        mctx.quoted.edit = async (text) => {
            if (!mctx.quoted.message.from_me) {
                throw new Error('You cannot edit another users message.');
            }
            return wss.sendMessage(mctx.chat.jid, {
                edit: quoted.key,
                text,
                mentions: text.match(/@([0-9]{5,16}|0)/g)?.map(v => v.replace('@', '') + '@' + ('lid')) || [],
            }, {
                quoted: asWAMessage(quoted),
            });
        };
        mctx.quoted.react = async (emogi) => {
            try {
                return await wss.sendMessage(mctx.chat.jid, {
                    react: {
                        key: quoted.key,
                        text: emogi,
                    },
                });
            }
            catch (error) {
                console.error('[React] No se pudo reaccionar al mensaje citado:', error);
                return null;
            }
        };
        mctx.quoted.delete = async () => {
            await forceDeleteMessage(wss, mctx.chat.jid, quoted.key, mctx.quoted.sender.jid, quoted.key.participant);
            return;
        };
        mctx.quoted.download = () => {
            return {
                buffer: async () => {
                    return baileys.downloadMediaMessage(quotedOriginalMessage, 'buffer', {}).catch(() => (null));
                },
                stream: async () => {
                    return baileys.downloadMediaMessage(quotedOriginalMessage, 'stream', {}).catch(() => (null));
                },
            };
        };
        if (quoted.message.conversation) {
            mctx.quoted.message.text = quoted.message.conversation;
            mctx.quoted.message.mimetype = 'text/plain';
            mctx.quoted.message.size = mctx.quoted.message.text.length;
            delete mctx.quoted.download;
        }
        else if (quoted.message.extendedTextMessage) {
            mctx.quoted.message.text = quoted.message.extendedTextMessage.text || '';
            mctx.quoted.message.mentioned = quoted.message.extendedTextMessage.contextInfo?.mentionedJid || [];
            mctx.quoted.message.mentionedJid = mctx.quoted.message.mentioned;
            mctx.quoted.message.mimetype = 'text/plain';
            mctx.quoted.message.size = mctx.quoted.message.text.length;
            delete mctx.quoted.download;
        }
        else if (quoted.message.viewOnceMessageV2?.message?.imageMessage) {
            mctx.quoted.message.text = quoted.message.viewOnceMessageV2.message.imageMessage.caption || '';
            mctx.quoted.message.mentioned = quoted.message.viewOnceMessageV2.message.imageMessage.contextInfo?.mentionedJid || [];
            mctx.quoted.message.mentionedJid = mctx.quoted.message.mentioned;
            mctx.quoted.message.mimetype = quoted.message.viewOnceMessageV2.message.imageMessage.mimetype || 'image/jpeg';
            mctx.quoted.message.size = Number(quoted.message.viewOnceMessageV2.message.imageMessage.fileLength || '0');
        }
        else if (quoted.message.viewOnceMessageV2?.message?.videoMessage) {
            mctx.quoted.message.text = quoted.message.viewOnceMessageV2.message.videoMessage.caption || '';
            mctx.quoted.message.mentioned = quoted.message.viewOnceMessageV2.message.videoMessage.contextInfo?.mentionedJid || [];
            mctx.quoted.message.mentionedJid = mctx.quoted.message.mentioned;
            mctx.quoted.message.mimetype = quoted.message.viewOnceMessageV2.message.videoMessage.mimetype || 'video/mp4';
            mctx.quoted.message.size = Number(quoted.message.viewOnceMessageV2.message.videoMessage.fileLength || '0');
        }
        else if (quoted.message.viewOnceMessageV2Extension?.message?.audioMessage) {
            mctx.quoted.message.mentioned = quoted.message.viewOnceMessageV2Extension.message.audioMessage.contextInfo?.mentionedJid || [];
            mctx.quoted.message.mentionedJid = mctx.quoted.message.mentioned;
            mctx.quoted.message.mimetype = quoted.message.viewOnceMessageV2Extension.message.audioMessage.mimetype || 'audio/mpeg';
            mctx.quoted.message.size = Number(quoted.message.viewOnceMessageV2Extension.message.audioMessage.fileLength || '0');
        }
        else if (quoted.message.imageMessage) {
            mctx.quoted.message.text = quoted.message.imageMessage.caption || '';
            mctx.quoted.message.mentioned = quoted.message.imageMessage.contextInfo?.mentionedJid || [];
            mctx.quoted.message.mentionedJid = mctx.quoted.message.mentioned;
            mctx.quoted.message.mimetype = quoted.message.imageMessage.mimetype || 'image/jpeg';
            mctx.quoted.message.size = Number(quoted.message.imageMessage.fileLength || '0');
        }
        else if (quoted.message.videoMessage) {
            mctx.quoted.message.text = quoted.message.videoMessage.caption || '';
            mctx.quoted.message.mentioned = quoted.message.videoMessage.contextInfo?.mentionedJid || [];
            mctx.quoted.message.mentionedJid = mctx.quoted.message.mentioned;
            mctx.quoted.message.mimetype = quoted.message.videoMessage.mimetype || 'video/mp4';
            mctx.quoted.message.size = Number(quoted.message.videoMessage.fileLength || '0');
        }
        else if (quoted.message.documentMessage) {
            mctx.quoted.message.text = quoted.message.documentMessage.caption || '';
            mctx.quoted.message.mentioned = quoted.message.documentMessage.contextInfo?.mentionedJid || [];
            mctx.quoted.message.mentionedJid = mctx.quoted.message.mentioned;
            mctx.quoted.message.mimetype = quoted.message.documentMessage.mimetype || 'application/octet-stream';
            mctx.quoted.message.size = Number(quoted.message.documentMessage.fileLength || '0');
        }
        else if (quoted.message.documentWithCaptionMessage?.message?.documentMessage) {
            mctx.quoted.message.text = quoted.message.documentWithCaptionMessage.message.documentMessage.caption || '';
            mctx.quoted.message.mentioned = quoted.message.documentWithCaptionMessage.message.documentMessage.contextInfo?.mentionedJid || [];
            mctx.quoted.message.mentionedJid = mctx.quoted.message.mentioned;
            mctx.quoted.message.mimetype = quoted.message.documentWithCaptionMessage.message.documentMessage.mimetype || 'application/octet-stream';
            mctx.quoted.message.size = Number(quoted.message.documentWithCaptionMessage.message.documentMessage.fileLength || '0');
        }
        else if (quoted.message.audioMessage) {
            mctx.quoted.message.mentioned = quoted.message.audioMessage.contextInfo?.mentionedJid || [];
            mctx.quoted.message.mentionedJid = mctx.quoted.message.mentioned;
            mctx.quoted.message.mimetype = quoted.message.audioMessage.mimetype || 'audio/mpeg';
            mctx.quoted.message.size = Number(quoted.message.audioMessage.fileLength || '0');
        }
        else if (quoted.message.stickerMessage) {
            mctx.quoted.message.mentioned = quoted.message.stickerMessage.contextInfo?.mentionedJid || [];
            mctx.quoted.message.mentionedJid = mctx.quoted.message.mentioned;
            mctx.quoted.message.mimetype = quoted.message.stickerMessage.mimetype || 'image/webp';
            mctx.quoted.message.size = Number(quoted.message.stickerMessage.fileLength || '0');
        }
    }
    if (LOG_MESSAGES) {
        printMessageLog(mctx);
    }
    return mctx;
};
