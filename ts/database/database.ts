import type * as types from "../types/types.js"
import { getConnection } from "./connect.js"
import { getRuntimeAssetPath, getRuntimeBotName, getRuntimeCurrencyName, getRuntimeOwnerName } from "../libs/zeta_cf.js"

export class Users {
  static get = async (key: string): Promise<types.UserDocument | null> => {
    return new Promise((resolve, reject) => {
      try {
        const db = getConnection()
        db.get("SELECT * FROM users WHERE user_jid = ?", [key], (err, row) => {
          if (err) {
            console.error("[Users.get] Error:", err)
            resolve(null)
          } else {
            resolve((row as types.UserDocument) || null)
          }
        })
      } catch (error) {
        console.error("[Users.get] Error:", error)
        resolve(null)
      }
    })
  }

  static set = async (key: string, value: Partial<types.UserDocument>): Promise<types.UserDocument | null> => {
    return new Promise(async (resolve) => {
      try {
        if (await this.has(key)) {
          const existingUser = await this.get(key)
          if (existingUser) {
            resolve(existingUser)
          }
          return
        }

        const db = getConnection()
        const userData = {
          user_jid: key,
          name: value.name || "~",
          range: value.range || "User",
          level: value.level || 1,
          experience: value.experience || 0,
        }

        db.run(
          `INSERT INTO users (user_jid, name, range, level, experience) VALUES (?, ?, ?, ?, ?)`,
          [userData.user_jid, userData.name, userData.range, userData.level, userData.experience],
          async (err) => {
            if (err) {
              console.error("[Users.set] Error:", err)
              resolve(null)
            } else {
              const newUser = await this.get(key)
              resolve(newUser)
            }
          },
        )
      } catch (error) {
        console.error("[Users.set] Error:", error)
        resolve(null)
      }
    })
  }

  static update = async (key: string, update: any): Promise<types.UserDocument | null> => {
    return new Promise(async (resolve) => {
      try {
        let user = await this.get(key)
        if (!user) {
          user = await this.set(key, { user_jid: key })
          if (!user) {
            resolve(null)
            return
          }
        }

        const db = getConnection()
        if (update.$set) {
          const updates: string[] = []
          const values: any[] = []

          for (const [field, value] of Object.entries(update.$set)) {
            updates.push(`${field} = ?`)
            values.push(value)
          }

          if (updates.length > 0) {
            values.push(key)
            db.run(`UPDATE users SET ${updates.join(", ")} WHERE user_jid = ?`, values, async (err) => {
              if (err) {
                console.error("[Users.update] Error:", err)
                resolve(null)
              } else {
                const updatedUser = await this.get(key)
                resolve(updatedUser)
              }
            })
          } else {
            resolve(user)
          }
        } else {
          resolve(user)
        }
      } catch (error) {
        console.error("[Users.update] Error:", error)
        resolve(null)
      }
    })
  }

  static has = async (key: string): Promise<boolean> => {
    return new Promise((resolve) => {
      try {
        const db = getConnection()
        db.get("SELECT COUNT(*) as count FROM users WHERE user_jid = ?", [key], (err, row: any) => {
          if (err) {
            console.error("[Users.has] Error:", err)
            resolve(false)
          } else {
            resolve(row && row.count > 0)
          }
        })
      } catch (error) {
        console.error("[Users.has] Error:", error)
        resolve(false)
      }
    })
  }

  static delete = async (key: string): Promise<boolean> => {
    return new Promise((resolve) => {
      try {
        const db = getConnection()
        db.run("DELETE FROM users WHERE user_jid = ?", [key], (err) => {
          if (err) {
            console.error("[Users.delete] Error:", err)
            resolve(false)
          } else {
            resolve(true)
          }
        })
      } catch (error) {
        console.error("[Users.delete] Error:", error)
        resolve(false)
      }
    })
  }

