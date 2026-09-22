import { Copy, FolderPlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Image } from "antd";
import { useTranslation } from "react-i18next";

import { formatPromptDate, isBrowseablePromptTag, type Prompt } from "@/services/api/prompts";

export function PromptDetailDialog({ prompt, onClose, onCopy, onSaveAsset }: { prompt: Prompt | null; onClose: () => void; onCopy: (prompt: string) => void; onSaveAsset?: (prompt: Prompt) => void }) {
    const { i18n, t } = useTranslation();
    const gallery = prompt ? uniqueUrls([prompt.coverUrl, ...prompt.referenceImageUrls]) : [];
    const [activeUrl, setActiveUrl] = useState(gallery[0] || "");
    const [previewOpen, setPreviewOpen] = useState(false);
    const params = prompt ? [
        prompt.imageModel ? [t("prompts.imageModel"), prompt.imageModel] : null,
        prompt.imageSize ? [t("prompts.imageSize"), prompt.imageSize] : null,
        prompt.imageCount ? [t("prompts.imageCount"), String(prompt.imageCount)] : null,
    ].filter((item): item is [string, string] => Boolean(item)) : [];

    useEffect(() => {
        setActiveUrl(gallery[0] || "");
        setPreviewOpen(false);
    }, [prompt?.id]);

    useEffect(() => {
        if (!prompt) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            if (previewOpen) {
                event.stopPropagation();
                setPreviewOpen(false);
                return;
            }
            onClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => {
            document.body.style.overflow = previous;
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [onClose, previewOpen, prompt]);

    if (!prompt) return null;

    const date = formatPromptDate(prompt.createdAt || prompt.updatedAt, i18n.resolvedLanguage);

    return createPortal(
        <div className="fixed inset-0 z-[1100] flex h-dvh flex-col overflow-hidden bg-white md:flex-row dark:bg-stone-950" role="dialog" aria-modal="true" aria-label={prompt.title}>
            <button type="button" className="absolute right-3 top-3 z-20 grid size-8 place-items-center rounded-full bg-black/40 text-white hover:bg-black/55 md:bg-transparent md:text-stone-500 md:hover:bg-black/5 md:hover:text-stone-900 dark:md:hover:bg-white/10 dark:md:hover:text-white" onClick={onClose} aria-label={t("common.close")}>
                <X className="size-4" />
            </button>

            <div className="relative h-[min(38svh,42%)] w-full shrink-0 overflow-hidden bg-stone-50 md:h-auto md:max-h-none md:min-h-0 md:flex-1 dark:bg-black">
                <button type="button" className="flex size-full items-center justify-center p-3 md:p-10" onClick={() => { if (activeUrl) setPreviewOpen(true); }}>
                    {activeUrl ? <img src={activeUrl} alt={prompt.title} className="max-h-full max-w-full cursor-zoom-in object-contain" /> : <p className="text-sm text-stone-400">{prompt.title}</p>}
                </button>
                {gallery.length > 1 ? (
                    <div className="absolute inset-x-0 bottom-2 flex justify-center gap-2 px-3">
                        {gallery.map((url) => (
                            <button key={url} type="button" onClick={() => setActiveUrl(url)} className={`size-10 overflow-hidden rounded-md ring-1 transition md:size-12 ${url === activeUrl ? "ring-white" : "ring-transparent opacity-70 hover:opacity-100"}`}>
                                <img src={url} alt="" className="size-full object-cover" />
                            </button>
                        ))}
                    </div>
                ) : null}
            </div>

            <Image.PreviewGroup items={gallery} preview={{ open: previewOpen, current: Math.max(0, gallery.indexOf(activeUrl)), onOpenChange: setPreviewOpen, onChange: (current) => setActiveUrl(gallery[current] || activeUrl), zIndex: 1200 }}>
                <div className="hidden">{gallery.map((url) => <Image key={url} src={url} alt="" />)}</div>
            </Image.PreviewGroup>

            <aside className="relative z-10 flex min-h-0 w-full flex-1 flex-col border-t border-stone-200 bg-white md:w-[400px] md:flex-none md:border-l md:border-t-0 dark:border-stone-800 dark:bg-stone-950">
                <div className="px-5 pt-4 md:pr-14 md:pt-5">
                    <p className="truncate text-sm font-medium text-stone-950 dark:text-stone-50">{prompt.author || prompt.category}</p>
                    <p className="mt-1 text-xs text-stone-400">
                        {date ? `${date} · ` : null}
                        {prompt.category}
                    </p>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5 px-5">
                    {prompt.tags.filter(isBrowseablePromptTag).map((tag) => (
                        <span key={tag} className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] text-stone-600 dark:bg-white/10 dark:text-stone-300">
                            {tag}
                        </span>
                    ))}
                </div>

                <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
                    <h3 className="text-sm font-medium text-stone-950 dark:text-stone-50">{t("prompts.generationParams")}</h3>
                    <div className="mt-4">
                        <span className="text-xs text-stone-400">{t("prompts.promptLabel")}</span>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-stone-800 dark:text-stone-200">{prompt.prompt}</p>
                    </div>
                    {prompt.description ? <p className="mt-4 text-sm leading-6 text-stone-500 dark:text-stone-400">{prompt.description}</p> : null}
                    {params.length > 0 ? (
                        <dl className="mt-5 grid gap-2 text-xs text-stone-500">
                            {params.map(([label, value]) => (
                                <div key={label} className="flex justify-between gap-4">
                                    <dt>{label}</dt>
                                    <dd className="text-stone-800 dark:text-stone-200">{value}</dd>
                                </div>
                            ))}
                        </dl>
                    ) : null}
                </div>

                <div className="flex justify-end gap-2 border-t border-stone-200 p-3 md:p-4 dark:border-stone-800">
                    {onSaveAsset ? (
                        <Button icon={<FolderPlus className="size-4" />} onClick={() => onSaveAsset(prompt)}>
                            {t("common.addToAssets")}
                        </Button>
                    ) : null}
                    <Button type="primary" icon={<Copy className="size-4" />} onClick={() => onCopy(prompt.prompt)}>
                        {t("common.copyPrompt")}
                    </Button>
                </div>
            </aside>
        </div>,
        document.body,
    );
}

function uniqueUrls(urls: string[]) {
    return [...new Set(urls.filter(Boolean))];
}
