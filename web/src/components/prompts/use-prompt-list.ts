import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";

import { ALL_PROMPTS_OPTION, fetchPrompts, prefetchDeferredPromptSources } from "@/services/api/prompts";

export const PROMPT_PAGE_SIZE = 20;

export function usePromptList({ keyword, tags, category, enabled = true }: { keyword: string; tags: string[]; category: string; enabled?: boolean }) {
    const queryClient = useQueryClient();
    const [debouncedKeyword, setDebouncedKeyword] = useState(keyword);
    const [loadingDeferred, setLoadingDeferred] = useState(false);
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedKeyword(keyword), 300);
        return () => clearTimeout(timer);
    }, [keyword]);
    const query = useInfiniteQuery({
        queryKey: ["prompts", debouncedKeyword, tags, category],
        queryFn: ({ pageParam }) => fetchPrompts({ keyword: debouncedKeyword, tag: tags, category, page: pageParam, pageSize: PROMPT_PAGE_SIZE }),
        initialPageParam: 1,
        getNextPageParam: (lastPage, pages) => (pages.reduce((total, page) => total + page.items.length, 0) < lastPage.total ? pages.length + 1 : undefined),
        enabled,
        placeholderData: keepPreviousData,
    });
    useEffect(() => {
        if (!enabled || category !== ALL_PROMPTS_OPTION) return;
        let cancelled = false;
        setLoadingDeferred(true);
        void prefetchDeferredPromptSources()
            .then((changed) => {
                if (cancelled || !changed) return;
                return queryClient.invalidateQueries({ queryKey: ["prompts"] });
            })
            .finally(() => {
                if (!cancelled) setLoadingDeferred(false);
            });
        return () => {
            cancelled = true;
        };
    }, [category, enabled, queryClient]);
    const firstPage = query.data?.pages[0];
    return {
        query,
        items: useMemo(() => query.data?.pages.flatMap((page) => page.items) || [], [query.data?.pages]),
        tags: firstPage?.tags || [],
        categories: firstPage?.categories || [],
        total: firstPage?.total || 0,
        loadingDeferred,
    };
}