  static size = async (): Promise<number> => {
    return new Promise((resolve) => {
      try {
        const db = getConnection()
        db.get("SELECT COUNT(*) as count FROM users", [], (err, row: any) => {
          if (err) {
            console.error("[Users.size] Error:", err)
            resolve(0)
          } else {
            resolve(row ? row.count : 0)
          }
        })
      } catch (error) {
        console.error("[Users.size] Error:", error)
        resolve(0)
      }
    })
  }

  static values = async (): Promise<types.UserDocument[]> => {
    return new Promise((resolve) => {
      try {
        const db = getConnection()
        db.all("SELECT * FROM users", [], (err, rows) => {
          if (err) {
            console.error("[Users.values] Error:", err)
            resolve([])
          } else {
            resolve(rows as types.UserDocument[])
          }
        })
      } catch (error) {
        console.error("[Users.values] Error:", error)
        resolve([])
      }
    })
  }
}

export class Groups {
  static get = async (key: string): Promise<types.GroupDocument | null> => {
    return new Promise((resolve) => {
      try {
        const db = getConnection()
        db.get("SELECT * FROM groups_table WHERE group_jid = ?", [key], (err, group: any) => {
          if (err) {
            console.error("[Groups.get] Error:", err)
            resolve(null)
          } else if (!group) {
            resolve(null)
          } else {
            db.all("SELECT * FROM group_users WHERE group_jid = ?", [key], (err, users) => {
              if (err) {
                console.error("[Groups.get] Error getting users:", err)
                resolve(null)
              } else {
                group.users = users || []
                resolve(group as types.GroupDocument)
              }
            })
          }
        })
      } catch (error) {
        console.error("[Groups.get] Error:", error)
        resolve(null)
      }
    })
  }

