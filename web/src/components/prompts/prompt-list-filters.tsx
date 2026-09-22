import { ChevronDown, Search, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Button, Dropdown, Input } from "antd";
import type { InputRef } from "antd";
import { useTranslation } from "react-i18next";

import { ALL_PROMPTS_OPTION, type PromptFilterOption } from "@/services/api/prompts";
import { cn } from "@/lib/utils";

export function PromptListFilters({
    keyword,
    onKeywordChange,
    keywordPlaceholder,
    category,
    onCategoryChange,
    categories,
    tags,
    onTagsChange,
    tagOptions,
    autoFocus = false,
    headerLeft,
}: {
    keyword: string;
    onKeywordChange: (value: string) => void;
    keywordPlaceholder: string;
    category: string;
    onCategoryChange: (value: string) => void;
    categories: PromptFilterOption[];
    tags: string[];
    onTagsChange: (value: string[]) => void;
    tagOptions: string[];
    autoFocus?: boolean;
    headerLeft?: ReactNode;
}) {
    const { t } = useTranslation();
    const inputRef = useRef<InputRef>(null);
    const hasFilters = Boolean(keyword.trim() || category !== ALL_PROMPTS_OPTION || tags.length);
    const visibleTags = tagOptions.slice(0, 24);
    for (const tag of tags) if (!visibleTags.includes(tag)) visibleTags.push(tag);
    const selectedCategory = categories.find((option) => option.value === category);
    const categoryLabel = category === ALL_PROMPTS_OPTION ? t("common.all") : selectedCategory?.label || t("prompts.category");

    useEffect(() => {
        if (!autoFocus) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
            const target = event.target as HTMLElement | null;
            if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
            event.preventDefault();
            inputRef.current?.focus();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [autoFocus]);

    const clearFilters = () => {
        onKeywordChange("");
        onCategoryChange(ALL_PROMPTS_OPTION);
        onTagsChange([]);
    };

    return (
        <div className="flex flex-col gap-3">
            <div className={cn("flex flex-col gap-2.5 sm:flex-row sm:items-center", headerLeft ? "sm:justify-between" : "")}>
                {headerLeft ? <div className="shrink-0">{headerLeft}</div> : null}
                <div className={cn("flex items-center gap-2", headerLeft ? "w-full sm:w-auto" : "w-full")}>
                    <Input
                        ref={inputRef}
                        autoFocus={autoFocus}
                        allowClear
                        className={cn("prompt-search-input !h-10 !rounded-xl !border-stone-200 bg-stone-50/80 hover:bg-stone-50/90 dark:!border-stone-700 dark:bg-stone-900/40", headerLeft ? "w-full sm:w-72 md:w-80 lg:w-96" : "flex-1")}
                        prefix={<Search className="size-4 text-stone-400" />}
                        suffix={
                            !keyword ? (
                                <kbd className="hidden sm:inline-block rounded border border-stone-200/80 bg-stone-100/80 px-1.5 py-0.5 text-[10px] font-medium text-stone-400 dark:border-stone-700 dark:bg-stone-800">
                                    /
                                </kbd>
                            ) : null
                        }
                        value={keyword}
                        placeholder={keywordPlaceholder}
                        onChange={(event) => onKeywordChange(event.target.value)}
                    />
                    <Dropdown
                        trigger={["click"]}
                        menu={{
                            selectable: true,
                            selectedKeys: [category],
                            items: [
                                { key: ALL_PROMPTS_OPTION, label: t("common.all") },
                                ...categories.map((option) => ({ key: option.value, label: option.label })),
                            ],
                            onClick: ({ key }) => onCategoryChange(key),
                        }}
                    >
                        <Button type="default" className="!h-10 shrink-0 justify-between gap-2 !rounded-xl border-stone-200 bg-stone-50/80 px-3 font-normal dark:border-stone-700 dark:bg-stone-900/40 sm:min-w-[8.5rem]">
                            <span className="truncate text-left text-xs sm:text-sm">
                                <span className="text-stone-500 dark:text-stone-400">{t("prompts.category")}</span>
                                <span className="mx-1 text-stone-300 dark:text-stone-600">·</span>
                                <span className="text-stone-900 dark:text-stone-100">{categoryLabel}</span>
                            </span>
                            <ChevronDown className="size-3.5 shrink-0 text-stone-400" />
                        </Button>
                    </Dropdown>
                </div>
            </div>

            <div className="relative min-w-0">
                <div className="hover-scrollbar -mx-1 flex items-center gap-1.5 overflow-x-auto overscroll-x-contain px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <TagChip active={tags.length === 0} onClick={() => onTagsChange([])}>
                        {t("common.all")}
                    </TagChip>
                    {visibleTags.map((tag) => (
                        <TagChip key={tag} active={tags.includes(tag)} onClick={() => onTagsChange(tags.includes(tag) ? tags.filter((item) => item !== tag) : [...tags, tag])}>
                            {tag}
                        </TagChip>
                    ))}
                    {hasFilters ? (
                        <button
                            type="button"
                            onClick={clearFilters}
                            className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-xs text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
                        >
                            <X className="size-3" />
                            <span>{t("prompts.clearFilters")}</span>
                        </button>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

function TagChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "prompt-tag-chip shrink-0 cursor-pointer whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-all",
                active
                    ? "prompt-tag-chip--active !border-stone-900 !bg-stone-900 !text-white shadow-xs dark:!border-stone-100 dark:!bg-stone-100 dark:!text-stone-900"
                    : "border-transparent bg-stone-100/90 text-stone-600 hover:bg-stone-200/80 hover:text-stone-900 dark:bg-stone-800/80 dark:text-stone-300 dark:hover:bg-stone-700/80 dark:hover:text-stone-100",
            )}
        >
            <span className={cn(active ? "!text-white dark:!text-stone-900" : "")}>{children}</span>
        </button>
    );
}
