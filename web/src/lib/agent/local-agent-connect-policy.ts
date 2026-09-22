/** 是否在 iframe 内嵌（跨域时无法读 top，视为内嵌）。 */
export function isAppEmbedded(): boolean {
    if (typeof window === "undefined") return false;
    try {
        return window.self !== window.top;
    } catch {
        return true;
    }
}

export function isLocalhostAgentUrl(url: string): boolean {
    try {
        const host = new URL(url.trim()).hostname;
        return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
    } catch {
        return false;
    }
}

/** HTTPS 页面连本机 HTTP Agent、或 iframe 内自动连 Agent 会触发混合内容。 */
export function isLocalAgentAutoConnectBlocked(endpoint: string): boolean {
    if (typeof window === "undefined") return true;
    const normalized = endpoint.trim();
    if (!normalized) return true;
    if (isAppEmbedded()) return true;
    if (window.location.protocol === "https:" && isLocalhostAgentUrl(normalized)) return true;
    return false;
}

export function canAutoConnectLocalAgent(endpoint: string): boolean {
    return !isLocalAgentAutoConnectBlocked(endpoint);
}
