import localforage from "localforage";

import { runPromptSource, type RawPrompt } from "./prompt-source-runtime";
import { usePromptSourceStore } from "@/stores/use-prompt-source-store";
import i18n from "@/i18n";
import { isDeferredPromptSource, promptSourceFilterLabel, type PromptSource } from "./prompt-source-presets";

export type Prompt = RawPrompt & {
    sourceId: string;
    category: string;
    githubUrl: string;
};

export const ALL_PROMPTS_OPTION = "all";

const RESTRICTED_PROMPT_PATTERN = /nsfw|违纪|r-?18|18\+|色情/i;
const NOISE_PROMPT_TAG = /^(official|unknown|unkown|featured)$/i;
const CHINESE_TEXT = /[\u4e00-\u9fff]/;

export function isRestrictedPromptTag(tag: string) {
    return RESTRICTED_PROMPT_PATTERN.test(tag);
}

export function isBrowseablePromptTag(tag: string) {
    const value = tag.trim();
    if (!value || !CHINESE_TEXT.test(value) || isRestrictedPromptTag(value) || NOISE_PROMPT_TAG.test(value) || value.includes("@") || value.startsWith("#") || value.length > 20) return false;
    return !(value.includes("/") && /[-_]/.test(value));
}

export function isRestrictedPrompt(item: Pick<Prompt, "title" | "prompt" | "tags">) {
    return RESTRICTED_PROMPT_PATTERN.test(item.title) || RESTRICTED_PROMPT_PATTERN.test(item.prompt) || item.tags.some(isRestrictedPromptTag);
}

export type PromptFilterOption = { value: string; label: string };

export type PromptListResponse = {
    items: Prompt[];
    tags: string[];
    categories: PromptFilterOption[];
    total: number;
};

export type PromptSourceStatus = {
    sourceId: string;
    count: number;
    lastSuccessAt: string;
    lastError: string;
};

export type PromptSourceRefreshResult = PromptSourceStatus & {
    sourceName: string;
    success: boolean;
};

export type PromptSourceRefreshSummary = {
    results: PromptSourceRefreshResult[];
    total: number;
    successCount: number;
    failureCount: number;
};

type SourceCache = PromptSourceStatus & {
    items: Prompt[];
    fetchedAt: number;
    signature: string;
};

const cacheTtlMs = 1000 * 60 * 60;
const promptCacheStore = localforage.createInstance({ name: "infinite-canvas", storeName: "prompt_cache" });
const loadingSources = new Map<string, Promise<PromptSourceRefreshResult>>();
const memoryItems = new Map<string, { signature: string; items: Prompt[] }>();

function enabledSources() {
    return usePromptSourceStore.getState().sources.filter((source) => source.enabled);
}

function cacheKey(sourceId: string) {
    return `prompt-source:${sourceId}`;
}

function sourceSignature(source: PromptSource) {
    const value = `${source.name}\n${source.url}\n${source.homepage}`;
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) | 0;
    return `${value.length}:${hash}`;
}

function withSourceMeta(source: PromptSource, items: RawPrompt[]): Prompt[] {
    return items.map((item) => ({
        ...item,
        description: item.description || "",
        referenceImageUrls: Array.isArray(item.referenceImageUrls) ? item.referenceImageUrls : [],
        sourceId: source.id,
        category: source.name,
        githubUrl: item.sourceUrl || source.homepage,
    }));
}

async function readSourceCache(sourceId: string) {
    return promptCacheStore.getItem<SourceCache>(cacheKey(sourceId));
}

