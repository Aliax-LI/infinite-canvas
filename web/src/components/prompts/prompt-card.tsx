import { Check, Copy, Quote } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { isBrowseablePromptTag, type Prompt } from "@/services/api/prompts";
import { cn } from "@/lib/utils";

export function PromptCard({ item, onOpen, onCopy }: { item: Prompt; onOpen: () => void; onCopy?: () => void }) {
    const { t } = useTranslation();
    const [copied, setCopied] = useState(false);
    const [imageLoaded, setImageLoaded] = useState(false);
    const [imageError, setImageError] = useState(false);
    const tags = item.tags.filter(isBrowseablePromptTag).slice(0, 3);
    const byline = [item.author, item.category].filter(Boolean).join(" · ");
    const hasCover = Boolean(item.coverUrl) && !imageError;

    const handleCopy = (event: React.MouseEvent) => {
        event.stopPropagation();
        onCopy?.();
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <article className="group relative overflow-hidden rounded-xl border border-stone-200/80 bg-white shadow-xs transition-all duration-300 hover:-translate-y-1 hover:shadow-xl dark:border-stone-800/80 dark:bg-stone-900">
            <button type="button" className="block w-full text-left focus:outline-none" onClick={onOpen}>
                {hasCover ? (
                    <div className="relative min-h-[180px] overflow-hidden bg-stone-100 dark:bg-stone-950">
                        {!imageLoaded ? (
                            <div className="absolute inset-0 flex flex-col justify-between p-3.5 bg-stone-200/50 dark:bg-stone-800/50 animate-pulse">
                                <div className="h-3 w-1/3 rounded bg-stone-300/60 dark:bg-stone-700/60" />
                                <div className="space-y-1.5">
                                    <div className="h-3 w-3/4 rounded bg-stone-300/60 dark:bg-stone-700/60" />
                                    <div className="h-2.5 w-1/2 rounded bg-stone-300/60 dark:bg-stone-700/60" />
                                </div>
                            </div>
                        ) : null}
                        <img
                            src={item.coverUrl}
                            alt={item.title}
                            className={cn(
                                "block h-auto w-full object-cover transition-all duration-500 ease-out group-hover:scale-105",
                                imageLoaded ? "opacity-100" : "opacity-0"
                            )}
                            loading="lazy"
                            decoding="async"
                            onLoad={() => setImageLoaded(true)}
                            onError={() => setImageError(true)}
                        />
                        <div className={cn(
                            "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-3.5 pb-3.5 pt-14 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100",
                            imageLoaded ? "opacity-0" : "opacity-0 pointer-events-none"
                        )}>
                            <span className="line-clamp-1 text-sm font-semibold leading-snug text-white drop-shadow-xs">{item.title}</span>
                            {byline ? <span className="mt-0.5 block line-clamp-1 text-[11px] text-white/75">{byline}</span> : null}
                            <p className="mt-1.5 line-clamp-2 overflow-hidden break-words text-xs leading-relaxed text-white/90">{item.prompt}</p>
                            {tags.length > 0 ? (
                                <span className="mt-2.5 flex flex-wrap gap-1">
                                    {tags.map((tag) => (
                                        <span key={tag} className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-xs">
                                            {tag}
                                        </span>
                                    ))}
                                </span>
                            ) : null}
                        </div>
                    </div>
                ) : (
                    <div className="flex min-h-[160px] flex-col justify-between p-4 bg-gradient-to-br from-stone-50/80 to-stone-100/50 dark:from-stone-900/60 dark:to-stone-800/40">
                        <div>
                            <div className="flex items-center gap-1.5 text-stone-400 dark:text-stone-500 mb-2">
                                <Quote className="size-4 shrink-0" />
                                {byline ? <span className="text-[11px] truncate">{byline}</span> : null}
                            </div>
                            <h3 className="line-clamp-1 text-sm font-semibold text-stone-900 dark:text-stone-100">{item.title}</h3>
                            <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-stone-600 dark:text-stone-300 break-words">{item.prompt}</p>
                        </div>
                        {tags.length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-1">
                                {tags.map((tag) => (
                                    <span key={tag} className="rounded-md bg-stone-200/70 dark:bg-stone-800 px-1.5 py-0.5 text-[10px] text-stone-600 dark:text-stone-400">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        ) : null}
                    </div>
                )}
            </button>

            {onCopy ? (
                <button
                    type="button"
                    className={`prompt-card-copy absolute right-2.5 top-2.5 z-10 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm backdrop-blur-md transition-all duration-150 active:scale-95 ${
                        copied
                            ? "!border-emerald-500/60 !bg-emerald-600 !text-white opacity-100"
                            : hasCover
                              ? "prompt-card-copy--on-cover !border-white/25 !bg-black/70 hover:!bg-black/85 !text-white opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                              : "!border-stone-200/80 !bg-white/90 hover:!bg-white !text-stone-800 dark:!border-stone-700 dark:!bg-stone-800/90 dark:!text-stone-200 opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                    }`}
                    onClick={handleCopy}
                >
                    {copied ? (
                        <>
                            <Check className="size-3.5 shrink-0 text-white" aria-hidden />
                            <span className="text-white">{t("common.copied")}</span>
                        </>
                    ) : (
                        <>
                            <Copy className="size-3.5 shrink-0" aria-hidden />
                            <span>{t("common.copy")}</span>
                        </>
                    )}
                </button>
            ) : null}
        </article>
    );
}

export function PromptCardSkeleton({ heightClass = "h-72" }: { heightClass?: string }) {
    return (
        <div className={cn("overflow-hidden rounded-xl border border-stone-200/70 bg-stone-100/90 shadow-xs dark:border-stone-800/80 dark:bg-stone-900/70", heightClass)}>
            <div className="flex h-full flex-col justify-between p-4 animate-pulse">
                <div className="flex items-center justify-between">
                    <div className="h-4 w-16 rounded-full bg-stone-200/90 dark:bg-stone-800" />
                    <div className="size-6 rounded-full bg-stone-200/90 dark:bg-stone-800" />
                </div>
                <div className="space-y-2">
                    <div className="h-3.5 w-3/4 rounded bg-stone-200/90 dark:bg-stone-800" />
                    <div className="h-3 w-full rounded bg-stone-200/80 dark:bg-stone-800/80" />
                    <div className="h-3 w-2/3 rounded bg-stone-200/80 dark:bg-stone-800/80" />
                    <div className="mt-3 flex gap-1.5 pt-1">
                        <div className="h-3.5 w-12 rounded-full bg-stone-200/90 dark:bg-stone-800" />
                        <div className="h-3.5 w-10 rounded-full bg-stone-200/90 dark:bg-stone-800" />
                    </div>
                </div>
            </div>
        </div>
    );
}
