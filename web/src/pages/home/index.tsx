import { ArrowRight } from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect, useMemo, useState } from "react";
import { Button, Image, Tag } from "antd";
import { useNavigate } from "react-router-dom";

import { fetchPrompts, type Prompt } from "@/services/api/prompts";
import { promptImageFallback } from "@/components/prompts/prompt-image";
import { navigationTools } from "@/constant/navigation-tools";
import { cn } from "@/lib/utils";

const fallbackPrompts: Prompt[] = [
    { id: "home-local-1", title: "现实中的名人", prompt: "山姆·奥特曼、唐纳德·特朗普和埃隆·马斯克在一家繁忙电影院的后台一起工作", tags: ["摄影", "照片级写实"], category: "local", githubUrl: "", coverUrl: "", preview: "", createdAt: "", updatedAt: "" },
    { id: "home-local-2", title: "便利店夜景", prompt: "在深夜的霓虹便利店门口生成一张带故事感的城市街头多人合影", tags: ["摄影", "街头"], category: "local", githubUrl: "", coverUrl: "", preview: "", createdAt: "", updatedAt: "" },
    { id: "home-local-3", title: "手写笔记本照片", prompt: "一张摊开的笔记本平放在桌面，页面写满手写笔记、旁边有咖啡和便签", tags: ["摄影", "生活方式"], category: "local", githubUrl: "", coverUrl: "", preview: "", createdAt: "", updatedAt: "" },
    { id: "home-local-4", title: "米粒微型文字", prompt: "一粒米上写着极小却清晰的文字，微距镜头，浅景深，干净背景", tags: ["微距", "文字"], category: "local", githubUrl: "", coverUrl: "", preview: "", createdAt: "", updatedAt: "" },
    { id: "home-local-5", title: "360 等距柱状全景图", prompt: "生成一张可循环衔接的 360 等距柱状全景图，适合沉浸式空间预览", tags: ["全景", "空间"], category: "local", githubUrl: "", coverUrl: "", preview: "", createdAt: "", updatedAt: "" },
    { id: "home-local-6", title: "游戏宣传画面", prompt: "一张有电影感的游戏宣传截图，角色站在雨夜街角，远处有霓虹灯和车辆光轨", tags: ["游戏", "娱乐"], category: "local", githubUrl: "", coverUrl: "", preview: "", createdAt: "", updatedAt: "" },
    { id: "home-local-7", title: "复古海滨游戏画面", prompt: "阳光海滨城市街道，一辆敞篷车经过棕榈树，画面像高质量游戏截图", tags: ["游戏", "复古"], category: "local", githubUrl: "", coverUrl: "", preview: "", createdAt: "", updatedAt: "" },
    { id: "home-local-8", title: "电影灯光人物剧照", prompt: "两位人物站在夜晚城市街头，警灯和车灯形成强烈电影级氛围", tags: ["电影", "人物"], category: "local", githubUrl: "", coverUrl: "", preview: "", createdAt: "", updatedAt: "" },
];

const fallbackStyles = [
    { background: "linear-gradient(135deg, #17231f 0%, #235245 58%, #5fd2aa 100%)", color: "#c8f7e6" },
    { background: "linear-gradient(135deg, #1c1917 0%, #78350f 54%, #f59e0b 100%)", color: "#fde68a" },
    { background: "linear-gradient(135deg, #1e293b 0%, #475569 58%, #cbd5e1 100%)", color: "#e2e8f0" },
    { background: "linear-gradient(135deg, #111827 0%, #1d4ed8 62%, #67e8f9 100%)", color: "#bfdbfe" },
    { background: "linear-gradient(135deg, #1f1a2e 0%, #7c2d12 52%, #fb7185 100%)", color: "#ffe4e6" },
    { background: "linear-gradient(135deg, #0f172a 0%, #3b0764 55%, #22d3ee 100%)", color: "#e0f2fe" },
] satisfies CSSProperties[];