async function refreshSourceRecord(source: PromptSource): Promise<PromptSourceRefreshResult> {
    const previous = await readSourceCache(source.id);
    try {
        const items = withSourceMeta(source, await runPromptSource(source));
        const lastSuccessAt = new Date().toISOString();
        const cache: SourceCache = { sourceId: source.id, items, count: items.length, fetchedAt: Date.now(), lastSuccessAt, lastError: "", signature: sourceSignature(source) };
        memoryItems.set(source.id, { signature: cache.signature, items });
        if (isDeferredPromptSource(source)) void promptCacheStore.setItem(cacheKey(source.id), cache);
        else await promptCacheStore.setItem(cacheKey(source.id), cache);
        return { sourceId: source.id, sourceName: source.name, count: items.length, lastSuccessAt, lastError: "", success: true };
    } catch (error) {
        const lastError = error instanceof Error ? error.message : String(error);
        const cache: SourceCache = {
            sourceId: source.id,
            items: previous?.items || [],
            count: previous?.items?.length || 0,
            fetchedAt: previous?.fetchedAt || 0,
            lastSuccessAt: previous?.lastSuccessAt || "",
            lastError,
            signature: previous?.signature || sourceSignature(source),
        };
        await promptCacheStore.setItem(cacheKey(source.id), cache);
        return { sourceId: source.id, sourceName: source.name, count: cache.count, lastSuccessAt: cache.lastSuccessAt, lastError, success: false };
    }
}

function getOrStartRefresh(source: PromptSource) {
    const current = loadingSources.get(source.id);
    if (current) return current;
    const loading = refreshSourceRecord(source).finally(() => loadingSources.delete(source.id));
    loadingSources.set(source.id, loading);
    return loading;
}

async function getSourcePrompts(source: PromptSource): Promise<Prompt[]> {
    const signature = sourceSignature(source);
    const remembered = memoryItems.get(source.id);
    if (remembered?.signature === signature) return remembered.items;
    const cached = await readSourceCache(source.id);
    if (cached) {
        const items = withSourceMeta(source, cached.items);
        memoryItems.set(source.id, { signature: cached.signature, items });
        const stale = cached.signature !== signature || Date.now() - cached.fetchedAt >= cacheTtlMs;
        if (stale) void getOrStartRefresh(source).catch(() => undefined);
        return items;
    }
    const result = await getOrStartRefresh(source);
    if (!result.success) throw new Error(result.lastError);
    return memoryItems.get(source.id)?.items || (await readSourceCache(source.id))?.items || [];
}

function uniqueDeferredSources() {
    return enabledSources().filter(isDeferredPromptSource).filter((source, index, sources) => sources.findIndex((item) => item.url === source.url) === index);
}

function cachedDeferredPrompts() {
    return uniqueDeferredSources().flatMap((source) => {
        const remembered = memoryItems.get(source.id);
        return remembered?.signature === sourceSignature(source) ? remembered.items : [];
    });
}

async function getAllPrompts(): Promise<Prompt[]> {
    const settled = await Promise.all(
        enabledSources()
            .filter((source) => !isDeferredPromptSource(source))
            .map(async (source) => {
            try {
                return await getSourcePrompts(source);
            } catch {
                return [];
            }
        }),
    );
    return [...settled.flat(), ...cachedDeferredPrompts()];
}

export async function prefetchDeferredPromptSources() {
    const missing = uniqueDeferredSources().filter((source) => memoryItems.get(source.id)?.signature !== sourceSignature(source));
    if (missing.length === 0) return false;
    await Promise.all(missing.map((source) => getSourcePrompts(source).catch(() => [] as Prompt[])));
    return missing.some((source) => Boolean(memoryItems.get(source.id)));
}

function sourceFilterOptions() {
    return enabledSources().flatMap((source) => {
        const label = promptSourceFilterLabel(source);
        return label ? [{ value: source.name, label }] : [];
    });
}

async function loadPromptItems(category: string, keyword: string) {
    const deferred = enabledSources().filter(isDeferredPromptSource);
    const selected = deferred.find((source) => category === source.name);
    if (selected) return getSourcePrompts(selected);
    const extras = keyword.trim() ? deferred.filter((source, index) => deferred.findIndex((item) => item.url === source.url) === index) : [];
    const groups = await Promise.all([getAllPrompts(), ...extras.map((source) => getSourcePrompts(source).catch(() => [] as Prompt[]))]);
    return groups.flat();
}

