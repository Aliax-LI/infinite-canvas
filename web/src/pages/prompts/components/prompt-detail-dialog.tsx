import { Copy, FolderPlus } from "lucide-react";
import { useMemo } from "react";
import { Button, Modal, Space, Tag } from "antd";

import { extractPromptPreviewImages, PromptImage } from "@/components/prompts/prompt-image";
import { formatPromptDate, type Prompt } from "@/services/api/prompts";

export function PromptDetailDialog({ prompt, onClose, onCopy, onSaveAsset }: { prompt: Prompt | null; onClose: () => void; onCopy: (prompt: string) => void; onSaveAsset?: (prompt: Prompt) => void }) {
    const previewImages = useMemo(() => {
        if (!prompt) return [];
        return Array.from(new Set([prompt.coverUrl, ...extractPromptPreviewImages(prompt.preview)].filter(Boolean)));
    }, [prompt]);

    return (
        <>
            <Modal title={prompt?.title} open={Boolean(prompt)} onCancel={onClose} footer={null} width={860}>
                {prompt ? (
                    <>
                        <div className="grid gap-5 md:grid-cols-[300px_minmax(0,1fr)]">
                            <div className="space-y-3">
                                <div className="overflow-hidden rounded-lg">
                                    <PromptImage src={prompt.coverUrl} title={prompt.title} seed={previewImages.length} />
                                </div>
                                {previewImages.length > 1 ? (
                                    <div className="grid grid-cols-3 gap-2">
                                        {previewImages.slice(1).map((image, index) => (
                                            <div key={image} className="overflow-hidden rounded-md border border-stone-200 bg-stone-100 dark:border-stone-800 dark:bg-stone-900">
                                                <PromptImage src={image} title={`${prompt.title} 预览 ${index + 1}`} seed={index + 1} className="aspect-square w-full object-cover" />
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                                {prompt.preview ? <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-stone-100 p-3 text-xs leading-5 text-stone-600 dark:bg-stone-900 dark:text-stone-300">{prompt.preview}</pre> : null}
                            </div>
                            <div className="min-w-0">
                                <div className="flex flex-wrap gap-1.5">
                                    {prompt.tags.map((tag) => (
                                        <Tag key={tag} className="m-0">
                                            {tag}
                                        </Tag>
                                    ))}
                                </div>
                                <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-stone-800 dark:text-stone-300">{prompt.prompt}</p>
                                <div className="mt-4 text-xs text-stone-500 dark:text-stone-400">
                                    创建：{formatPromptDate(prompt.createdAt)} · 更新：{formatPromptDate(prompt.updatedAt)}
                                </div>
                                <Space wrap className="mt-5">
                                    <Button type="primary" icon={<Copy className="size-4" />} onClick={() => onCopy(prompt.prompt)}>
                                        复制提示词
                                    </Button>
                                    {onSaveAsset ? (
                                        <Button icon={<FolderPlus className="size-4" />} onClick={() => onSaveAsset(prompt)}>
                                            加入我的素材
                                        </Button>
                                    ) : null}
                                </Space>
                            </div>
                        </div>
                    </>
                ) : null}
            </Modal>
        </>
    );
}
