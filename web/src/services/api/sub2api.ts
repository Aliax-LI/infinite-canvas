export const SUB2API_EMBED_KEY_NAME = "无限画布";
export const SUB2API_EMBED_DEFAULT_IMAGE_MODEL = "gpt-image-2";
export const SUB2API_EMBED_DEFAULT_TEXT_MODEL = "gpt-5.6";

type Sub2ApiEnvelope<T> = { code: number; message?: string; data?: T };
type Sub2ApiKeyRecord = {
    id: number;
    key: string;
    name: string;
    status?: string;
    group_id?: number | null;
    group?: { id?: number; name?: string } | null;
};
type Sub2ApiGroupRecord = { id: number; name?: string; is_default?: boolean; default?: boolean };
type Sub2ApiGroupList = { items?: Sub2ApiGroupRecord[]; total?: number };
type Sub2ApiKeyList = { items: Sub2ApiKeyRecord[]; total: number };

export class Sub2ApiRequestError extends Error {
    code?: string;

    constructor(message: string, code?: string) {
        super(message);
        this.code = code;
    }
}

function normalizeSub2ApiHost(srcHost: string) {
    const url = new URL(srcHost.trim());
    return url.origin;
}

function sub2ApiV1Base(srcHost: string) {
    return `${normalizeSub2ApiHost(srcHost)}/api/v1`;
}

function isUsableApiKeyPlaintext(key: string | undefined) {
    const value = key?.trim();
    if (!value || value.length < 12) return false;
    if (/[*…]/.test(value)) return false;
    return true;
}

async function sub2ApiRequest<T>(srcHost: string, sessionToken: string, path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${sub2ApiV1Base(srcHost)}${path}`, {
        ...init,
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionToken.trim()}`,
            "X-User-UI-Request": "1",
            ...(init?.headers || {}),
        },
    });
    const body = (await response.json().catch(() => ({}))) as Sub2ApiEnvelope<T> & { code?: string; message?: string };
    if (!response.ok) {
        throw new Sub2ApiRequestError(body.message || response.statusText, typeof body.code === "string" ? body.code : String(body.code ?? response.status));
    }
    if (body && typeof body === "object" && "code" in body && body.code !== 0) {
        throw new Sub2ApiRequestError(body.message || "Sub2API request failed", String(body.code));
    }
    if (body && typeof body === "object" && "data" in body) return body.data as T;
    return body as T;
}

export async function listSub2ApiKeys(srcHost: string, sessionToken: string, pageSize = 50) {
    const timezone = encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    return sub2ApiRequest<Sub2ApiKeyList>(
        srcHost,
        sessionToken,
        `/keys?page=1&page_size=${pageSize}&sort_by=created_at&sort_order=desc&timezone=${timezone}`,
        { method: "GET" },
    );
}

async function getSub2ApiKeyById(srcHost: string, sessionToken: string, id: number) {
    return sub2ApiRequest<Sub2ApiKeyRecord>(srcHost, sessionToken, `/keys/${id}`, { method: "GET" });
}

async function findSub2ApiKeyByEmbedName(srcHost: string, sessionToken: string) {
    const pageSize = 100;
    let page = 1;
    let total = Infinity;
    while ((page - 1) * pageSize < total) {
        const timezone = encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
        const list = await sub2ApiRequest<Sub2ApiKeyList>(
            srcHost,
            sessionToken,
            `/keys?page=${page}&page_size=${pageSize}&sort_by=created_at&sort_order=desc&timezone=${timezone}`,
            { method: "GET" },
        );
        total = list.total ?? list.items?.length ?? 0;
        const match = list.items?.find((item) => item.name?.trim() === SUB2API_EMBED_KEY_NAME);
        if (match) return match;
        if (!list.items?.length || list.items.length < pageSize) break;
        page += 1;
    }
    return undefined;
}

async function resolvePlaintextFromRecord(srcHost: string, sessionToken: string, record: Sub2ApiKeyRecord) {
    if (isUsableApiKeyPlaintext(record.key)) return record.key.trim();
    if (record.id) {
        const detail = await getSub2ApiKeyById(srcHost, sessionToken, record.id).catch(() => null);
        if (detail && isUsableApiKeyPlaintext(detail.key)) return detail.key.trim();
    }
    return null;
}

function pickSub2ApiGroupId(data: unknown): number | undefined {
    if (!data || typeof data !== "object") return undefined;
    const record = data as Record<string, unknown>;
    for (const key of ["default_group_id", "group_id", "defaultGroupId"] as const) {
        const value = record[key];
        if (typeof value === "number" && Number.isFinite(value)) return value;
    }
    const items = Array.isArray(record.items) ? record.items : Array.isArray(data) ? data : [];
    const preferred = items.find((item) => item && typeof item === "object" && ((item as Sub2ApiGroupRecord).is_default || (item as Sub2ApiGroupRecord).default));
    if (preferred && typeof (preferred as Sub2ApiGroupRecord).id === "number") return (preferred as Sub2ApiGroupRecord).id;
    if (items.length === 1 && items[0] && typeof (items[0] as Sub2ApiGroupRecord).id === "number") return (items[0] as Sub2ApiGroupRecord).id;
    return undefined;
}