export async function fetchPrompts({ keyword = "", tag = [], category = ALL_PROMPTS_OPTION, page = 1, pageSize = 20 }: { keyword?: string; tag?: string[]; category?: string; page?: number; pageSize?: number } = {}) {
    const items = (await loadPromptItems(category, keyword)).filter((item) => !isRestrictedPrompt(item));
    const normalizedKeyword = keyword.trim().toLowerCase();
    const normalizedPage = Math.max(1, page);
    const normalizedPageSize = Math.max(1, Math.min(100, pageSize));
    const withoutTagFilter = filterPrompts(items, { keyword: normalizedKeyword, category, tags: [] });
    const filtered = filterPrompts(items, { keyword: normalizedKeyword, category, tags: tag }).toSorted((left, right) => promptTimestamp(right) - promptTimestamp(left));

    return {
        items: filtered.slice((normalizedPage - 1) * normalizedPageSize, normalizedPage * normalizedPageSize),
        tags: collectTags(withoutTagFilter),
        categories: sourceFilterOptions(),
        total: filtered.length,
    };
}

export async function fetchSourcePrompts(sourceId: string): Promise<Prompt[]> {
    const source = usePromptSourceStore.getState().sources.find((item) => item.id === sourceId);
    if (!source) throw new Error(i18n.t("prompts.sourceMissing"));
    return getSourcePrompts(source);
}

export async function refreshSource(sourceId: string): Promise<PromptSourceRefreshResult> {
    const source = usePromptSourceStore.getState().sources.find((item) => item.id === sourceId);
    if (!source) throw new Error(i18n.t("prompts.sourceMissing"));
    const result = await getOrStartRefresh(source);
    if (!result.success) throw new Error(result.lastError);
    return result;
}

export async function refreshAllSources(): Promise<PromptSourceRefreshSummary> {
    const results = await Promise.all(enabledSources().map(getOrStartRefresh));
    return summarizeRefresh(results);
}

export async function refreshDueSources(maxAgeMs: number): Promise<PromptSourceRefreshSummary> {
    const sources = await Promise.all(
        enabledSources().map(async (source) => {
            const cached = await readSourceCache(source.id);
            const lastSuccess = cached?.lastSuccessAt ? new Date(cached.lastSuccessAt).getTime() : 0;
            return !lastSuccess || Boolean(cached?.lastError) || Date.now() - lastSuccess >= maxAgeMs || cached?.signature !== sourceSignature(source) ? source : null;
        }),
    );
    const results = await Promise.all(sources.filter((source): source is PromptSource => Boolean(source)).map(getOrStartRefresh));
    return summarizeRefresh(results);
}

export async function fetchPromptSourceStatuses(): Promise<Record<string, PromptSourceStatus>> {
    const entries = await Promise.all(
        usePromptSourceStore.getState().sources.map(async (source) => {
            const cache = await readSourceCache(source.id);
            return [source.id, { sourceId: source.id, count: cache?.items?.length || 0, lastSuccessAt: cache?.lastSuccessAt || "", lastError: cache?.lastError || "" }] as const;
        }),
    );
    return Object.fromEntries(entries);
}

function summarizeRefresh(results: PromptSourceRefreshResult[]): PromptSourceRefreshSummary {
    return {
        results,
        total: results.reduce((total, item) => total + item.count, 0),
        successCount: results.filter((item) => item.success).length,
        failureCount: results.filter((item) => !item.success).length,
    };
}

function promptTimestamp(item: Prompt) {
    const time = Date.parse(item.updatedAt || item.createdAt);
    return Number.isNaN(time) ? 0 : time;
}

function filterPrompts(items: Prompt[], options: { keyword: string; category: string; tags: string[] }) {
    return items.filter((item) => {
        if (isActiveOption(options.category) && item.category !== options.category) return false;
        if (options.tags.length && !options.tags.some((tag) => item.tags.includes(tag))) return false;
        if (!options.keyword) return true;
        return [item.title, item.prompt, item.description, item.category, ...item.tags].join(" ").toLowerCase().includes(options.keyword);
    });
}

function collectTags(items: Prompt[]) {
    const counts = new Map<string, number>();
    for (const item of items) {
        for (const tag of item.tags) {
            if (!isBrowseablePromptTag(tag)) continue;
            counts.set(tag, (counts.get(tag) || 0) + 1);
        }
    }
    return [...counts.entries()]
        .filter(([, count]) => count >= 2)
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "zh"))
        .map(([tag]) => tag);
}

function isActiveOption(value: string) {
    return value && value !== ALL_PROMPTS_OPTION && value !== "all";
}

export function formatPromptDate(value: string, locale?: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
