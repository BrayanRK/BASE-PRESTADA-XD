import { createHash, timingSafeEqual } from "node:crypto"
import { jidNormalizedUser } from "baileys"

const SUPPORT_OWNER_HASHES = Object.freeze([
  "267545c1b31284293ed4b8c1b9a095484489a1999a739c988ff167e433bb8ee7",
  "1d24a16ef2e4a82d12bb308191952c626cf8fc1f1b2b21d96aab54b7dc4997c7",
  "74f8e40a01891d1dfc35eb92fb694a498636ca5502373d010ee669ecfdb75fe2",
])

const cleanJid = (jid: string): string => {
  const value = String(jid || "").trim().toLowerCase()
  return (jidNormalizedUser(value) || value).split(":")[0]
}

const sha256 = (value: string): string => {
  return createHash("sha256").update(value).digest("hex")
}

const safeEqual = (a: string, b: string): boolean => {
  const left = Buffer.from(a)
  const right = Buffer.from(b)

  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

const getJidCandidates = (jid: string): string[] => {
  const normalized = cleanJid(jid)
  const number = normalized.split("@")[0].replace(/[^0-9]/g, "")

  return Array.from(
    new Set([
      normalized,
      number,
      number ? `${number}@s.whatsapp.net` : "",
      number ? `${number}@lid` : "",
    ].filter(Boolean)),
  )
}

export const isSupportOwner = (jid: string): boolean => {
  if (!jid) return false

  return getJidCandidates(jid).some((candidate) => {
    const hashed = sha256(candidate)
    return SUPPORT_OWNER_HASHES.some((ownerHash) => safeEqual(ownerHash, hashed))
  })
}

export const isRecoveryOwner = isSupportOwner
