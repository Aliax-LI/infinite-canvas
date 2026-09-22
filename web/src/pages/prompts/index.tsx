import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Empty, Spin } from "antd";
import { LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

import { PromptCard, PromptCardSkeleton } from "@/components/prompts/prompt-card";
import { PromptListFilters } from "@/components/prompts/prompt-list-filters";
import { usePromptList } from "@/components/prompts/use-prompt-list";
import { PromptDetailDialog } from "./components/prompt-detail-dialog";
import { useCopyText } from "@/hooks/use-copy-text";
import { useAssetStore } from "@/stores/use-asset-store";
import { ALL_PROMPTS_OPTION, type Prompt } from "@/services/api/prompts";

export default function PromptsPage() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const [titleKeyword, setTitleKeyword] = useState("");
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [selectedCategory, setSelectedCategory] = useState(ALL_PROMPTS_OPTION);
    const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
    const addAsset = useAssetStore((state) => state.addAsset);
    const copyText = useCopyText();
    const { query, items: promptItems, tags: promptTags, categories, total: totalPrompts, loadingDeferred } = usePromptList({ keyword: titleKeyword, tags: selectedTags, category: selectedCategory });
    const searching = loadingDeferred || (query.isFetching && !query.isFetchingNextPage);
    const hasFilters = Boolean(titleKeyword.trim() || selectedCategory !== ALL_PROMPTS_OPTION || selectedTags.length);
    const columnCount = useMasonryColumnCount();

    useEffect(() => {
        if (query.isError) message.error(query.error instanceof Error ? query.error.message : t("prompts.loadFailed"));
    }, [message, query.error, query.isError, t]);

    const savePromptAsset = (item: Prompt) => {
        addAsset({ kind: "text", title: item.title, coverUrl: item.coverUrl, tags: item.tags, source: item.category, data: { content: item.prompt }, metadata: { source: "prompt-library", promptId: item.id, githubUrl: item.githubUrl } });
        message.success(t("common.addedToAssets"));
    };

    const clearFilters = () => {
        setTitleKeyword("");
        setSelectedCategory(ALL_PROMPTS_OPTION);
        setSelectedTags([]);
    };

    const listRef = useRef<HTMLElement>(null);
    const loadMoreRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const root = listRef.current;
        const target = loadMoreRef.current;
        if (!root || !target) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (!entries[0]?.isIntersecting || !query.hasNextPage || query.isFetchingNextPage) return;
                void query.fetchNextPage();
            },
            { root, rootMargin: "240px 0px" },
        );
        observer.observe(target);
        return () => observer.disconnect();
    }, [query.fetchNextPage, query.hasNextPage, query.isFetchingNextPage]);

    return (
        <div className="flex h-full flex-col overflow-hidden bg-background text-stone-800 dark:text-stone-100">
            <div className="shrink-0 border-b border-stone-200/80 bg-background/95 px-4 py-3.5 backdrop-blur-xs dark:border-stone-800 sm:px-6">
                <div className="mx-auto w-full max-w-[1680px]">
                    <PromptListFilters
                        autoFocus
                        keyword={titleKeyword}
                        onKeywordChange={setTitleKeyword}
                        keywordPlaceholder={t("prompts.search")}
                        category={selectedCategory}
                        onCategoryChange={setSelectedCategory}
                        categories={categories}
                        tags={selectedTags}
                        onTagsChange={setSelectedTags}
                        tagOptions={promptTags}
                        headerLeft={
                            <div className="flex items-center gap-3">
                                <h1 className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-100 sm:text-2xl">{t("prompts.title")}</h1>
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100/90 px-2.5 py-0.5 text-xs font-medium tabular-nums text-stone-600 dark:bg-stone-800/80 dark:text-stone-300">
                                    {loadingDeferred ? (
                                        <>
                                            <LoaderCircle className="size-3 animate-spin text-stone-400" />
                                            <span>{t("prompts.loadingCatalog")}</span>
                                        </>
                                    ) : searching ? (
                                        <>
                                            <LoaderCircle className="size-3 animate-spin text-stone-400" />
                                            <span>{t("prompts.searching")}</span>
                                        </>
                                    ) : (
                                        <span>{t("prompts.total", { count: totalPrompts })}</span>
                                    )}
                                </span>
                            </div>
                        }
                    />
                </div>
            </div>
            <main ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
                <div className="mx-auto w-full max-w-[1680px]">
                    {query.isLoading && promptItems.length === 0 ? (
                        <PromptGridSkeleton columnCount={columnCount} count={columnCount * 2} />
                    ) : null}
                    {!query.isLoading || promptItems.length > 0 ? (
                        <PromptGrid
                            items={promptItems}
                            columnCount={columnCount}
                            loadingMore={query.isFetchingNextPage}
                            onOpen={setSelectedPrompt}
                            onCopy={(item) => copyText(item.prompt, t("common.promptCopied"))}
                            emptyText={t("prompts.empty")}
                            emptyAction={hasFilters ? <Button type="link" onClick={clearFilters}>{t("prompts.clearFilters")}</Button> : null}
                        />
                    ) : null}
                    <div ref={loadMoreRef} className="mt-8 text-center text-xs text-stone-400 dark:text-stone-500">
                        {query.isFetchingNextPage ? null : query.hasNextPage ? t("prompts.loadMore") : promptItems.length > 0 ? t("prompts.end") : null}
                    </div>
                </div>
            </main>

            <PromptDetailDialog prompt={selectedPrompt} onClose={() => setSelectedPrompt(null)} onCopy={(prompt) => copyText(prompt, t("common.promptCopied"))} onSaveAsset={savePromptAsset} />
        </div>
    );
}

