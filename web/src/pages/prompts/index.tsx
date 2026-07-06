import { FolderPlus, Search, X } from "lucide-react";
import { type UIEvent, useEffect, useState } from "react";
import { App, Button, Empty, Input, Spin, Tag } from "antd";

import { PromptCard } from "@/components/prompts/prompt-card";
import { usePromptList } from "@/components/prompts/use-prompt-list";
import { PromptDetailDialog } from "./components/prompt-detail-dialog";
import { useCopyText } from "@/hooks/use-copy-text";
import { cn } from "@/lib/utils";
import { useAssetStore } from "@/stores/use-asset-store";
import { ALL_PROMPTS_OPTION, type Prompt } from "@/services/api/prompts";

export default function PromptsPage() {
    const { message } = App.useApp();
    const [titleKeyword, setTitleKeyword] = useState("");
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [selectedCategory, setSelectedCategory] = useState(ALL_PROMPTS_OPTION);
    const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
    const addAsset = useAssetStore((state) => state.addAsset);
    const copyText = useCopyText();
    const { query, items: promptItems, tags: promptTags, categories: promptCategoryOptions, total: totalPrompts } = usePromptList({ keyword: titleKeyword, tags: selectedTags, category: selectedCategory });
    const activeFilterCount = (titleKeyword.trim() ? 1 : 0) + (selectedCategory !== ALL_PROMPTS_OPTION ? 1 : 0) + selectedTags.length;

    useEffect(() => {
        if (query.isError) {
            message.error(query.error instanceof Error ? query.error.message : "获取提示词失败");
        }
    }, [message, query.error, query.isError]);

    const toggleTag = (tag: string) => {
        if (tag === ALL_PROMPTS_OPTION) return setSelectedTags([]);
        setSelectedTags((items) => (items.includes(tag) ? items.filter((item) => item !== tag) : [...items, tag]));
    };
    const clearFilters = () => {
        setTitleKeyword("");
        setSelectedCategory(ALL_PROMPTS_OPTION);
        setSelectedTags([]);
    };

    const savePromptAsset = (item: Prompt) => {
        addAsset({ kind: "text", title: item.title, coverUrl: item.coverUrl, tags: item.tags, source: item.category, data: { content: item.prompt }, metadata: { source: "prompt-library", promptId: item.id, githubUrl: item.githubUrl } });
        message.success("已加入我的素材");
    };

    const handleListScroll = (event: UIEvent<HTMLDivElement>) => {
        const target = event.currentTarget;
        if (query.hasNextPage && !query.isFetchingNextPage && target.scrollTop + target.clientHeight >= target.scrollHeight - 160) {
            void query.fetchNextPage();
        }
    };

    return (
        <div className="flex h-full flex-col overflow-hidden bg-background text-stone-800 dark:text-stone-100">
            <main
                className="min-h-0 flex-1 overflow-y-auto bg-background bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] px-6 py-8 [background-size:16px_16px] dark:bg-[radial-gradient(rgba(245,245,244,.16)_1px,transparent_1px)]"
                onScroll={handleListScroll}
            >
                <div className="mx-auto max-w-7xl pb-8">
                    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">
                        <div>
                            <div className="inline-flex items-center rounded-md border border-stone-200 bg-white/80 px-2.5 py-1 text-xs font-medium text-stone-500 shadow-sm dark:border-stone-800 dark:bg-stone-950/80 dark:text-stone-400">
                                {totalPrompts} 条提示词
                            </div>
                            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-stone-950 dark:text-stone-100">提示词仓库</h1>
                            <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-500 dark:text-stone-400">沉淀可复用的图像提示词、参考风格和创作案例。</p>
                        </div>
                        <div className="rounded-lg border border-stone-200 bg-white/90 p-2 shadow-sm backdrop-blur dark:border-stone-800 dark:bg-stone-950/80">
                            <Input size="large" className="w-full" prefix={<Search className="size-4 text-stone-400" />} value={titleKeyword} placeholder="按标题查询" onChange={(event) => setTitleKeyword(event.target.value)} />
                        </div>
                    </div>
                    {query.isLoading ? (
                        <div className="flex h-60 items-center justify-center">
                            <Spin />
                        </div>
                    ) : null}
                    {!query.isLoading ? (
                        <div className="sticky top-0 z-10 mt-6 rounded-lg border border-stone-200 bg-background/95 p-4 shadow-sm backdrop-blur dark:border-stone-800">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                                <div className="text-xs font-medium text-stone-500 dark:text-stone-400">
                                    当前显示 {promptItems.length} / {totalPrompts}
                                </div>
                                {activeFilterCount ? (
                                    <Button size="small" type="text" icon={<X className="size-3.5" />} onClick={clearFilters}>
                                        清空筛选
                                    </Button>
                                ) : null}
                            </div>
                            <div className="grid gap-3 text-left">
                                <div className="grid gap-2 sm:grid-cols-[56px_minmax(0,1fr)] sm:items-start">
                                    <div className="pt-2 text-xs font-medium text-stone-500 dark:text-stone-400">分类</div>
                                    <div className="hide-scrollbar flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
                                        {promptCategoryOptions.map((category) => (
                                            <Tag.CheckableTag key={category} checked={selectedCategory === category} className={cn("prompt-filter-tag", selectedCategory === category && "is-active")} onChange={() => setSelectedCategory(category)}>
                                                {category}
                                            </Tag.CheckableTag>
                                        ))}
                                    </div>
                                </div>
                                <div className="grid gap-2 sm:grid-cols-[56px_minmax(0,1fr)] sm:items-start">
                                    <div className="pt-2 text-xs font-medium text-stone-500 dark:text-stone-400">标签</div>
                                    <div className="hide-scrollbar flex max-h-28 gap-2 overflow-auto pb-1 sm:flex-wrap sm:pb-0">
                                        {promptTags.map((tag) => (
                                            <Tag.CheckableTag
                                                key={tag}
                                                checked={tag === ALL_PROMPTS_OPTION ? selectedTags.length === 0 : selectedTags.includes(tag)}
                                                className={cn("prompt-filter-tag", (tag === ALL_PROMPTS_OPTION ? selectedTags.length === 0 : selectedTags.includes(tag)) && "is-active")}
                                                onChange={() => toggleTag(tag)}
                                            >
                                                {tag}
                                            </Tag.CheckableTag>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>

                {!query.isLoading ? (
                    <div>
                        <div className="mx-auto grid max-w-7xl gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                            {promptItems.map((item) => (
                                <PromptCard
                                    key={item.id}
                                    item={item}
                                    onOpen={() => setSelectedPrompt(item)}
                                    onCopy={() => copyText(item.prompt, "提示词已复制")}
                                    extraAction={
                                        <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => savePromptAsset(item)}>
                                            加入我的素材
                                        </Button>
                                    }
                                />
                            ))}
                        </div>
                        {promptItems.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有找到匹配的提示词" className="py-16" /> : null}
                        <div className="mx-auto mt-6 max-w-7xl text-center text-xs text-stone-500 dark:text-stone-400">
                            {query.isFetchingNextPage ? "加载中..." : query.hasNextPage ? "继续向下滚动加载更多" : promptItems.length > 0 ? "已经到底了" : null}
                        </div>
                    </div>
                ) : null}
            </main>

            <PromptDetailDialog prompt={selectedPrompt} onClose={() => setSelectedPrompt(null)} onCopy={(prompt) => copyText(prompt, "提示词已复制")} onSaveAsset={savePromptAsset} />
        </div>
    );
}