function Highlighter({ action, color, children }: { action: "highlight" | "underline"; color: string; children: ReactNode }) {
    return (
        <span className="relative inline-block px-1">
            {action === "highlight" ? (
                <span className="absolute inset-x-0 bottom-0 top-1 rounded-sm opacity-45" style={{ backgroundColor: color }} />
            ) : (
                <span className="absolute inset-x-0 bottom-0 h-1 rounded-full opacity-80" style={{ backgroundColor: color }} />
            )}
            <span className="relative font-medium text-stone-800 dark:text-stone-200">{children}</span>
        </span>
    );
}

export default function IndexPage() {
    const navigate = useNavigate();
    const [primaryTool] = navigationTools;
    const [promptShowcase, setPromptShowcase] = useState<Prompt[]>(fallbackPrompts);
    const [failedCoverIds, setFailedCoverIds] = useState<Set<string>>(new Set());
    const [previewPromptId, setPreviewPromptId] = useState("");
    const [previewOpen, setPreviewOpen] = useState(false);
    const previewItems = useMemo(() => promptShowcase.map((item, index) => ({ ...item, previewCoverUrl: item.coverUrl && !failedCoverIds.has(item.id) ? item.coverUrl : promptImageFallback(item.title, index) })), [failedCoverIds, promptShowcase]);
    const previewIndex = Math.max(0, previewItems.findIndex((item) => item.id === previewPromptId));

    useEffect(() => {
        void fetchPrompts({ pageSize: 12 })
            .then((data) => setPromptShowcase(data.items.length ? data.items : fallbackPrompts))
            .catch(() => setPromptShowcase(fallbackPrompts));
    }, []);

    function openPreview(item: Prompt) {
        setPreviewPromptId(item.id);
        setPreviewOpen(true);
    }

    return (
        <main className="relative h-full overflow-y-auto bg-background bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] text-stone-950 dark:bg-[radial-gradient(rgba(245,245,244,.18)_1px,transparent_1px)] dark:text-stone-100">
            <section className="relative mx-auto min-h-[calc(100vh-4rem)] max-w-7xl overflow-hidden px-6">
                <div className="pointer-events-none absolute left-[15%] top-24 size-20 rounded-full border border-dashed border-stone-200 dark:border-stone-800" />
                <div className="pointer-events-none absolute right-[23%] top-[48%] size-20 rounded-full border border-dashed border-stone-200 dark:border-stone-800" />

                <div className="relative flex min-h-[620px] flex-col items-center justify-center pt-10 text-center">
                    <h1 className="ai-title-aurora max-w-5xl text-balance text-5xl font-semibold tracking-normal sm:text-7xl lg:text-8xl">无限画布</h1>
                    <p className="mt-8 max-w-3xl text-balance text-lg leading-8 text-stone-500 dark:text-stone-400">
                        在
                        <Highlighter action="underline" color="#FF9800">
                            无限画布
                        </Highlighter>
                        中生成、连接和重组
                        <Highlighter action="highlight" color="#87CEFA">
                            图片、文字与图形
                        </Highlighter>
                        ，让创作从单次生成变成连续推演。
                    </p>
                    <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                        <Button type="primary" size="large" onClick={() => navigate(`/${primaryTool.slug}`)} icon={<ArrowRight className="size-4" />} iconPlacement="end">
                            开始使用
                        </Button>
                        <Button size="large" onClick={() => navigate("/canvas")}>
                            打开画布
                        </Button>
                    </div>
                </div>

                <section className="relative mx-auto mb-20 max-w-6xl border-t border-stone-200 pt-12 dark:border-stone-800">
                    <div className="mb-8 grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-start">
                        <div />
                        <div className="max-w-2xl text-center">
                            <h2 className="text-3xl font-semibold text-stone-950 dark:text-stone-100">沉淀每一次好结果</h2>
                            <p className="mt-3 text-base leading-7 text-stone-500 dark:text-stone-400">收藏稳定出图的提示词、参考风格和结果图片，让下一次创作从已有经验开始。</p>
                        </div>
                        <Button type="link" onClick={() => navigate("/prompts")} className="justify-self-center md:justify-self-end" icon={<ArrowRight className="size-4" />} iconPlacement="end">
                            查看提示词库
                        </Button>
                    </div>
                    <div className="grid auto-rows-[210px] gap-4 md:grid-cols-4">
                        {promptShowcase.map((item, index) => (
                            <PromptShowcaseCard
                                key={item.id}
                                item={item}
                                index={index}
                                imageFailed={failedCoverIds.has(item.id)}
                                onImageError={() => setFailedCoverIds((current) => new Set(current).add(item.id))}
                                onPreview={() => openPreview(item)}
                            />
                        ))}
                    </div>
                </section>
            </section>
            <Image.PreviewGroup
                preview={{
                    open: previewOpen,
                    current: previewIndex,
                    onOpenChange: setPreviewOpen,
                    onChange: (index) => setPreviewPromptId(previewItems[index]?.id || ""),
                }}
            >
                <div className="hidden">
                    {previewItems.map((item) => (
                        <Image key={item.id} src={item.previewCoverUrl} alt={item.title} />
                    ))}
                </div>
            </Image.PreviewGroup>
        </main>
    );
}