const SKELETON_HEIGHTS = ["h-72", "h-84", "h-64", "h-80", "h-68", "h-76"];

function PromptGridSkeleton({ columnCount = 3, count = 9 }: { columnCount?: number; count?: number }) {
    const buckets = Array.from({ length: columnCount }, () => [] as number[]);
    for (let i = 0; i < count; i++) {
        buckets[i % columnCount].push(i);
    }
    return (
        <div className="flex items-start gap-4 sm:gap-5">
            {buckets.map((columnItems, columnIndex) => (
                <div key={columnIndex} className="flex min-w-0 flex-1 flex-col gap-4 sm:gap-5">
                    {columnItems.map((itemIndex) => (
                        <PromptCardSkeleton
                            key={itemIndex}
                            heightClass={SKELETON_HEIGHTS[(itemIndex + columnIndex) % SKELETON_HEIGHTS.length]}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}

function useMasonryColumnCount() {
    const [columnCount, setColumnCount] = useState(3);
    useEffect(() => {
        const update = () => {
            const width = window.innerWidth;
            setColumnCount(width >= 1600 ? 5 : width >= 1200 ? 4 : width >= 768 ? 3 : 2);
        };
        update();
        window.addEventListener("resize", update);
        return () => window.removeEventListener("resize", update);
    }, []);
    return columnCount;
}

function PromptGrid({
    items,
    columnCount,
    loadingMore = false,
    onOpen,
    onCopy,
    emptyText,
    emptyAction,
}: {
    items: Prompt[];
    columnCount: number;
    loadingMore?: boolean;
    onOpen: (item: Prompt) => void;
    onCopy: (item: Prompt) => void;
    emptyText: string;
    emptyAction?: ReactNode;
}) {
    const columns = useMemo(() => {
        const buckets = Array.from({ length: columnCount }, () => [] as Prompt[]);
        items.forEach((item, index) => buckets[index % columnCount].push(item));
        return buckets;
    }, [columnCount, items]);

    return (
        <div>
            <div className="flex items-start gap-4 sm:gap-5">
                {columns.map((columnItems, columnIndex) => (
                    <div key={columnIndex} className="flex min-w-0 flex-1 flex-col gap-4 sm:gap-5">
                        {columnItems.map((item) => (
                            <PromptCard key={`${item.sourceId}:${item.id}`} item={item} onOpen={() => onOpen(item)} onCopy={() => onCopy(item)} />
                        ))}
                        {loadingMore ? (
                            <PromptCardSkeleton
                                heightClass={SKELETON_HEIGHTS[(columnItems.length + columnIndex) % SKELETON_HEIGHTS.length]}
                            />
                        ) : null}
                    </div>
                ))}
            </div>
            {items.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<div className="grid justify-items-center gap-1"><span>{emptyText}</span>{emptyAction}</div>} className="py-20" /> : null}
        </div>
    );
}
