#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const API_URL = "https://youmind.com/youmarketing-api/prompt-category-prompts";
const HOMEPAGE = "https://youmind.com/zh-CN/prompts/image/styles";
const PAGE_SIZE = 60;
const CONCURRENCY = 3;
const TIMEOUT_MS = 20_000;
const RETRIES = 3;
const ARGUMENT_PLACEHOLDER = /\{argument\s+name="[^"]*"\s+default="([^"]*)"\}/g;

const outFile = resolve(dirname(fileURLToPath(import.meta.url)), "youmind-prompts.json");

const first = await fetchPage(1);
const total = first.total;
const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
console.log(`YouMind total=${total} pages=${pageCount} -> ${outFile}`);

const pages = new Array(pageCount);
pages[0] = first.prompts;
for (let start = 2; start <= pageCount; start += CONCURRENCY) {
    const batch = [];
    for (let page = start; page < start + CONCURRENCY && page <= pageCount; page += 1) batch.push(page);
    const results = await Promise.all(batch.map((page) => fetchPage(page)));
    for (const [index, page] of batch.entries()) {
        pages[page - 1] = results[index].prompts;
        console.log(`page ${page}/${pageCount} +${results[index].prompts.length}`);
    }
}

const seen = new Set();
const items = [];
for (const prompts of pages) {
    for (const item of prompts) {
        const mapped = mapPrompt(item);
        if (!mapped || seen.has(mapped.id)) continue;
        seen.add(mapped.id);
        items.push(mapped);
    }
}

await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, JSON.stringify(items));
console.log(`wrote ${items.length} prompts (${(Buffer.byteLength(JSON.stringify(items)) / 1024 / 1024).toFixed(1)} MB)`);

async function fetchPage(page) {
    let lastError = "";
    for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
        try {
            const response = await fetch(API_URL, {
                method: "POST",
                headers: {
                    accept: "application/json",
                    "content-type": "application/json",
                    origin: "https://youmind.com",
                    referer: HOMEPAGE,
                    "user-agent": "Mozilla/5.0",
                },
                body: JSON.stringify({
                    media: "image",
                    dimension: "styles",
                    categoryIds: [],
                    locale: "zh-CN",
                    page,
                    limit: PAGE_SIZE,
                    sortBy: "time",
                    sortOrder: "desc",
                }),
                signal: AbortSignal.timeout(TIMEOUT_MS),
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            return { total: Number(data.total) || 0, prompts: Array.isArray(data.prompts) ? data.prompts : [] };
        } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
            if (attempt < RETRIES) await sleep(attempt * 1000);
        }
    }
    throw new Error(`page ${page} failed: ${lastError}`);
}

function mapPrompt(value) {
    const record = value && typeof value === "object" ? value : {};
    const title = stringValue(record.title).trim();
    const prompt = expandYouMindPrompt(stringValue(record.translatedContent) || stringValue(record.content)).trim();
    if (!title || !prompt) return null;
    const media = stringArray(record.media);
    const href = stringValue(record.href);
    const author = record.author && typeof record.author === "object" ? stringValue(record.author.name) : stringValue(record.author);
    return {
        id: stringValue(record.id) || href || title,
        title,
        prompt,
        description: stringValue(record.description),
        coverUrl: media[0] || "",
        referenceImageUrls: stringArray(record.referenceImages),
        tags: collectTags(record.imageCategories),
        createdAt: stringValue(record.sourcePublishedAt),
        author,
        sourceUrl: href ? new URL(href, HOMEPAGE).toString() : stringValue(record.sourceLink),
    };
}

function expandYouMindPrompt(text) {
    return text.replace(ARGUMENT_PLACEHOLDER, "$1");
}

function collectTags(value) {
    const groups = value && typeof value === "object" ? value : {};
    const tags = [];
    for (const key of ["styles", "subjects", "useCases"]) {
        for (const item of Array.isArray(groups[key]) ? groups[key] : []) {
            const title = stringValue(item?.title).trim();
            if (title && !tags.includes(title)) tags.push(title);
        }
    }
    return tags;
}

function stringValue(value) {
    return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function stringArray(value) {
    return Array.isArray(value) ? value.map(stringValue).map((item) => item.trim()).filter(Boolean) : [];
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
