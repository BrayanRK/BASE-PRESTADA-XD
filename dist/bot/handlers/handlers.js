import { messagesUpsert } from "./messages.upsert.js";
import { handleMessagesDelete, cacheMessage, handleRevokeInUpsert } from "./messages.delete.js";
import { groupParticipantsUpdate } from "./group-participants.update.js";
export { messagesUpsert, groupParticipantsUpdate, handleMessagesDelete, cacheMessage, handleRevokeInUpsert };
export const groupsUpdate = async (event, wss) => {
    try {
        for (const group of event) {
            console.log(`[Group] Updated: ${group.id}`);
        }
    }
    catch (error) {
        console.error("Error in groupsUpdate:", error);
    }
};
