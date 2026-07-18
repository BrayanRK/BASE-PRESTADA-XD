import fs from "node:fs";
import path from "node:path";
import { getConnection } from "../database/connect.js";
import { getEffectiveBotJid } from "./bot-scope.js";
const FIVE_MINUTES = 5 * 60 * 1000;
const DEFAULT_CLAIM_MESSAGE = "「✦」 {user} reclamó a *{character}*\n> ✧ Valor › *{value}* {currency}\n> ✦ Serie › *{source}*";
const safeFileName = (value) => {
    return String(value || "default").replace(/[^a-zA-Z0-9]/g, "_");
};
const ensureDir = (dir) => {
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });
};
const readJson = (file, fallback) => {
    try {
        if (!fs.existsSync(file)) {
            fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
            return fallback;
        }
        const raw = fs.readFileSync(file, "utf8");
        if (!raw.trim())
            return fallback;
        return JSON.parse(raw);
    }
    catch {
        return fallback;
    }
};
const writeJson = (file, data) => {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
};
const runSql = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        getConnection().run(sql, params, (err) => (err ? reject(err) : resolve()));
    });
};
const getSql = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        getConnection().get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
    });
};
const normalize = (value) => {
    return String(value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
};
const normalizeJid = (jid) => {
    return String(jid || "").trim().split(":")[0];
};
export const formatNumber = (value) => {
    return Math.floor(Number(value || 0)).toLocaleString("en-US");
};
export const cleanInput = (text) => {
    return String(text || "").replace(/\s+/g, " ").trim();
};
export const jidTag = (jid) => `@${normalizeJid(jid).split("@")[0]}`;
export const getMentionedJid = (mctx) => {
    return (mctx.message.mentioned?.[0] || mctx.message.mentionedJid?.[0]);
};
export const removeMentionFromArgs = (args, jid) => {
    let text = cleanInput(args.join(" "));
    if (!jid)
        return text;
    const number = normalizeJid(jid).split("@")[0].replace(/[^0-9]/g, "");
    if (!number)
        return text;
    return cleanInput(text.replace(new RegExp(`@${number}`, "g"), "").replace(new RegExp(number, "g"), ""));
};
export const randomOf = (items) => {
    if (!items?.length)
        return undefined;
    return items[Math.floor(Math.random() * items.length)];
};
export const getCharacterImage = (character) => {
    return randomOf(character.img?.filter(Boolean)) || character.image;
};
export const getCharacterVideo = (character) => {
    return randomOf(character.vid?.filter(Boolean));
};
export const gachaTitle = (title, subtitle) => {
    let text = `» ˚₊· ͟͟͞͞➳❥ *${title}*\n`;
    if (subtitle)
        text += `> ${subtitle}\n`;
    return text;
};
export const usageBlock = (title, examples) => {
    return `${gachaTitle(title, "Usa el formato correcto para que funcione.")}\n${examples.map((v) => `✧ ${v}`).join("\n")}`;
};
export const sendText = async (wss, mctx, text, mentions = []) => {
    await wss.sendMessage(mctx.chat.jid, {
        text,
        mentions: Array.from(new Set(mentions.filter(Boolean))),
    }, { quoted: mctx.message.original });
};
export const sendImage = async (wss, mctx, imageUrl, caption, mentions = []) => {
    await wss.sendMessage(mctx.chat.jid, {
        image: { url: imageUrl },
        caption,
        mentions: Array.from(new Set(mentions.filter(Boolean))),
    }, { quoted: mctx.message.original });
};
export const sendVideo = async (wss, mctx, videoUrl, caption, mentions = []) => {
    await wss.sendMessage(mctx.chat.jid, {
        video: { url: videoUrl },
        caption,
        mentions: Array.from(new Set(mentions.filter(Boolean))),
    }, { quoted: mctx.message.original });
};
export const getDisplayName = async (wss, mctx, jid) => {
    const target = normalizeJid(jid);
    if (target === mctx.sender.jid && mctx.sender.name && mctx.sender.name !== "~") {
        return cleanInput(mctx.sender.name);
    }
    if (mctx.is_group) {
        const metadata = await wss.groupMetadata(mctx.chat.jid).catch(() => null);
        const participant = metadata?.participants?.find((p) => {
            return p.id === target || p.lid === target || p.phoneNumber === target || p.id?.split("@")[0] === target.split("@")[0];
        });
        const nick = participant?.name || participant?.notify || participant?.verifiedName;
        if (nick)
            return cleanInput(nick);
    }
    const socketName = await wss.getName(target).catch(() => "");
    return cleanInput(socketName) || "Usuario";
};
export const formatUser = async (wss, mctx, jid, mode = "nick") => {
    if (mode === "tag")
        return { text: jidTag(jid), mentions: [jid] };
    return { text: await getDisplayName(wss, mctx, jid), mentions: [] };
};
export const getRuntimeGacha = (bot, group) => {
    const effectiveBotJid = getEffectiveBotJid(bot);
    const mainBotJid = bot.bot_type === "free" ? effectiveBotJid || group?.primary_bot : undefined;
    return new GachaDatabaseIndividual(effectiveBotJid || bot.bot_jid || "default@lid", bot.bot_type || "main", mainBotJid);
};
export class GachaDatabaseIndividual {
    botJid;
    botType;
    mainBotJid;
    charactersFile;
    haremFile;
    stateFile;
    constructor(botJid, botType = "main", mainBotJid) {
        this.botJid = safeFileName(botJid || "default@lid");
        this.botType = botType;
        this.mainBotJid = safeFileName(mainBotJid || botJid || "default@lid");
        const dataDir = path.join(process.cwd(), "database");
        const cacheDir = path.join(process.cwd(), "cache");
        ensureDir(dataDir);
        ensureDir(cacheDir);
        this.charactersFile = path.join(dataDir, "characters_shared.json");
        this.haremFile = path.join(dataDir, `harem_${this.botType === "free" ? this.mainBotJid : this.botJid}.json`);
        this.stateFile = path.join(cacheDir, `gacha_state_${this.botJid}.json`);
        this.initializeFiles();
    }
    initializeFiles() {
        if (!fs.existsSync(this.charactersFile))
            writeJson(this.charactersFile, []);
        if (!fs.existsSync(this.haremFile))
            writeJson(this.haremFile, []);
        if (!fs.existsSync(this.stateFile))
            writeJson(this.stateFile, { lastCharacters: {}, claimMessages: {} });
    }
    loadCharacters() {
        return readJson(this.charactersFile, []);
    }
    saveCharacters(characters) {
        writeJson(this.charactersFile, characters);
    }
    loadHarem() {
        return readJson(this.haremFile, []);
    }
    saveHarem(harem) {
        writeJson(this.haremFile, harem);
    }
    loadState() {
        const state = readJson(this.stateFile, { lastCharacters: {}, claimMessages: {} });
        state.lastCharacters ||= {};
        state.claimMessages ||= {};
        return state;
    }
    saveState(state) {
        writeJson(this.stateFile, state);
    }
    getTotalCharactersCount() {
        return this.loadCharacters().length;
    }
    addCharacter(character) {
        const characters = this.loadCharacters();
        const name = cleanInput(character.name || "");
        if (!name)
            return false;
        const exists = characters.some((c) => normalize(c.name) === normalize(name));
        if (exists)
            return false;
        const newCharacter = {
            id: character.id || `${Date.now()}${Math.random().toString(36).slice(2, 9)}`,
            name,
            source: cleanInput(character.source || "Desconocido"),
            value: Math.max(1, Number(character.value) || Math.floor(Math.random() * 3000) + 1000),
            image: character.image,
            description: character.description,
            rarity: character.rarity,
            tags: character.tags || [],
            gender: character.gender || "Unknown",
            votes: character.votes || 0,
            img: character.img || (character.image ? [character.image] : []),
            vid: character.vid || [],
            user_id: null,
            bot_jid: this.botJid,
            status: "Libre",
        };
        characters.push(newCharacter);
        this.saveCharacters(characters);
        return true;
    }
    searchCharacters(query, limit = 10) {
        const term = normalize(query);
        if (!term)
            return [];
        const characters = this.loadCharacters();
        const scored = characters
            .map((char) => {
            const name = normalize(char.name);
            const source = normalize(char.source);
            let score = 0;
            if (name === term)
                score += 100;
            if (name.startsWith(term))
                score += 75;
            if (name.includes(term))
                score += 50;
            if (source === term)
                score += 35;
            if (source.includes(term))
                score += 20;
            return { char, score };
        })
            .filter((item) => item.score > 0)
            .sort((a, b) => b.score - a.score || b.char.value - a.char.value);
        return scored.slice(0, limit).map((item) => item.char);
    }
    findCharacter(query) {
        return this.searchCharacters(query, 1)[0] || null;
    }
    getCharacterById(id) {
        return this.loadCharacters().find((c) => c.id === id) || null;
    }
    getRandomCharacter() {
        const characters = this.loadCharacters();
        if (!characters.length)
            return null;
        return characters[Math.floor(Math.random() * characters.length)];
    }
    getCharacterOwner(characterId) {
        const entry = this.loadHarem().find((item) => item.character_id === characterId);
        return entry?.user_id || null;
    }
    getOwnerEntry(characterId) {
        return this.loadHarem().find((item) => item.character_id === characterId) || null;
    }
    getUserCharacters(userId) {
        const harem = this.loadHarem().filter((entry) => entry.user_id === userId);
        const characters = this.loadCharacters();
        return harem.map((entry) => characters.find((char) => char.id === entry.character_id)).filter(Boolean);
    }
    getUserEntries(userId) {
        const characters = this.loadCharacters();
        return this.loadHarem()
            .filter((entry) => entry.user_id === userId)
            .map((entry) => ({ entry, character: characters.find((char) => char.id === entry.character_id) }))
            .filter((item) => Boolean(item.character));
    }
    getUserStats(userId) {
        const entries = this.getUserEntries(userId);
        return {
            count: entries.length,
            value: entries.reduce((acc, item) => acc + Number(item.character.value || 0), 0),
            votes: entries.reduce((acc, item) => acc + Number(item.character.votes || 0), 0),
            saleCount: entries.filter((item) => Number(item.entry.sale_price || 0) > 0).length,
        };
    }
    claimCharacter(userId, characterId) {
        const harem = this.loadHarem();
        if (harem.some((entry) => entry.character_id === characterId))
            return { ok: false, reason: "already" };
        harem.push({
            user_id: userId,
            character_id: characterId,
            claimed_at: Date.now(),
            last_claim_time: Date.now(),
            sale_price: null,
            favorite: false,
        });
        this.saveHarem(harem);
        return { ok: true };
    }
    deleteUserCharacter(userId, characterId) {
        const harem = this.loadHarem();
        const next = harem.filter((entry) => !(entry.user_id === userId && entry.character_id === characterId));
        if (next.length === harem.length)
            return false;
        this.saveHarem(next);
        return true;
    }
    transferCharacter(fromUserId, toUserId, characterId) {
        const harem = this.loadHarem();
        const entry = harem.find((item) => item.user_id === fromUserId && item.character_id === characterId);
        if (!entry)
            return false;
        entry.user_id = toUserId;
        entry.sale_price = null;
        entry.claimed_at = Date.now();
        this.saveHarem(harem);
        return true;
    }
    transferAll(fromUserId, toUserId) {
        const harem = this.loadHarem();
        let count = 0;
        for (const entry of harem) {
            if (entry.user_id === fromUserId) {
                entry.user_id = toUserId;
                entry.sale_price = null;
                entry.claimed_at = Date.now();
                count++;
            }
        }
        this.saveHarem(harem);
        return count;
    }
    tradeCharacters(userId, ownCharacterId, otherCharacterId) {
        const harem = this.loadHarem();
        const mine = harem.find((entry) => entry.user_id === userId && entry.character_id === ownCharacterId);
        if (!mine)
            return { ok: false, reason: "mine" };
        const other = harem.find((entry) => entry.character_id === otherCharacterId && entry.user_id !== userId);
        if (!other)
            return { ok: false, reason: "other" };
        const otherUser = other.user_id;
        mine.user_id = otherUser;
        other.user_id = userId;
        mine.sale_price = null;
        other.sale_price = null;
        mine.claimed_at = Date.now();
        other.claimed_at = Date.now();
        this.saveHarem(harem);
        return { ok: true, otherUser };
    }
    setSale(userId, characterId, price) {
        const harem = this.loadHarem();
        const entry = harem.find((item) => item.user_id === userId && item.character_id === characterId);
        if (!entry)
            return false;
        entry.sale_price = Math.max(1, Math.floor(price));
        this.saveHarem(harem);
        return true;
    }
    removeSale(userId, characterId) {
        const harem = this.loadHarem();
        const entry = harem.find((item) => item.user_id === userId && item.character_id === characterId);
        if (!entry || !entry.sale_price)
            return false;
        entry.sale_price = null;
        this.saveHarem(harem);
        return true;
    }
    getSales(page = 1, limit = 10) {
        const characters = this.loadCharacters();
        const sales = this.loadHarem()
            .filter((entry) => Number(entry.sale_price || 0) > 0)
            .map((entry) => ({
            entry,
            character: characters.find((char) => char.id === entry.character_id),
            seller: entry.user_id,
            price: Number(entry.sale_price || 0),
        }))
            .filter((item) => Boolean(item.character))
            .sort((a, b) => a.price - b.price);
        const pages = Math.max(1, Math.ceil(sales.length / limit));
        const safePage = Math.min(Math.max(1, page), pages);
        const start = (safePage - 1) * limit;
        return { items: sales.slice(start, start + limit), total: sales.length, pages };
    }
    async buyCharacter(groupJid, buyerId, characterId) {
        const harem = this.loadHarem();
        const entry = harem.find((item) => item.character_id === characterId && Number(item.sale_price || 0) > 0);
        if (!entry)
            return { ok: false, reason: "not_sale" };
        if (entry.user_id === buyerId)
            return { ok: false, reason: "self" };
        const price = Number(entry.sale_price || 0);
        const balance = await this.getBalance(groupJid, buyerId);
        if (balance < price)
            return { ok: false, reason: "money", price, seller: entry.user_id };
        const seller = entry.user_id;
        await this.addMoney(groupJid, buyerId, -price);
        await this.addMoney(groupJid, seller, price);
        entry.user_id = buyerId;
        entry.sale_price = null;
        entry.claimed_at = Date.now();
        this.saveHarem(harem);
        return { ok: true, price, seller };
    }
    saveLastCharacter(character, groupJid) {
        const state = this.loadState();
        state.lastCharacters[groupJid] = { character, timestamp: Date.now(), group_jid: groupJid };
        this.saveState(state);
    }
    getLastRolledCharacter(groupJid) {
        const state = this.loadState();
        const last = state.lastCharacters[groupJid];
        if (!last)
            return null;
        if (Date.now() - last.timestamp > FIVE_MINUTES) {
            delete state.lastCharacters[groupJid];
            this.saveState(state);
            return null;
        }
        return last.character;
    }
    clearLastRolledCharacter(groupJid) {
        const state = this.loadState();
        delete state.lastCharacters[groupJid];
        this.saveState(state);
    }
    setClaimMessage(userId, message) {
        const state = this.loadState();
        state.claimMessages[userId] = cleanInput(message).slice(0, 500);
        this.saveState(state);
    }
    deleteClaimMessage(userId) {
        const state = this.loadState();
        delete state.claimMessages[userId];
        this.saveState(state);
    }
    getClaimMessage(userId) {
        return this.loadState().claimMessages[userId] || DEFAULT_CLAIM_MESSAGE;
    }
    renderClaimMessage(input) {
        const template = this.getClaimMessage(input.userId);
        const text = template
            .replace(/\{user\}/g, jidTag(input.userId))
            .replace(/\{nick\}/g, input.nick)
            .replace(/\{character\}/g, input.character.name)
            .replace(/\{value\}/g, formatNumber(input.character.value))
            .replace(/\{source\}/g, input.character.source)
            .replace(/\{currency\}/g, input.currency || "coins");
        return { text, mentions: text.includes(jidTag(input.userId)) ? [input.userId] : [] };
    }
    getTopCharacters(limit, offset = 0) {
        return this.loadCharacters().sort((a, b) => Number(b.value || 0) - Number(a.value || 0)).slice(offset, offset + limit);
    }
    getVoteTop(limit = 10) {
        return this.loadCharacters().sort((a, b) => Number(b.votes || 0) - Number(a.votes || 0)).slice(0, limit);
    }
    getTopOwners(limit = 10) {
        const characters = this.loadCharacters();
        const values = new Map();
        for (const entry of this.loadHarem()) {
            const character = characters.find((char) => char.id === entry.character_id);
            if (!character)
                continue;
            const current = values.get(entry.user_id) || { jid: entry.user_id, count: 0, value: 0 };
            current.count++;
            current.value += Number(character.value || 0);
            values.set(entry.user_id, current);
        }
        return [...values.values()].sort((a, b) => b.value - a.value || b.count - a.count).slice(0, limit);
    }
    voteCharacter(characterId) {
        const characters = this.loadCharacters();
        const character = characters.find((char) => char.id === characterId);
        if (!character)
            return { ok: false };
        const increment = Math.floor(Math.random() * 70) + 30;
        character.votes = Number(character.votes || 0) + 1;
        character.value = Number(character.value || 0) + increment;
        this.saveCharacters(characters);
        return { ok: true, newValue: character.value, increment, votes: character.votes };
    }
    async getBalance(groupJid, userId) {
        await this.ensureGroupUser(groupJid, userId);
        const row = await getSql("SELECT money FROM group_users WHERE group_jid = ? AND user_jid = ?", [groupJid, userId]);
        return Number(row?.money || 0);
    }
    async addMoney(groupJid, userId, amount) {
        await this.ensureGroupUser(groupJid, userId);
        await runSql("UPDATE group_users SET money = money + ?, updated_at = CURRENT_TIMESTAMP WHERE group_jid = ? AND user_jid = ?", [Math.floor(amount), groupJid, userId]);
    }
    async ensureGroupUser(groupJid, userId) {
        await runSql(`INSERT OR IGNORE INTO group_users (group_jid, user_jid, money, money_deposited) VALUES (?, ?, 0, 0)`, [groupJid, userId]);
    }
    async fetchCharactersBatch(batchSize) {
        return this.fetchCharactersContinue(1, batchSize);
    }
    async fetchCharactersContinue(startPage, batchSize) {
        let added = 0;
        let skipped = 0;
        let page = Math.max(1, Number(startPage) || 1);
        const perPage = 50;
        while (added + skipped < Math.max(1, batchSize)) {
            const query = `query ($page: Int, $perPage: Int) { Page(page: $page, perPage: $perPage) { characters(sort: FAVOURITES_DESC) { id name { full } gender image { large } media(perPage: 1, sort: POPULARITY_DESC) { nodes { title { romaji english native } } } } } }`;
            try {
                const response = await fetch("https://graphql.anilist.co", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Accept": "application/json" },
                    body: JSON.stringify({ query, variables: { page, perPage } }),
                });
                if (!response.ok)
                    break;
                const json = await response.json();
                const chars = json?.data?.Page?.characters || [];
                if (!chars.length)
                    break;
                for (const item of chars) {
                    if (added + skipped >= Math.max(1, batchSize))
                        break;
                    const name = cleanInput(item?.name?.full || "");
                    if (!name) {
                        skipped++;
                        continue;
                    }
                    const source = cleanInput(item?.media?.nodes?.[0]?.title?.romaji ||
                        item?.media?.nodes?.[0]?.title?.english ||
                        item?.media?.nodes?.[0]?.title?.native ||
                        "Desconocido");
                    const ok = this.addCharacter({
                        id: String(item.id || `${Date.now()}${Math.random()}`),
                        name,
                        gender: item?.gender || "Unknown",
                        source,
                        value: Math.floor(Math.random() * 3500) + 1000,
                        image: item?.image?.large,
                        img: item?.image?.large ? [item.image.large] : [],
                        vid: [],
                    });
                    if (ok)
                        added++;
                    else
                        skipped++;
                }
                page++;
            }
            catch (error) {
                console.error("[Gacha fetch]", error);
                break;
            }
        }
        return { added, skipped, nextPage: page };
    }
    async saveToJson() {
        return Promise.resolve();
    }
    async searchAnime(query) {
        const local = this.loadCharacters().filter((char) => normalize(char.source) === normalize(query) || normalize(char.source).includes(normalize(query)));
        try {
            const graphQuery = `query ($search: String) { Media(search: $search, type: ANIME) { title { romaji english native } description(asHtml: false) episodes status coverImage { large } } }`;
            const response = await fetch("https://graphql.anilist.co", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify({ query: graphQuery, variables: { search: query } }),
            });
            if (response.ok) {
                const json = await response.json();
                const media = json?.data?.Media;
                if (media) {
                    return {
                        title: media.title?.romaji || media.title?.english || query,
                        description: cleanInput(String(media.description || "Sin descripción.").replace(/<[^>]+>/g, "")).slice(0, 600),
                        episodes: media.episodes,
                        status: media.status,
                        image: media.coverImage?.large,
                        characters: local.length,
                    };
                }
            }
        }
        catch { }
        if (!local.length)
            return null;
        return {
            title: local[0].source,
            description: `Hay ${local.length} personajes registrados de esta serie en el gacha.`,
            characters: local.length,
        };
    }
    getHaremInfo() {
        return { file: this.haremFile, shared: this.botType === "free", mainBot: this.botType === "free" ? this.mainBotJid : undefined };
    }
}
export const normalizeGachaSearch = (value) => {
    return String(value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
};
export const parseGachaPageArgs = (args) => {
    const clean = [...args];
    let page = 1;
    const explicitIndex = clean.findIndex((arg) => {
        return /^(?:p|pg|pag|pagina|page)[:=]?\d+$/i.test(arg) || /^--?(?:p|pg|pag|pagina|page)=?\d+$/i.test(arg);
    });
    if (explicitIndex >= 0) {
        const match = clean[explicitIndex].match(/\d+/);
        page = Math.max(1, Number(match?.[0]) || 1);
        clean.splice(explicitIndex, 1);
        return { page, args: clean };
    }
    const last = clean[clean.length - 1];
    if (clean.length > 1 && /^\d+$/.test(last || "")) {
        page = Math.max(1, Number(last) || 1);
        clean.pop();
    }
    return { page, args: clean };
};
export const paginateGacha = (items, inputPage = 1, pageSize = 10) => {
    const total = items.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(Math.max(1, inputPage || 1), pages);
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return {
        page,
        pages,
        total,
        start,
        end,
        items: items.slice(start, end),
    };
};
export const gachaPercent = (value, total) => {
    if (!total)
        return "0%";
    return `${Math.round((value / total) * 100)}%`;
};
export const gachaCompactHeader = (title, subtitle) => {
    let text = `✿ *${title}*`;
    if (subtitle)
        text += ` ${subtitle}`;
    return text;
};
export const gachaPageFooter = (page, pages) => {
    return `\n\n▏▱ Página *${page}* de *${pages}*`;
};
export const gachaPageHint = (prefix, command) => {
    return `> Usa *${prefix}${command} 2* o *${prefix}${command} page=2* para cambiar de página.`;
};
export const parsePageArgs = parseGachaPageArgs;
export const paginate = paginateGacha;
export const gachaHeader = gachaCompactHeader;
export const gachaHint = gachaPageHint;
