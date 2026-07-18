class TTLCache {
    ttlMs;
    store = new Map();
    constructor(ttlMs) {
        this.ttlMs = ttlMs;
    }
    set(key, value) {
        this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
        return this;
    }
    get(key) {
        const item = this.store.get(key);
        if (!item)
            return undefined;
        if (item.expiresAt <= Date.now()) {
            this.store.delete(key);
            return undefined;
        }
        return item.value;
    }
    has(key) {
        return this.get(key) !== undefined;
    }
    delete(key) {
        return this.store.delete(key);
    }
    clear() {
        this.store.clear();
    }
}
export const metadatas = new TTLCache(600_000);
export const users = new TTLCache(300_000);
export const groups = new TTLCache(600_000);
export const bots = new Map();
export const callback = new TTLCache(300_000);