  static set = async (key: string, value: Partial<types.GroupDocument>): Promise<types.GroupDocument | null> => {
    return new Promise(async (resolve) => {
      try {
        if (await this.has(key)) {
          resolve(null)
          return
        }

        const db = getConnection()
        const groupData = {
          group_jid: key,
          admins_only_enabled: value.admins_only_enabled ? 1 : 0,
          primary_bot: value.primary_bot || "",
          moderators_only_enabled: value.moderators_only_enabled ? 1 : 0,
          mute_all_enabled: value.mute_all_enabled ? 1 : 0,
          autoadmin_enabled: value.autoadmin_enabled ? 1 : 0,
          antilinks_enabled: value.antilinks_enabled ? 1 : 0,
          antispam_enabled: value.antispam_enabled ? 1 : 0,
          antidelete_enabled: (value as any).antidelete_enabled ? 1 : 0,
          welcomes_enabled: value.welcomes_enabled ? 1 : 0,
          welcome_message: value.welcome_message || "",
          welcome_image_url: (value as any).welcome_image_url || "",
          farewells_enabled: value.farewells_enabled ? 1 : 0,
          farewell_message: value.farewell_message || "",
          farewell_image_url: (value as any).farewell_image_url || "",
          alerts_enabled: value.alerts_enabled ? 1 : 0,
        }

        db.run(
          `INSERT INTO groups_table (group_jid, admins_only_enabled, primary_bot, moderators_only_enabled,
          mute_all_enabled, autoadmin_enabled, antilinks_enabled, antispam_enabled, antidelete_enabled, welcomes_enabled, welcome_message, welcome_image_url, farewells_enabled, farewell_message, farewell_image_url, alerts_enabled)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            groupData.group_jid,
            groupData.admins_only_enabled,
            groupData.primary_bot,
            groupData.moderators_only_enabled,
            groupData.mute_all_enabled,
            groupData.autoadmin_enabled,
            groupData.antilinks_enabled,
            groupData.antispam_enabled,
            groupData.antidelete_enabled,
            groupData.welcomes_enabled,
            groupData.welcome_message,
            groupData.welcome_image_url,
            groupData.farewells_enabled,
            groupData.farewell_message,
            groupData.farewell_image_url,
            groupData.alerts_enabled,
          ],
          async (err) => {
            if (err) {
              console.error("[Groups.set] Error:", err)
              resolve(null)
            } else {
              resolve(await this.get(key))
            }
          },
        )
      } catch (error) {
        console.error("[Groups.set] Error:", error)
        resolve(null)
      }
    })
  }

  static update = async (key: string, update: any): Promise<types.GroupDocument | null> => {
    return new Promise(async (resolve) => {
      try {
        let group = await this.get(key)
        if (!group) {
          group = await this.set(key, { group_jid: key })
          if (!group) {
            resolve(null)
            return
          }
        }

        const db = getConnection()

        if (update.$set) {
          const updates: string[] = []
          const values: any[] = []

          for (const [field, value] of Object.entries(update.$set)) {
            updates.push(`${field} = ?`)
            values.push(typeof value === "boolean" ? (value ? 1 : 0) : value)
          }

          if (updates.length > 0) {
            values.push(key)
            db.run(`UPDATE groups_table SET ${updates.join(", ")} WHERE group_jid = ?`, values, async (err) => {
              if (err) {
                console.error("[Groups.update] Error:", err)
                resolve(null)
              } else {
                if (update.$push && update.$push.users) {
                  const userData = update.$push.users
                  db.run(
                    `INSERT OR IGNORE INTO group_users (group_jid, user_jid, money, money_deposited, berries, enhancers,
                    cookies, potions, last_hunt_ago, last_work_ago, last_mining_ago, last_daily_ago, last_robbery_ago)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                      key,
                      userData.user_jid,
                      userData.money || 0,
                      userData.money_deposited || 0,
                      userData.berries || 0,
                      userData.enhancers || 0,
                      userData.cookies || 0,
                      userData.potions || 0,
                      userData.last_hunt_ago || 0,
                      userData.last_work_ago || 0,
                      userData.last_mining_ago || 0,
                      userData.last_daily_ago || 0,
                      userData.last_robbery_ago || 0,
                    ],
                    async (err) => {
                      if (err) {
                        console.error("[Groups.update] Error adding user:", err)
                      }
                      resolve(await this.get(key))
                    },
                  )
                } else {
                  resolve(await this.get(key))
                }
              }
            })
          } else {
            resolve(group)
          }
        } else if (update.$push && update.$push.users) {
          const userData = update.$push.users
          db.run(
            `INSERT OR IGNORE INTO group_users (group_jid, user_jid, money, money_deposited, berries, enhancers,
            cookies, potions, last_hunt_ago, last_work_ago, last_mining_ago, last_daily_ago, last_robbery_ago)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              key,
              userData.user_jid,
              userData.money || 0,
              userData.money_deposited || 0,
              userData.berries || 0,
              userData.enhancers || 0,
              userData.cookies || 0,
              userData.potions || 0,
              userData.last_hunt_ago || 0,
              userData.last_work_ago || 0,
              userData.last_mining_ago || 0,
              userData.last_daily_ago || 0,
              userData.last_robbery_ago || 0,
            ],
            async (err) => {
              if (err) {
                console.error("[Groups.update] Error adding user:", err)
                resolve(null)
              } else {
                resolve(await this.get(key))
              }
            },
          )
        } else {
          resolve(group)
        }
      } catch (error) {
        console.error("[Groups.update] Error:", error)
        resolve(null)
      }
    })
  }

  static has = async (key: string): Promise<boolean> => {
    return new Promise((resolve) => {
      try {
        const db = getConnection()
        db.get("SELECT COUNT(*) as count FROM groups_table WHERE group_jid = ?", [key], (err, row: any) => {
          if (err) {
            console.error("[Groups.has] Error:", err)
            resolve(false)
          } else {
            resolve(row && row.count > 0)
          }
        })
      } catch (error) {
        console.error("[Groups.has] Error:", error)
        resolve(false)
      }
    })
  }

  static delete = async (key: string): Promise<boolean> => {
    return new Promise((resolve) => {
      try {
        const db = getConnection()
        db.run("DELETE FROM groups_table WHERE group_jid = ?", [key], (err) => {
          if (err) {
            console.error("[Groups.delete] Error:", err)
            resolve(false)
          } else {
            resolve(true)
          }
        })
      } catch (error) {
        console.error("[Groups.delete] Error:", error)
        resolve(false)
      }
    })
  }

  static size = async (): Promise<number> => {
    return new Promise((resolve) => {
      try {
        const db = getConnection()
        db.get("SELECT COUNT(*) as count FROM groups_table", [], (err, row: any) => {
          if (err) {
            console.error("[Groups.size] Error:", err)
            resolve(0)
          } else {
            resolve(row ? row.count : 0)
          }
        })
      } catch (error) {
        console.error("[Groups.size] Error:", error)
        resolve(0)
      }
    })
  }

  static values = async (): Promise<types.GroupDocument[]> => {
    return new Promise((resolve) => {
      try {
        const db = getConnection()
        db.all("SELECT * FROM groups_table", [], (err, rows) => {
          if (err) {
            console.error("[Groups.values] Error:", err)
            resolve([])
          } else {
            resolve(rows as types.GroupDocument[])
          }
        })
      } catch (error) {
        console.error("[Groups.values] Error:", error)
        resolve([])
      }
    })
  }
}

const normalizeSqlBool = (value: unknown): number => {
  return value === true || value === 1 || value === "1" ? 1 : 0
}

const pickText = (incoming: unknown, current: unknown, fallback = ""): string => {
  const next = typeof incoming === "string" ? incoming.trim() : ""
  if (next) return String(incoming).trim()

  const saved = typeof current === "string" ? current.trim() : ""
  if (saved) return String(current).trim()

  return fallback
}

const hydrateBotDocument = (row: any): types.BotDocument => ({
  ...row,
  autojoin_enabled: Boolean(row?.autojoin_enabled),
  setup_completed: Boolean(row?.setup_completed),
  setup_step: Number(row?.setup_step || 0),
}) as types.BotDocument

export class Bots {
  static get = async (key: string): Promise<types.BotDocument | null> => {
    return new Promise(async (resolve) => {
      try {
        const db = getConnection()
        db.get("SELECT * FROM bots WHERE bot_jid = ?", [key], async (err, row) => {
          if (err) {
            console.error("[Bots.get] Error:", err)
            resolve(null)
          } else if (!row) {
            resolve(await this.set(key, { bot_jid: key }))
          } else {
            resolve(hydrateBotDocument(row))
          }
        })
      } catch (error) {
        console.error("[Bots.get] Error:", error)
        resolve(null)
      }
    })
  }

  static find = async (key: string): Promise<types.BotDocument | null> => {
    return new Promise((resolve) => {
      try {
        const db = getConnection()
        db.get("SELECT * FROM bots WHERE bot_jid = ?", [key], (err, row) => {
          if (err) {
            console.error("[Bots.find] Error:", err)
            resolve(null)
          } else {
            resolve(row ? hydrateBotDocument(row) : null)
          }
        })
      } catch (error) {
        console.error("[Bots.find] Error:", error)
        resolve(null)
      }
    })
  }

  static set = async (key: string, value: Partial<types.BotDocument>): Promise<types.BotDocument | null> => {
    return new Promise(async (resolve) => {
      try {
        const db = getConnection()
        const current = await this.find(key)
        const effectiveBotType = (value.bot_type || current?.bot_type || "main") as types.TypeBots
        const isPremiumBot = effectiveBotType === "premium"
        const botData = {
          bot_jid: key,
          name: pickText(value.name, current?.name, isPremiumBot ? "" : getRuntimeBotName()),
          owner_jid: pickText(value.owner_jid, current?.owner_jid, ""),
          owner_lid: pickText(value.owner_lid, current?.owner_lid, ""),
          owner_pn: pickText(value.owner_pn, current?.owner_pn, ""),
          owner_name: pickText(value.owner_name, current?.owner_name, isPremiumBot ? "" : getRuntimeOwnerName()),
          owner_number: pickText(value.owner_number, current?.owner_number, ""),
          logo_url: pickText(value.logo_url, current?.logo_url, isPremiumBot ? "" : getRuntimeAssetPath("generalImage")),
          thumbnail_url: pickText(value.thumbnail_url, current?.thumbnail_url, isPremiumBot ? "" : getRuntimeAssetPath("generalImage")),
          submenu_url: pickText(value.submenu_url, current?.submenu_url, isPremiumBot ? "" : getRuntimeAssetPath("subMainImage")),
          welcome_url: pickText(value.welcome_url, current?.welcome_url, isPremiumBot ? "" : getRuntimeAssetPath("welcomeImage")),
          rpg_url: pickText(value.rpg_url, current?.rpg_url, isPremiumBot ? "" : getRuntimeAssetPath("rpgImage")),
          channel_url: pickText(value.channel_url, current?.channel_url, ""),
          facebook_url: pickText(value.facebook_url, current?.facebook_url, ""),
          instagram_url: pickText(value.instagram_url, current?.instagram_url, ""),
          tiktok_url: pickText(value.tiktok_url, current?.tiktok_url, ""),
          telegram_url: pickText(value.telegram_url, current?.telegram_url, ""),
          prefixes: pickText(value.prefixes, current?.prefixes, ""),
          setup_completed:
            value.setup_completed !== undefined && value.setup_completed !== null
              ? normalizeSqlBool(value.setup_completed)
              : normalizeSqlBool(current?.setup_completed || (!isPremiumBot ? 1 : 0)),
          setup_step: Number(value.setup_step ?? current?.setup_step ?? 0),
          bot_type: effectiveBotType,
          parent_bot_jid: pickText(value.parent_bot_jid, current?.parent_bot_jid, ""),
          hierarchy_parent_jid: pickText(value.hierarchy_parent_jid, current?.hierarchy_parent_jid, ""),
          currency: pickText(value.currency, current?.currency, getRuntimeCurrencyName()),
          username: pickText(value.username, current?.username, ""),
          status: pickText(value.status, current?.status, ""),
          autojoin_enabled:
            value.autojoin_enabled !== undefined && value.autojoin_enabled !== null
              ? normalizeSqlBool(value.autojoin_enabled)
              : normalizeSqlBool(current?.autojoin_enabled),
        }

        db.run(
          `INSERT INTO bots (bot_jid, name, owner_jid, owner_lid, owner_pn, owner_name, owner_number, logo_url, thumbnail_url, submenu_url, welcome_url, rpg_url, channel_url, facebook_url, instagram_url, tiktok_url, telegram_url, prefixes, setup_completed, setup_step, bot_type, parent_bot_jid, hierarchy_parent_jid, currency, username, status, autojoin_enabled)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(bot_jid) DO UPDATE SET
            name = excluded.name,
            owner_jid = excluded.owner_jid,
            owner_lid = excluded.owner_lid,
            owner_pn = excluded.owner_pn,
            owner_name = excluded.owner_name,
            owner_number = excluded.owner_number,
            logo_url = excluded.logo_url,
            thumbnail_url = excluded.thumbnail_url,
            submenu_url = excluded.submenu_url,
            welcome_url = excluded.welcome_url,
            rpg_url = excluded.rpg_url,
            channel_url = excluded.channel_url,
            facebook_url = excluded.facebook_url,
            instagram_url = excluded.instagram_url,
            tiktok_url = excluded.tiktok_url,
            telegram_url = excluded.telegram_url,
            prefixes = excluded.prefixes,
            setup_completed = excluded.setup_completed,
            setup_step = excluded.setup_step,
            bot_type = excluded.bot_type,
            parent_bot_jid = excluded.parent_bot_jid,
            hierarchy_parent_jid = excluded.hierarchy_parent_jid,
            currency = excluded.currency,
            username = excluded.username,
            status = excluded.status,
            autojoin_enabled = excluded.autojoin_enabled,
            updated_at = CURRENT_TIMESTAMP`,
          [
            botData.bot_jid,
            botData.name,
            botData.owner_jid,
            botData.owner_lid,
            botData.owner_pn,
            botData.owner_name,
            botData.owner_number,
            botData.logo_url,
            botData.thumbnail_url,
            botData.submenu_url,
            botData.welcome_url,
            botData.rpg_url,
            botData.channel_url,
            botData.facebook_url,
            botData.instagram_url,
            botData.tiktok_url,
            botData.telegram_url,
            botData.prefixes,
            botData.setup_completed,
            botData.setup_step,
            botData.bot_type,
            botData.parent_bot_jid,
            botData.hierarchy_parent_jid,
            botData.currency,
            botData.username,
            botData.status,
            botData.autojoin_enabled,
          ],
          async (err) => {
            if (err) {
              console.error("[Bots.set] Error:", err)
              resolve(null)
            } else {
              resolve(await this.get(key))
            }
          },
        )
      } catch (error) {
        console.error("[Bots.set] Error:", error)
        resolve(null)
      }
    })
  }

  static listByType = async (types_: string[]): Promise<types.BotDocument[]> => {
    return new Promise((resolve) => {
      try {
        if (!types_.length) {
          resolve([])
          return
        }
        const db = getConnection()
        const placeholders = types_.map(() => "?").join(",")
        db.all(`SELECT * FROM bots WHERE bot_type IN (${placeholders})`, types_, (err, rows) => {
          if (err) {
            console.error("[Bots.listByType] Error:", err)
            resolve([])
          } else {
            resolve(((rows || []) as any[]).map(hydrateBotDocument))
          }
        })
      } catch (error) {
        console.error("[Bots.listByType] Error:", error)
        resolve([])
      }
    })
  }

  static remove = async (key: string): Promise<boolean> => {
    return new Promise((resolve) => {
      try {
        const db = getConnection()
        db.run("DELETE FROM bots WHERE bot_jid = ?", [key], (err) => {
          if (err) {
            console.error("[Bots.remove] Error:", err)
            resolve(false)
          } else {
            resolve(true)
          }
        })
      } catch (error) {
        console.error("[Bots.remove] Error:", error)
        resolve(false)
      }
    })
  }

  static update = async (key: string, update: any): Promise<types.BotDocument | null> => {
    return new Promise(async (resolve) => {
      try {
        let bot = await this.get(key)
        if (!bot) {
          bot = await this.set(key, { bot_jid: key })
          if (!bot) {
            resolve(null)
            return
          }
        }

        const db = getConnection()

        if (update.$set) {
          const updates: string[] = []
          const values: any[] = []

          for (const [field, value] of Object.entries(update.$set)) {
            updates.push(`${field} = ?`)
            values.push(value)
          }

          if (updates.length > 0) {
            updates.push("updated_at = CURRENT_TIMESTAMP")
            values.push(key)
            db.run(`UPDATE bots SET ${updates.join(", ")} WHERE bot_jid = ?`, values, async (err) => {
              if (err) {
                console.error("[Bots.update] Error:", err)
                resolve(null)
              } else {
                const ownerJid = update.$set.owner_jid
                const parentBotJid = update.$set.parent_bot_jid
                if (ownerJid || parentBotJid) {
                  const number = String(key).split("@")[0].replace(/[^0-9]/g, "")
                  const sessionUpdates: string[] = []
                  const sessionValues: any[] = []
                  if (ownerJid) {
                    sessionUpdates.push("owner_jid = ?")
                    sessionValues.push(ownerJid)
                  }
                  if (parentBotJid !== undefined) {
                    sessionUpdates.push("parent_bot_jid = ?")
                    sessionValues.push(parentBotJid || "")
                  }
                  sessionValues.push(key, number)
                  db.run(
                    `UPDATE bot_sessions SET ${sessionUpdates.join(", ")} WHERE bot_jid = ? OR bot_number = ?`,
                    sessionValues,
                    () => {},
                  )
                }
                resolve(await this.get(key))
              }
            })
          } else {
            resolve(bot)
          }
        } else {
          resolve(bot)
        }
      } catch (error) {
        console.error("[Bots.update] Error:", error)
        resolve(null)
      }
    })
  }

  static has = async (key: string): Promise<boolean> => {
    return new Promise((resolve) => {
      try {
        const db = getConnection()
        db.get("SELECT COUNT(*) as count FROM bots WHERE bot_jid = ?", [key], (err, row: any) => {
          if (err) {
            console.error("[Bots.has] Error:", err)
            resolve(false)
          } else {
            resolve(row && row.count > 0)
          }
        })
      } catch (error) {
        console.error("[Bots.has] Error:", error)
        resolve(false)
      }
    })
  }

  static delete = async (key: string): Promise<boolean> => {
    return new Promise((resolve) => {
      try {
        const db = getConnection()
        db.run("DELETE FROM bots WHERE bot_jid = ?", [key], (err) => {
          if (err) {
            console.error("[Bots.delete] Error:", err)
            resolve(false)
          } else {
            resolve(true)
          }
        })
      } catch (error) {
        console.error("[Bots.delete] Error:", error)
        resolve(false)
      }
    })
  }

  static size = async (): Promise<number> => {
    return new Promise((resolve) => {
      try {
        const db = getConnection()
        db.get("SELECT COUNT(*) as count FROM bots", [], (err, row: any) => {
          if (err) {
            console.error("[Bots.size] Error:", err)
            resolve(0)
          } else {
            resolve(row ? row.count : 0)
          }
        })
      } catch (error) {
        console.error("[Bots.size] Error:", error)
        resolve(0)
      }
    })
  }

  static values = async (): Promise<types.BotDocument[]> => {
    return new Promise((resolve) => {
      try {
        const db = getConnection()
        db.all("SELECT * FROM bots", [], (err, rows) => {
          if (err) {
            console.error("[Bots.values] Error:", err)
            resolve([])
          } else {
            resolve(rows as types.BotDocument[])
          }
        })
      } catch (error) {
        console.error("[Bots.values] Error:", error)
        resolve([])
      }
    })
  }
}

const cleanDbText = (value: unknown): string => String(value ?? "").trim()
const dbJidNumber = (jid?: string | null): string => cleanDbText(jid).split(":")[0].split("@")[0].replace(/[^0-9]/g, "")
const normalizeDbJid = (jid?: string | null): string => {
  const text = cleanDbText(jid).toLowerCase()
  if (!text) return ""
  if (/@(lid|s\.whatsapp\.net)$/i.test(text)) return text
  const number = dbJidNumber(text)
  return number ? `${number}@s.whatsapp.net` : ""
}
const normalizeBotKey = (botJid?: string | null): string => normalizeDbJid(botJid) || cleanDbText(botJid)
const dbJidServer = (jid?: string | null): string => normalizeDbJid(jid).split("@")[1] || ""
const sameDbUserIdentity = (left?: string | null, right?: string | null): boolean => {
  const a = normalizeDbJid(left)
  const b = normalizeDbJid(right)
  if (!a || !b) return false
  if (a === b) return true


  if (dbJidServer(a) === "lid" || dbJidServer(b) === "lid") return false

  const aNumber = dbJidNumber(a)
  const bNumber = dbJidNumber(b)
  return Boolean(aNumber && bNumber && aNumber === bNumber)
}

export class BotSubOwners {
  static add = async (botJid: string, userJid: string, addedBy = ""): Promise<boolean> => {
    return new Promise((resolve) => {
      try {
        const botKey = normalizeBotKey(botJid)
        const userKey = normalizeDbJid(userJid)
        const addedByKey = normalizeDbJid(addedBy)
        if (!botKey || !userKey) return resolve(false)

        const db = getConnection()
        db.run(
          `INSERT INTO bot_subowners (bot_jid, user_jid, added_by)
           VALUES (?, ?, ?)
           ON CONFLICT(bot_jid, user_jid) DO UPDATE SET added_by = excluded.added_by`,
          [botKey, userKey, addedByKey],
          (err) => {
            if (err) {
              console.error("[BotSubOwners.add] Error:", err)
              resolve(false)
            } else {
              resolve(true)
            }
          },
        )
      } catch (error) {
        console.error("[BotSubOwners.add] Error:", error)
        resolve(false)
      }
    })
  }

  static remove = async (botJid: string, userJid: string): Promise<boolean> => {
    return new Promise((resolve) => {
      try {
        const botKey = normalizeBotKey(botJid)
        const userKey = normalizeDbJid(userJid)
        if (!botKey || !userKey) return resolve(false)

        const db = getConnection()
        db.run("DELETE FROM bot_subowners WHERE bot_jid = ? AND user_jid = ?", [botKey, userKey], function (err) {
          if (err) {
            console.error("[BotSubOwners.remove] Error:", err)
            resolve(false)
          } else {
            resolve((this?.changes || 0) > 0)
          }
        })
      } catch (error) {
        console.error("[BotSubOwners.remove] Error:", error)
        resolve(false)
      }
    })
  }

  static has = async (botJid: string, userJid: string): Promise<boolean> => {
    return new Promise((resolve) => {
      try {
        const botKey = normalizeBotKey(botJid)
        const userKey = normalizeDbJid(userJid)
        if (!botKey || !userKey) return resolve(false)

        const db = getConnection()
        db.all("SELECT user_jid FROM bot_subowners WHERE bot_jid = ?", [botKey], (err, rows: any[]) => {
          if (err) {
            console.error("[BotSubOwners.has] Error:", err)
            resolve(false)
          } else {
            resolve((rows || []).some((item) => sameDbUserIdentity(item?.user_jid, userKey)))
          }
        })
      } catch (error) {
        console.error("[BotSubOwners.has] Error:", error)
        resolve(false)
      }
    })
  }

  static list = async (botJid: string): Promise<types.BotSubOwnerDocument[]> => {
    return new Promise((resolve) => {
      try {
        const botKey = normalizeBotKey(botJid)
        if (!botKey) return resolve([])

        const db = getConnection()
        db.all("SELECT * FROM bot_subowners WHERE bot_jid = ? ORDER BY created_at ASC", [botKey], (err, rows) => {
          if (err) {
            console.error("[BotSubOwners.list] Error:", err)
            resolve([])
          } else {
            resolve((rows || []) as types.BotSubOwnerDocument[])
          }
        })
      } catch (error) {
        console.error("[BotSubOwners.list] Error:", error)
        resolve([])
      }
    })
  }
}

export class BotSettings {
  static get = async (botJid: string, key: string): Promise<string> => {
    return new Promise((resolve) => {
      try {
        const botKey = normalizeBotKey(botJid)
        const settingKey = cleanDbText(key)
        if (!botKey || !settingKey) return resolve("")

        const db = getConnection()
        db.get("SELECT value FROM bot_settings WHERE bot_jid = ? AND key = ?", [botKey, settingKey], (err, row: any) => {
          if (err) {
            console.error("[BotSettings.get] Error:", err)
            resolve("")
          } else {
            resolve(cleanDbText(row?.value))
          }
        })
      } catch (error) {
        console.error("[BotSettings.get] Error:", error)
        resolve("")
      }
    })
  }

  static set = async (botJid: string, key: string, value: string): Promise<boolean> => {
    return new Promise((resolve) => {
      try {
        const botKey = normalizeBotKey(botJid)
        const settingKey = cleanDbText(key)
        if (!botKey || !settingKey) return resolve(false)

        const db = getConnection()
        db.run(
          `INSERT INTO bot_settings (bot_jid, key, value)
           VALUES (?, ?, ?)
           ON CONFLICT(bot_jid, key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
          [botKey, settingKey, cleanDbText(value)],
          (err) => {
            if (err) {
              console.error("[BotSettings.set] Error:", err)
              resolve(false)
            } else {
              resolve(true)
            }
          },
        )
      } catch (error) {
        console.error("[BotSettings.set] Error:", error)
        resolve(false)
      }
    })
  }

  static getBool = async (botJid: string, key: string, fallback = false): Promise<boolean> => {
    const value = await this.get(botJid, key)
    if (!value) return fallback
    return /^(1|true|yes|on|si|sí)$/i.test(value)
  }

  static setBool = async (botJid: string, key: string, value: boolean): Promise<boolean> => {
    return this.set(botJid, key, value ? "on" : "off")
  }
}
