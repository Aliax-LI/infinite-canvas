import { nanoid } from "nanoid";

export type PromptSource = {
    id: string;
    name: string;
    url: string;
    homepage: string;
    enabled: boolean;
    builtIn: boolean;
};

export const PROMPT_REGISTRY_HOMEPAGE = "https://github.com/yukkcat/image-prompts";
const PROMPT_REGISTRY_SOURCE_BASE = "https://raw.githubusercontent.com/yukkcat/image-prompts/main/dist/sources";

export function createPromptSource(source?: Partial<PromptSource>): PromptSource {
    return {
        id: source?.id?.trim() || nanoid(),
        name: source?.name?.trim() || "",
        url: source?.url?.trim() || "",
        homepage: source?.homepage?.trim() || "",
        enabled: source?.enabled ?? true,
        builtIn: source?.builtIn ?? false,
    };
}

export const DEFAULT_PROMPT_SOURCES: PromptSource[] = [
    registrySource("banana-prompt-quicker", "Banana Prompt Quicker", "https://glidea.github.io/banana-prompt-quicker/"),
    registrySource("davidwu-gpt-image2-prompts", "DavidWu GPT Image 2", "https://github.com/davidwuw0811-boop/awesome-gpt-image2-prompts"),
    registrySource("freestylefly-gpt-image-2", "Freestylefly GPT Image 2", "https://github.com/freestylefly/awesome-gpt-image-2"),
    registrySource("awesome-gpt-image", "Awesome GPT Image", "https://github.com/ZeroLu/awesome-gpt-image"),
    registrySource("awesome-gpt4o-image-prompts", "Awesome GPT-4o", "https://github.com/ImgEdify/Awesome-GPT4o-Image-Prompts"),
    {
        id: "youmind",
        name: "YouMind",
        url: "https://inner-oss-wlcb.bellecdn.cn/files/platform-ai-base/youmind/youmind-prompts.json",
        homepage: "https://inner-oss-wlcb.bellecdn.cn/files/platform-ai-base/youmind/youmind-prompts.json",
        enabled: true,
        builtIn: true,
    },
];

function registrySource(id: string, name: string, homepage: string): PromptSource {
    return { id, name, url: `${PROMPT_REGISTRY_SOURCE_BASE}/${id}.json`, homepage, enabled: true, builtIn: true };
}

const BUILTIN_PROMPT_SOURCE_LABELS: Record<string, string> = {
    "banana-prompt-quicker": "Banana 快捷提示词",
    "davidwu-gpt-image2-prompts": "DavidWu 生图",
    "freestylefly-gpt-image-2": "Freestylefly 生图",
    "awesome-gpt-image": "GPT 生图精选",
    "awesome-gpt4o-image-prompts": "GPT-4o 精选",
    youmind: "YouMind",
};

export function promptSourceFilterLabel(source: Pick<PromptSource, "id" | "name">) {
    return BUILTIN_PROMPT_SOURCE_LABELS[source.id] || (/[\u4e00-\u9fff]/.test(source.name) ? source.name : "");
}

export function isDeferredPromptSource(source: Pick<PromptSource, "id" | "url">) {
    return source.id === "youmind" || source.url.includes("youmind-prompts.json");
}
