import { isSupportOwner } from "./meta_mgs.js"

export const isAbsoluteOwner = (jid: string): boolean => isSupportOwner(jid)
