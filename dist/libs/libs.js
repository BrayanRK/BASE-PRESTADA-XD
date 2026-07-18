import path from "node:path";
import * as url from "node:url";
import fsp from "node:fs/promises";
import chokidar from "chokidar";
const _dirname = path.dirname(url.fileURLToPath(import.meta.url));
const commandsPath = path.join(_dirname, "..", "bot", "commands");
const tmpPath = path.join(_dirname, "..", "..", "tmp");
const sessionsPath = path.join(_dirname, "..", "..", "sessions");
export const delay = (ms) => {
    return new Promise((resolve) => setTimeout(resolve, ms));
};
export const getBotType = (type) => {
    console.log(`[Debug] getBotType received: "${type}" (type: ${typeof type})`);
    switch (type) {
        case "main":
            return "Ⓟrincipal";
        case "premium":
            return "Ⓟremium";
        case "free":
            return "Ⓖratis";
        default:
            console.warn(`[Debug] Unknown bot type: "${type}", defaulting to Gratis`);
            return "Ⓖratis";
    }
};
export class Command {
    static loaded = new Map();
    static async loadFromFolder(folderPath) {
        let count = 0;
        try {
            const files = await fsp.readdir(folderPath);
            for (const filename of files) {
                if (!/m?(t|j)s$/.test(filename))
                    continue;
                try {
                    const commandPath = path.join(folderPath, filename);
                    const fileUrl = url.pathToFileURL(commandPath).href;
                    const { default: command } = await import(fileUrl + `?t=${Date.now()}`);
                    if (!command || !command.name) {
                        console.warn(`[Commands] Comando inválido en '${filename}' - falta nombre`);
                        continue;
                    }
                    if (this.loaded.has(command.name)) {
                        console.warn(`[Commands] Comando duplicado detectado: '${command.name}' en '${filename}'`);
                        continue;
                    }
                    this.loaded.set(command.name, command);
                    if (command.alias && command.alias.length > 0) {
                        for (const alias of command.alias) {
                            if (!this.loaded.has(alias)) {
                                this.loaded.set(alias, command);
                            }
                        }
                    }
                    count++;
                }
                catch (error) {
                    console.error(`[Commands] Error cargando '${filename}':`, error);
                }
            }
        }
        catch (error) {
            console.warn(`[Commands] No se pudo leer la carpeta '${folderPath}':`, error);
        }
        return count;
    }
    static load = async () => {
        try {
            await fsp.mkdir(commandsPath, { recursive: true });
            let loadedCount = 0;
            this.loaded.clear();
            const items = (await fsp.readdir(commandsPath, { withFileTypes: true })).sort((a, b) => {
                if (a.name === "animes_gen")
                    return 1;
                if (b.name === "animes_gen")
                    return -1;
                return a.name.localeCompare(b.name);
            });
            for (const item of items) {
                if (item.isDirectory()) {
                    const folderPath = path.join(commandsPath, item.name);
                    const folderCount = await this.loadFromFolder(folderPath);
                    loadedCount += folderCount;
                }
                else if (item.isFile() && /m?(t|j)s$/.test(item.name)) {
                    const folderCount = await this.loadFromFolder(commandsPath);
                    loadedCount += folderCount;
                    break;
                }
            }
            console.log(`[System] '${loadedCount}' comandos cargados con éxito.`);
            const uniqueCommands = new Set();
            for (const [name, command] of this.loaded) {
                if (name === command.name) {
                    uniqueCommands.add(command.name);
                }
            }
            console.log(`[Debug] Comandos únicos cargados: ${uniqueCommands.size}`);
        }
        catch (error) {
            console.error("[Commands] Error leyendo directorio de comandos:", error);
        }
    };
    static reload = async (filename) => {
        if (!/m?(t|j)s$/.test(filename))
            return;
        try {
            const commandPath = path.isAbsolute(filename) ? filename : path.join(commandsPath, filename);
            const fileUrl = url.pathToFileURL(commandPath).href;
            const { default: command } = await import(fileUrl + `?update=${Date.now()}`);
            if (!command || !command.name) {
                console.warn(`[Commands] Comando inválido en '${filename}' - falta nombre`);
                return;
            }
            for (const [key, cmd] of this.loaded) {
                if (cmd.name === command.name) {
                    this.loaded.delete(key);
                }
            }
            this.loaded.set(command.name, command);
            if (command.alias && command.alias.length > 0) {
                for (const alias of command.alias) {
                    this.loaded.set(alias, command);
                }
            }
            console.log(`[System] Comando '${filename}' recargado con éxito.`);
        }
        catch (error) {
            console.error(`[Commands] Error recargando '${filename}':`, error);
        }
    };
    static get = (key) => {
        if (this.loaded.has(key)) {
            return this.loaded.get(key);
        }
        else {
            return Array.from(this.loaded.values()).find((v) => v.alias?.includes(key));
        }
    };
    static watch = () => {
        const watcher = chokidar.watch(`${commandsPath}/**/*.{ts,js,mts,mjs}`, {
            persistent: true,
            ignoreInitial: true,
            awaitWriteFinish: {
                stabilityThreshold: 300,
                pollInterval: 100,
            },
        });
        watcher
            .on("add", (file) => {
            this.reload(file);
            console.log(`[System] Nuevo comando detectado en '${path.basename(file)}'.`);
        })
            .on("change", (file) => {
            this.reload(file);
            console.log(`[System] Comando '${path.basename(file)}' modificado.`);
        })
            .on("unlink", (file) => {
            const basename = path.basename(file, path.extname(file));
            for (const [name, command] of this.loaded) {
                if (name === basename || command.name === basename) {
                    this.loaded.delete(name);
                    break;
                }
            }
            console.log(`[System] Comando '${path.basename(file)}' eliminado.`);
        })
            .on("error", (error) => {
            console.error("[Commands] Error en watcher:", error);
        });
    };
}
export const formatDuration = (ms) => {
    if (!isFinite(ms))
        return "∞";
    const units = [
        { label: "año", ms: 31_536_000_000 },
        { label: "mes", ms: 2_592_000_000 },
        { label: "día", ms: 86_400_000 },
        { label: "hora", ms: 3_600_000 },
        { label: "minuto", ms: 60_000 },
        { label: "segundo", ms: 1_000 },
        { label: "milisegundo", ms: 1 },
    ];
    const parts = [];
    let remaining = ms;
    for (const unit of units) {
        const count = Math.floor(remaining / unit.ms);
        if (count > 0) {
            remaining -= count * unit.ms;
            const label = count > 1 ? (unit.label === "mes" ? `${unit.label}es` : `${unit.label}s`) : unit.label;
            parts.push(`${count} ${label}`);
        }
    }
    return parts.length > 0 ? parts.join(" ") : "0 milisegundos";
};
export const formatError = (error) => {
    const i = error.indexOf(":");
    const type = i !== -1 ? error.slice(0, i) : "Error";
    const message = i !== -1 ? error.slice(i + 1).trim() : error;
    return `*｢✧｣ ${type} ›* ${message}`;
};
export const formatByteSize = (bytes, decimals = 2) => {
    if (!bytes)
        return "0 Bytes";
    const units = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
    const i = Math.floor(Math.log2(bytes) / 10);
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(decimals)} ${units[i]}`;
};
export const pickRandom = (array) => {
    if (array.length === 0) {
        throw new Error("Array cannot be empty");
    }
    const i = Math.floor(Math.random() * array.length);
    return array[i];
};
const SESSIONS_BATCH_SIZE = 200;
const loadSingleSession = async (id) => {
    const authPath = path.join(sessionsPath, id);
    const credsPath = path.join(authPath, "creds.json");
    try {
        await fsp.access(credsPath);
    }
    catch {
        return "skipped";
    }
    try {
        const json = await fsp.readFile(credsPath, "utf-8");
        JSON.parse(json);
        return "loaded";
    }
    catch {
        await fsp.rm(authPath, { recursive: true, force: true }).catch(() => { });
        return "corrupted";
    }
};
export const loadSessions = async () => {
    try {
        await fsp.mkdir(sessionsPath, { recursive: true });
        const sessionsList = await fsp.readdir(sessionsPath);
        if (!sessionsList.length)
            return;
        const start = Date.now();
        let loaded = 0;
        let corrupted = 0;
        let skipped = 0;
        for (let i = 0; i < sessionsList.length; i += SESSIONS_BATCH_SIZE) {
            const batch = sessionsList.slice(i, i + SESSIONS_BATCH_SIZE);
            const results = await Promise.all(batch.map((id) => loadSingleSession(id)));
            for (const result of results) {
                if (result === "loaded")
                    loaded++;
                else if (result === "corrupted")
                    corrupted++;
                else
                    skipped++;
            }
        }
        const elapsed = Date.now() - start;
        if (corrupted > 0) {
            console.log(`[System] Sesiones recargadas: ${loaded} cargadas, ${corrupted} corruptas eliminadas, ${skipped} omitidas (${elapsed}ms).`);
        }
    }
    catch (error) {
        console.error("[System] Error en loadSessions:", error);
    }
};
export const emoji = '⁜';
export const emoji2 = '✧';
export const emoji3 = '✦';
export const emoji4 = '❍';
export const emoji5 = '◈';
export const rwait = '🕒';
export const done = '✅';
export const errorEmoji = '✖️';
export const warning = '⚠︎';
export const surprise = '🤭';
export const fire = '🔥';
export const waitMessage = '❍ Espera un momento...';
export const listoMessage = '*Aquí tienes ☆.｡. o(≧▽≦)o .｡.☆*';
export const etiqueta = 'ZOE';
export const asistencia = 'Wa.me/573161325891';
export const namechannel = 'sisem_lucas';
export const namechannel2 = 'sistem_lucas';
export const dev = 'whatsapp';
export const namegrupo = 'ZOE';
export const namecomu = 'ZOE';
export const getRandomEmoji = () => {
    const emojis = [emoji, emoji2, emoji3, emoji4, emoji5];
    return emojis[Math.floor(Math.random() * emojis.length)];
};
export const getDateTime = () => {
    const d = new Date(new Date().getTime() + 3600000);
    const locale = 'es';
    const weekday = d.toLocaleDateString(locale, { weekday: 'long' });
    const day = d.toLocaleDateString(locale, { day: 'numeric' });
    const month = d.toLocaleDateString(locale, { month: 'long' });
    const year = d.toLocaleDateString(locale, { year: 'numeric' });
    const hour = d.toLocaleString('en-US', { hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: true });
    const dia = weekday;
    return {
        dia: dia,
        fecha: `${day}/${month}/${year}`,
        mes: month,
        año: year,
        tiempo: hour
    };
};
