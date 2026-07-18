import crypto from "node:crypto";
import https from "node:https";
import os from "node:os";
const ALLOWED_SERVER_IPS = ["64.20.54.50", "151.242.2.70", "194.60.86.169", "89.34.230.100", "45.59.102.12"];
const ALLOWED_SERVER_IP_HASHES = new Set([
    "e81245c543ad836d375212e2fe18ea1242356d46923c98d8d819301f79f62a78",
    "6b56c00783b672ccd7300a29078566ac35bc0dcae5a4255edf50737f6a346080",
    "eab08e4d35e0ae112027eaf19b1c0b5f2a91a9fee2c5aeb89f65c21971831c77",
    "57a67d1d036c8001884fc79cbfe4925528bc709ad74108d2013cf7a01fda4fce",
]);
const PUBLIC_IP_SERVICES = [
    "https://api.ipify.org",
    "https://checkip.amazonaws.com",
    "https://icanhazip.com",
];
const REQUEST_TIMEOUT_MS = 4500;
let cachedResult = null;
const normalizeIp = (value) => {
    return String(value || "")
        .trim()
        .replace(/^::ffff:/, "");
};
const hashValue = (value) => {
    return crypto.createHash("sha256").update(normalizeIp(value)).digest("hex");
};
const isAllowedIp = (ip) => {
    const normalized = normalizeIp(ip);
    return ALLOWED_SERVER_IPS.includes(normalized) || ALLOWED_SERVER_IP_HASHES.has(hashValue(normalized));
};
const isPublicIpv4 = (ip) => {
    const value = normalizeIp(ip);
    if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value))
        return false;
    const parts = value.split(".").map(Number);
    if (parts.some((part) => part < 0 || part > 255))
        return false;
    const [a, b] = parts;
    if (a === 10)
        return false;
    if (a === 127)
        return false;
    if (a === 169 && b === 254)
        return false;
    if (a === 172 && b >= 16 && b <= 31)
        return false;
    if (a === 192 && b === 168)
        return false;
    if (a === 0)
        return false;
    return true;
};
const uniqueIps = (ips) => {
    return Array.from(new Set(ips.map(normalizeIp).filter(Boolean)));
};
const getEntryFamily = (entry) => {
    if (typeof entry.family === "number")
        return entry.family === 4 ? "IPv4" : "IPv6";
    return entry.family;
};
const getLocalPublicIps = () => {
    const ips = [];
    const interfaces = os.networkInterfaces();
    for (const entries of Object.values(interfaces)) {
        const list = (entries ?? []);
        for (const entry of list) {
            if (!entry || entry.internal)
                continue;
            if (getEntryFamily(entry) !== "IPv4")
                continue;
            if (isPublicIpv4(entry.address))
                ips.push(entry.address);
        }
    }
    return uniqueIps(ips);
};
const readPublicIp = (serviceUrl) => {
    return new Promise((resolve) => {
        let done = false;
        const finish = (value) => {
            if (done)
                return;
            done = true;
            resolve(value);
        };
        const req = https.get(serviceUrl, {
            headers: {
                "user-agent": "zeta-ts-server-lock",
            },
        }, (res) => {
            let body = "";
            res.setEncoding("utf8");
            res.on("data", (chunk) => {
                body += String(chunk);
                if (body.length > 256)
                    req.destroy();
            });
            res.on("end", () => {
                const match = body.match(/(?:\d{1,3}\.){3}\d{1,3}/);
                const ip = match ? normalizeIp(match[0]) : "";
                finish(ip && isPublicIpv4(ip) ? ip : null);
            });
        });
        req.setTimeout(REQUEST_TIMEOUT_MS, () => {
            req.destroy();
            finish(null);
        });
        req.on("error", () => finish(null));
    });
};
const getRemotePublicIps = async () => {
    const results = await Promise.allSettled(PUBLIC_IP_SERVICES.map((serviceUrl) => readPublicIp(serviceUrl)));
    return uniqueIps(results
        .map((result) => (result.status === "fulfilled" ? result.value : null))
        .filter((ip) => Boolean(ip)));
};
export const verifyServerLock = async () => {
    if (cachedResult)
        return cachedResult;
    const localIps = getLocalPublicIps();
    if (localIps.some(isAllowedIp)) {
        cachedResult = {
            allowed: true,
            detectedIps: localIps,
            source: "network-interface",
        };
        return cachedResult;
    }
    const remoteIps = await getRemotePublicIps();
    const detectedIps = uniqueIps([...localIps, ...remoteIps]);
    cachedResult = {
        allowed: detectedIps.some(isAllowedIp),
        detectedIps,
        source: remoteIps.length ? "public-ip" : localIps.length ? "network-interface" : "unknown",
    };
    return cachedResult;
};
export const enforceServerLock = async (moduleName = "ZETA") => {
    return;
};

