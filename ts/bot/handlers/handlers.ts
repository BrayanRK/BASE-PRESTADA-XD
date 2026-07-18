import { messagesUpsert } from "./messages.upsert.js"
import { handleMessagesDelete, cacheMessage, handleRevokeInUpsert } from "./messages.delete.js"
import { groupParticipantsUpdate } from "./group-participants.update.js"
import type * as baileys from "baileys"
import type * as types from "../../types/types.js"

export { messagesUpsert, groupParticipantsUpdate, handleMessagesDelete, cacheMessage, handleRevokeInUpsert }

export const groupsUpdate = async (event: baileys.BaileysEventMap["groups.update"], wss: types.WASocket) => {
  try {
    for (const group of event) {
      console.log(`[Group] Updated: ${group.id}`)
    }
  } catch (error) {
    console.error("Error in groupsUpdate:", error)
  }
}
