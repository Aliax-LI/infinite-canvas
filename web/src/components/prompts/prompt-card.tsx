import { Copy, Eye } from "lucide-react";
import type { ReactNode } from "react";
import { Button, Tag } from "antd";

import { PromptImage } from "@/components/prompts/prompt-image";
import { formatPromptDate, type Prompt } from "@/services/api/prompts";

export function PromptCard({
    item,
    onOpen,
    onCopy,
    actionLabel = "复制",
    actionIcon = <Copy className="size-3.5" />,
    actionType = "text",
    extraAction,
}: {
    item: Prompt;
    onOpen: () => void;
    onCopy: () => void;
    actionLabel?: string;
    actionIcon?: ReactNode;
    actionType?: "text" | "primary";
    extraAction?: ReactNode;
}) {
    return (
        <article className="group overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md dark:border-stone-800 dark:bg-stone-950 dark:hover:border-stone-700">
            <div className="relative bg-stone-100 dark:bg-stone-900">
                <PromptImage src={item.coverUrl} title={item.title} seed={seedFromId(item.id)} />
                <div className="pointer-events-none absolute right-3 top-3 inline-flex items-center gap-1 rounded-md border border-white/20 bg-black/35 px-2 py-1 text-[11px] font-medium text-white opacity-0 backdrop-blur transition group-hover:opacity-100">
                    <Eye className="size-3" />
                    预览
                </div>
            </div>
            <button type="button" className="block w-full text-left" onClick={onOpen}>
                <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h2 className="line-clamp-1 text-sm font-semibold text-stone-950 dark:text-stone-100">{item.title}</h2>
                            <div className="mt-1 line-clamp-1 text-[11px] text-stone-400 dark:text-stone-500">{item.category}</div>
                        </div>
                        <span className="shrink-0 text-xs text-stone-400 dark:text-stone-500">{formatPromptDate(item.updatedAt)}</span>
                    </div>
                    <p className="mt-3 line-clamp-3 text-xs leading-5 text-stone-600 dark:text-stone-400">{item.prompt}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {item.tags.slice(0, 5).map((tag) => (
                            <Tag key={tag} className="m-0 text-[11px]">
                                {tag}
                            </Tag>
                        ))}
                    </div>
                </div>
            </button>
            <div className="flex items-center gap-2 px-4 pb-4">
                <Button block={actionType === "primary"} type={actionType} size="small" icon={actionIcon} onClick={onCopy}>
                    {actionLabel}
                </Button>
                {extraAction}
            </div>
        </article>
    );
}

function seedFromId(value: string) {
    return Array.from(value).reduce((total, char) => total + char.charCodeAt(0), 0);
}
