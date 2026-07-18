import * as baileys from "baileys"
import * as types from "../types/types.js"

class TTLCache<K, V> {
  private store = new Map<K, { value: V; expiresAt: number }>()

  constructor(private ttlMs: number) {}

  set(key: K, value: V): this {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs })
    return this
  }

  get(key: K): V | undefined {
    const item = this.store.get(key)
    if (!item) return undefined

    if (item.expiresAt <= Date.now()) {
      this.store.delete(key)
      return undefined
    }

    return item.value
  }

  has(key: K): boolean {
    return this.get(key) !== undefined
  }

  delete(key: K): boolean {
    return this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }
}

export const metadatas = new TTLCache<string, baileys.GroupMetadata>(600_000)
export const users = new TTLCache<string, types.UserDocument>(300_000)
export const groups = new TTLCache<string, types.GroupDocument>(600_000)
export const bots = new Map<string, types.BotDocument>()
export const callback = new TTLCache<string, types.CallBack>(300_000)
