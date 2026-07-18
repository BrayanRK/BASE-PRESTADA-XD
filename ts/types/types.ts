import type * as baileys from "baileys"
import type * as stream from "node:stream"

export interface BotEvents {
  "bot.error": [
    {
      error: Error | TypeError | string
    },
  ]
  "bot.logout": [
    {
      reason: string
      error: string
    },
  ]
  "bot.reconnecting": [
    {
      reason: string
      error: string
    },
  ]
  "bot.code": [
    {
      code: string
    },
  ]
  "bot.qr": [
    {
      qr: string
    },
  ]
  "bot.open": [
    {
      botjid: string
    },
  ]
  "bot.close": [
    {
      botjid: string
    },
  ]
}

export type TypeBots = "free" | "premium" | "main"

export interface MessageContext {
  sender: {
    jid: string
    name: string
    isOwner: boolean
    isAdmin: boolean
    isModerator: boolean
    is_bot: boolean
  }
  chat: {
    jid: string
    isGroup: boolean
    name: string
  }
  is_group: boolean
  is_private: boolean
  is_newsletter: boolean
  message: {
    original: baileys.WAMessage
    text: string
    type: baileys.MessageType
    mimetype: string
    mentioned: string[]
    mentionedJid: string[]
    size: number
    from_me: boolean
    id: string
    quoted?: {
      text: string
      sender: string
    }
  }
  me: {
    name: string
    jids: {
      pn: string
      lid: string
    }
  }
  conn: WASocket
  reply: (
    text: string,
    server?: "lid" | "s.whatsapp.net",
  ) => Promise<void> | Promise<baileys.WAMessage>
  react: (emogi: string) => Promise<baileys.WAMessage>
  delete: () => Promise<void>
  edit?: (text: string, server?: "lid" | "s.whatsapp.net") => Promise<baileys.WAMessage>
  download?: () => {
    buffer: () => Promise<Buffer>
    stream: () => Promise<stream.Transform>
  }
  quoted?: MessageContext
  replyImage: (options: { url: string; caption?: string; mentions?: string[] }) =>
    | Promise<void>
    | Promise<baileys.WAMessage>
  replyVideo: (options: { url: string; caption?: string; gifPlayback?: boolean; mentions?: string[] }) =>
    | Promise<void>
    | Promise<baileys.WAMessage>
}

export type UserRanges = "Owner" | "Mod" | "Premium" | "User"

export interface UserDocument {
  id?: number
  user_jid: string
  name: string
  range: UserRanges
  level: number
  experience: number
  genre?: string | null
  description?: string | null
  favorite_character_id?: string | null
  favorite_character_name?: string | null
  sticker_pack?: string
  sticker_author?: string
  last_activity?: Date
  created_at?: Date
  updated_at?: Date
}

export type GroupUserPokemonDocument = {
  id: number
  name: string
  types: string[]
  base_stat: {
    hp: number
    attack: number
    defense: number
    speed: number
  }
  sprite: string
}

export type GroupUserDocument = {
  id?: number
  user_jid: string
  group_jid?: string
  money: number
  money_deposited: number
  pokemon?: GroupUserPokemonDocument[]
  berries: number
  enhancers: number
  cookies: number
  potions: number
  last_hunt_ago: number
  last_work_ago: number
  last_mining_ago: number
  last_daily_ago: number
  last_robbery_ago: number
  last_crime_ago?: number
  last_slut_ago?: number
  last_trivia_ago?: number
  created_at?: Date
  updated_at?: Date
}

export interface GroupDocument {
  id?: number
  group_jid: string
  admins_only_enabled: boolean
  primary_bot: string
  moderators_only_enabled: boolean
  mute_all_enabled: boolean
  autoadmin_enabled: boolean
  antilinks_enabled: boolean
  antispam_enabled: boolean
  antidelete_enabled: boolean
  welcomes_enabled: boolean
  welcome_message: string
  welcome_image_url?: string
  farewells_enabled: boolean
  farewell_message: string
  farewell_image_url?: string
  alerts_enabled: boolean
  users: GroupUserDocument[]
  created_at?: Date
  updated_at?: Date
}

export interface BotDocument {
  id?: number
  bot_jid: string
  name: string
  owner_jid: string
  owner_lid?: string
  owner_pn?: string
  owner_name: string
  owner_number?: string
  logo_url: string
  thumbnail_url: string
  submenu_url?: string
  welcome_url?: string
  rpg_url?: string
  channel_url?: string
  facebook_url?: string
  instagram_url?: string
  tiktok_url?: string
  telegram_url?: string
  prefixes?: string
  setup_completed?: boolean | number
  setup_step?: number
  bot_type: TypeBots
  parent_bot_jid?: string
  hierarchy_parent_jid?: string
  currency: string
  username?: string
  status?: string
  autojoin_enabled?: boolean | number
  created_at?: Date
  updated_at?: Date
}

export interface BotSubOwnerDocument {
  id?: number
  bot_jid: string
  user_jid: string
  added_by?: string
  created_at?: Date
}

