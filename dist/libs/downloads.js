import axios from "axios";
import * as cheerio from "cheerio";
import { spawn, spawnSync } from "node:child_process";
import fs, { promises as fsPromises } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
export class MediaCheckError extends Error {
    userMessage;
    constructor(msg = "Archivo inválido", userMsg = "El archivo descargado está dañado o vacío") {
        super(msg);
        this.name = "MediaCheckError";
        this.userMessage = userMsg;
    }
}
const _verifyMediaAbort = (ms = 15_000) => {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    t.unref?.();
    return c.signal;
};
export const verifyMediaUrl = async (url, minBytes = 60 * 1024) => {
    if (!/^https?:\/\//i.test(String(url || "")))
        throw new MediaCheckError("URL inválida", "No se pudo procesar");
    let size = null;
    try {
        const head = await fetch(url, { method: "HEAD", signal: _verifyMediaAbort() });
        if (head.ok) {
            const len = head.headers.get("content-length");
            if (len)
                size = Number(len);
        }
    }
    catch { }
    if (size === null) {
        try {
            const partial = await fetch(url, { method: "GET", headers: { range: "bytes=0-0" }, signal: _verifyMediaAbort() });
            const range = partial.headers.get("content-range");
            if (range && range.includes("/")) {
                const total = range.split("/")[1];
                if (total && total !== "*")
                    size = Number(total);
            }
            else if (partial.status !== 206) {
                const len = partial.headers.get("content-length");
                if (len)
                    size = Number(len);
            }
            await partial.body?.cancel?.().catch(() => { });
        }
        catch { }
    }
    if (size !== null && Number.isFinite(size) && size > 0 && size < minBytes) {
        throw new MediaCheckError(`Archivo demasiado pequeño (${size} bytes)`, "El archivo descargado está dañado o vacío, intenta de nuevo");
    }
};
const DVYER_BASE = "https://dv-yer-api.online";
const DVYER_TIMEOUT = 90_000;
const DVYER_API_KEY = process.env.DVYER_API_KEY || "dvyer430117431548";
export class DvyerError extends Error {
    userMessage;
    constructor(msg = "Error DV-YER", userMsg = "La API no respondió") {
        super(msg);
        this.name = "DvyerError";
        this.userMessage = userMsg;
    }
}
const _dvyerAbort = (ms = DVYER_TIMEOUT) => {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    t.unref?.();
    return c.signal;
};
const _dvyerBuildUrl = (path, params = {}) => {
    const url = new URL(`${DVYER_BASE}${path.startsWith("/") ? path : `/${path}`}`);
    for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null || v === "")
            continue;
        url.searchParams.set(k, String(v));
    }
    if (DVYER_API_KEY) {
        if (!url.searchParams.has("apikey"))
            url.searchParams.set("apikey", DVYER_API_KEY);
        if (!url.searchParams.has("key"))
            url.searchParams.set("key", DVYER_API_KEY);
    }
    return url.toString();
};
const _dvyerUnwrap = (raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
        return raw;
    const obj = raw;
    const hasEnv = ["ok", "success", "status", "data", "result", "results", "response", "error"].some(k => k in obj);
    if (!hasEnv)
        return raw;
    const failed = obj.ok === false || obj.success === false || obj.status === false || obj.status === "false" || obj.status === "error" || obj.status === 0;
    if (failed)
        throw new DvyerError(String(obj.error || obj.message || "error"), "No se pudo procesar");
    const d = obj.data ?? obj.result ?? obj.results ?? obj.response;
    if (d !== undefined && d !== null)
        return d;
    if (obj.error)
        throw new DvyerError(String(obj.error), "No se pudo procesar");
    return raw;
};
export const dvyerGet = async (endpoint, params = {}) => {
    let res;
    try {
        res = await fetch(_dvyerBuildUrl(endpoint, params), {
            method: "GET",
            signal: _dvyerAbort(),
            headers: {
                accept: "application/json, */*",
                ...(DVYER_API_KEY ? { authorization: `Bearer ${DVYER_API_KEY}`, "x-api-key": DVYER_API_KEY, apikey: DVYER_API_KEY } : {}),
            },
        });
    }
    catch (e) {
        throw new DvyerError(e instanceof Error ? e.message : String(e), "La API no respondió");
    }
    if (!res.ok)
        throw new DvyerError(`HTTP ${res.status}`, res.status === 429 ? "Límite alcanzado" : "La API no respondió");
    const text = await res.text().catch(() => "");
    if (!text)
        throw new DvyerError("Respuesta vacía", "La API no respondió");
    let json;
    try {
        json = JSON.parse(text);
    }
    catch {
        throw new DvyerError("JSON inválido", "La API no respondió");
    }
    return _dvyerUnwrap(json);
};
const _dvyerIsUrl = (v) => /^https?:\/\//i.test(String(v ?? "").trim());
const _dvyerMediaLike = (u) => /\.(mp3|m4a|ogg|opus|mp4|webm|mov|mkv|jpg|jpeg|png|webp|gif|apk|zip)(\?|#|$)/i.test(u) || /\/tmp\/|\/file\/|\/download|\/media|\/uploads?\//i.test(u);
const _dvyerWalkUrls = (v, out = []) => {
    if (!v)
        return out;
    if (typeof v === "string" && _dvyerIsUrl(v)) {
        out.push(v);
        return out;
    }
    if (Array.isArray(v)) {
        for (const x of v)
            _dvyerWalkUrls(x, out);
        return out;
    }
    if (typeof v === "object") {
        for (const x of Object.values(v))
            _dvyerWalkUrls(x, out);
    }
    return out;
};
const _DVYER_MEDIA_KEYS = ["url", "download", "downloadUrl", "download_url", "dl", "media", "audio", "video", "file", "link", "image", "thumbnail", "cover"];
export const dvyerMediaUrl = (data) => {
    if (data && typeof data === "object" && !Array.isArray(data)) {
        const obj = data;
        for (const k of _DVYER_MEDIA_KEYS) {
            const v = String(obj[k] ?? "").trim();
            if (_dvyerIsUrl(v) && _dvyerMediaLike(v))
                return v;
        }
        for (const k of _DVYER_MEDIA_KEYS) {
            const v = String(obj[k] ?? "").trim();
            if (_dvyerIsUrl(v))
                return v;
        }
    }
    const urls = _dvyerWalkUrls(data);
    const found = urls.find(_dvyerMediaLike) || urls[0];
    if (!found)
        throw new DvyerError("Sin URL", "No se pudo procesar");
    return found;
};
const _dvyerStr = (v, fb = "") => String(v ?? "").replace(/\s+/g, " ").trim() || fb;
const _dvyerArr = (v) => {
    if (Array.isArray(v))
        return v;
    if (v && typeof v === "object") {
        const obj = v;
        for (const k of ["items", "results", "videos", "tracks", "songs", "data", "pins", "images", "media", "files", "apps", "apk", "apks", "list"])
            if (Array.isArray(obj[k]))
                return obj[k];
        const singleKeys = ["url", "link", "dl", "download", "downloadUrl", "media", "audio", "video", "file", "image", "thumbnail", "name", "title", "package"];
        if (singleKeys.some(k => obj[k] !== undefined && obj[k] !== null && obj[k] !== ""))
            return [obj];
    }
    return [];
};
export const dvyerItems = (data) => _dvyerArr(data);
export const dvyerTitle = (item, fb = "Sin título") => _dvyerStr(item?.title || item?.name || item?.track || item?.song || item?.appName || item?.filename || item?.fileName, fb);
export const dvyerAuthor = (item, fb = "Desconocido") => {
    const o = item;
    if (Array.isArray(o?.artists)) {
        const n = o.artists.map(a => typeof a === "string" ? a : _dvyerStr(a?.name)).filter(Boolean);
        if (n.length)
            return n.join(", ");
    }
    return _dvyerStr(o?.artist || o?.author || o?.channel || o?.creator || o?.username || o?.owner, fb);
};
export const dvyerThumb = (item) => _dvyerStr(item?.thumbnail || item?.thumb || item?.image || item?.cover || item?.icon || item?.banner);
export const dvyerLink = (item) => _dvyerStr(item?.url || item?.link || item?.download || item?.downloadUrl || item?.download_url || item?.dl || item?.file || item?.media || item?.video || item?.audio);
export const dvyerDuration = (item) => _dvyerStr(item?.duration || item?.timestamp || item?.time);
export const dvyerSize = (item) => _dvyerStr(item?.size || item?.filesize || item?.sizeMb || item?.sizeBytes);
export const dvyerUserError = (error, fallback = "No se pudo procesar") => error instanceof DvyerError ? (error.userMessage || fallback) : fallback;
const DVYER_AUDIO_MIME = {
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    aac: "audio/aac",
    ogg: "audio/ogg",
    opus: "audio/ogg; codecs=opus",
    wav: "audio/wav",
    flac: "audio/flac",
};
export const dvyerAudioFile = (data, fallbackName = "audio") => {
    const mediaUrl = dvyerMediaUrl(data);
    const explicitExt = _dvyerStr(data?.ext || data?.format || data?.extension).replace(/^\./, "").toLowerCase();
    const urlExt = (mediaUrl.match(/\.([a-z0-9]{2,4})(?:\?|#|$)/i)?.[1] || "").toLowerCase();
    const ext = DVYER_AUDIO_MIME[explicitExt] ? explicitExt : DVYER_AUDIO_MIME[urlExt] ? urlExt : "mp3";
    const mimetype = DVYER_AUDIO_MIME[ext] || "audio/mpeg";
    const existingName = _dvyerStr(data?.fileName || data?.filename);
    const fileName = existingName && /\.[a-z0-9]{2,4}$/i.test(existingName) ? existingName : `${fallbackName}.${ext}`;
    return { mediaUrl, mimetype, fileName, ext };
};
export const dvyerYtMp3 = (url) => dvyerGet("/ytmp3", { url });
export const dvyerYtMp3Dl = (url) => dvyerGet("/ytmp3dl", { url });
export const dvyerYtMp4 = (url, quality = "720") => dvyerGet("/ytmp4", { url, quality });
export const dvyerYtMp4Dl = (url, quality = "720") => dvyerGet("/ytmp4dl", { url, quality });
export const dvyerSpotify = (url) => dvyerGet("/spotify", { url });
export const dvyerAppleMusic = (url) => dvyerGet("/applemusicdl", { url });
export const dvyerInstagram = (url) => dvyerGet("/instagram", { url });
export const dvyerFacebook = (url) => dvyerGet("/facebook", { url });
export const dvyerTikTokMp4 = (url) => dvyerGet("/ttdlmp4", { url });
export const dvyerMediafire = (url) => dvyerGet("/mediafire", { url });
export const dvyerMega = (url) => dvyerGet("/mega", { url });
export const dvyerTerabox = (url) => dvyerGet("/terabox", { url });
export const dvyerApkDl = (query) => dvyerGet("/apkdl", { query });
export const dvyerApkModDl = (query) => dvyerGet("/apkmoddl", { query });
export const dvyerWindows = (query) => dvyerGet("/windl", { query });
export const dvyerMac = (query) => dvyerGet("/macdl", { query });
export const dvyerYtSearch = (query) => dvyerGet("/ytsearch", { query }).then(dvyerItems);
export const dvyerSpotifySearch = (query) => dvyerGet("/spotifysearch", { query }).then(dvyerItems);
export const dvyerAppleMusicSearch = (query) => dvyerGet("/applemusicsearch", { query }).then(dvyerItems);
export const dvyerTikTokSearch = (query) => dvyerGet("/tiktoksearch", { query }).then(dvyerItems);
export const dvyerApkSearch = (query) => dvyerGet("/apksearch", { query }).then(dvyerItems);
export const dvyerApkModSearch = (query) => dvyerGet("/apkmodsearch", { query }).then(dvyerItems);
export const dvyerWinSearch = (query) => dvyerGet("/winsearch", { query }).then(dvyerItems);
export const dvyerMacSearch = (query) => dvyerGet("/macsearch", { query }).then(dvyerItems);
export const dvyerAnimeFLVLatest = () => dvyerGet("/animeflv/latest").then(dvyerItems);
export const dvyerAnimeFLVSearch = (query) => dvyerGet("/animeflv/search", { query }).then(dvyerItems);
export const dvyerAnimeFLVAnime = (slug) => dvyerGet(`/animeflv/anime/${slug}`);
export const dvyerAnimeFLVEpisode = (slug) => dvyerGet(`/animeflv/episode/${slug}`);
export const dvyerMALNews = () => dvyerGet("/anime/myanimelist/news").then(dvyerItems);
export const dvyerLivechartSchedule = () => dvyerGet("/anime/livechart/schedule").then(dvyerItems);
export const dvyerAnimeKompiLatest = () => dvyerGet("/anime/animekompi/latest").then(dvyerItems);
export const dvyerAnimeDAOSearch = (query) => dvyerGet("/anime/animedao/search", { query }).then(dvyerItems);
export const dvyerImageHD = (url, scale = 2, format = "jpg") => dvyerGet("/image/hd", { url, scale, format });
export const dvyerImageConvert = (url, fmt) => dvyerGet("/image/convert", { url, format: fmt });
export const dvyerImageCompress = (url) => dvyerGet("/image/compress", { url });
export const dvyerImgBB = (url) => dvyerGet("/imgbb", { url });
export const dvyerCheckHost = (host) => dvyerGet("/tools/checkhost", { host });
export const dvyerWaifu = () => dvyerGet("/random/waifu");
export const dvyerEaseMate = (query) => dvyerGet("/easemate", { query }).then(dvyerItems);
export const dvyerTenorEmoji = (emoji) => dvyerGet("/search/tenor/emoji", { emoji });
export const dvyerHuggingFace = (model) => dvyerGet("/search/huggingface/model", { model });
const EVOGB_BASE = "https://api.evogb.org";
const EVOGB_KEY = "zetaservers";
const EVOGB_TIMEOUT = 90_000;
export class EvogbError extends Error {
    userMessage;
    constructor(msg = "Error EVOGB", userMsg = "EVOGB no respondió") {
        super(msg);
        this.name = "EvogbError";
        this.userMessage = userMsg;
    }
}
const _evogbAbort = (ms = EVOGB_TIMEOUT) => {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    t.unref?.();
    return c.signal;
};
const _evogbBuildUrl = (p, params = {}) => {
    const url = new URL(`${EVOGB_BASE}${p.startsWith("/") ? p : `/${p}`}`);
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== "")
            url.searchParams.set(k, String(v));
    }
    if (!url.searchParams.has("key"))
        url.searchParams.set("key", EVOGB_KEY);
    if (!url.searchParams.has("apikey"))
        url.searchParams.set("apikey", EVOGB_KEY);
    return url.toString();
};
const _evogbUnwrap = (raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
        return raw;
    const obj = raw;
    const hasEnv = ["ok", "success", "status", "data", "result", "results", "response", "error"].some(k => k in obj);
    if (!hasEnv)
        return raw;
    const failed = obj.ok === false || obj.success === false || obj.status === false || obj.status === "false" || obj.status === "error";
    if (failed)
        throw new EvogbError(String(obj.error || obj.message || "error"), "No se pudo procesar");
    const d = obj.data ?? obj.result ?? obj.results ?? obj.response;
    if (d !== undefined && d !== null)
        return d;
    if (obj.error)
        throw new EvogbError(String(obj.error), "No se pudo procesar");
    return raw;
};
export const evogbGet = async (endpoint, params = {}) => {
    let res;
    try {
        res = await fetch(_evogbBuildUrl(endpoint, params), {
            method: "GET", signal: _evogbAbort(),
            headers: { accept: "application/json, */*", authorization: `Bearer ${EVOGB_KEY}`, "x-api-key": EVOGB_KEY, apikey: EVOGB_KEY },
        });
    }
    catch (e) {
        throw new EvogbError(e instanceof Error ? e.message : String(e), "EVOGB no respondió");
    }
    if (!res.ok)
        throw new EvogbError(`HTTP ${res.status}`, res.status === 429 ? "EVOGB sin límite" : "EVOGB no respondió");
    const respText = await res.text().catch(() => "");
    if (!respText)
        throw new EvogbError("Respuesta vacía", "EVOGB no respondió");
    let json;
    try {
        json = JSON.parse(respText);
    }
    catch {
        throw new EvogbError("JSON inválido", "EVOGB no respondió");
    }
    return _evogbUnwrap(json);
};
export const evogbPost = async (endpoint, body = {}, params = {}) => {
    let res;
    try {
        res = await fetch(_evogbBuildUrl(endpoint, params), {
            method: "POST", signal: _evogbAbort(),
            headers: { accept: "application/json, */*", "content-type": "application/json", authorization: `Bearer ${EVOGB_KEY}`, "x-api-key": EVOGB_KEY, apikey: EVOGB_KEY },
            body: JSON.stringify({ key: EVOGB_KEY, apikey: EVOGB_KEY, ...body }),
        });
    }
    catch (e) {
        throw new EvogbError(e instanceof Error ? e.message : String(e), "EVOGB no respondió");
    }
    if (!res.ok)
        throw new EvogbError(`HTTP ${res.status}`, "EVOGB no respondió");
    const text = await res.text().catch(() => "");
    let json;
    try {
        json = JSON.parse(text);
    }
    catch {
        throw new EvogbError("JSON inválido", "EVOGB no respondió");
    }
    return _evogbUnwrap(json);
};
const _evogbPostForm = async (endpoint, form, params = {}) => {
    form.set("key", EVOGB_KEY);
    form.set("apikey", EVOGB_KEY);
    let res;
    try {
        res = await fetch(_evogbBuildUrl(endpoint, params), {
            method: "POST", signal: _evogbAbort(),
            headers: { accept: "application/json, text/plain, */*", authorization: `Bearer ${EVOGB_KEY}`, "x-api-key": EVOGB_KEY, apikey: EVOGB_KEY },
            body: form,
        });
    }
    catch (e) {
        throw new EvogbError(e instanceof Error ? e.message : String(e), "EVOGB no respondió");
    }
    if (!res.ok)
        throw new EvogbError(`HTTP ${res.status}`, res.status === 429 ? "EVOGB sin límite" : "EVOGB no respondió");
    const text = await res.text().catch(() => "");
    let json;
    try {
        json = JSON.parse(text);
    }
    catch {
        throw new EvogbError("JSON inválido", "EVOGB no respondió");
    }
    return _evogbUnwrap(json);
};
const _evogbDataUrlToBlob = (dataUrl) => {
    const match = String(dataUrl || "").match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/i);
    if (!match)
        throw new EvogbError("DataURL inválido", "No se pudo procesar");
    const mime = match[1] || "application/octet-stream";
    const isBase64 = Boolean(match[2]);
    const raw = match[3] || "";
    const buffer = isBase64 ? Buffer.from(raw, "base64") : Buffer.from(decodeURIComponent(raw));
    const ext = mime.includes("/") ? (mime.split("/")[1] || "").replace(/[^a-z0-9]+/gi, "") || "bin" : "bin";
    return {
        blob: new Blob([buffer], { type: mime }),
        filename: `upload.${ext}`,
    };
};
const _evogbStr = (v, fb = "") => String(v ?? "").replace(/\s+/g, " ").trim() || fb;
const _evogbIsUrl = (v) => /^(?:https?:\/\/|data:|blob:)/i.test(_evogbStr(v));
const _evogbMediaLike = (u) => /\.(mp3|m4a|ogg|opus|mp4|webm|mov|mkv|jpg|jpeg|png|webp|gif|apk|zip)(\?|#|$)/i.test(u) || /\/tmp\/|\/file\/|\/download|\/media|\/uploads?\//i.test(u) || /^data:/i.test(u);
const _evogbWalkUrls = (v, out = []) => {
    if (!v)
        return out;
    if (typeof v === "string" && _evogbIsUrl(v)) {
        out.push(v);
        return out;
    }
    if (Array.isArray(v)) {
        for (const x of v)
            _evogbWalkUrls(x, out);
        return out;
    }
    if (typeof v === "object") {
        for (const x of Object.values(v))
            _evogbWalkUrls(x, out);
    }
    return out;
};
const _EVOGB_MEDIA_KEYS = ["url", "download", "downloadUrl", "download_url", "dl", "media", "audio", "video", "file", "link", "image", "thumbnail", "cover"];
export const evogbMediaUrl = (data) => {
    if (data && typeof data === "object" && !Array.isArray(data)) {
        const obj = data;
        for (const k of _EVOGB_MEDIA_KEYS) {
            const v = _evogbStr(obj[k]);
            if (_evogbIsUrl(v) && _evogbMediaLike(v))
                return v;
        }
        for (const k of _EVOGB_MEDIA_KEYS) {
            const v = _evogbStr(obj[k]);
            if (_evogbIsUrl(v))
                return v;
        }
    }
    const urls = _evogbWalkUrls(data);
    const found = urls.find(_evogbMediaLike) || urls[0];
    if (!found)
        throw new EvogbError("Sin URL", "No se pudo procesar");
    return found;
};
const _evogbArr = (v) => {
    if (Array.isArray(v))
        return v;
    if (v && typeof v === "object") {
        const obj = v;
        for (const k of ["items", "results", "videos", "tracks", "songs", "data", "pins", "images", "media", "files", "apps", "apk", "apks"])
            if (Array.isArray(obj[k]))
                return obj[k];
        const sk = ["url", "link", "dl", "download", "media", "audio", "video", "file", "image", "thumbnail", "name", "title", "package"];
        if (sk.some(k => obj[k] !== undefined && obj[k] !== null && obj[k] !== ""))
            return [obj];
    }
    return [];
};
export const evogbItems = (data) => _evogbArr(data);
export const evogbTitle = (item, fb = "Sin título") => _evogbStr(item?.title || item?.name || item?.track || item?.song || item?.appName || item?.filename || item?.fileName, fb);
export const evogbAuthor = (item, fb = "Desconocido") => {
    const o = item;
    if (Array.isArray(o?.artists)) {
        const n = o.artists.map(a => typeof a === "string" ? a : _evogbStr(a?.name)).filter(Boolean);
        if (n.length)
            return n.join(", ");
    }
    return _evogbStr(o?.artist || o?.author || o?.channel || o?.creator || o?.username, fb);
};
export const evogbThumb = (item) => _evogbStr(item?.thumbnail || item?.thumb || item?.image || item?.cover || item?.icon || item?.banner);
export const evogbLink = (item) => _evogbStr(item?.url || item?.link || item?.download || item?.downloadUrl || item?.download_url || item?.dl || item?.file || item?.media || item?.video || item?.audio);
export const evogbDuration = (item) => _evogbStr(item?.duration || item?.timestamp || item?.time);
export const evogbSize = (item) => _evogbStr(item?.size || item?.filesize || item?.sizeMb || item?.sizeBytes);
export const evogbUserError = (error, fallback = "No se pudo procesar") => error instanceof EvogbError ? (error.userMessage || fallback) : fallback;
export const evogbYtMp3 = (url) => evogbGet("/dl/ytmp3", { url });
export const evogbYtMp4 = (url, q = "720") => evogbGet("/dl/ytmp4", { url, quality: q });
export const evogbSpotifyDl = (url) => evogbGet("/dl/spotify", { url });
export const evogbTikTok = (url) => evogbGet("/dl/tiktok", { url });
export const evogbTikTokMp3 = (url) => evogbGet("/dl/tiktokmp3", { url });
export const evogbYoutubePlay = (query, type = "audio") => evogbGet("/dl/youtube-play", { query, type });
export const evogbSearchYt = (query) => evogbGet("/search/yt", { query }).then(evogbItems);
export const evogbSearchSpotify = (query) => evogbGet("/search/spotify", { query }).then(evogbItems);
export const evogbSearchPinterest = (query) => evogbGet("/search/pinterest", { query }).then(evogbItems);
export const evogbSearchPinterestVideo = (query) => evogbGet("/search/pinterestvideo", { query }).then(evogbItems);
export const evogbSearchTikTok = (query) => evogbGet("/search/tiktok", { query }).then(evogbItems);
export const evogbSearchApk = (query) => evogbGet("/search/apk", { query }).then(evogbItems);
export const evogbBrat = async (text, animated = false) => {
    const endpoint = "/tools/brat";
    let res;
    try {
        res = await fetch(_evogbBuildUrl(endpoint, { text, animated }), {
            method: "GET",
            signal: _evogbAbort(),
            headers: { accept: "*/*", authorization: `Bearer ${EVOGB_KEY}`, "x-api-key": EVOGB_KEY, apikey: EVOGB_KEY },
        });
    }
    catch (e) {
        throw new EvogbError(e instanceof Error ? e.message : String(e), "EVOGB no respondió");
    }
    if (!res.ok)
        throw new EvogbError(`HTTP ${res.status}`, res.status === 429 ? "EVOGB sin límite" : "EVOGB no respondió");
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (/^image\//.test(ct) || /^video\//.test(ct) || /^application\/octet-stream/.test(ct)) {
        const arrayBuffer = await res.arrayBuffer();
        const base64 = typeof Buffer !== "undefined"
            ? Buffer.from(arrayBuffer).toString("base64")
            : btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
        const mime = ct || "application/octet-stream";
        return `data:${mime};base64,${base64}`;
    }
    const respText = await res.text().catch(() => "");
    if (!respText)
        throw new EvogbError("Respuesta vacía", "EVOGB no respondió");
    let json;
    try {
        json = JSON.parse(respText);
    }
    catch {
        throw new EvogbError("JSON inválido", "EVOGB no respondió");
    }
    return _evogbUnwrap(json);
};
export const evogbUpscale = (url) => evogbGet("/tools/upscale", { url });
export const evogbWhatMusicShazam = (url) => evogbGet("/tools/whatmusic-shazam", { url });
export const evogbToReal = (file) => evogbGet("/ai/toreal", { method: "url", url: file, file });
export const evogbUpload = async (file, server = "auto", method = "url") => {
    if (_evogbIsUrl(file))
        return evogbGet("/tools/upload", { server, method, url: file, file });
    if (/^data:/i.test(file)) {
        const { blob, filename } = _evogbDataUrlToBlob(file);
        const form = new FormData();
        form.set("server", server);
        form.set("method", method);
        form.set("file", blob, filename);
        return _evogbPostForm("/tools/upload", form);
    }
    return evogbPost("/tools/upload", { server, method, file });
};
const SCRATS_BASE = (process.env.SCRATS_API || "http://89.34.230.100:3000").replace(/\/+$/, "");
const SCRATS_TOKEN = process.env.SCRATS_TOKEN || "sky_scrats_conex-sockets";
const SCRATS_TIMEOUT = Number(process.env.SCRATS_TIMEOUT_MS || 90_000);
export class SkyScratsError extends Error {
    userMessage;
    constructor(msg = "Error SKY-SCRATS", userMsg = "SKY-SCRATS no respondió") {
        super(msg);
        this.name = "SkyScratsError";
        this.userMessage = userMsg;
    }
}
const _scratsReq = async (path, options = {}) => {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), SCRATS_TIMEOUT);
    t.unref?.();
    const method = (options.method || "GET").toUpperCase();
    let res;
    try {
        res = await fetch(`${SCRATS_BASE}${path}`, {
            method, signal: c.signal,
            headers: { accept: "application/json, */*", "content-type": "application/json", authorization: `Bearer ${SCRATS_TOKEN}` },
            ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        });
    }
    catch (e) {
        clearTimeout(t);
        throw new SkyScratsError(e instanceof Error ? e.message : String(e), "SKY-SCRATS no respondió");
    }
    clearTimeout(t);
    if (!res.ok)
        throw new SkyScratsError(`HTTP ${res.status}`, "SKY-SCRATS no respondió");
    const text = await res.text().catch(() => "");
    if (!text)
        throw new SkyScratsError("Respuesta vacía", "SKY-SCRATS no respondió");
    let json;
    try {
        json = JSON.parse(text);
    }
    catch {
        throw new SkyScratsError("JSON inválido", "SKY-SCRATS no respondió");
    }
    const obj = json;
    if (obj && typeof obj === "object" && !Array.isArray(obj) && "ok" in obj) {
        if (!obj.ok)
            throw new SkyScratsError(String(obj.error || obj.message || "error"), "SKY-SCRATS no respondió");
        if (obj.data !== undefined)
            return obj.data;
    }
    return json;
};
const enc = (s) => encodeURIComponent(s);
const _scratsStr = (v, fb = "") => String(v ?? "").replace(/\s+/g, " ").trim() || fb;
const _scratsIsUrl = (v) => /^https?:\/\//i.test(_scratsStr(v));
export const scratsYouTubeAudio = (url) => _scratsReq("/api/yt/audio", { method: "POST", body: { url } });
export const scratsYouTubeVideo = (url, quality = "720") => _scratsReq("/api/yt/video", { method: "POST", body: { url, quality } });
export const scratsGoogleWeb = (query, limit = 5) => _scratsReq(`/api/google/web?q=${enc(query)}&limit=${limit}`);
export const scratsGoogleImages = (query, limit = 5) => _scratsReq(`/api/google/images?q=${enc(query)}&limit=${limit}&minWidth=1000&minHeight=700`);
export const scratsPinterest = (query, limit = 10) => _scratsReq(`/api/pinterest/search?q=${enc(query)}&limit=${limit}`);
export const scratsSpotifySearch = (query, limit = 5) => _scratsReq(`/api/spotify/search?q=${enc(query)}&limit=${limit}&type=track`);
export const scratsHealth = () => _scratsReq("/health");
export const scratsUserError = (error, fallback = "No se pudo procesar") => error instanceof SkyScratsError ? (error.userMessage || fallback) : fallback;
export const scratsMediaUrl = (media) => {
    const url = _scratsStr(media?.url);
    if (!_scratsIsUrl(url))
        throw new SkyScratsError("Sin URL", "No se pudo procesar");
    return url;
};
export const pickGoogleImage = (data) => {
    const items = Array.isArray(data) ? data : [...(data?.images || []), ...(data?.results || []), ...(data?.items || [])];
    return items.find(i => _scratsIsUrl(i.image) || _scratsIsUrl(i.imageUrl) || _scratsIsUrl(i.url) || _scratsIsUrl(i.original)) || null;
};
export const googleImageUrl = (item) => {
    const url = _scratsStr(item?.image || item?.imageUrl || item?.url || item?.link || item?.original);
    if (!_scratsIsUrl(url))
        throw new SkyScratsError("Sin imagen", "No encontré imágenes.");
    return url;
};
export const pickGoogleWebResults = (data) => {
    const items = Array.isArray(data) ? data : [...(data?.results || []), ...(data?.items || [])];
    return items.filter(i => _scratsStr(i.title) && _scratsStr(i.url || i.link)).slice(0, 5);
};
export const pickPinterestImage = (data) => {
    const items = [...(data?.images || []), ...(data?.pins || [])];
    return items.find(i => _scratsIsUrl(i.image) || _scratsIsUrl(i.url)) || null;
};
export const pinterestItemUrl = (item) => {
    const url = _scratsStr(item?.image || item?.url);
    if (!_scratsIsUrl(url))
        throw new SkyScratsError("Sin imagen", "No encontré imágenes de Pinterest.");
    return url;
};
export const findFirstUrl = (text = "") => {
    return _scratsStr(text.match(/https?:\/\/\S+/i)?.[0]?.replace(/[>)\]}.,]+$/, ""));
};
export const toDataUrl = (buffer, mimetype = "image/jpeg") => {
    if (!buffer.length)
        throw new SkyScratsError("Imagen vacía", "No se pudo procesar");
    return `data:${mimetype || "image/jpeg"};base64,${buffer.toString("base64")}`;
};
const ROOT_DIR = process.cwd();
const TMP_DIR = process.env.MEDIA_TMP_DIR || path.join(ROOT_DIR, "tmp");
const BIN_DIR = path.join(ROOT_DIR, "bin");
const DEFAULT_TIMEOUT = Number(process.env.MEDIA_DOWNLOAD_TIMEOUT_MS || 180_000);
const YOUTUBE_VIDEO_HEIGHT = Number(process.env.YT_VIDEO_HEIGHT || process.env.YOUTUBE_VIDEO_HEIGHT || 480);
const TRANSCODE_YOUTUBE_VIDEO = String(process.env.YT_VIDEO_TRANSCODE || process.env.YOUTUBE_VIDEO_TRANSCODE || "1") !== "0";
const USER_AGENT = process.env.MEDIA_USER_AGENT ||
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const VIDEO_EXT = new Set([".mp4", ".m4v", ".mov", ".webm", ".mkv"]);
const AUDIO_EXT = new Set([".mp3", ".m4a", ".opus", ".ogg", ".webm"]);
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const ensureTmp = () => {
    fs.mkdirSync(TMP_DIR, { recursive: true });
};
const existsExecutable = (file) => {
    try {
        return Boolean(file && fs.existsSync(file) && (process.platform === "win32" || (fs.accessSync(file, fs.constants.X_OK), true)));
    }
    catch {
        return false;
    }
};
export const getYtDlpPath = () => {
    const exe = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
    const candidates = [
        process.env.YTDLP_PATH,
        path.join(BIN_DIR, exe),
        path.join(ROOT_DIR, exe),
        "/usr/local/bin/yt-dlp",
        "/usr/bin/yt-dlp",
        "/bin/yt-dlp",
    ].filter(Boolean);
    for (const file of candidates) {
        if (existsExecutable(file))
            return file;
    }
    return exe;
};
const safeName = (name = "media") => {
    return (String(name)
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._-]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 80) || "media");
};
const isUrl = (text = "") => /^https?:\/\//i.test(String(text).trim());
const cookieFileFor = (platform) => {
    const envByPlatform = {
        instagram: process.env.IG_COOKIES || process.env.INSTAGRAM_COOKIES,
        twitter: process.env.TWITTER_COOKIES || process.env.X_COOKIES,
        x: process.env.TWITTER_COOKIES || process.env.X_COOKIES,
        tiktok: process.env.TIKTOK_COOKIES,
        pinterest: process.env.PIN_COOKIES || process.env.PINTEREST_COOKIES,
        youtube: process.env.YOUTUBE_COOKIES || process.env.YT_COOKIES,
    };
    const file = envByPlatform[platform] || process.env.MEDIA_COOKIES;
    return file && fs.existsSync(file) ? file : null;
};
const detectKindFromExt = (file) => {
    const ext = path.extname(file).toLowerCase();
    if (VIDEO_EXT.has(ext))
        return "video";
    if (AUDIO_EXT.has(ext))
        return "audio";
    if (IMAGE_EXT.has(ext))
        return "image";
    return "document";
};
const mimeFromExt = (file, forcedKind) => {
    const ext = path.extname(file).toLowerCase();
    const map = {
        ".mp4": "video/mp4",
        ".m4v": "video/mp4",
        ".mov": "video/quicktime",
        ".webm": forcedKind === "audio" ? "audio/webm" : "video/webm",
        ".mkv": "video/x-matroska",
        ".mp3": "audio/mpeg",
        ".m4a": "audio/mp4",
        ".opus": "audio/ogg",
        ".ogg": "audio/ogg",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
    };
    return map[ext] || "application/octet-stream";
};
const shortError = (err) => {
    const raw = err?.stderr || err?.stdout || err?.message || String(err || "Error desconocido");
    return String(raw).replace(/\s+/g, " ").trim().slice(0, 700);
};
const findNewestDownload = (stamp, preferredKind = null) => {
    const priority = {
        video: [".mp4", ".m4v", ".mov", ".webm", ".mkv"],
        audio: [".mp3", ".m4a", ".opus", ".ogg", ".webm"],
        image: [".jpg", ".jpeg", ".png", ".webp", ".gif"],
    };
    const wanted = preferredKind && priority[preferredKind] ? new Set(priority[preferredKind]) : null;
    const ignored = new Set([".part", ".ytdl", ".tmp", ".temp", ".aria2"]);
    const files = fs
        .readdirSync(TMP_DIR)
        .filter((file) => file.startsWith(stamp))
        .map((file) => {
        const full = path.join(TMP_DIR, file);
        const stat = fs.statSync(full);
        const ext = path.extname(file).toLowerCase();
        const kindScore = wanted && wanted.has(ext) ? 1 : 0;
        return { file, full, ext, kindScore, size: stat.size, mtime: stat.mtimeMs };
    })
        .filter((item) => item.size > 0 && !ignored.has(item.ext))
        .filter((item) => !wanted || wanted.has(item.ext) || (!VIDEO_EXT.has(item.ext) && !AUDIO_EXT.has(item.ext) && !IMAGE_EXT.has(item.ext)))
        .sort((a, b) => b.kindScore - a.kindScore || b.mtime - a.mtime || b.size - a.size);
    return files[0] || null;
};
const cleanupFiles = (stamp) => {
    try {
        for (const file of fs.readdirSync(TMP_DIR)) {
            if (file.startsWith(stamp))
                fs.rmSync(path.join(TMP_DIR, file), { force: true });
        }
    }
    catch { }
};
const runYtDlp = (args, options = {}) => {
    const ytdlp = getYtDlpPath();
    const result = spawnSync(ytdlp, args, {
        cwd: ROOT_DIR,
        timeout: options.timeout || DEFAULT_TIMEOUT,
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 40,
        env: {
            ...process.env,
            PATH: [BIN_DIR, "/usr/local/bin", "/usr/bin", "/bin", process.env.PATH || ""].filter(Boolean).join(path.delimiter),
        },
    });
    if (result.error)
        throw result.error;
    if (result.status !== 0) {
        const error = new Error(shortError(result));
        error.stdout = result.stdout || undefined;
        error.stderr = result.stderr || undefined;
        throw error;
    }
    return result;
};
const getFfmpegPath = () => {
    if (process.env.FFMPEG_PATH)
        return process.env.FFMPEG_PATH;
    try {
        const ffmpeg = require("ffmpeg-static");
        if (ffmpeg && fs.existsSync(ffmpeg))
            return ffmpeg;
    }
    catch { }
    return "ffmpeg";
};
const transcodeForWhatsapp = (inputFile, stamp, options = {}) => {
    if (!TRANSCODE_YOUTUBE_VIDEO || options.platform !== "youtube" || options.mode !== "video")
        return inputFile;
    const ffmpeg = getFfmpegPath();
    const outputFile = path.join(TMP_DIR, `${stamp}.wa.mp4`);
    const height = Math.max(240, Math.min(Number(options.height || YOUTUBE_VIDEO_HEIGHT) || 480, 720));
    const result = spawnSync(ffmpeg, [
        "-y",
        "-i",
        inputFile,
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-vf",
        `scale='trunc(min(${Math.round((16 * height) / 9)},iw)/2)*2':-2`,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        String(options.crf || 28),
        "-pix_fmt",
        "yuv420p",
        "-profile:v",
        "baseline",
        "-level",
        "3.1",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        outputFile,
    ], {
        cwd: ROOT_DIR,
        timeout: options.timeout || DEFAULT_TIMEOUT,
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 40,
        env: {
            ...process.env,
            PATH: [BIN_DIR, "/usr/local/bin", "/usr/bin", "/bin", process.env.PATH || ""].filter(Boolean).join(path.delimiter),
        },
    });
    if (result.error || result.status !== 0 || !fs.existsSync(outputFile) || fs.statSync(outputFile).size < 5000) {
        return inputFile;
    }
    return outputFile;
};
export const youtubeWhatsappFormat = (height = YOUTUBE_VIDEO_HEIGHT) => {
    const maxHeight = Math.max(240, Math.min(Number(height) || 480, 720));
    return [
        `bv*[vcodec^=avc1][height<=${maxHeight}][ext=mp4]+ba[acodec^=mp4a][ext=m4a]`,
        `b[vcodec^=avc1][height<=${maxHeight}][ext=mp4]`,
        `bv*[vcodec^=avc1][height<=720][ext=mp4]+ba[acodec^=mp4a][ext=m4a]`,
        `b[vcodec^=avc1][height<=720][ext=mp4]`,
        "best[height<=480][ext=mp4]",
        "best[ext=mp4]",
        "best",
    ].join("/");
};
export const getYtDlpInfo = (url, platform = "media") => {
    const cookies = cookieFileFor(platform);
    const args = ["-J", "--no-playlist", "--no-warnings", "--no-check-certificates", "--user-agent", USER_AGENT];
    if (cookies)
        args.push("--cookies", cookies);
    args.push(url);
    const result = runYtDlp(args, { timeout: 90_000 });
    return JSON.parse(result.stdout || "{}");
};
export const downloadWithYtDlp = (url, options = {}) => {
    ensureTmp();
    const platform = options.platform || "media";
    const mode = options.mode || "video";
    const stamp = `dl_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const outputTemplate = path.join(TMP_DIR, `${stamp}.%(ext)s`);
    const cookies = cookieFileFor(platform);
    const args = [
        "--no-playlist",
        "--no-warnings",
        "--no-check-certificates",
        "--force-overwrites",
        "--restrict-filenames",
        "--user-agent",
        USER_AGENT,
        "-o",
        outputTemplate,
    ];
    if (cookies)
        args.push("--cookies", cookies);
    if (mode === "audio") {
        args.push("-f", "bestaudio/best", "-x", "--audio-format", options.audioFormat || "mp3", "--audio-quality", String(options.audioQuality || 3));
        try {
            const ffmpeg = require("ffmpeg-static");
            if (ffmpeg && fs.existsSync(ffmpeg))
                args.push("--ffmpeg-location", ffmpeg);
        }
        catch { }
    }
    else if (mode === "image") {
        args.push("--write-thumbnail", "--skip-download", "--convert-thumbnails", "jpg");
    }
    else {
        args.push("-f", options.format || "bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/best[ext=mp4]/best", "-S", options.sort || "res:480,ext:mp4:m4a", "--merge-output-format", "mp4", "--remux-video", "mp4");
        const ffmpeg = getFfmpegPath();
        if (ffmpeg && ffmpeg !== "ffmpeg")
            args.push("--ffmpeg-location", ffmpeg);
    }
    args.push(url);
    try {
        runYtDlp(args, { timeout: options.timeout || DEFAULT_TIMEOUT });
        const found = findNewestDownload(stamp, mode);
        if (!found)
            throw new Error("yt-dlp terminó, pero no generó archivo");
        const finalFile = transcodeForWhatsapp(found.full, stamp, options);
        const buffer = fs.readFileSync(finalFile);
        if (buffer.length < Number(options.minBytes || 1500))
            throw new Error("Archivo generado demasiado pequeño");
        const kind = mode === "audio" ? "audio" : detectKindFromExt(finalFile);
        const filename = `${safeName(options.filename || platform)}${path.extname(finalFile)}`;
        cleanupFiles(stamp);
        return {
            ok: true,
            source: "yt-dlp",
            platform,
            kind,
            mime: mimeFromExt(filename, kind),
            filename,
            title: options.title || null,
            url,
            buffer,
        };
    }
    catch (err) {
        cleanupFiles(stamp);
        throw new Error(`yt-dlp ${platform}: ${shortError(err)}`);
    }
};
const toNodeBuffer = (data) => {
    if (!data)
        throw new Error("Respuesta vacía");
    if (Buffer.isBuffer(data))
        return data;
    if (data instanceof ArrayBuffer) {
        return Buffer.from(new Uint8Array(data));
    }
    if (ArrayBuffer.isView(data)) {
        const view = data;
        const arrayBuffer = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
        return Buffer.from(new Uint8Array(arrayBuffer));
    }
    if (typeof data === "string")
        return Buffer.from(data);
    throw new Error("Respuesta inválida");
};
const fetchDownloadBuffer = async (url, options = {}) => {
    const res = await axios.get(url, {
        responseType: "arraybuffer",
        maxRedirects: 8,
        timeout: options.timeout || DEFAULT_TIMEOUT,
        headers: {
            "User-Agent": USER_AGENT,
            Accept: "*/*",
            Referer: options.referer || undefined,
            ...options.headers,
        },
        validateStatus: (status) => status >= 200 && status < 400,
    });
    const buffer = toNodeBuffer(res.data);
    if (buffer.length < Number(options.minBytes || 1500))
        throw new Error("Archivo descargado demasiado pequeño");
    const contentType = String(res.headers["content-type"] || "").split(";")[0].trim();
    const finalUrl = res.request?.res?.responseUrl || url;
    return { buffer, contentType, finalUrl };
};
const extFromMime = (mime, fallback = ".mp4") => {
    const cleanMime = String(mime || "").split(";")[0].trim().toLowerCase();
    const map = {
        "video/mp4": ".mp4",
        "video/webm": ".webm",
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "audio/mpeg": ".mp3",
        "audio/mp4": ".m4a",
        "audio/ogg": ".ogg",
    };
    return map[cleanMime] || fallback;
};
const absUrl = (raw, base) => {
    if (!raw)
        return null;
    const value = String(raw).replace(/&amp;/g, "&").trim();
    try {
        return new URL(value, base).toString();
    }
    catch {
        return null;
    }
};
const parseMeta = (html) => {
    const meta = {};
    const re = /<meta\s+([^>]*?)>/gi;
    let match;
    while ((match = re.exec(html))) {
        const attrs = match[1];
        const prop = attrs.match(/(?:property|name)=['"]([^'"]+)['"]/i)?.[1];
        const content = attrs.match(/content=['"]([^'"]+)['"]/i)?.[1];
        if (prop && content && !meta[prop])
            meta[prop] = content.replace(/&amp;/g, "&");
    }
    return meta;
};
export const searchYoutube = async (query) => {
    const text = String(query || "").trim();
    if (!text)
        throw new Error("Búsqueda vacía");
    if (isUrl(text))
        return { url: text, title: null, thumbnail: null };
    const mod = (await import("yt-search"));
    const ytSearch = mod.default || mod;
    const found = await ytSearch(text);
    const video = found?.videos?.[0];
    if (!video?.url)
        throw new Error("No encontré resultados en YouTube");
    return {
        url: video.url,
        title: video.title || null,
        thumbnail: video.thumbnail || null,
        seconds: video.seconds || null,
        author: video.author?.name || null,
    };
};
const getYtdlCore = async () => {
    const mod = (await import("@distube/ytdl-core"));
    return mod.default || mod;
};
const youtubeInfoWithYtdl = async (url) => {
    const ytdl = await getYtdlCore();
    if (!ytdl.validateURL(url))
        return null;
    const info = await ytdl.getInfo(url);
    const details = info?.videoDetails || {};
    const thumbs = details.thumbnails || [];
    return {
        title: details.title || null,
        thumbnail: thumbs[thumbs.length - 1]?.url || null,
        seconds: Number(details.lengthSeconds || 0) || null,
        author: details.author?.name || details.ownerChannelName || null,
    };
};
const youtubeAudioWithYtdlCore = async (url, meta = {}) => {
    const ytdl = await getYtdlCore();
    return new Promise((resolve, reject) => {
        if (!ytdl.validateURL(url))
            return reject(new Error("URL de YouTube inválida para ytdl-core"));
        const stream = ytdl(url, {
            filter: "audioonly",
            quality: "highestaudio",
            highWaterMark: 1 << 25,
            requestOptions: { headers: { "User-Agent": USER_AGENT } },
        });
        const chunks = [];
        const timer = setTimeout(() => stream.destroy(new Error("timeout descargando audio con ytdl-core")), DEFAULT_TIMEOUT);
        stream.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        stream.on("error", (err) => {
            clearTimeout(timer);
            reject(err);
        });
        stream.on("end", () => {
            clearTimeout(timer);
            const buffer = Buffer.concat(chunks);
            if (buffer.length < 5000)
                return reject(new Error("Audio demasiado pequeño"));
            resolve({
                ok: true,
                source: "@distube/ytdl-core",
                platform: "youtube",
                kind: "audio",
                mime: "audio/mp4",
                filename: `${safeName(meta.title || "youtube_audio")}.m4a`,
                title: meta.title || null,
                url,
                buffer,
            });
        });
    });
};
const pickProgressiveMp4 = (formats = [], maxHeight = YOUTUBE_VIDEO_HEIGHT) => {
    const limit = Math.max(240, Math.min(Number(maxHeight) || 480, 720));
    const progressive = formats
        .filter((format) => {
        return format?.hasVideo && format?.hasAudio && /mp4/i.test(String(format.container || format.mimeType || ""));
    })
        .sort((a, b) => {
        const ah = Number(a.height || 0);
        const bh = Number(b.height || 0);
        const aScore = ah <= limit ? ah + 10000 : 10000 - ah;
        const bScore = bh <= limit ? bh + 10000 : 10000 - bh;
        return bScore - aScore;
    });
    return progressive[0] || null;
};
const youtubeVideoWithYtdlCore = async (url, meta = {}) => {
    const ytdl = await getYtdlCore();
    if (!ytdl.validateURL(url))
        throw new Error("URL de YouTube inválida para ytdl-core");
    const info = await ytdl.getInfo(url, {
        requestOptions: { headers: { "User-Agent": USER_AGENT } },
    });
    const format = pickProgressiveMp4(info?.formats || []);
    if (!format)
        throw new Error("No hay video MP4 progresivo disponible");
    return new Promise((resolve, reject) => {
        const stream = ytdl.downloadFromInfo(info, {
            format,
            highWaterMark: 1 << 25,
            requestOptions: { headers: { "User-Agent": USER_AGENT } },
        });
        const chunks = [];
        const timer = setTimeout(() => stream.destroy(new Error("timeout descargando video con ytdl-core")), DEFAULT_TIMEOUT);
        stream.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        stream.on("error", (err) => {
            clearTimeout(timer);
            reject(err);
        });
        stream.on("end", async () => {
            clearTimeout(timer);
            try {
                const raw = Buffer.concat(chunks);
                if (raw.length < 5000)
                    throw new Error("Video demasiado pequeño");
                const buffer = await faststartMp4(raw).catch(() => raw);
                resolve({
                    ok: true,
                    source: "@distube/ytdl-core",
                    platform: "youtube",
                    kind: "video",
                    mime: "video/mp4",
                    filename: `${safeName(meta.title || "youtube_video")}.mp4`,
                    title: meta.title || null,
                    url,
                    buffer,
                });
            }
            catch (err) {
                reject(err);
            }
        });
    });
};
export const downloadYoutubeAudio = async (input) => {
    const selected = await searchYoutube(input);
    let meta = selected;
    try {
        meta = { ...selected, ...((await youtubeInfoWithYtdl(selected.url)) || {}) };
    }
    catch { }
    try {
        return await youtubeAudioWithYtdlCore(selected.url, meta);
    }
    catch {
        return downloadWithYtDlp(selected.url, {
            platform: "youtube",
            mode: "audio",
            filename: meta.title || "youtube_audio",
            title: meta.title,
        });
    }
};
export const downloadYoutubeVideo = async (input) => {
    const selected = await searchYoutube(input);
    let meta = selected;
    try {
        meta = { ...selected, ...((await youtubeInfoWithYtdl(selected.url)) || {}) };
    }
    catch { }
    try {
        return await youtubeVideoWithYtdlCore(selected.url, meta);
    }
    catch {
        return downloadWithYtDlp(selected.url, {
            platform: "youtube",
            mode: "video",
            format: youtubeWhatsappFormat(YOUTUBE_VIDEO_HEIGHT),
            sort: `res:${Math.max(240, Math.min(YOUTUBE_VIDEO_HEIGHT || 480, 720))},ext:mp4:m4a`,
            filename: meta.title || "youtube_video",
            title: meta.title,
            minBytes: 5000,
            height: YOUTUBE_VIDEO_HEIGHT,
            crf: 29,
        });
    }
};
export const downloadInstagramRaw = async (url) => {
    return downloadWithYtDlp(url, {
        platform: "instagram",
        mode: "video",
        filename: "instagram",
    });
};
export const downloadTwitterRaw = async (url) => {
    return downloadWithYtDlp(url, {
        platform: "twitter",
        mode: "video",
        filename: "twitter_x",
    });
};
export const downloadTikTokTikwm = async (url) => {
    const res = await axios.get("https://www.tikwm.com/api/", {
        params: { url, hd: 1 },
        timeout: 90_000,
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        validateStatus: (status) => status >= 200 && status < 400,
    });
    const body = res.data || {};
    const data = body.data || {};
    if (!data || (body.code && Number(body.code) !== 0))
        throw new Error(body.msg || "TikWM no devolvió resultado válido");
    const title = data.title || data.desc || "tiktok";
    const videoUrl = absUrl(data.hdplay || data.play || data.wmplay, "https://www.tikwm.com/");
    if (videoUrl) {
        const media = await fetchDownloadBuffer(videoUrl, { referer: "https://www.tikwm.com/" });
        const ext = extFromMime(media.contentType, ".mp4");
        return {
            ok: true,
            source: "tikwm",
            platform: "tiktok",
            kind: "video",
            mime: media.contentType || "video/mp4",
            filename: `${safeName(title)}${ext}`,
            title,
            url,
            directUrl: media.finalUrl,
            buffer: media.buffer,
        };
    }
    const images = Array.isArray(data.images) ? data.images : [];
    if (images.length) {
        const items = [];
        for (let i = 0; i < Math.min(images.length, 10); i++) {
            const imageUrl = absUrl(images[i], "https://www.tikwm.com/");
            if (!imageUrl)
                continue;
            const media = await fetchDownloadBuffer(imageUrl, { referer: "https://www.tikwm.com/", minBytes: 500 });
            const ext = extFromMime(media.contentType, ".jpg");
            items.push({
                kind: "image",
                mime: media.contentType || "image/jpeg",
                filename: `${safeName(title)}_${i + 1}${ext}`,
                buffer: media.buffer,
                url: imageUrl,
            });
        }
        if (items.length) {
            return { ok: true, source: "tikwm", platform: "tiktok", kind: "album", title, url, items };
        }
    }
    throw new Error("TikWM no encontró video ni imágenes");
};
export const downloadTikTokRaw = async (url) => {
    try {
        return await downloadTikTokTikwm(url);
    }
    catch {
        return downloadWithYtDlp(url, {
            platform: "tiktok",
            mode: "video",
            filename: "tiktok",
        });
    }
};
export const downloadPinterestOpenGraph = async (url) => {
    const res = await axios.get(url, {
        timeout: 90_000,
        maxRedirects: 8,
        headers: {
            "User-Agent": USER_AGENT,
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        validateStatus: (status) => status >= 200 && status < 400,
    });
    const finalUrl = res.request?.res?.responseUrl || url;
    const meta = parseMeta(String(res.data || ""));
    const title = meta["og:title"] || meta["twitter:title"] || "pinterest";
    const raw = meta["og:video"] || meta["og:video:url"] || meta["og:video:secure_url"] || meta["twitter:player:stream"] || meta["og:image"] || meta["twitter:image"];
    const mediaUrl = absUrl(raw, finalUrl);
    if (!mediaUrl)
        throw new Error("OpenGraph no encontró media");
    const media = await fetchDownloadBuffer(mediaUrl, { referer: finalUrl, minBytes: 500 });
    const kind = media.contentType.startsWith("image/") ? "image" : "video";
    const ext = extFromMime(media.contentType, kind === "image" ? ".jpg" : ".mp4");
    return {
        ok: true,
        source: "opengraph",
        platform: "pinterest",
        kind,
        mime: media.contentType || (kind === "image" ? "image/jpeg" : "video/mp4"),
        filename: `${safeName(title)}${ext}`,
        title,
        url,
        directUrl: media.finalUrl,
        buffer: media.buffer,
    };
};
export const downloadPinterestRaw = async (url) => {
    try {
        return downloadWithYtDlp(url, {
            platform: "pinterest",
            mode: "video",
            filename: "pinterest",
        });
    }
    catch {
        return downloadPinterestOpenGraph(url);
    }
};
export const normalizePlatform = (platform) => {
    const value = String(platform || "").toLowerCase();
    if (["ig", "instagram"].includes(value))
        return "instagram";
    if (["tw", "x", "twitter"].includes(value))
        return "twitter";
    if (["tt", "tiktok"].includes(value))
        return "tiktok";
    if (["pin", "pinterest"].includes(value))
        return "pinterest";
    if (["play", "ytmp3", "yta", "youtube-audio"].includes(value))
        return "youtube-audio";
    if (["yt", "ytv", "ytmp4", "youtube", "youtube-video"].includes(value))
        return "youtube-video";
    return value;
};
export const downloadByPlatform = async (platform, input) => {
    const p = normalizePlatform(platform);
    if (p === "instagram")
        return downloadInstagramRaw(input);
    if (p === "twitter")
        return downloadTwitterRaw(input);
    if (p === "tiktok")
        return downloadTikTokRaw(input);
    if (p === "pinterest")
        return downloadPinterestRaw(input);
    if (p === "youtube-audio")
        return downloadYoutubeAudio(input);
    if (p === "youtube-video")
        return downloadYoutubeVideo(input);
    throw new Error(`Plataforma no soportada: ${platform}`);
};
export const sendMediaResult = async (sock, jid, result, quoted, options = {}) => {
    const caption = options.caption || "";
    if (result.kind === "album" && Array.isArray(result.items)) {
        for (const item of result.items || []) {
            await sendMediaResult(sock, jid, item, quoted, options);
        }
        return;
    }
    if (result.kind === "video") {
        return sock.sendMessage(jid, { video: result.buffer, mimetype: result.mime || "video/mp4", caption }, { quoted });
    }
    if (result.kind === "image") {
        return sock.sendMessage(jid, { image: result.buffer, mimetype: result.mime || "image/jpeg", caption }, { quoted });
    }
    if (result.kind === "audio") {
        return sock.sendMessage(jid, { audio: result.buffer, mimetype: result.mime || "audio/mpeg", ptt: Boolean(options.ptt) }, { quoted });
    }
    return sock.sendMessage(jid, {
        document: result.buffer,
        mimetype: result.mime || "application/octet-stream",
        fileName: result.filename || "media.bin",
        caption,
    }, { quoted });
};
const ffmpegBin = getFfmpegPath();
const CNV_BASE_URL = "https://cnv.cx";
const CNV_HEADERS = {
    "accept-encoding": "gzip, deflate, br, zstd",
    origin: "https://frame.y2meta-uk.com",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
};
const YOUTUBE_HEADERS = {
    "accept-language": "es-ES,es;q=0.9,en;q=0.8",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
};
const CLIPTO_HEADERS_BASE = {
    "content-type": "application/json",
    origin: "https://www.clipto.com",
    referer: "https://www.clipto.com/es/media-downloader/youtube-downloader",
    accept: "application/json, text/plain, */*",
    priority: "u=1, i",
    "sec-gpc": "1",
    "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
};
const YT_ID_REGEX = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtube\.com\/watch\?.*?[?&]v=)([a-zA-Z0-9_-]{11})/;
const isYoutubeUrl = (value) => {
    return /(?:youtube\.com|youtu\.be)/i.test(value);
};
export const extractYoutubeId = (value) => {
    const clean = String(value || "").trim();
    const match = clean.match(YT_ID_REGEX);
    if (match?.[1])
        return match[1];
    if (/^[a-zA-Z0-9_-]{11}$/.test(clean))
        return clean;
    return null;
};
export const toYoutubeUrl = (value) => {
    const id = extractYoutubeId(value);
    return id ? `https://youtu.be/${id}` : value;
};
export const formatViews = (views) => {
    const value = Number(views || 0);
    if (!value)
        return "N/A";
    if (value >= 1e9)
        return `${(value / 1e9).toFixed(1)}B`;
    if (value >= 1e6)
        return `${(value / 1e6).toFixed(1)}M`;
    if (value >= 1e3)
        return `${(value / 1e3).toFixed(1)}K`;
    return value.toString();
};
export const youtubeInfoText = (video, mode = "audio") => {
    const title = String(video.title || "Sin título").trim();
    const author = String(video.author || "Desconocido").trim();
    const duration = String(video.duration || "N/A").trim();
    const ago = String(video.ago || "N/A").trim();
    const link = String(video.url || "").trim();
    return [
        mode === "video" ? "「🎬」 YouTube MP4" : "「🎧」 YouTube MP3",
        "",
        `✦ Título › ${title}`,
        `✦ Canal › ${author}`,
        `✦ Duración › ${duration}`,
        `✦ Vistas › ${formatViews(video.views)}`,
        `✦ Publicado › ${ago}`,
        link ? `✦ Link › ${link}` : "",
    ].filter(Boolean).join("\n");
};
export const sanitizeFileName = (name) => {
    return String(name || "youtube")
        .normalize("NFKD")
        .replace(/[^\w\s.-]/g, "")
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 90)
        .toLowerCase() || "youtube";
};
const cleanTitle = (value) => {
    return String(value || "")
        .replace(/\\u0026/g, "&")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim();
};
const randomHex = (length) => {
    return Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join("");
};
const walk = (node, callback) => {
    if (!node || typeof node !== "object")
        return;
    callback(node);
    if (Array.isArray(node)) {
        for (const item of node)
            walk(item, callback);
        return;
    }
    for (const value of Object.values(node)) {
        walk(value, callback);
    }
};
const textFromRuns = (value) => {
    if (!value)
        return "";
    if (typeof value.simpleText === "string")
        return value.simpleText;
    if (Array.isArray(value.runs))
        return value.runs.map((run) => run?.text || "").join("");
    return "";
};
const parseViews = (value) => {
    const clean = String(value || "").replace(/[^\d]/g, "");
    return Number(clean || 0);
};
const parseYoutubeInitialData = (html) => {
    const patterns = [
        /var ytInitialData = (\{[\s\S]*?\});<\/script>/,
        /window\["ytInitialData"\]\s*=\s*(\{[\s\S]*?\});/,
        /ytInitialData"\]\s*=\s*(\{[\s\S]*?\});/,
    ];
    for (const pattern of patterns) {
        const match = html.match(pattern);
        if (!match?.[1])
            continue;
        try {
            return JSON.parse(match[1]);
        }
        catch { }
    }
    return null;
};
const videoFromRenderer = (renderer) => {
    const id = renderer?.videoId;
    if (!id)
        return null;
    const title = cleanTitle(textFromRuns(renderer.title));
    if (!title)
        return null;
    const author = textFromRuns(renderer.ownerText) ||
        textFromRuns(renderer.longBylineText) ||
        textFromRuns(renderer.shortBylineText) ||
        "Desconocido";
    const duration = renderer.lengthText?.simpleText ||
        renderer.thumbnailOverlays?.find((overlay) => overlay?.thumbnailOverlayTimeStatusRenderer)?.thumbnailOverlayTimeStatusRenderer?.text?.simpleText ||
        "N/A";
    const views = parseViews(renderer.viewCountText?.simpleText || textFromRuns(renderer.shortViewCountText) || "");
    const ago = textFromRuns(renderer.publishedTimeText) || "N/A";
    const thumbnails = renderer.thumbnail?.thumbnails || [];
    const thumbnail = thumbnails[thumbnails.length - 1]?.url ||
        `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    return {
        id,
        title,
        url: `https://youtu.be/${id}`,
        thumbnail,
        duration,
        views,
        ago,
        author: cleanTitle(author),
    };
};
const getOembedInfo = async (id) => {
    const url = `https://youtu.be/${id}`;
    const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, {
        headers: YOUTUBE_HEADERS,
    }).catch(() => null);
    if (!response?.ok) {
        return {
            id,
            title: `YouTube ${id}`,
            url,
            thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
            duration: "N/A",
            views: 0,
            ago: "N/A",
            author: "Desconocido",
        };
    }
    const json = await response.json().catch(() => null);
    return {
        id,
        title: cleanTitle(json?.title || `YouTube ${id}`),
        url,
        thumbnail: json?.thumbnail_url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        duration: "N/A",
        views: 0,
        ago: "N/A",
        author: cleanTitle(json?.author_name || "Desconocido"),
    };
};
export const searchYouTube = async (query) => {
    const cleanQuery = String(query || "").trim();
    if (!cleanQuery) {
        throw new Error("Escribe el nombre o link del video.");
    }
    const id = extractYoutubeId(cleanQuery);
    if (id) {
        const direct = await getOembedInfo(id);
        if (direct)
            return direct;
    }
    const searchUrl = isYoutubeUrl(cleanQuery)
        ? toYoutubeUrl(cleanQuery)
        : `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQuery)}`;
    const response = await fetch(searchUrl, {
        headers: YOUTUBE_HEADERS,
    });
    if (!response.ok) {
        throw new Error(`YouTube respondió ${response.status}.`);
    }
    const html = await response.text();
    const initialData = parseYoutubeInitialData(html);
    if (!initialData) {
        throw new Error("No pude leer resultados de YouTube.");
    }
    const videos = [];
    walk(initialData, (node) => {
        if (node?.videoRenderer) {
            const info = videoFromRenderer(node.videoRenderer);
            if (info && !videos.some((item) => item.id === info.id)) {
                videos.push(info);
            }
        }
    });
    const first = videos.find((video) => !/^\s*(mix|playlist)\s*$/i.test(video.title)) || videos[0];
    if (!first) {
        throw new Error("No se encontró nada.");
    }
    return first;
};
const _ytParseViews = (value) => {
    if (typeof value === "number")
        return value;
    const raw = String(value ?? "").toLowerCase().trim();
    const number = Number(raw.replace(/[^\d.]/g, "")) || 0;
    if (!number)
        return 0;
    if (raw.includes("b"))
        return Math.round(number * 1e9);
    if (raw.includes("m"))
        return Math.round(number * 1e6);
    if (raw.includes("k"))
        return Math.round(number * 1e3);
    return Math.round(number);
};
const _ytFromEvogbItem = (item, fallbackQuery) => {
    const link = evogbLink(item) || String(item.videoUrl || item.video_url || item.watchUrl || item.watch_url || "").trim();
    const id = extractYoutubeId(link) || extractYoutubeId(String(item.id ?? "").trim()) || "";
    const url = id ? toYoutubeUrl(id) : link;
    if (!url)
        throw new Error("EVOGB no devolvió link de YouTube");
    return {
        id: id || "evogb",
        title: evogbTitle(item, fallbackQuery),
        url,
        thumbnail: evogbThumb(item) || (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : ""),
        duration: evogbDuration(item) || "N/A",
        views: _ytParseViews(item.views || item.view || item.viewsText || item.viewCount),
        ago: String(item.ago || item.published || item.publishedTime || item.uploaded || "N/A").trim() || "N/A",
        author: evogbAuthor(item),
    };
};
export const resolveYoutubeInfo = async (query) => {
    const text = String(query ?? "").trim();
    if (!text)
        throw new Error("Búsqueda vacía");
    try {
        const items = await evogbSearchYt(text);
        const first = items[0];
        if (first)
            return _ytFromEvogbItem(first, text);
    }
    catch { }
    return searchYouTube(text);
};
export const sendYoutubeInfoCard = async (sock, mctx, video, mode) => {
    const caption = youtubeInfoText(video, mode);
    const thumbnail = String(video.thumbnail ?? "").trim();
    if (/^https?:\/\//i.test(thumbnail)) {
        try {
            await sock.sendMessage(mctx.chat.jid, { image: { url: thumbnail }, caption }, { quoted: mctx.message.original });
            return;
        }
        catch { }
    }
    await mctx.reply(caption);
};
const getCnvKey = async () => {
    const response = await fetch(`${CNV_BASE_URL}/v2/sanity/key`, {
        headers: CNV_HEADERS,
    });
    if (!response.ok) {
        throw new Error(`cnv.cx key respondió ${response.status}.`);
    }
    const json = await response.json().catch(() => null);
    if (!json?.key) {
        throw new Error("cnv.cx devolvió una key inválida.");
    }
    return String(json.key);
};
const resolvePayload = (link, format) => {
    const type = format.endsWith("k") ? "mp3" : "mp4";
    return {
        link,
        format: type,
        audioBitrate: type === "mp3" ? format.replace("k", "") : "128",
        videoQuality: type === "mp4" ? format.replace("p", "") : "480",
        filenameStyle: "pretty",
        vCodec: "h264",
    };
};
const convertCnv = async (url, format) => {
    const key = await getCnvKey();
    const payload = resolvePayload(url, format);
    const response = await fetch(`${CNV_BASE_URL}/v2/converter`, {
        method: "POST",
        headers: {
            ...CNV_HEADERS,
            key,
            "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(payload),
    });
    if (!response.ok) {
        throw new Error(`cnv.cx respondió ${response.status}.`);
    }
    const json = await response.json().catch(() => null);
    if (!json?.url) {
        throw new Error(json?.message || json?.error || "cnv.cx no generó descarga.");
    }
    return json;
};
const getCliptoHeaders = () => {
    return {
        ...CLIPTO_HEADERS_BASE,
        cookie: [
            "NEXT_LOCALE=en;",
            `uu=${randomHex(32)};`,
            `bucket=${Math.floor(Math.random() * 100)};`,
            "stripe-checkout=default;",
            "country=ES;",
            "ip=79.117.167.49;",
            "mac-download=mac;",
            "show-mac-download-new-interface=default_second;",
            `XSRF-TOKEN=${randomHex(40)}`,
        ].join(" "),
    };
};
const getCliptoData = async (url) => {
    if (!extractYoutubeId(url)) {
        throw new Error("CLIPTO_INVALID_URL");
    }
    const response = await fetch("https://www.clipto.com/api/youtube", {
        method: "POST",
        headers: getCliptoHeaders(),
        body: JSON.stringify({ url }),
    });
    if (!response.ok) {
        throw new Error("CLIPTO_API_ERROR");
    }
    const data = await response.json().catch(() => null);
    if (!data?.success || !Array.isArray(data.medias)) {
        throw new Error("CLIPTO_INVALID_RESPONSE");
    }
    return data;
};
const mediaQualityScore = (media) => {
    const qualityNumber = Number(String(media.quality || "").match(/\d+/)?.[0] || 0);
    const height = Number(media.height || 0);
    const bitrate = Number(media.bitrate || 0);
    return Math.max(qualityNumber, height) * 100000 + bitrate;
};
const pickCliptoMedia = (medias, mode) => {
    if (mode === "audio") {
        const audio = medias
            .filter((media) => media.url && (media.type === "audio" || /^mp3|m4a|webm|opus|ogg$/i.test(media.ext)))
            .sort((a, b) => mediaQualityScore(b) - mediaQualityScore(a));
        return audio[0] || null;
    }
    const withAudio = medias
        .filter((media) => {
        return media.url && media.type === "video" && media.audioQuality !== null && /mp4/i.test(media.ext || media.mimeType || "");
    })
        .sort((a, b) => {
        const ah = Number(a.height || String(a.quality || "").match(/\d+/)?.[0] || 0);
        const bh = Number(b.height || String(b.quality || "").match(/\d+/)?.[0] || 0);
        const aScore = ah <= 480 ? ah + 10000 : 10000 - ah;
        const bScore = bh <= 480 ? bh + 10000 : 10000 - bh;
        return bScore - aScore;
    });
    if (withAudio[0])
        return withAudio[0];
    const video = medias
        .filter((media) => media.url && media.type === "video" && /mp4/i.test(media.ext || media.mimeType || ""))
        .sort((a, b) => mediaQualityScore(b) - mediaQualityScore(a));
    return video[0] || null;
};
const fetchYoutubeBuffer = async (url) => {
    const response = await fetch(url, {
        headers: {
            "user-agent": CNV_HEADERS["user-agent"],
        },
    });
    if (!response.ok) {
        throw new Error(`La descarga respondió ${response.status}.`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) {
        throw new Error("La descarga llegó vacía.");
    }
    return buffer;
};
const runProcess = (command, args, timeoutMs = 180_000) => {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            stdio: ["ignore", "ignore", "pipe"],
        });
        let stderr = "";
        const timer = setTimeout(() => {
            child.kill("SIGKILL");
            reject(new Error(`${command} tardó demasiado.`));
        }, timeoutMs);
        child.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
        });
        child.on("error", (error) => {
            clearTimeout(timer);
            reject(error);
        });
        child.on("close", (code) => {
            clearTimeout(timer);
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(stderr || `${command} terminó con código ${code}`));
        });
    });
};
export const faststartMp4 = async (buffer) => {
    if (!Buffer.isBuffer(buffer) || !buffer.length) {
        throw new Error("Video vacío.");
    }
    const id = `${Date.now()}-${randomUUID()}`;
    const input = path.join(tmpdir(), `zeta-youtube-${id}.mp4`);
    const output = path.join(tmpdir(), `zeta-youtube-${id}-fast.mp4`);
    await fsPromises.writeFile(input, buffer);
    try {
        await runProcess(ffmpegBin, ["-y", "-i", input, "-c", "copy", "-movflags", "+faststart", output], 120_000);
    }
    catch {
        await runProcess(ffmpegBin, [
            "-y",
            "-i",
            input,
            "-c:v",
            "libx264",
            "-c:a",
            "aac",
            "-preset",
            "veryfast",
            "-movflags",
            "+faststart",
            output,
        ], 180_000);
    }
    const data = await fsPromises.readFile(output);
    await fsPromises.rm(input, { force: true }).catch(() => { });
    await fsPromises.rm(output, { force: true }).catch(() => { });
    if (!data.length) {
        throw new Error("ffmpeg no generó video.");
    }
    return data;
};
const downloadByCnv = async (video, mode) => {
    const format = mode === "audio" ? "128k" : "480p";
    const data = await convertCnv(video.url, format);
    const buffer = await fetchYoutubeBuffer(data.url);
    return {
        buffer: mode === "video" ? await faststartMp4(buffer) : buffer,
        filename: sanitizeFileName(path.basename(data.filename || video.title, path.extname(data.filename || ""))),
        mime: mode === "audio" ? "audio/mpeg" : "video/mp4",
        ext: mode === "audio" ? ".mp3" : ".mp4",
    };
};
const downloadByDownloads = async (video, mode) => {
    const result = mode === "audio"
        ? await downloadYoutubeAudio(video.url)
        : await downloadYoutubeVideo(video.url);
    if (!result.buffer?.length)
        throw new Error("downloads.ts no devolvió archivo");
    const rawName = result.filename || result.title || video.title;
    const ext = path.extname(rawName) || (mode === "audio" ? ".mp3" : ".mp4");
    return {
        buffer: result.buffer,
        filename: sanitizeFileName(path.basename(rawName, path.extname(rawName)) || video.title),
        mime: result.mime || (mode === "audio" ? "audio/mpeg" : "video/mp4"),
        ext,
    };
};
const downloadByClipto = async (video, mode) => {
    const data = await getCliptoData(video.url);
    const media = pickCliptoMedia(data.medias, mode);
    if (!media?.url) {
        throw new Error("CLIPTO_NO_MEDIA");
    }
    const buffer = await fetchYoutubeBuffer(media.url);
    return {
        buffer: mode === "video" ? await faststartMp4(buffer) : buffer,
        filename: sanitizeFileName(data.title || video.title),
        mime: media.mimeType || (mode === "audio" ? "audio/mpeg" : "video/mp4"),
        ext: media.ext ? `.${String(media.ext).replace(/^\./, "")}` : mode === "audio" ? ".mp3" : ".mp4",
    };
};
const findDownloadedFile = async (dir) => {
    const files = await fsPromises.readdir(dir);
    const file = files.find((name) => !name.endsWith(".part") && !name.endsWith(".ytdl"));
    if (!file)
        throw new Error("yt-dlp no generó archivo.");
    return path.join(dir, file);
};
const downloadByYtDlp = async (video, mode) => {
    const dir = path.join(tmpdir(), `zeta-ytdlp-${Date.now()}-${randomUUID()}`);
    await fsPromises.mkdir(dir, { recursive: true });
    const output = path.join(dir, "%(title).90B.%(ext)s");
    const cookies = cookieFileFor("youtube");
    const commonArgs = ["--no-warnings", "--no-check-certificates", "--user-agent", USER_AGENT, "--force-overwrites", "--no-part", "--retries", "3", "--fragment-retries", "3"];
    if (cookies)
        commonArgs.push("--cookies", cookies);
    const args = mode === "audio"
        ? [
            ...commonArgs,
            "-x",
            "--audio-format",
            "mp3",
            "--audio-quality",
            "128K",
            "-o",
            output,
            video.url,
        ]
        : [
            ...commonArgs,
            "-f",
            "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best[height<=480]",
            "--merge-output-format",
            "mp4",
            "-o",
            output,
            video.url,
        ];
    try {
        await runProcess(getYtDlpPath(), args, 240_000);
        const file = await findDownloadedFile(dir);
        const buffer = await fsPromises.readFile(file);
        return {
            buffer: mode === "video" ? await faststartMp4(buffer) : buffer,
            filename: sanitizeFileName(path.basename(file, path.extname(file)) || video.title),
            mime: mode === "audio" ? "audio/mpeg" : "video/mp4",
            ext: path.extname(file) || (mode === "audio" ? ".mp3" : ".mp4"),
        };
    }
    finally {
        await fsPromises.rm(dir, { force: true, recursive: true }).catch(() => { });
    }
};
export const downloadYouTube = async (video, mode) => {
    const primary = await downloadByDownloads(video, mode)
        .then((result) => ({ ...result, source: "downloads" }))
        .catch(() => null);
    if (primary?.buffer?.length)
        return primary;
    const cnv = await downloadByCnv(video, mode)
        .then((result) => ({ ...result, source: "cnv.cx" }))
        .catch(() => null);
    if (cnv?.buffer?.length)
        return cnv;
    const clipto = await downloadByClipto(video, mode)
        .then((result) => ({ ...result, source: "clipto" }))
        .catch(() => null);
    if (clipto?.buffer?.length)
        return clipto;
    const ytdlp = await downloadByYtDlp(video, mode)
        .then((result) => ({ ...result, source: "yt-dlp" }))
        .catch(() => {
        throw new Error("No se pudo realizar la descarga");
    });
    return ytdlp;
};
const clean = (value, fallback = "") => {
    const text = String(value ?? "").replace(/\s+/g, " ").trim();
    return text || fallback;
};
const hasUrl = (value) => {
    const text = clean(value);
    return /^https?:\/\//i.test(text);
};
const isImageUrl = (url) => /\.(jpe?g|png|webp)(\?|#|$)/i.test(url) || /i\.pinimg\.com/i.test(url);
const isGifUrl = (url) => /\.gif(\?|#|$)/i.test(url);
const isVideoUrl = (url) => /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(url) || /(?:v\d?\.pinimg\.com|video)/i.test(url);
const firstValidUrl = (...values) => {
    for (const value of values) {
        if (Array.isArray(value)) {
            const nested = firstValidUrl(...value);
            if (nested)
                return nested;
            continue;
        }
        if (hasUrl(value))
            return value;
    }
    return "";
};
const tryAll = async (attempts) => {
    let lastError = null;
    for (const attempt of attempts) {
        try {
            const result = await attempt();
            if (result)
                return result;
        }
        catch (error) {
            lastError = error;
        }
    }
    throw new Error(String(lastError?.message || lastError || "No hubo resultados válidos."));
};
const mediaTypeFromDownloadKind = (kind, mime = "") => {
    if (kind === "image")
        return "image";
    if (/gif/i.test(mime))
        return "gif";
    return "video";
};
const downloadCaption = (extra) => ["「◈」 *Descarga realizada*", extra?.trim()].filter(Boolean).join("\n\n");
const mediaFromDownloadResult = (input, label, limit = 6) => {
    if (input.kind === "album" && Array.isArray(input.items)) {
        return (input.items || [])
            .slice(0, limit)
            .map((item, index) => ({
            type: mediaTypeFromDownloadKind(item.kind, item.mime),
            url: item.url,
            buffer: item.buffer,
            mime: item.mime,
            caption: downloadCaption(`✦ Archivo › ${item.kind === "image" ? "imagen" : "video"} ${index + 1}`),
            fileName: item.filename || `${label.toLowerCase()}-${index + 1}.${item.kind === "image" ? "jpg" : "mp4"}`,
        }));
    }
    if (!input.buffer)
        return [];
    return [{
            type: mediaTypeFromDownloadKind(input.kind, input.mime),
            url: input.directUrl || input.url,
            buffer: input.buffer,
            mime: input.mime,
            caption: downloadCaption("✦ Método › downloads.ts"),
            fileName: input.filename || `${label.toLowerCase()}.${input.kind === "image" ? "jpg" : "mp4"}`,
        }];
};
export const isFacebookUrl = (text) => /(?:facebook\.com|fb\.watch|fb\.com)\//i.test(text);
export const isInstagramUrl = (text) => /instagram\.com\//i.test(text);
export const isTikTokUrl = (text) => /(?:https?:\/\/)?(?:www\.|vm\.|vt\.|m\.)?tiktok\.com\//i.test(text);
export const isPinterestUrl = (text) => /(?:https?:\/\/)?(?:www\.|br\.|mx\.)?pinterest\.[a-z.]+\/|(?:https?:\/\/)?pin\.it\//i.test(text);
const normalizeRuhendList = (input) => {
    if (Array.isArray(input))
        return input;
    if (Array.isArray(input?.data))
        return input.data;
    if (Array.isArray(input?.result))
        return input.result;
    if (Array.isArray(input?.results))
        return input.results;
    if (Array.isArray(input?.medias))
        return input.medias;
    if (input && typeof input === "object")
        return [input];
    return [];
};
const mediaFromRuhend = (input, label, limit = 5) => {
    const list = normalizeRuhendList(input);
    const medias = list
        .map((item, index) => {
        const mediaUrl = firstValidUrl(item?.url, item?.download_url, item?.downloadUrl, item?.video, item?.image, item?.hd, item?.sd, item?.nowm, item?.wm, item?.link, item);
        if (!mediaUrl)
            return null;
        const type = isImageUrl(mediaUrl) && !isVideoUrl(mediaUrl) ? "image" : isGifUrl(mediaUrl) ? "gif" : "video";
        const ext = type === "image" ? "jpg" : type === "gif" ? "gif" : "mp4";
        return {
            type,
            url: mediaUrl,
            caption: downloadCaption(`✦ Archivo › ${type === "image" ? "imagen" : type === "gif" ? "gif" : "video"}`),
            fileName: `${label.toLowerCase()}-${index + 1}.${ext}`,
        };
    })
        .filter(Boolean);
    return medias.slice(0, limit);
};
export const downloadFacebook = async (url) => {
    return tryAll([
        async () => {
            const ruhend = await import("ruhend-scraper");
            const downloader = ruhend?.fbdl || ruhend?.facebook || ruhend?.fbdown || ruhend?.igdl || ruhend?.default?.fbdl || ruhend?.default?.igdl;
            if (typeof downloader !== "function")
                return null;
            const data = await downloader(url);
            const medias = mediaFromRuhend(data, "Facebook", 3);
            return medias.find((item) => item.type === "video") || medias[0] || null;
        },
        async () => {
            const dylux = await import("api-dylux");
            const fg = dylux.default || dylux;
            const data = await fg.fbdl(url);
            const videoUrl = firstValidUrl(data?.data?.[0]?.url, data?.data?.[0]?.hd, data?.data?.[0]?.sd, data?.url, data?.hd, data?.sd);
            if (!videoUrl)
                return null;
            return {
                type: "video",
                url: videoUrl,
                caption: downloadCaption("✦ Archivo › video"),
                fileName: "facebook.mp4",
            };
        },
        async () => {
            const { data } = await axios.get(`https://api.dorratz.com/fbvideo?url=${encodeURIComponent(url)}`, { timeout: 25_000 });
            const videoUrl = firstValidUrl(data?.result?.hd, data?.result?.sd, data?.hd, data?.sd);
            if (!videoUrl)
                return null;
            return {
                type: "video",
                url: videoUrl,
                caption: downloadCaption("✦ Archivo › video"),
                fileName: "facebook.mp4",
            };
        },
    ]);
};
export const downloadInstagram = async (url) => {
    return tryAll([
        async () => {
            const ruhend = await import("ruhend-scraper");
            const igdl = ruhend?.igdl || ruhend?.instagram || ruhend?.instagramdl || ruhend?.default?.igdl;
            if (typeof igdl !== "function")
                return null;
            const data = await igdl(url);
            const medias = mediaFromRuhend(data, "Instagram", 6);
            return medias.length ? medias : null;
        },
        async () => {
            const scraper = await import("@bochilteam/scraper");
            const instagramdl = scraper.instagramdl || scraper.default?.instagramdl;
            if (!instagramdl)
                return null;
            const data = await instagramdl(url);
            const medias = mediaFromRuhend(data, "Instagram", 6);
            return medias.length ? medias : null;
        },
        async () => {
            const result = await downloadByPlatform("instagram", url);
            const medias = mediaFromDownloadResult(result, "Instagram", 6);
            return medias.length ? medias : null;
        },
    ]);
};
const tiktokFromTikdown = async (url) => {
    const tokenPage = await axios.get("https://tikdown.org/id", { timeout: 25_000 });
    const $ = cheerio.load(tokenPage.data);
    const token = $("#download-form > input[type=hidden]:nth-child(2)").attr("value");
    if (!token)
        return "";
    const { data } = await axios.request({
        url: "https://tikdown.org/getAjax?",
        method: "POST",
        data: new URLSearchParams({ url, _token: token }),
        headers: {
            "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        timeout: 25_000,
    });
    if (!data?.status || !data?.html)
        return "";
    const parsed = cheerio.load(data.html);
    return firstValidUrl(parsed("div.download-links > div:nth-child(1) > a").attr("href"), parsed("a[href*='.mp4']").first().attr("href"));
};
export const downloadTikTok = async (url) => {
    return tryAll([
        async () => {
            const result = await downloadByPlatform("tiktok", url);
            const medias = mediaFromDownloadResult(result, "TikTok", 10);
            return medias.find((item) => item.type === "video") || medias[0] || null;
        },
        async () => {
            const frieren = await import("@xct007/frieren-scraper");
            const tk = frieren?.tiktok || frieren?.default?.tiktok;
            const data = await tk?.v1?.(url);
            const videoUrl = firstValidUrl(data?.play, data?.video, data?.nowm, data?.url);
            if (!videoUrl)
                return null;
            const author = clean(data?.author?.nickname || data?.author?.unique_id || "desconocido");
            const desc = clean(data?.description || data?.desc);
            return {
                type: "video",
                url: videoUrl,
                caption: downloadCaption([
                    author ? `✦ Autor › ${author}` : undefined,
                    desc ? `✦ Texto › ${desc.slice(0, 120)}` : undefined,
                ]
                    .filter(Boolean)
                    .join("\n")),
                fileName: "tiktok.mp4",
            };
        },
        async () => {
            const videoUrl = await tiktokFromTikdown(url);
            if (!videoUrl)
                return null;
            return {
                type: "video",
                url: videoUrl,
                caption: downloadCaption("✦ Archivo › video"),
                fileName: "tiktok.mp4",
            };
        },
        async () => {
            const dylux = await import("api-dylux");
            const fg = dylux.default || dylux;
            const data = await fg.tiktok(url);
            const videoUrl = firstValidUrl(data?.nowm, data?.wm, data?.video);
            if (!videoUrl)
                return null;
            const author = clean(data?.author?.nickname || data?.author?.unique_id || "desconocido");
            return {
                type: "video",
                url: videoUrl,
                caption: downloadCaption(author ? `✦ Autor › ${author}` : undefined),
                fileName: "tiktok.mp4",
            };
        },
        async () => {
            const scraper = await import("@bochilteam/scraper");
            const tiktokdl = scraper.tiktokdl || scraper.default?.tiktokdl;
            if (typeof tiktokdl !== "function")
                return null;
            const data = await tiktokdl(url);
            const videoUrl = firstValidUrl(data?.video?.no_watermark, data?.video?.no_watermark_hd, data?.video, data?.nowm, data?.url);
            if (!videoUrl)
                return null;
            const author = clean(data?.author?.nickname || "desconocido");
            return {
                type: "video",
                url: videoUrl,
                caption: downloadCaption(author ? `✦ Autor › ${author}` : undefined),
                fileName: "tiktok.mp4",
            };
        },
    ]);
};
const normalizeGoogleResults = (input) => {
    const list = Array.isArray(input)
        ? input
        : Array.isArray(input?.data)
            ? input.data
            : Array.isArray(input?.result)
                ? input.result
                : Array.isArray(input?.results)
                    ? input.results
                    : Array.isArray(input?.all)
                        ? input.all
                        : [];
    return list
        .map((item) => ({
        title: clean(item?.title || item?.judul || item?.name, "Sin título"),
        url: clean(item?.url || item?.link || item?.formattedUrl),
        description: clean(item?.description || item?.snippet || item?.desc || item?.body, "Sin descripción."),
    }))
        .filter((item) => item.url)
        .slice(0, 8);
};
export const googleSearch = async (query) => {
    return tryAll([
        async () => {
            const scraper = await import("@bochilteam/scraper");
            const googleIt = scraper.googleIt || scraper.google || scraper.default?.googleIt || scraper.default?.google;
            if (!googleIt)
                return null;
            const data = await googleIt(query);
            const results = normalizeGoogleResults(data);
            return results.length ? results : null;
        },
        async () => {
            const { data } = await axios.get(`https://api.alyachan.dev/api/google?q=${encodeURIComponent(query)}&apikey=Gata-Dios`, { timeout: 25_000 });
            const results = normalizeGoogleResults(data);
            return results.length ? results : null;
        },
        async () => {
            const { data } = await axios.get(`https://api.dorratz.com/v3/googlesearch?q=${encodeURIComponent(query)}`, { timeout: 25_000 });
            const results = normalizeGoogleResults(data);
            return results.length ? results : null;
        },
    ]);
};
export const googleImageSearch = async (query) => {
    return tryAll([
        async () => {
            const scraper = await import("@bochilteam/scraper");
            const googleImage = scraper.googleImage || scraper.default?.googleImage;
            if (!googleImage)
                return null;
            const data = await googleImage(query);
            const image = typeof data?.getRandom === "function" ? await data.getRandom() : firstValidUrl(data?.[0], data);
            return hasUrl(image) ? image : null;
        },
        async () => {
            const { data } = await axios.get(`https://api.alyachan.dev/api/imagesearch?q=${encodeURIComponent(query)}&apikey=Gata-Dios`, { timeout: 25_000 });
            const list = Array.isArray(data?.data) ? data.data : [];
            return firstValidUrl(list?.[0]?.url, list?.[0]?.image, list?.[0]) || null;
        },
    ]);
};
const normalizePinterestType = (url) => {
    if (isGifUrl(url))
        return "gif";
    if (isVideoUrl(url))
        return "video";
    return "image";
};
const cleanPinterestUrl = (url) => {
    return clean(url)
        .replace(/\\u002F/g, "/")
        .replace(/\\\//g, "/")
        .replace(/&amp;/g, "&")
        .replace(/\u0026/g, "&");
};
const collectPinterestUrls = (input, output = new Set(), depth = 0) => {
    if (depth > 8 || input == null)
        return output;
    if (typeof input === "string") {
        const text = cleanPinterestUrl(input);
        const direct = text.match(/https?:\/\/[^\s"'<>]+/gi) || [];
        for (const raw of direct) {
            const url = cleanPinterestUrl(raw).replace(/[),.]+$/g, "");
            if (/\.(jpe?g|png|webp|gif|mp4|mov|m4v|webm)(\?|#|$)/i.test(url) || /(?:i\.pinimg\.com|v\d?\.pinimg\.com|pinimg\.com\/videos)/i.test(url)) {
                if (!/avatar|profile|60x60|75x75/i.test(url))
                    output.add(url);
            }
        }
        return output;
    }
    if (Array.isArray(input)) {
        for (const item of input)
            collectPinterestUrls(item, output, depth + 1);
        return output;
    }
    if (typeof input === "object") {
        for (const value of Object.values(input))
            collectPinterestUrls(value, output, depth + 1);
    }
    return output;
};
const normalizePinterestMedia = (input, label, limit = 5) => {
    const urls = Array.from(collectPinterestUrls(input))
        .map(cleanPinterestUrl)
        .filter((url, index, list) => list.indexOf(url) === index)
        .filter((url) => !/\.m3u8(\?|#|$)/i.test(url))
        .sort((a, b) => {
        const score = (url) => {
            if (isVideoUrl(url))
                return 0;
            if (isGifUrl(url))
                return 1;
            if (/originals/i.test(url))
                return 2;
            return 3;
        };
        return score(a) - score(b);
    });
    return urls.slice(0, limit).map((url, index) => {
        const type = normalizePinterestType(url);
        const ext = type === "video" ? "mp4" : type === "gif" ? "gif" : "jpg";
        return {
            type,
            url,
            caption: `✅ Pinterest ${type === "image" ? "imagen" : type === "gif" ? "GIF" : "video"} ${index + 1}\n\n📌 ${label}`,
            fileName: `pinterest-${index + 1}.${ext}`,
        };
    });
};
const pinterestFromPage = async (url) => {
    const { data } = await axios.get(url, {
        timeout: 30_000,
        maxRedirects: 5,
        headers: {
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "accept-language": "es-ES,es;q=0.9,en;q=0.8",
        },
    });
    const $ = cheerio.load(String(data));
    const title = clean($('meta[property="og:title"]').attr("content") ||
        $('meta[name="twitter:title"]').attr("content") ||
        $("title").text(), "Pinterest");
    const metaValues = [
        $('meta[property="og:video"]').attr("content"),
        $('meta[property="og:video:url"]').attr("content"),
        $('meta[property="og:video:secure_url"]').attr("content"),
        $('meta[name="twitter:player:stream"]').attr("content"),
        $('meta[property="og:image"]').attr("content"),
        $('meta[name="twitter:image"]').attr("content"),
        $('link[rel="image_src"]').attr("href"),
    ].filter(Boolean);
    const medias = normalizePinterestMedia([metaValues, String(data)], title, 5);
    return medias.length ? medias : null;
};
export const downloadPinterest = async (url) => {
    return tryAll([
        async () => {
            const result = await downloadByPlatform("pinterest", url);
            const medias = mediaFromDownloadResult(result, "Pinterest", 5);
            return medias.length ? medias : null;
        },
        async () => {
            const mod = await import("btch-downloader");
            const pinterest = mod?.pinterest || mod?.default?.pinterest || mod?.default;
            if (typeof pinterest !== "function")
                return null;
            const data = await pinterest(url);
            const medias = normalizePinterestMedia(data, "Pinterest", 5);
            return medias.length ? medias : null;
        },
        async () => pinterestFromPage(url),
    ]);
};
export const searchPinterestMedia = async (query) => {
    return tryAll([
        async () => {
            const mod = await import("btch-downloader");
            const pinterest = mod?.pinterest || mod?.default?.pinterest || mod?.default;
            if (typeof pinterest !== "function")
                return null;
            const data = await pinterest(query);
            const medias = normalizePinterestMedia(data, query, 6);
            return medias.length ? medias : null;
        },
    ]);
};
export const instagramStalk = async (username) => {
    const cleanUsername = clean(username).replace(/^@/, "");
    return tryAll([
        async () => {
            const mod = await import("@StarlightsTeam/Scraper");
            const Starlights = mod?.default || mod;
            if (typeof Starlights?.igstalk !== "function")
                return null;
            const data = await Starlights.igstalk(cleanUsername);
            const user = clean(data?.username || cleanUsername).replace(/^@/, "");
            return {
                username: user,
                name: clean(data?.name || data?.fullname || data?.fullName || user),
                bio: clean(data?.description || data?.bio),
                avatar: firstValidUrl(data?.thumbnail, data?.profilePic, data?.profile_picture, data?.avatar),
                followers: clean(data?.followers),
                following: clean(data?.following),
                posts: clean(data?.posts),
                url: clean(data?.url || `https://instagram.com/${user}`),
            };
        },
        async () => {
            const dylux = await import("api-dylux");
            const fg = dylux.default || dylux;
            const data = await fg.igStalk(cleanUsername);
            const user = clean(data?.username || cleanUsername).replace(/^@/, "");
            return {
                username: user,
                name: clean(data?.name || data?.fullName || user),
                bio: clean(data?.description || data?.bio),
                avatar: firstValidUrl(data?.profilePic, data?.profile_picture, data?.avatar),
                followers: clean(data?.followersH || data?.followers),
                following: clean(data?.followingH || data?.following),
                posts: clean(data?.postsH || data?.posts),
                url: `https://instagram.com/${user}`,
            };
        },
    ]);
};
export const tiktokStalk = async (username) => {
    return tryAll([
        async () => {
            const dylux = await import("api-dylux");
            const fg = dylux.default || dylux;
            const data = await fg.ttStalk(username);
            const user = clean(data?.username || username).replace(/^@/, "");
            return {
                username: user,
                name: clean(data?.name || data?.nickname || user),
                bio: clean(data?.desc || data?.signature),
                avatar: firstValidUrl(data?.profile, data?.avatar, data?.avatarLarger),
                followers: clean(data?.followers),
                following: clean(data?.following),
                likes: clean(data?.likes),
                url: `https://tiktok.com/@${user.replace(/^@/, "")}`,
            };
        },
    ]);
};
const withTimeout = async (promise, ms, label) => {
    let timer;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error(`${label} tardó demasiado.`)), ms);
            }),
        ]);
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
};
const normalizeTikTokSearchResults = (input, query) => {
    const list = Array.isArray(input)
        ? input
        : Array.isArray(input?.data)
            ? input.data
            : Array.isArray(input?.meta)
                ? input.meta
                : Array.isArray(input?.result)
                    ? input.result
                    : Array.isArray(input?.results)
                        ? input.results
                        : [];
    return list
        .map((row, index) => {
        const item = row?.item || row?.aweme_info || row?.video || row;
        const video = item?.video || row?.video || {};
        const author = item?.author || row?.author || {};
        const id = clean(item?.id || item?.aweme_id || row?.id || row?.common?.doc_id_str);
        const username = clean(author?.uniqueId || author?.unique_id || author?.secUid || author?.nickname).replace(/^@/, "");
        const postUrl = username && id ? `https://www.tiktok.com/@${username}/video/${id}` : "";
        const mediaUrl = firstValidUrl(row?.hd, row?.play, row?.url, row?.download_url, item?.download_url, item?.play, item?.url, video?.downloadAddr, video?.playAddr, video?.playApi, video?.bitrateInfo?.[0]?.PlayAddr?.UrlList, video?.bitrateInfo?.[0]?.PlayAddr?.url_list, video?.bitrateInfo?.[0]?.play_addr?.url_list, video?.noWatermark, video?.withWatermark, postUrl);
        if (!mediaUrl)
            return null;
        const title = clean(item?.desc || item?.description || row?.desc || row?.title, query);
        return {
            type: "video",
            url: mediaUrl,
            caption: `✅ Resultado TikTok ${index + 1}\n\n📌 ${title}`,
            fileName: `tiktok-search-${index + 1}.mp4`,
        };
    })
        .filter(Boolean)
        .slice(0, 5);
};
export const searchTikTokVideos = async (query) => {
    return tryAll([
        async () => {
            const ttwid = clean(process.env.TIKTOK_TTWID);
            if (!ttwid)
                throw new Error("Falta TIKTOK_TTWID para usar tiktok-search-api.");
            const mod = await import("tiktok-search-api");
            const TikTokSearch = mod?.TikTokSearch || mod?.default?.TikTokSearch || mod?.default;
            if (typeof TikTokSearch !== "function")
                return null;
            const data = await withTimeout(Promise.resolve(TikTokSearch(query, ttwid, 2)), 30_000, "tiktok-search-api");
            const results = normalizeTikTokSearchResults(data, query);
            return results.length ? results : null;
        },
        async () => {
            const apiBase = process.env.ZETA_SEARCH_API || "";
            if (!apiBase)
                return null;
            const { data } = await axios.get(`${apiBase.replace(/\/$/, "")}/search/tiktoksearch?query=${encodeURIComponent(query)}`, { timeout: 25_000 });
            const results = normalizeTikTokSearchResults(data, query);
            return results.length ? results : null;
        },
    ]);
};
// ── KEPOLU BRAT (respaldo de emergencia, solo se usa si EVOGB falla) ──
const KEPOLU_BRAT_BASE = "https://kepolu-brat.hf.space/brat";
const _kepoluAbort = (ms = 20_000) => {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    t.unref?.();
    return c.signal;
};
const _kepoluExtractCandidate = (data) => {
    if (!data || typeof data !== "object")
        return null;
    const candidate = data.result?.url || data.result?.image || (typeof data.result === "string" ? data.result : undefined) ||
        data.data?.url || data.data?.image || (typeof data.data === "string" ? data.data : undefined) ||
        data.url || data.image;
    return typeof candidate === "string" && candidate ? candidate : null;
};
export const kepoluBratBuffer = async (text) => {
    const url = `${KEPOLU_BRAT_BASE}?q=${encodeURIComponent(text)}`;
    let res;
    try {
        res = await fetch(url, { headers: { accept: "*/*" }, signal: _kepoluAbort() });
    }
    catch (e) {
        throw new Error(`kepolu-brat no respondió: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!res.ok)
        throw new Error(`kepolu-brat HTTP ${res.status}`);
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (/^image\//.test(contentType) || /^application\/octet-stream/.test(contentType)) {
        const buffer = Buffer.from(await res.arrayBuffer());
        if (!buffer.length)
            throw new Error("kepolu-brat devolvió una imagen vacía");
        return buffer;
    }
    const data = await res.json().catch(() => null);
    if (!data)
        throw new Error("kepolu-brat devolvió una respuesta inválida");
    const candidate = _kepoluExtractCandidate(data);
    if (!candidate)
        throw new Error(String(data.message || "kepolu-brat no devolvió una imagen"));
    if (/^data:/i.test(candidate)) {
        const match = candidate.match(/^data:([^;]+);base64,(.+)$/);
        if (!match)
            throw new Error("kepolu-brat devolvió un data-uri inválido");
        return Buffer.from(match[2], "base64");
    }
    if (/^https?:\/\//i.test(candidate)) {
        const imgRes = await fetch(candidate, { signal: _kepoluAbort() });
        if (!imgRes.ok)
            throw new Error(`kepolu-brat HTTP ${imgRes.status} descargando imagen`);
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        if (!buffer.length)
            throw new Error("kepolu-brat devolvió una imagen vacía");
        return buffer;
    }
    return Buffer.from(candidate, "base64");
};
