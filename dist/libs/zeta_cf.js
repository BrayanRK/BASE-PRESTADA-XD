import fs from "node:fs";
import path from "node:path";
export const UNIVERSAL_CONFIG_PATH = path.join(process.cwd(), "base_zeta.json");
const cleanText = (value) => String(value ?? "").trim();
export const DEFAULT_COMMAND_PREFIXES = ["."];
const emptySocialLinks = () => ({
    facebook: "",
    instagram: "",
    tiktok: "",
    telegram: "",
});
const emptySetup = () => ({
    completed: false,
    lockedChatJid: "",
    assets: {},
    textCompleted: {},
    prefixes: [],
    updatedAt: "",
});
export const normalizeOwnerJid = (value) => {
    const input = cleanText(value);
    if (!input || input === "0")
        return "";
    const compact = input.replace(/\s+/g, "");
    if (/@(lid|s\.whatsapp\.net)$/i.test(compact))
        return compact.toLowerCase();
    const digits = compact.replace(/[^0-9]/g, "");
    if (!digits)
        return "";
    return `${digits}@s.whatsapp.net`;
};
export const normalizeOwnerLid = (value) => {
    const jid = normalizeOwnerJid(value);
    return /@lid$/i.test(jid) ? jid : "";
};
export const normalizeOwnerPn = (value) => {
    const jid = normalizeOwnerJid(value);
    return /@s\.whatsapp\.net$/i.test(jid) ? jid : "";
};
export const normalizeOwnerNumber = (value) => {
    const digits = cleanText(value).replace(/[^0-9]/g, "");
    if (!digits || digits === "0")
        return "";
    return /^\d{8,15}$/.test(digits) ? digits : "";
};
const normalizeStoredOwnerNumber = (ownerNumber, ownerJid) => {
    const direct = normalizeOwnerNumber(cleanText(ownerNumber));
    if (direct)
        return direct;
    const jid = cleanText(ownerJid);
    if (/@s\.whatsapp\.net$/i.test(jid))
        return normalizeOwnerNumber(jid);
    return "";
};
export const normalizeReceptionNumber = (value) => {
    const digits = cleanText(value).replace(/[^0-9]/g, "");
    if (!digits)
        return "";
    if (digits.startsWith("521"))
        return digits;
    if (digits.startsWith("52"))
        return `521${digits.slice(2)}`;
    return digits;
};
export const normalizePrefixes = (value) => {
    const source = Array.isArray(value) ? value.join(" ") : cleanText(value);
    const prefixes = source
        .split(/\s+/)
        .map((prefix) => prefix.trim())
        .filter(Boolean);
    return Array.from(new Set(prefixes)).slice(0, 20);
};
export const parseOptionalUrl = (value) => {
    const input = cleanText(value);
    if (!input || input === "0")
        return { ok: true, value: "" };
    const candidate = /^https?:\/\//i.test(input) ? input : `https://${input}`;
    try {
        const url = new URL(candidate);
        if (!/^https?:$/i.test(url.protocol))
            return { ok: false, value: "" };
        if (!url.hostname || !/[a-z0-9]/i.test(url.hostname))
            return { ok: false, value: "" };
        return { ok: true, value: url.toString() };
    }
    catch {
        return { ok: false, value: "" };
    }
};
export const normalizeOptionalUrl = (value) => {
    const parsed = parseOptionalUrl(value);
    return parsed.ok ? parsed.value : "";
};
const normalizeSocialLinks = (value) => ({
    facebook: normalizeOptionalUrl(value?.facebook),
    instagram: normalizeOptionalUrl(value?.instagram),
    tiktok: normalizeOptionalUrl(value?.tiktok),
    telegram: normalizeOptionalUrl(value?.telegram),
});
const normalizeSetup = (value) => {
    const setup = emptySetup();
    const assets = value?.assets && typeof value.assets === "object" ? value.assets : {};
    const prefixes = normalizePrefixes(value?.prefixes);
    const textCompleted = value?.textCompleted && typeof value.textCompleted === "object" ? value.textCompleted : {};
    const requiredAssets = ["generalImage", "subMainImage", "rpgImage", "welcomeImage"];
    const hasAllAssets = requiredAssets.every((key) => Boolean(assets[key]?.path));
    return {
        completed: Boolean(value?.completed && hasAllAssets && prefixes.length),
        lockedChatJid: cleanText(value?.lockedChatJid),
        assets,
        textCompleted,
        prefixes,
        updatedAt: cleanText(value?.updatedAt),
    };
};
export const isValidUniversalConfig = (value) => {
    if (!value)
        return false;
    return Boolean(cleanText(value.botName) && cleanText(value.currencyName) && cleanText(value.ownerName));
};
export const readUniversalConfig = () => {
    try {
        if (!fs.existsSync(UNIVERSAL_CONFIG_PATH))
            return null;
        const raw = fs.readFileSync(UNIVERSAL_CONFIG_PATH, "utf8");
        const parsed = JSON.parse(raw);
        if (!isValidUniversalConfig(parsed))
            return null;
        return {
            botName: cleanText(parsed.botName),
            ownerJid: normalizeOwnerJid(cleanText(parsed.ownerJid)),
            ownerLid: normalizeOwnerLid(cleanText(parsed.ownerLid || parsed.ownerJid)),
            ownerPn: normalizeOwnerPn(cleanText(parsed.ownerPn || parsed.ownerNumber || parsed.ownerJid)),
            ownerNumber: normalizeStoredOwnerNumber(parsed.ownerNumber, parsed.ownerJid),
            currencyName: cleanText(parsed.currencyName),
            ownerName: cleanText(parsed.ownerName),
            receptionNumber: normalizeReceptionNumber(cleanText(parsed.receptionNumber)),
            channelUrl: normalizeOptionalUrl(parsed.channelUrl),
            socialLinks: normalizeSocialLinks(parsed.socialLinks),
            setup: normalizeSetup(parsed.setup),
            configuredAt: cleanText(parsed.configuredAt) || new Date().toISOString(),
        };
    }
    catch {
        return null;
    }
};
export const writeUniversalConfig = (config) => {
    const data = {
        botName: cleanText(config.botName),
        ownerJid: normalizeOwnerJid(config.ownerJid),
        ownerLid: normalizeOwnerLid(config.ownerLid || config.ownerJid),
        ownerPn: normalizeOwnerPn(config.ownerPn || config.ownerNumber || config.ownerJid || ""),
        ownerNumber: normalizeStoredOwnerNumber(config.ownerNumber, config.ownerPn || config.ownerJid),
        currencyName: cleanText(config.currencyName),
        ownerName: cleanText(config.ownerName),
        receptionNumber: normalizeReceptionNumber(config.receptionNumber),
        channelUrl: normalizeOptionalUrl(config.channelUrl),
        socialLinks: normalizeSocialLinks(config.socialLinks),
        setup: normalizeSetup(config.setup),
        configuredAt: new Date().toISOString(),
    };
    if (!isValidUniversalConfig(data)) {
        throw new Error("Configuración universal incompleta");
    }
    fs.writeFileSync(UNIVERSAL_CONFIG_PATH, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
    return data;
};
export const updateUniversalConfig = (update) => {
    const current = readUniversalConfig();
    if (!current)
        throw new Error("Falta base_zeta.json. Ejecuta el bot y completa la configuración inicial.");
    const data = {
        ...current,
        ...update,
        botName: cleanText(update.botName ?? current.botName),
        ownerJid: normalizeOwnerJid(cleanText(update.ownerJid ?? current.ownerJid)),
        ownerLid: normalizeOwnerLid(cleanText(update.ownerLid ?? current.ownerLid ?? update.ownerJid ?? current.ownerJid)),
        ownerPn: normalizeOwnerPn(cleanText(update.ownerPn ?? current.ownerPn ?? update.ownerNumber ?? current.ownerNumber ?? update.ownerJid ?? current.ownerJid)),
        ownerNumber: normalizeStoredOwnerNumber(update.ownerNumber ?? current.ownerNumber, update.ownerPn ?? current.ownerPn ?? update.ownerJid ?? current.ownerJid),
        currencyName: cleanText(update.currencyName ?? current.currencyName),
        ownerName: cleanText(update.ownerName ?? current.ownerName),
        receptionNumber: normalizeReceptionNumber(cleanText(update.receptionNumber ?? current.receptionNumber)),
        channelUrl: normalizeOptionalUrl(update.channelUrl ?? current.channelUrl),
        socialLinks: normalizeSocialLinks({ ...current.socialLinks, ...(update.socialLinks || {}) }),
        setup: normalizeSetup({
            ...current.setup,
            ...(update.setup || {}),
            assets: { ...(current.setup?.assets || {}), ...(update.setup?.assets || {}) },
            textCompleted: { ...(current.setup?.textCompleted || {}), ...(update.setup?.textCompleted || {}) },
        }),
        configuredAt: current.configuredAt,
    };
    fs.writeFileSync(UNIVERSAL_CONFIG_PATH, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
    return data;
};
export const getUniversalConfig = () => {
    const config = readUniversalConfig();
    if (!config)
        throw new Error("Falta base_zeta.json. Ejecuta el bot y completa la configuración inicial.");
    return config;
};
export const getRuntimeBotName = () => readUniversalConfig()?.botName || "";
export const getRuntimeCurrencyName = () => readUniversalConfig()?.currencyName || "";
export const getRuntimeOwnerName = () => readUniversalConfig()?.ownerName || "";
export const getRuntimeOwnerJid = () => readUniversalConfig()?.ownerJid || "";
export const getRuntimeOwnerLid = () => readUniversalConfig()?.ownerLid || "";
export const getRuntimeOwnerPn = () => readUniversalConfig()?.ownerPn || "";
export const getRuntimeOwnerNumber = () => readUniversalConfig()?.ownerNumber || "";
export const getRuntimeReceptionNumber = () => readUniversalConfig()?.receptionNumber || "";
export const getRuntimeChannelUrl = () => readUniversalConfig()?.channelUrl || "";
export const getRuntimeSocialLinks = () => readUniversalConfig()?.socialLinks || emptySocialLinks();
export const getRuntimeSetup = () => readUniversalConfig()?.setup || emptySetup();
export const isRuntimeSetupComplete = () => Boolean(readUniversalConfig()?.setup?.completed);
export const getRuntimeCommandPrefixes = () => readUniversalConfig()?.setup?.prefixes || [];
export const getRuntimeAssetPath = (key) => readUniversalConfig()?.setup?.assets?.[key]?.path || "";