export interface BotSettingDocument {
  id?: number
  bot_jid: string
  key: string
  value: string
  updated_at?: Date
}

export interface WASocket extends baileys.WASocket {
  groupMetadata: (jid: string, cache?: boolean) => Promise<baileys.GroupMetadata>
  parseMentions: (text: string, server: "lid" | "s.whatsapp.net") => string[]
  groupInviteLink: (jid: string) => Promise<string>
  getName: (jid: string) => Promise<string>
  profilePictureUrl: (jid: string, type?: "preview" | "image") => Promise<string>
}

export type CommandExecuteContext = {
  mctx: MessageContext
  usedPrefix: string
  commandName: string
  args: string[]
  user: UserDocument
  group: GroupDocument
  bot: BotDocument
  groupMetadata: baileys.GroupMetadata
  userIsBotOwner: boolean
  userIsPrimaryBotOwner?: boolean
  userIsBotSubOwner?: boolean
  botIsAdmin: boolean
  userIsAdmin: boolean
  userIsOwner: boolean
  userIsMod: boolean
  userIsPremium: boolean
}

export type CommandCategories =
  | "main"
  | "economy"
  | "extras"
  | "games"
  | "owner"
  | "moderation"
  | "group"
  | "downloaders"
  | "pokegame"
  | "bot"
  | "utilities"
  | "premb"
  | "lucasxt"
  | "anime"

type CommandFlags = "only.groups" | "only.private" | "all.chats"
type CommandRequires =
  | "administrator"
  | "bot.owner"
  | "administrator.user"
  | "owner.user"
  | "moderator.user"
  | "premium.user"

export interface Command {
  name: string
  alias: string[]
  description: string
  using?: string
  category: CommandCategories
  flags: CommandFlags[]
  requires: CommandRequires[]
  hidden: boolean
  execute: (wss: WASocket, ectx: CommandExecuteContext) => Promise<void>
}

export type CallBack = {
  for: string
  execute: (wss: WASocket, mctx: MessageContext) => Promise<void>
}

export interface BotConfig {
  botJid: string
  botType: "main" | "premium"
  ownerJid: string
  name: string
  logoUrl?: string
  thumbnailUrl?: string
}

export interface DatabaseUser {
  id: number
  user_jid: string
  name: string
  range: string
  level: number
  experience: number
  genre?: string | null
  description?: string | null
  favorite_character_id?: string | null
  favorite_character_name?: string | null
  sticker_pack?: string
  sticker_author?: string
  last_activity: string
  created_at: string
  updated_at: string
}

export interface DatabaseGroup {
  id: number
  group_jid: string
  admins_only_enabled: number
  primary_bot: string
  moderators_only_enabled: number
  mute_all_enabled: number
  autoadmin_enabled: number
  antilinks_enabled: number
  welcomes_enabled: number
  welcome_message: string
  welcome_image_url?: string
  farewells_enabled: number
  farewell_message: string
  farewell_image_url?: string
  alerts_enabled: number
  created_at: string
  updated_at: string
}

export interface DatabaseGroupUser {
  id: number
  group_jid: string
  user_jid: string
  money: number
  money_deposited: number
  berries: number
  enhancers: number
  cookies: number
  potions: number
  last_hunt_ago: number
  last_work_ago: number
  last_mining_ago: number
  last_daily_ago: number
  last_robbery_ago: number
  last_crime_ago?: number
  last_slut_ago?: number
  last_trivia_ago?: number
  created_at: string
  updated_at: string
}

export interface PremiumCode {
  id: number
  code: string
  user_jid: string
  bot_number?: string
  bot_type: string
  expires_at: string
  created_at: string
  used_at?: string
  is_active: boolean
  notifications_sent: number
}

export interface BotSession {
  id: number
  bot_id: string
  bot_jid: string
  bot_number: string
  owner_jid: string
  bot_type: string
  session_path: string
  created_at: string
  last_seen: string
  is_active: boolean
  expires_at?: string
  notified: number
}

export interface Character {
  id: string
  name: string
  gender: string
  value: number
  source: string
  img: string[]
  vid: string[]
  user_id: string | null
  status: string
  votes: number
  for_sale: boolean
  price: number | null
  seller_id: string | null
  last_removed_time: number | null
  bot_jid: string
}

export interface HaremEntry {
  user_id: string
  character_id: string
  last_claim_time: number | null
  last_vote_time: number | null
  vote_cooldown: number | null
  bot_jid: string
}

export type BotData = {
  owner_jid: string
  owner_lid?: string
  owner_pn?: string
  bot_jid: string
  bot_type: string
  bot_id: string
  parent_bot_jid?: string
  connected_at?: number
  original_type?: string
  is_online?: boolean
  wss: WASocket
}

export type ConnectionMethod = "qr" | "code" | "existing"

export type BotConfiguration = {
  owner_jid: string
  bot_jid: null | string
  bot_type: TypeBots
  bot_id: string
  connection_method: ConnectionMethod
  session_path?: string
  parent_bot_jid?: string
  hierarchy_parent_jid?: string
}

export interface ReactionData {
  [key: string]: string[]
}