function PromptShowcaseCard({ item, index, imageFailed, onImageError, onPreview }: { item: Prompt; index: number; imageFailed: boolean; onImageError: () => void; onPreview: () => void }) {
    const hasImage = Boolean(item.coverUrl) && !imageFailed;
    const style = fallbackStyles[index % fallbackStyles.length];

    return (
        <button
            type="button"
            onClick={onPreview}
            className={cn(
                "group relative cursor-pointer overflow-hidden rounded-lg border border-stone-200 bg-stone-100 text-left outline-none transition duration-200 hover:-translate-y-0.5 hover:border-stone-300 focus-visible:ring-2 focus-visible:ring-stone-400 dark:border-stone-800 dark:bg-stone-900 dark:hover:border-stone-700",
                index === 0 && "md:col-span-2 md:row-span-2",
                index === 3 && "md:col-span-2",
            )}
        >
            {hasImage ? <img src={item.coverUrl} alt={item.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" loading="lazy" referrerPolicy="no-referrer" onError={onImageError} /> : <PromptFallbackCover title={item.title} index={index} style={style} />}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/78 via-black/42 to-transparent p-4 text-white">
                <div className="mb-2 flex flex-wrap gap-1.5">
                    {item.tags.slice(0, 2).map((tag) => (
                        <Tag key={tag} variant="filled" className="m-0 border-0 bg-white/15 text-[11px] text-white backdrop-blur">
                            {tag}
                        </Tag>
                    ))}
                </div>
                <h3 className="text-sm font-medium">{item.title}</h3>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/75">{item.prompt}</p>
            </div>
        </button>
    );
}

function PromptFallbackCover({ title, index, style }: { title: string; index: number; style: CSSProperties }) {
    return (
        <div className="absolute inset-0 overflow-hidden" style={style}>
            <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(255,255,255,.22)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.18)_1px,transparent_1px)] [background-size:28px_28px]" />
            <div className="absolute -right-10 -top-10 size-40 rounded-full border border-white/30" />
            <div className="absolute bottom-10 left-8 h-16 w-28 rotate-[-12deg] rounded-lg border border-white/25 bg-white/10 backdrop-blur" />
            <div className="absolute right-8 top-12 grid size-16 place-items-center rounded-lg border border-white/25 bg-black/10 text-lg font-semibold text-white/85">{String(index + 1).padStart(2, "0")}</div>
            <div className="absolute left-6 top-7 max-w-[72%] text-balance text-xl font-semibold leading-tight text-white/90">{title}</div>
        </div>
    );
}
