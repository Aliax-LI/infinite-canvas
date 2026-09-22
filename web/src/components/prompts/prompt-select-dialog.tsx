import { type UIEvent, useEffect, useState } from "react";
import { App, Empty, Modal, Spin } from "antd";
import { useTranslation } from "react-i18next";

import { ALL_PROMPTS_OPTION } from "@/services/api/prompts";
import { useCopyText } from "@/hooks/use-copy-text";
import { PromptCard } from "./prompt-card";
import { PromptListFilters } from "./prompt-list-filters";
import { usePromptList } from "./use-prompt-list";

export function PromptSelectDialog({ open, onOpenChange, onSelect }: { open: boolean; onOpenChange: (open: boolean) => void; onSelect: (prompt: string) => void }) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const copyText = useCopyText();
    const [keyword, setKeyword] = useState("");
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [selectedCategory, setSelectedCategory] = useState(ALL_PROMPTS_OPTION);
    const { query, items, tags: promptTags, categories, total, loadingDeferred } = usePromptList({ keyword, tags: selectedTags, category: selectedCategory, enabled: open });
    const selectPrompt = (prompt: string) => {
        onSelect(prompt);
        onOpenChange(false);
    };

    useEffect(() => {
        if (query.isError) message.error(query.error instanceof Error ? query.error.message : t("prompts.loadFailed"));
    }, [message, query.error, query.isError, t]);

    const handleListScroll = (event: UIEvent<HTMLDivElement>) => {
        const target = event.currentTarget;
        if (query.hasNextPage && !query.isFetchingNextPage && target.scrollTop + target.clientHeight >= target.scrollHeight - 160) void query.fetchNextPage();
    };

    const searching = query.isFetching && !query.isFetchingNextPage;

    return (
        <Modal title={t("prompts.library")} open={open} onCancel={() => onOpenChange(false)} footer={null} width={960} centered>
            <div className="flex h-[62dvh] min-h-0 flex-col gap-4" data-canvas-no-zoom onWheelCapture={(event) => event.stopPropagation()}>
                <PromptListFilters autoFocus={open} keyword={keyword} onKeywordChange={setKeyword} keywordPlaceholder={t("prompts.search")} category={selectedCategory} onCategoryChange={setSelectedCategory} categories={categories} tags={selectedTags} onTagsChange={setSelectedTags} tagOptions={promptTags} />
                <p className="text-xs text-stone-500 dark:text-stone-400">{loadingDeferred ? t("prompts.loadingCatalog") : searching ? t("prompts.searching") : t("prompts.total", { count: total })}</p>
                <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto pr-2" data-canvas-no-zoom onScroll={handleListScroll} onWheelCapture={(event) => event.stopPropagation()}>
                    {query.isLoading && items.length === 0 ? (
                        <div className="flex h-40 items-center justify-center">
                            <Spin />
                        </div>
                    ) : null}
                    <div className="columns-2 gap-3 lg:columns-3 [&>*]:mb-3">
                        {items.map((item) => (
                            <PromptCard key={`${item.sourceId}:${item.id}`} item={item} onOpen={() => selectPrompt(item.prompt)} onCopy={() => { copyText(item.prompt, t("common.promptCopied")); }} />
                        ))}
                    </div>
                    {(!query.isLoading || items.length > 0) && items.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("prompts.empty")} className="py-8" /> : null}
                    {query.isFetchingNextPage ? (
                        <div className="py-4 text-center">
                            <Spin size="small" />
                        </div>
                    ) : null}
                </div>
            </div>
        </Modal>
    );
}
