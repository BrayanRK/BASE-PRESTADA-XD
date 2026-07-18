import fs from "node:fs";
import path from "node:path";
export const DICE_SLOTS = 6;
const diceDir = () => {
    const dir = path.join(process.cwd(), "database", "dice");
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });
    return dir;
};
const manifestPath = () => path.join(diceDir(), "manifest.json");
const loadManifest = () => {
    try {
        const file = manifestPath();
        if (!fs.existsSync(file))
            return [];
        const raw = fs.readFileSync(file, "utf8");
        if (!raw.trim())
            return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch (error) {
        console.error("[DiceStickers.loadManifest]", error);
        return [];
    }
};
const saveManifest = (entries) => {
    fs.writeFileSync(manifestPath(), JSON.stringify(entries, null, 2));
};
export const listDiceEntries = () => {
    return loadManifest().sort((a, b) => a.slot - b.slot);
};
export const getDiceEntry = (slot) => {
    return loadManifest().find((entry) => entry.slot === slot) || null;
};
export const nextEmptySlot = () => {
    const used = new Set(loadManifest().map((entry) => entry.slot));
    for (let slot = 1; slot <= DICE_SLOTS; slot++) {
        if (!used.has(slot))
            return slot;
    }
    return null;
};
export const addDiceEntry = (buffer, kind, mimetype, slot, addedBy) => {
    const file = `slot_${slot}.bin`;
    fs.writeFileSync(path.join(diceDir(), file), buffer);
    const entries = loadManifest().filter((entry) => entry.slot !== slot);
    const entry = { slot, file, kind, mimetype, addedBy, addedAt: Date.now() };
    entries.push(entry);
    saveManifest(entries);
    return entry;
};
export const readDiceBuffer = (entry) => {
    try {
        const file = path.join(diceDir(), entry.file);
        if (!fs.existsSync(file))
            return null;
        return fs.readFileSync(file);
    }
    catch (error) {
        console.error("[DiceStickers.readDiceBuffer]", error);
        return null;
    }
};
export const getRandomDiceEntry = () => {
    const entries = loadManifest();
    if (!entries.length)
        return null;
    return entries[Math.floor(Math.random() * entries.length)];
};