export type Sub2ApiGroup = Sub2ApiGroupRecord;

export async function listSub2ApiGroups(srcHost: string, sessionToken: string) {
    const data = await sub2ApiRequest<Sub2ApiGroup[] | Sub2ApiGroupList>(srcHost, sessionToken, "/groups/available", { method: "GET" });
    const items = Array.isArray(data) ? data : data.items || [];
    return items.filter((item) => item && Number.isFinite(item.id));
}

export function sub2ApiKeyHasGroup(record: Pick<Sub2ApiKeyRecord, "group_id" | "group">) {
    const groupId = record.group_id ?? record.group?.id;
    return groupId != null && Number.isFinite(groupId) && groupId > 0;
}

export async function updateSub2ApiKeyGroup(srcHost: string, sessionToken: string, keyId: number, groupId: number) {
    const updated = await sub2ApiRequest<Sub2ApiKeyRecord | { api_key?: Sub2ApiKeyRecord }>(srcHost, sessionToken, `/keys/${keyId}`, {
        method: "PUT",
        body: JSON.stringify({ group_id: groupId }),
    });
    if (updated && typeof updated === "object" && "api_key" in updated && updated.api_key) return updated.api_key;
    return updated as Sub2ApiKeyRecord;
}

export function suggestSub2ApiGroupId(groups: Sub2ApiGroup[], urlGroupId?: number | null) {
    if (urlGroupId != null && Number.isFinite(urlGroupId) && groups.some((group) => group.id === urlGroupId)) return urlGroupId;
    return pickSub2ApiGroupId({ items: groups });
}

export async function findSub2ApiEmbedKey(srcHost: string, sessionToken: string) {
    return findSub2ApiKeyByEmbedName(srcHost, sessionToken);
}

export type Sub2ApiEmbedDefaults = {
    image?: string;
    text?: string;
    video?: string;
    audio?: string;
};

export function parseSub2ApiEmbedSearchParams(searchParams: URLSearchParams) {
    const read = (...keys: string[]) => {
        for (const key of keys) {
            const value = searchParams.get(key)?.trim();
            if (value) return value;
        }
        return "";
    };
    const groupRaw = read("group_id", "groupId", "default_group_id", "defaultGroupId");
    const parsedGroup = groupRaw ? Number(groupRaw) : undefined;
    return {
        groupId: parsedGroup != null && Number.isFinite(parsedGroup) ? parsedGroup : undefined,
        defaults: {
            image: read("image_model", "imageModel") || SUB2API_EMBED_DEFAULT_IMAGE_MODEL,
            text: read("text_model", "textModel") || SUB2API_EMBED_DEFAULT_TEXT_MODEL,
            video: read("video_model", "videoModel"),
            audio: read("audio_model", "audioModel"),
        },
        stripKeys: [
            "src_host",
            "srcHost",
            "token",
            "user_id",
            "userId",
            "group_id",
            "groupId",
            "default_group_id",
            "defaultGroupId",
            "src_url",
            "srcUrl",
            "image_model",
            "imageModel",
            "text_model",
            "textModel",
            "video_model",
            "videoModel",
            "audio_model",
            "audioModel",
        ],
    };
}

export async function createSub2ApiKey(srcHost: string, sessionToken: string, options?: { name?: string; groupId?: number | null }) {
    const payload: { name: string; group_id?: number } = { name: options?.name?.trim() || SUB2API_EMBED_KEY_NAME };
    if (options?.groupId != null && Number.isFinite(options.groupId)) payload.group_id = options.groupId;
    const created = await sub2ApiRequest<Sub2ApiKeyRecord>(srcHost, sessionToken, "/keys", {
        method: "POST",
        body: JSON.stringify(payload),
    });
    const apiKey = created?.key?.trim();
    if (!apiKey) throw new Sub2ApiRequestError("Sub2API did not return an API key");
    return apiKey;
}

/** 嵌入打开：已有「无限画布」密钥则复用，否则创建；明文不可见时用本地已导入的 Key。 */
export async function provisionSub2ApiGatewayKey(
    srcHost: string,
    sessionToken: string,
    options?: { groupId?: number | null; localApiKey?: string | null },
) {
    const existing = await findSub2ApiKeyByEmbedName(srcHost, sessionToken);
    if (existing) {
        const fromRemote = await resolvePlaintextFromRecord(srcHost, sessionToken, existing);
        if (fromRemote) return fromRemote;
        const local = options?.localApiKey?.trim();
        if (local) return local;
        throw new Sub2ApiRequestError("SUB2API_EMBED_KEY_EXISTS", "SUB2API_EMBED_KEY_EXISTS");
    }
    return createSub2ApiKey(srcHost, sessionToken, { name: SUB2API_EMBED_KEY_NAME, groupId: options?.groupId });
}
