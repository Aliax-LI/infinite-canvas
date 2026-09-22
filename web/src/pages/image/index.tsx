import { AlertCircle, ArrowLeft, ArrowRight, ArrowUp, BookOpen, Check, CheckSquare, ClipboardPaste, Copy, CornerDownLeft, Download, Eye, FolderPlus, History, ImagePlus, LoaderCircle, PenLine, Plus, RotateCcw, SlidersHorizontal, Trash2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type DragEvent } from "react";
import { createPortal } from "react-dom";
import { App, Button, Checkbox, Dropdown, Image, Input, Modal, Tag, Tooltip, Typography } from "antd";
import localforage from "localforage";
import { saveAs } from "file-saver";
import { useTranslation } from "react-i18next";

import { CanvasImageSettingsPopover } from "@/components/canvas/canvas-image-settings-popover";
import { ModelPicker } from "@/components/model-picker";
import { PromptSelectDialog } from "@/components/prompts/prompt-select-dialog";
import { AssetPickerModal, type InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import { imageReferenceLabel } from "@/lib/image-reference-prompt";
import { modelOptionLabel, modelOptionName, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { nanoid } from "nanoid";
import { formatDuration } from "@/lib/image-utils";
import { inferMediaRatio } from "@/lib/media-size";
import { requestEdit, requestGeneration } from "@/services/api/image";
import { deleteStoredImages, ensureImagePreview, getImagePreviewRevision, previewUrlFor, resolveImageUrl, subscribeImagePreviews, uploadImage } from "@/services/image-storage";
import { useAssetStore } from "@/stores/use-asset-store";
import { useWorkbenchAgentStore } from "@/stores/use-workbench-agent-store";
import type { ReferenceImage } from "@/types/image";
import { cn } from "@/lib/utils";
import i18n from "@/i18n";

type GeneratedImage = {
    id: string;
    dataUrl: string;
    storageKey?: string;
    durationMs: number;
    width: number;
    height: number;
    bytes: number;
    mimeType?: string;
};

type GenerationResult = {
    id: string;
    status: "pending" | "success" | "failed";
    image?: GeneratedImage;
    error?: string;
};

type GenerationLog = {
    id: string;
    createdAt: number;
    title: string;
    prompt: string;
    time: string;
    model: string;
    config: GenerationLogConfig;
    references: ReferenceImage[];
    durationMs: number;
    successCount: number;
    failCount: number;
    imageCount: number;
    size: string;
    quality: string;
    status: "success" | "failed";
    images: GeneratedImage[];
};

type GenerationLogConfig = Pick<AiConfig, "model" | "imageModel" | "quality" | "size" | "count">;

type UpdateAiConfig = <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;

const LOG_STORE_KEY = "infinite-canvas:image_generation_logs";
const logStore = localforage.createInstance({ name: "infinite-canvas", storeName: "image_generation_logs" });

export default function ImagePage() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const threadRef = useRef<HTMLDivElement>(null);
    const dragDepthRef = useRef(0);
    const config = useConfigStore((state) => state.config);
    const effectiveConfig = useEffectiveConfig();
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const addAsset = useAssetStore((state) => state.addAsset);
    const [prompt, setPrompt] = useState("");
    const [references, setReferences] = useState<ReferenceImage[]>([]);
    const [results, setResults] = useState<GenerationResult[]>([]);
    const [logs, setLogs] = useState<GenerationLog[]>([]);
    const [running, setRunning] = useState(false);
    const [logsOpen, setLogsOpen] = useState(false);
    const [promptDialogOpen, setPromptDialogOpen] = useState(false);
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [startedAt, setStartedAt] = useState(0);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
    const [previewLog, setPreviewLog] = useState<GenerationLog | null>(null);
    const [liveTurn, setLiveTurn] = useState<{ prompt: string; references: ReferenceImage[] } | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [isReferenceDragActive, setIsReferenceDragActive] = useState(false);
    const [autoRunToken, setAutoRunToken] = useState(0);
    const imageCommand = useWorkbenchAgentStore((state) => state.imageCommand);
    const clearImageCommand = useWorkbenchAgentStore((state) => state.clearImageCommand);
    const updateAgentTask = useWorkbenchAgentStore((state) => state.updateTask);
    const processedCommandRef = useRef(0);
    const agentTaskIdRef = useRef<string | undefined>(undefined);

    const model = effectiveConfig.imageModel || effectiveConfig.model;
    const canGenerate = Boolean(prompt.trim());
    const generationCount = Math.max(1, Math.min(10, Number(config.count) || 1));

    const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

    const scrollToBottom = (smooth = true) => {
        const node = threadRef.current;
        if (!node) return;
        node.scrollTo({ top: node.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    };

    useEffect(() => {
        const vv = window.visualViewport;
        if (!vv) return;

        const updateViewport = () => {
            const heightDiff = window.innerHeight - vv.height;
            const isOpen = heightDiff > 120;
            setIsKeyboardOpen(isOpen);
            if (isOpen) {
                requestAnimationFrame(() => {
                    scrollToBottom(true);
                });
            }
        };

        vv.addEventListener("resize", updateViewport);
        vv.addEventListener("scroll", updateViewport);
        return () => {
            vv.removeEventListener("resize", updateViewport);
            vv.removeEventListener("scroll", updateViewport);
        };
    }, []);

    useEffect(() => {
        if (!running || !startedAt) return;
        const timer = window.setInterval(() => setElapsedMs(performance.now() - startedAt), 1000);
        return () => window.clearInterval(timer);
    }, [running, startedAt]);

    useEffect(() => {
        void refreshLogs();
    }, []);

    useEffect(() => {
        scrollToBottom(running);
    }, [logs.length, liveTurn, results, running]);

    const addReferences = async (files?: FileList | null) => {
        const imageFiles = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
        const nextReferences = await Promise.all(
            imageFiles.map(async (file) => {
                const image = await uploadImage(file);
                return { id: nanoid(), name: file.name, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey };
            }),
        );
        setReferences((value) => [...value, ...nextReferences]);
    };

    const addReferencesFromClipboard = async () => {
        try {
            const items = await navigator.clipboard.read();
            const blobs = await Promise.all(items.flatMap((item) => item.types.filter((type) => type.startsWith("image/")).map((type) => item.getType(type))));
            if (!blobs.length) {
                message.error(t("imageWorkbench.clipboardEmpty"));
                return;
            }
            const nextReferences = await Promise.all(
                blobs.map(async (blob, index) => {
                    const image = await uploadImage(blob);
                    return { id: nanoid(), name: `clipboard-${index + 1}.png`, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey };
                }),
            );
            setReferences((value) => [...value, ...nextReferences]);
            message.success(t("imageWorkbench.clipboardAdded", { count: nextReferences.length }));
        } catch {
            message.error(t("imageWorkbench.clipboardEmpty"));
        }
    };

    const generate = async () => {
        const agentTaskId = agentTaskIdRef.current;
        agentTaskIdRef.current = undefined;
        const text = prompt.trim();
        if (!text) {
            message.error(t("imageWorkbench.promptRequired"));
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: t("imageWorkbench.promptRequired") });
            return;
        }
        if (!isAiConfigReady(effectiveConfig, model)) {
            message.warning(t("workbench.configFirst"));
            openConfigDialog(true);
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: t("imageWorkbench.configIncomplete") });
            return;
        }

        const snapshot = buildRequestSnapshot();
        if (!snapshot) {
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: t("imageWorkbench.invalidParams") });
            return;
        }

        setElapsedMs(0);
        setRunning(true);
        if (agentTaskId) updateAgentTask(agentTaskId, { status: "running", error: undefined });
        setPreviewLog(null);
        setLiveTurn({ prompt: snapshot.text, references: snapshot.references });
        setResults(Array.from({ length: generationCount }, () => ({ id: nanoid(), status: "pending" })));
        const batchStartedAt = performance.now();
        setStartedAt(batchStartedAt);

        const tasks = Array.from({ length: generationCount }, (_, index) => runGenerationSlot(index, snapshot));

        const result = await Promise.allSettled(tasks);
        const successImages = result.filter((item): item is PromiseFulfilledResult<GeneratedImage> => item.status === "fulfilled").map((item) => item.value);
        const successCount = successImages.length;
        const failCount = generationCount - successCount;
        const failed = result.find((item): item is PromiseRejectedResult => item.status === "rejected");
        const error = failed?.reason instanceof Error ? failed.reason.message : failCount ? t("workbench.generationFailed") : undefined;
        if (agentTaskId) updateAgentTask(agentTaskId, { status: successCount ? "succeeded" : "failed", successCount, failCount, error: successCount ? undefined : error });

        try {
            await saveLog(
                buildLog({
                    prompt: text,
                    model,
                    config: { ...snapshot.config, count: String(generationCount) },
                    references: snapshot.references,
                    durationMs: performance.now() - batchStartedAt,
                    successCount,
                    failCount,
                    status: successCount ? "success" : "failed",
                    images: successImages,
                }),
            );
            successCount ? message.success(t("imageWorkbench.generated")) : message.error(failed?.reason instanceof Error ? failed.reason.message : t("workbench.generationFailed"));
            setLiveTurn(null);
            setResults([]);
        } finally {
            setRunning(false);
        }
    };

    // Handle image-generation commands from the Agent panel by setting the prompt and optionally starting generation.
    useEffect(() => {
        if (!imageCommand || imageCommand.nonce === processedCommandRef.current) return;
        processedCommandRef.current = imageCommand.nonce;
        clearImageCommand();
        if (typeof imageCommand.prompt === "string") setPrompt(imageCommand.prompt);
        if (imageCommand.run && running) {
            if (imageCommand.taskId) updateAgentTask(imageCommand.taskId, { status: "failed", error: t("imageWorkbench.busy") });
            return;
        }
        if (imageCommand.run) {
            agentTaskIdRef.current = imageCommand.taskId;
            setAutoRunToken((value) => value + 1);
        }
    }, [imageCommand, clearImageCommand, running, updateAgentTask]);

    useEffect(() => {
        if (!autoRunToken) return;
        void generate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoRunToken]);

    const downloadImage = (image: GeneratedImage, index: number) => {
        saveAs(image.dataUrl, `image-${index + 1}.png`);
    };

    const addResultToReferences = async (image: GeneratedImage, index: number) => {
        const stored = await uploadImage(image.dataUrl);
        setReferences((value) => [...value, { id: nanoid(), name: `result-${index + 1}.png`, type: stored.mimeType, dataUrl: stored.url, storageKey: stored.storageKey }]);
        message.success(t("imageWorkbench.addedReference"));
    };

    const saveResultToAssets = async (image: GeneratedImage, index: number) => {
        const stored = await uploadImage(image.dataUrl);
        addAsset({
            kind: "image",
            title: t("imageWorkbench.resultTitle", { count: index + 1 }),
            coverUrl: stored.url,
            tags: [],
            source: t("imageWorkbench.source"),
            data: { dataUrl: stored.url, storageKey: stored.storageKey, width: stored.width, height: stored.height, bytes: stored.bytes, mimeType: stored.mimeType },
            metadata: { source: "image-page", prompt },
        });
        message.success(t("common.addedToAssets"));
    };

    const insertPickedAsset = async (payload: InsertAssetPayload) => {
        if (payload.kind === "text") {
            setPrompt(payload.content);
        } else if (payload.kind === "image") {
            const stored = await uploadImage(payload.dataUrl);
            setReferences((value) => [...value, { id: nanoid(), name: payload.title, type: stored.mimeType, dataUrl: stored.url, storageKey: stored.storageKey }]);
        } else {
            message.warning(t("imageWorkbench.unsupportedAsset"));
        }
        setAssetPickerOpen(false);
    };

    const createSession = () => {
        setPrompt("");
        setReferences([]);
        setResults([]);
        setElapsedMs(0);
        setStartedAt(0);
        setSelectedLogIds([]);
        setPreviewLog(null);
        setLiveTurn(null);
    };

    const deleteSelectedLogs = () => {
        const imageKeys = logs.filter((log) => selectedLogIds.includes(log.id)).flatMap((log) => log.images.map((image) => image.storageKey).filter((key): key is string => Boolean(key)));
        void Promise.all([deleteStoredImages(imageKeys), ...selectedLogIds.map((id) => logStore.removeItem(id))]).then(refreshLogs);
        if (previewLog && selectedLogIds.includes(previewLog.id)) {
            setPreviewLog(null);
        }
        setSelectedLogIds([]);
        setDeleteConfirmOpen(false);
    };

    const deleteSingleLog = (logId: string) => {
        const target = logs.find((log) => log.id === logId);
        if (!target) return;
        const imageKeys = target.images.map((image) => image.storageKey).filter((key): key is string => Boolean(key));
        void Promise.all([deleteStoredImages(imageKeys), logStore.removeItem(logId)]).then(refreshLogs);
        if (previewLog?.id === logId) {
            setPreviewLog(null);
        }
        setSelectedLogIds((prev) => prev.filter((id) => id !== logId));
    };

    const saveLog = (log: GenerationLog) => logStore.setItem(log.id, serializeLog(log)).then(refreshLogs);

    const refreshLogs = async () => setLogs(await readStoredLogs());

    const applyLogToComposer = (log: GenerationLog) => {
        setPrompt(log.prompt);
        setReferences(log.references || []);
        if (log.config.imageModel || log.model) updateConfig("imageModel", log.config.imageModel || log.model);
        if (log.config.quality) updateConfig("quality", log.config.quality);
        if (log.config.size) updateConfig("size", log.config.size);
        if (log.config.count) updateConfig("count", log.config.count);
    };

    const previewGenerationLog = async (log: GenerationLog) => {
        setPreviewLog(log);
        setLogsOpen(false);
        applyLogToComposer(log);
        message.success(t("workbench.loadedToComposer"));
    };

    const buildRequestSnapshot = () => {
        const text = prompt.trim();
        if (!text) {
            message.error(t("imageWorkbench.promptRequired"));
            return null;
        }
        if (!isAiConfigReady(effectiveConfig, model)) {
            message.warning(t("workbench.configFirst"));
            openConfigDialog(true);
            return null;
        }
        return { text, config: { ...effectiveConfig, model, count: "1" }, references: [...references] };
    };

    const runGenerationSlot = async (index: number, snapshot: { text: string; config: AiConfig; references: ReferenceImage[] }) => {
        const itemStartedAt = performance.now();
        try {
            const result = snapshot.references.length ? await requestEdit(snapshot.config, snapshot.text, snapshot.references) : await requestGeneration(snapshot.config, snapshot.text);
            const image = result[0];
            if (!image) throw new Error(t("imageWorkbench.missingResult"));
            const stored = await uploadImage(image.dataUrl);
            const nextImage: GeneratedImage = { id: image.id, dataUrl: stored.url, ...(stored.storageKey ? { storageKey: stored.storageKey } : {}), durationMs: performance.now() - itemStartedAt, width: stored.width, height: stored.height, bytes: stored.bytes, mimeType: stored.mimeType };
            setResults((value) => updateResultAt(value, index, { status: "success", image: nextImage }));
            return nextImage;
        } catch (error) {
            setResults((value) => updateResultAt(value, index, { status: "failed", error: error instanceof Error ? error.message : t("workbench.generationFailed") }));
            throw error;
        }
    };

    const retryResult = async (index: number) => {
        const snapshot = buildRequestSnapshot();
        if (!snapshot) return;
        setPreviewLog(null);
        setResults((value) => updateResultAt(value, index, { status: "pending", error: undefined, image: undefined }));
        const retryStartedAt = performance.now();
        try {
            const image = await runGenerationSlot(index, snapshot);
            saveLog(
                buildLog({
                    prompt: snapshot.text,
                    model,
                    config: { ...snapshot.config, count: "1" },
                    references: snapshot.references,
                    durationMs: performance.now() - retryStartedAt,
                    successCount: 1,
                    failCount: 0,
                    status: "success",
                    images: [image],
                }),
            );
            message.success(t("workbench.retrySuccess"));
        } catch {
            // runGenerationSlot has already marked the result as failed.
        }
    };

    const historyTurns = [...logs].reverse();
    const beginDrag = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        dragDepthRef.current += 1;
        if (event.dataTransfer.types.includes("Files")) setIsReferenceDragActive(true);
    };
    const endDrag = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (!dragDepthRef.current) setIsReferenceDragActive(false);
    };
    const dropFiles = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        dragDepthRef.current = 0;
        setIsReferenceDragActive(false);
        void addReferences(event.dataTransfer.files);
    };

    return (
        <div
            className="flex h-full flex-col overflow-hidden bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100"
            onDragEnter={beginDrag}
            onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
            }}
            onDragLeave={endDrag}
            onDrop={dropFiles}
        >
            <h1 className="sr-only">{t("imageWorkbench.title")}</h1>
            <div ref={threadRef} className="thin-scrollbar min-h-0 flex-1 overflow-y-auto">
                {historyTurns.length || liveTurn ? (
                    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-end gap-6 px-4 py-6">
                        {historyTurns.map((log) => (
                            <ThreadTurn
                                key={log.id}
                                prompt={log.prompt}
                                references={log.references}
                                tags={[modelOptionName(log.config.imageModel || log.model), inferMediaRatio(log.config.size || log.size || "auto"), formatDuration(log.durationMs)].filter(Boolean)}
                                failCount={log.failCount}
                                images={log.images}
                                onPromptClick={() => applyLogToComposer(log)}
                                onEdit={addResultToReferences}
                                onDownload={downloadImage}
                                onSaveAsset={saveResultToAssets}
                                onRetry={
                                    log.failCount
                                        ? () => {
                                              applyLogToComposer(log);
                                              setAutoRunToken((value) => value + 1);
                                          }
                                        : undefined
                                }
                            />
                        ))}
                        {liveTurn ? (
                            <ThreadTurn
                                prompt={liveTurn.prompt}
                                references={liveTurn.references}
                                tags={[modelOptionName(model), running ? t("workbench.waiting", { time: formatDuration(elapsedMs) }) : ""].filter(Boolean)}
                                results={results}
                                onEdit={addResultToReferences}
                                onDownload={downloadImage}
                                onSaveAsset={saveResultToAssets}
                                onRetry={retryResult}
                            />
                        ) : null}
                    </div>
                ) : (
                    <div className="flex min-h-full flex-col items-center justify-center px-6 text-center">
                        <ImagePlus className="mb-4 size-10 text-stone-500" />
                        <p className="text-base font-medium">{t("imageWorkbench.empty")}</p>
                        <p className="mt-1 max-w-sm text-sm text-stone-500 dark:text-stone-400">{t("imageWorkbench.emptyHint")}</p>
                    </div>
                )}
            </div>

            <div
                className={cn(
                    "shrink-0 px-3 pt-1 transition-[padding] duration-150 ease-out sm:px-4",
                    isKeyboardOpen ? "pb-2" : "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
                )}
            >
                <div
                    className={cn(
                        "mx-auto w-full max-w-3xl rounded-3xl border bg-white/95 p-3 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] backdrop-blur-md transition-all sm:p-3.5 dark:bg-stone-900/90 dark:shadow-[0_8px_32px_-4px_rgba(0,0,0,0.4)]",
                        isReferenceDragActive
                            ? "border-stone-900 ring-2 ring-stone-900/10 dark:border-stone-100 dark:ring-white/10"
                            : "border-stone-200/90 dark:border-stone-800",
                    )}
                >
                    {isReferenceDragActive ? <p className="mb-2 text-center text-sm text-stone-500 dark:text-stone-400">{t("imageWorkbench.dropReferences")}</p> : null}
                    {references.length ? (
                        <div
                            className="hover-scrollbar mb-2.5 flex gap-2 overflow-x-auto overscroll-x-contain pb-1"
                            onWheel={(event) => {
                                if (event.currentTarget.scrollWidth <= event.currentTarget.clientWidth) return;
                                event.preventDefault();
                                event.currentTarget.scrollLeft += event.deltaY;
                            }}
                        >
                            <Image.PreviewGroup items={references.map((item) => item.dataUrl || previewUrlFor(item.storageKey)).filter(Boolean)} preview={{ zIndex: 1300 }}>
                            {references.map((item, index) => (
                                <div key={item.id} className="group relative size-16 shrink-0 overflow-hidden rounded-xl border border-stone-200/80 bg-stone-100 shadow-sm dark:border-stone-800 dark:bg-stone-800">
                                    <Image src={previewUrlFor(item.storageKey) || item.dataUrl} preview={{ src: item.dataUrl || previewUrlFor(item.storageKey) }} alt={item.name} classNames={{ root: "block size-full", img: "!h-full !w-full object-cover" }} />
                                    <span className="pointer-events-none absolute left-1 top-1 rounded bg-black/60 px-1 py-px text-[10px] font-medium text-white shadow-sm backdrop-blur-xs">{imageReferenceLabel(index)}</span>
                                    <ReferenceOrderButtons index={index} total={references.length} onMove={(offset) => setReferences((value) => moveListItem(value, index, offset))} />
                                    <button
                                        type="button"
                                        className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white shadow-sm transition-transform active:scale-90 hover:bg-black/80 sm:hidden sm:group-hover:flex"
                                        onClick={() => setReferences((value) => value.filter((ref) => ref.id !== item.id))}
                                        aria-label={t("imageWorkbench.removeReference")}
                                    >
                                        <Trash2 className="size-3" />
                                    </button>
                                </div>
                            ))}
                            </Image.PreviewGroup>
                        </div>
                    ) : null}
                    <Input.TextArea
                        value={prompt}
                        onChange={(event) => setPrompt(event.target.value)}
                        onFocus={() => {
                            setTimeout(() => {
                                scrollToBottom(true);
                            }, 200);
                        }}
                        autoSize={{ minRows: 2, maxRows: 8 }}
                        variant="borderless"
                        placeholder={t("imageWorkbench.promptPlaceholder")}
                        className="!min-h-[3.25rem] !p-1 text-base leading-relaxed text-stone-900 placeholder:text-stone-400/80 dark:text-stone-100 dark:placeholder:text-stone-500/80"
                        onKeyDown={(event) => {
                            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
                            event.preventDefault();
                            if (canGenerate && !running) void generate();
                        }}
                    />

                    {/* 工具条：极简扁平无边框风格，自然融入底栏 */}
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-1 pt-1 sm:mt-2.5 sm:pt-0">
                        {/* 左侧功能按钮组 */}
                        <div className="flex items-center gap-0.5">
                            <Dropdown
                                trigger={["click"]}
                                menu={{
                                    items: [
                                        { key: "upload", icon: <Upload className="size-3.5" />, label: t("workbench.upload"), onClick: () => fileInputRef.current?.click() },
                                        { key: "clipboard", icon: <ClipboardPaste className="size-3.5" />, label: t("workbench.clipboard"), onClick: () => void addReferencesFromClipboard() },
                                        { key: "assets", icon: <FolderPlus className="size-3.5" />, label: t("workbench.viewAssets"), onClick: () => setAssetPickerOpen(true) },
                                    ],
                                }}
                            >
                                <Tooltip title={t("imageWorkbench.references")}>
                                    <button
                                        type="button"
                                        className="flex size-8 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-black/5 hover:text-stone-900 active:scale-95 dark:text-stone-400 dark:hover:bg-white/10 dark:hover:text-stone-100"
                                        aria-label={t("imageWorkbench.references")}
                                    >
                                        <Plus className="size-4" />
                                    </button>
                                </Tooltip>
                            </Dropdown>
                            <Tooltip title={t("workbench.viewPrompts")}>
                                <button
                                    type="button"
                                    onClick={() => setPromptDialogOpen(true)}
                                    className="flex size-8 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-black/5 hover:text-stone-900 active:scale-95 dark:text-stone-400 dark:hover:bg-white/10 dark:hover:text-stone-100"
                                    aria-label={t("workbench.viewPrompts")}
                                >
                                    <BookOpen className="size-4" />
                                </button>
                            </Tooltip>
                            <Tooltip title={t("workbench.logs")}>
                                <button
                                    type="button"
                                    onClick={() => setLogsOpen(true)}
                                    className="flex size-8 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-black/5 hover:text-stone-900 active:scale-95 dark:text-stone-400 dark:hover:bg-white/10 dark:hover:text-stone-100"
                                    aria-label={t("workbench.logs")}
                                >
                                    <History className="size-4" />
                                </button>
                            </Tooltip>
                        </div>

                        {/* 右侧：无边框控制与发送 */}
                        <div className="flex items-center gap-1">
                            <ModelPicker
                                config={effectiveConfig}
                                value={model}
                                onChange={(value) => updateConfig("imageModel", value)}
                                capability="image"
                                compact
                                className="!h-8 !min-w-0"
                                onMissingConfig={() => openConfigDialog(false)}
                            />
                            <CanvasImageSettingsPopover
                                config={effectiveConfig}
                                onConfigChange={(key, value) => updateConfig(key, value)}
                                placement="topRight"
                                summary="ratio-count"
                                triggerVariant="flat"
                                panelVariant="app"
                                maxCount={10}
                                triggerIcon={<SlidersHorizontal className="size-3.5 text-stone-500 dark:text-stone-400" />}
                            />
                            <Tooltip title={t("workbench.generate")}>
                                <Button
                                    type="primary"
                                    shape="circle"
                                    icon={<ArrowUp className="size-4" />}
                                    loading={running}
                                    disabled={!canGenerate || running}
                                    onClick={() => void generate()}
                                    aria-label={t("workbench.generate")}
                                    className="!flex !size-8 !items-center !justify-center shrink-0"
                                />
                            </Tooltip>
                        </div>
                    </div>
                </div>
            </div>

            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                    void addReferences(event.target.files);
                    event.target.value = "";
                }}
            />
            {logsOpen
                ? createPortal(
                      <LogPanel
                          logs={logs}
                          selectedLogIds={selectedLogIds}
                          activeLogId={previewLog?.id}
                          onClose={() => setLogsOpen(false)}
                          onSelectedLogIdsChange={setSelectedLogIds}
                          onCreateSession={() => {
                              createSession();
                              setLogsOpen(false);
                          }}
                          onDeleteSelected={() => setDeleteConfirmOpen(true)}
                          onDeleteSingle={deleteSingleLog}
                          onPreviewLog={(log) => void previewGenerationLog(log)}
                      />,
                      document.body,
                  )
                : null}
            <PromptSelectDialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen} onSelect={setPrompt} />
            <AssetPickerModal open={assetPickerOpen} defaultTab="my-assets" onInsert={(payload) => void insertPickedAsset(payload)} onClose={() => setAssetPickerOpen(false)} />
            <Modal title={t("workbench.deleteLogs")} open={deleteConfirmOpen} zIndex={1200} onCancel={() => setDeleteConfirmOpen(false)} onOk={deleteSelectedLogs} okText={t("common.delete")} okButtonProps={{ danger: true }} cancelText={t("common.cancel")}>
                {t("workbench.deleteLogsConfirm", { count: selectedLogIds.length })}
            </Modal>
        </div>
    );
}

function ThreadTurn({
    prompt,
    references,
    tags,
    failCount,
    images,
    results,
    onPromptClick,
    onEdit,
    onDownload,
    onSaveAsset,
    onRetry,
}: {
    prompt: string;
    references: ReferenceImage[];
    tags?: string[];
    failCount?: number;
    images?: GeneratedImage[];
    results?: GenerationResult[];
    onPromptClick?: () => void;
    onEdit: (image: GeneratedImage, index: number) => void;
    onDownload: (image: GeneratedImage, index: number) => void;
    onSaveAsset: (image: GeneratedImage, index: number) => void;
    onRetry?: (index: number) => void;
}) {
    const { t } = useTranslation();
    const mapped = results?.length ? results : (images || []).map((image) => ({ id: image.id, status: "success" as const, image }));
    const slots = mapped.length ? mapped : failCount ? [{ id: "failed", status: "failed" as const, error: t("workbench.generationFailed") }] : [];
    const isMulti = slots.length > 1;

    return (
        <article className="space-y-3">
            <div className="flex justify-end">
                <ThreadPrompt prompt={prompt} references={references} onPromptClick={onPromptClick} />
            </div>
            <div className="flex justify-start">
                <div className={cn("space-y-2", isMulti ? "w-full max-w-[95%] sm:max-w-2xl" : "w-fit max-w-[90%] sm:max-w-md")}>
                    <div className={isMulti ? "grid grid-cols-2 gap-3" : "space-y-3"}>
                        {slots.map((result, index) =>
                            result.status === "success" && result.image ? (
                                <ResultImageCard key={result.id} image={result.image} index={index} onEdit={onEdit} onDownload={onDownload} onSaveAsset={onSaveAsset} />
                            ) : result.status === "failed" ? (
                                <FailedImageCard key={result.id} error={result.error || t("workbench.generationFailed")} onRetry={onRetry ? () => onRetry(index) : undefined} />
                            ) : (
                                <PendingImageCard key={result.id} />
                            ),
                        )}
                    </div>
                    {tags?.length ? (
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                            {tags.map((tag) => (
                                <span
                                    key={tag}
                                    className="inline-flex items-center rounded-md bg-stone-100 px-2 py-0.5 text-xs text-stone-500 dark:bg-stone-800/80 dark:text-stone-400"
                                >
                                    {tag}
                                </span>
                            ))}
                        </div>
                    ) : null}
                </div>
            </div>
        </article>
    );
}

function ThreadPrompt({
    prompt,
    references,
    onPromptClick,
}: {
    prompt: string;
    references: ReferenceImage[];
    onPromptClick?: () => void;
}) {
    const { t } = useTranslation();
    const [copied, setCopied] = useState(false);
    const previewItems = references.map((item) => item.dataUrl || previewUrlFor(item.storageKey)).filter(Boolean);

    const handleCopy = async (event: React.MouseEvent) => {
        event.stopPropagation();
        await navigator.clipboard.writeText(prompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <div className="group relative flex max-w-[88%] sm:max-w-lg flex-col rounded-2xl bg-stone-200/65 p-3.5 transition-colors dark:bg-stone-800/80">
            {references.length ? (
                <div className="mb-2.5 flex flex-wrap gap-1.5" onClick={(event) => event.stopPropagation()}>
                    <Image.PreviewGroup items={previewItems} preview={{ zIndex: 1300 }}>
                        {references.map((item, index) => (
                            <div key={item.id} className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-stone-300/40 shadow-2xs dark:bg-stone-700/50">
                                <Image
                                    src={previewUrlFor(item.storageKey) || item.dataUrl}
                                    preview={{ src: item.dataUrl || previewUrlFor(item.storageKey) }}
                                    alt={item.name}
                                    classNames={{ root: "block size-full", img: "!h-full !w-full object-cover" }}
                                />
                                <span className="pointer-events-none absolute left-1 top-1 rounded bg-black/60 px-1 py-0.5 text-[9px] font-medium leading-none text-white backdrop-blur-xs">
                                    {imageReferenceLabel(index)}
                                </span>
                            </div>
                        ))}
                    </Image.PreviewGroup>
                </div>
            ) : null}
            <p className="whitespace-pre-wrap text-left text-sm leading-relaxed text-stone-800 select-text font-normal dark:text-stone-200">{prompt}</p>
            <div className="mt-2 flex items-center justify-between text-[11px] text-stone-400 dark:text-stone-500">
                {onPromptClick ? (
                    <button
                        type="button"
                        onClick={onPromptClick}
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-stone-500 transition-colors hover:bg-black/5 hover:text-stone-800 active:scale-95 dark:text-stone-400 dark:hover:bg-white/10 dark:hover:text-stone-100"
                        title={t("imageWorkbench.fillComposer")}
                    >
                        <CornerDownLeft className="size-3" />
                        <span>{t("imageWorkbench.fillComposer")}</span>
                    </button>
                ) : <span />}
                <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex size-6 items-center justify-center rounded-md text-stone-500 transition-colors hover:bg-black/5 hover:text-stone-800 active:scale-90 dark:text-stone-400 dark:hover:bg-white/10 dark:hover:text-stone-100"
                    title={copied ? t("common.copied") : t("common.copy")}
                    aria-label={copied ? t("common.copied") : t("common.copy")}
                >
                    {copied ? <Check className="size-3 text-emerald-600 dark:text-emerald-400" /> : <Copy className="size-3" />}
                </button>
            </div>
        </div>
    );
}

function ResultImageCard({
    image,
    index,
    onEdit,
    onDownload,
    onSaveAsset,
}: {
    image: GeneratedImage;
    index: number;
    onEdit: (image: GeneratedImage, index: number) => void;
    onDownload: (image: GeneratedImage, index: number) => void;
    onSaveAsset: (image: GeneratedImage, index: number) => void;
}) {
    const { t } = useTranslation();
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    const src = previewUrlFor(image.storageKey) || image.dataUrl;
    const aspect = image.width && image.height ? `${image.width} / ${image.height}` : undefined;

    return (
        <div className="group relative flex w-fit max-w-full flex-col">
            <div className="relative overflow-hidden rounded-2xl bg-stone-100 shadow-2xs dark:bg-stone-900">
                <Image
                    src={src}
                    preview={{ src: image.dataUrl }}
                    alt={t("imageWorkbench.resultAlt", { count: index + 1 })}
                    rootClassName="!block"
                    className="!block max-h-[300px] sm:max-h-[360px] max-w-[280px] sm:max-w-[360px] w-auto h-auto object-contain cursor-zoom-in transition-transform duration-300 group-hover:scale-[1.01]"
                    style={{
                        aspectRatio: aspect,
                    }}
                />
            </div>
            <div className="flex w-full min-w-[180px] items-center justify-between px-1 pt-1.5">
                <span className="text-xs text-stone-400 dark:text-stone-500">
                    {image.width}×{image.height}
                </span>
                <div className="flex items-center gap-1">
                    <Tooltip title={t("common.addToAssets")}>
                        <button
                            type="button"
                            className="flex size-7 items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-black/5 hover:text-stone-700 active:scale-95 dark:text-stone-500 dark:hover:bg-white/10 dark:hover:text-stone-200"
                            onClick={() => void onSaveAsset(image, index)}
                            aria-label={t("common.addToAssets")}
                        >
                            <FolderPlus className="size-3.5" />
                        </button>
                    </Tooltip>
                    <Tooltip title={t("imageWorkbench.addReference")}>
                        <button
                            type="button"
                            className="flex size-7 items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-black/5 hover:text-stone-700 active:scale-95 dark:text-stone-500 dark:hover:bg-white/10 dark:hover:text-stone-200"
                            onClick={() => void onEdit(image, index)}
                            aria-label={t("imageWorkbench.addReference")}
                        >
                            <PenLine className="size-3.5" />
                        </button>
                    </Tooltip>
                    <Tooltip title={t("common.download")}>
                        <button
                            type="button"
                            className="flex size-7 items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-black/5 hover:text-stone-700 active:scale-95 dark:text-stone-500 dark:hover:bg-white/10 dark:hover:text-stone-200"
                            onClick={() => onDownload(image, index)}
                            aria-label={t("common.download")}
                        >
                            <Download className="size-3.5" />
                        </button>
                    </Tooltip>
                </div>
            </div>
        </div>
    );
}

function PendingImageCard() {
    const { t } = useTranslation();
    return (
        <div className="flex aspect-square w-60 max-w-full flex-col items-center justify-center gap-3 rounded-2xl border border-stone-200/60 bg-stone-200/50 p-5 text-center dark:border-stone-800 dark:bg-stone-900/80">
            <div className="relative flex items-center justify-center">
                <div className="absolute size-9 animate-ping rounded-full bg-stone-400/20 dark:bg-stone-500/20" />
                <div className="flex size-9 items-center justify-center rounded-full bg-white shadow-2xs dark:bg-stone-800">
                    <LoaderCircle className="size-5 animate-spin text-stone-700 dark:text-stone-300" />
                </div>
            </div>
            <div className="space-y-0.5">
                <p className="text-xs font-medium text-stone-700 dark:text-stone-300">{t("workbench.generating")}</p>
                <p className="text-[11px] text-stone-400 dark:text-stone-500">{t("generation.pending.0") || "正在生成画面细节..."}</p>
            </div>
        </div>
    );
}

function FailedImageCard({ error, onRetry }: { error: string; onRetry?: () => void }) {
    const { t } = useTranslation();
    const isGeneric = !error || error === t("workbench.failed") || error === t("workbench.generationFailed");
    return (
        <div className="flex aspect-square w-60 max-w-full flex-col items-center justify-center gap-2.5 rounded-2xl border border-rose-200/80 bg-rose-50/50 p-4 text-center dark:border-rose-900/40 dark:bg-rose-950/25">
            <div className="flex size-9 items-center justify-center rounded-full bg-rose-100/80 text-rose-600 dark:bg-rose-950/80 dark:text-rose-400">
                <AlertCircle className="size-5 shrink-0" />
            </div>
            <div className="space-y-1 px-2">
                <p className="text-xs font-semibold text-rose-700 dark:text-rose-400">{t("workbench.generationFailed")}</p>
                {!isGeneric ? (
                    <p className="line-clamp-2 text-xs leading-snug text-stone-500 dark:text-stone-400">
                        {error}
                    </p>
                ) : null}
            </div>
            {onRetry ? (
                <button
                    type="button"
                    onClick={onRetry}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-100/70 active:scale-95 dark:text-rose-300 dark:hover:bg-rose-950/60"
                >
                    <RotateCcw className="size-3.5" />
                    <span>{t("workbench.retry")}</span>
                </button>
            ) : null}
        </div>
    );
}

function updateResultAt(results: GenerationResult[], index: number, next: Partial<GenerationResult>) {
    return results.map((item, itemIndex) => (itemIndex === index ? { ...item, ...next } : item));
}

function LogPanel({
    logs,
    selectedLogIds,
    activeLogId,
    onClose,
    onSelectedLogIdsChange,
    onDeleteSelected,
    onDeleteSingle,
    onPreviewLog,
}: {
    logs: GenerationLog[];
    selectedLogIds: string[];
    activeLogId?: string;
    onClose: () => void;
    onSelectedLogIdsChange: (ids: string[]) => void;
    onCreateSession?: () => void;
    onDeleteSelected: () => void;
    onDeleteSingle?: (id: string) => void;
    onPreviewLog: (log: GenerationLog) => void;
}) {
    const { t } = useTranslation();
    const allSelected = Boolean(logs.length) && selectedLogIds.length === logs.length;
    const toggleAll = () => onSelectedLogIdsChange(allSelected ? [] : logs.map((log) => log.id));

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[1100] flex flex-col bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
            {/* Header */}
            <header className="shrink-0 border-b border-stone-200/80 bg-white/80 px-4 py-3 backdrop-blur-md dark:border-stone-800 dark:bg-stone-900/80 sm:px-6">
                <div className="mx-auto flex max-w-[1680px] items-center justify-between gap-4">
                    {/* Left: Title + Count Badge + Actions on the same line */}
                    <div className="flex items-center gap-3">
                        <div className="flex items-baseline gap-2">
                            <h2 className="m-0 text-sm font-semibold leading-none text-stone-900 dark:text-stone-100">
                                {t("workbench.logs")}
                            </h2>
                            <span className="text-xs leading-none text-stone-400 dark:text-stone-500">
                                {t("workbench.logCount", { count: logs.length })}
                            </span>
                        </div>

                        {logs.length ? (
                            <>
                                <div className="h-3.5 w-px bg-stone-200 dark:bg-stone-800" />
                                <div className="flex items-center gap-1.5">
                                    <button
                                        type="button"
                                        onClick={toggleAll}
                                        className={cn(
                                            "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 !text-xs font-medium border-0 shadow-none outline-none ring-0 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 transition-colors active:scale-95",
                                            allSelected
                                                ? "bg-black/5 text-stone-900 dark:bg-white/10 dark:text-stone-100"
                                                : "text-stone-600 hover:bg-black/5 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-white/10 dark:hover:text-stone-100"
                                        )}
                                    >
                                        <CheckSquare className="size-3.5" />
                                        <span className="!text-xs leading-none">{allSelected ? t("common.cancel") : t("workbench.selectAll")}</span>
                                    </button>

                                    {selectedLogIds.length ? (
                                        <button
                                            type="button"
                                            onClick={onDeleteSelected}
                                            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 !text-xs font-medium text-rose-600 border-0 shadow-none outline-none ring-0 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 transition-colors hover:bg-rose-50 hover:text-rose-700 active:scale-95 dark:text-rose-400 dark:hover:bg-rose-950/40"
                                        >
                                            <Trash2 className="size-3.5" />
                                            <span className="!text-xs leading-none">{t("common.delete")} ({selectedLogIds.length})</span>
                                        </button>
                                    ) : null}
                                </div>
                            </>
                        ) : null}
                    </div>

                    {/* Right: Close button */}
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex size-8 items-center justify-center rounded-lg text-stone-500 border-0 shadow-none outline-none ring-0 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 transition-colors hover:bg-black/5 hover:text-stone-900 active:scale-95 dark:text-stone-400 dark:hover:bg-white/10 dark:hover:text-stone-100"
                        aria-label={t("common.close")}
                        title={t("common.close")}
                    >
                        <X className="size-4" />
                    </button>
                </div>
            </header>

            {/* Gallery Content */}
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
                <div className="mx-auto max-w-[1680px]">
                    {logs.length ? (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
                            {logs.map((log) => (
                                <LogCard
                                    key={log.id}
                                    log={log}
                                    selected={selectedLogIds.includes(log.id)}
                                    active={activeLogId === log.id}
                                    onSelectedChange={(checked) =>
                                        onSelectedLogIdsChange(
                                            checked
                                                ? [...selectedLogIds, log.id]
                                                : selectedLogIds.filter((id) => id !== log.id)
                                        )
                                    }
                                    onClick={() => onPreviewLog(log)}
                                    onDelete={onDeleteSingle ? () => onDeleteSingle(log.id) : undefined}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="flex min-h-80 flex-col items-center justify-center gap-3 text-center">
                            <div className="flex size-14 items-center justify-center rounded-2xl bg-stone-100 text-stone-400 dark:bg-stone-800">
                                <History className="size-6" />
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm font-medium text-stone-700 dark:text-stone-300">{t("workbench.noLogs")}</p>
                                <p className="text-xs text-stone-400 dark:text-stone-500">在工作台输入提示词开始第一次生成</p>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-stone-700 transition-colors hover:bg-black/5 hover:text-stone-900 active:scale-95 dark:text-stone-300 dark:hover:bg-white/10 dark:hover:text-stone-100"
                            >
                                <Plus className="size-3.5" />
                                <span>开始生成</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function LogCard({
    log,
    selected,
    active,
    onSelectedChange,
    onClick,
    onDelete,
}: {
    log: GenerationLog;
    selected: boolean;
    active: boolean;
    onSelectedChange: (checked: boolean) => void;
    onClick: () => void;
    onDelete?: () => void;
}) {
    const { t } = useTranslation();
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    const images = log.images.filter((image) => previewUrlFor(image.storageKey) || image.dataUrl);
    const thumb = images[0];
    const extra = Math.max(0, images.length - 1);
    const previewItems = images.map((image) => image.dataUrl || previewUrlFor(image.storageKey)).filter(Boolean);
    const [previewVisible, setPreviewVisible] = useState(false);
    const [copied, setCopied] = useState(false);
    const [expandedPrompt, setExpandedPrompt] = useState(false);

    return (
        <article
            className={cn(
                "group relative aspect-[4/5] overflow-hidden rounded-2xl border transition-all duration-200 select-none",
                selected || active
                    ? "border-stone-900 ring-2 ring-stone-900 dark:border-stone-100 dark:ring-stone-100"
                    : "border-stone-200/80 bg-white hover:border-stone-300 dark:border-stone-800 dark:bg-stone-900 dark:hover:border-stone-700"
            )}
        >
            {thumb ? (
                <>
                    {/* Background Thumbnail Image - Click opens Lightbox Preview */}
                    <div
                        className="absolute inset-0 z-0 cursor-zoom-in overflow-hidden bg-stone-100 dark:bg-stone-900"
                        onClick={() => setPreviewVisible(true)}
                        title="点击放大预览"
                    >
                        <img
                            src={previewUrlFor(thumb.storageKey) || thumb.dataUrl}
                            alt={log.prompt || log.title}
                            className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                            loading="lazy"
                        />
                    </div>

                    {/* Top Floating Controls */}
                    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between p-2.5">
                        {/* Checkbox */}
                        <button
                            type="button"
                            onClick={(event) => {
                                event.stopPropagation();
                                onSelectedChange(!selected);
                            }}
                            className={cn(
                                "pointer-events-auto flex size-6 items-center justify-center rounded-full border-0 shadow-none outline-none ring-0 focus:outline-none focus:ring-0 transition-all duration-150 backdrop-blur-xs",
                                selected
                                    ? "bg-stone-900 dark:bg-white"
                                    : "bg-black/35 hover:bg-black/55 opacity-80 sm:opacity-0 sm:group-hover:opacity-100"
                            )}
                            title={selected ? t("common.cancel") : t("workbench.selectAll")}
                        >
                            <Check
                                className={cn(
                                    "size-3.5 stroke-[2.5] transition-opacity",
                                    selected
                                        ? "!text-white stroke-white dark:!text-stone-900 dark:stroke-stone-900 opacity-100"
                                        : "!text-transparent stroke-transparent hover:!text-white/70 hover:stroke-white/70 opacity-0 group-hover:opacity-100"
                                )}
                            />
                        </button>

                        {/* Multi-image indicator badge */}
                        {extra > 0 ? (
                            <span className="pointer-events-auto inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-xs">
                                +{extra}
                            </span>
                        ) : null}
                    </div>

                    {/* Bottom Floating Info & Actions */}
                    <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col justify-end bg-gradient-to-t from-black/85 via-black/45 to-transparent p-2.5 pt-7 text-white transition-all duration-200">
                        {/* Prompt text - tap to expand on mobile or view in desktop */}
                        <p
                            className={cn(
                                "text-xs font-medium leading-relaxed text-white/95 drop-shadow-xs transition-all cursor-pointer",
                                expandedPrompt ? "line-clamp-none max-h-48 overflow-y-auto" : "line-clamp-2"
                            )}
                            onClick={(event) => {
                                event.stopPropagation();
                                setExpandedPrompt((prev) => !prev);
                            }}
                            title={log.prompt || log.title}
                        >
                            {log.prompt || log.title}
                        </p>

                        {/* Sub-meta: Time · Duration · Model */}
                        <div className="mt-1 flex items-center justify-between gap-1 text-[11px] text-white/70">
                            <span className="truncate">
                                {[log.time, formatDuration(log.durationMs)].filter(Boolean).join(" · ")}
                            </span>
                            {log.model ? (
                                <span
                                    className="shrink-0 max-w-[110px] truncate rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-medium text-white/90"
                                    title={modelOptionName(log.model)}
                                >
                                    {modelOptionName(log.model)}
                                </span>
                            ) : null}
                        </div>

                        {/* Quick Action Buttons: Always visible on mobile, reveal on hover on desktop */}
                        <div
                            className="mt-2 flex items-center gap-1.5 border-t border-white/20 pt-2 opacity-100 sm:opacity-0 sm:transition-opacity sm:duration-150 sm:group-hover:opacity-100"
                            onClick={(event) => event.stopPropagation()}
                        >
                            <button
                                type="button"
                                onClick={onClick}
                                className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-lg bg-white/95 px-2 !text-[11px] font-medium !text-stone-900 border-0 shadow-none outline-none ring-0 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 transition-colors hover:bg-white active:scale-95"
                                title="一键将提示词、参考图与生图参数填回输入栏，并无缝切回工作台"
                            >
                                <PenLine className="size-3 shrink-0" />
                                <span className="!text-[11px] font-medium leading-none">{t("workbench.loadToComposer")}</span>
                            </button>
                            <button
                                type="button"
                                onClick={async () => {
                                    if (log.prompt) {
                                        await navigator.clipboard.writeText(log.prompt);
                                        setCopied(true);
                                        setTimeout(() => setCopied(false), 1500);
                                    }
                                }}
                                className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/20 text-white backdrop-blur-xs border-0 shadow-none outline-none ring-0 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 transition-colors hover:bg-white/35 active:scale-95"
                                title={copied ? t("common.copied") : t("common.copy")}
                            >
                                {copied ? <Check className="size-3.5 !text-emerald-300 stroke-emerald-300" /> : <Copy className="size-3.5" />}
                            </button>
                            {onDelete ? (
                                <button
                                    type="button"
                                    onClick={onDelete}
                                    className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-rose-500/30 text-white backdrop-blur-xs border-0 shadow-none outline-none ring-0 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 transition-colors hover:bg-rose-500/60 active:scale-95"
                                    title={t("common.delete")}
                                >
                                    <Trash2 className="size-3.5" />
                                </button>
                            ) : null}
                        </div>
                    </div>

                    {/* Hidden Ant Design Image Preview Group for Full High-Res Lightbox */}
                    <div className="hidden" onClick={(event) => event.stopPropagation()}>
                        <Image.PreviewGroup
                            preview={{
                                visible: previewVisible,
                                onVisibleChange: (vis) => setPreviewVisible(vis),
                                zIndex: 1300,
                            }}
                            items={previewItems}
                        >
                            <Image src={previewUrlFor(thumb.storageKey) || thumb.dataUrl} />
                        </Image.PreviewGroup>
                    </div>
                </>
            ) : (
                /* Failed or No-Image Card */
                <div
                    className={cn(
                        "relative flex size-full flex-col justify-between p-3.5 text-left",
                        log.status === "failed" ? "bg-rose-50/40 dark:bg-rose-950/25" : "bg-stone-100/70 dark:bg-stone-900/80"
                    )}
                >
                    {/* Top Row: Checkbox + Status Tag */}
                    <div className="flex items-center justify-between gap-2">
                        <button
                            type="button"
                            onClick={(event) => {
                                event.stopPropagation();
                                onSelectedChange(!selected);
                            }}
                            className={cn(
                                "flex size-6 items-center justify-center rounded-full border-0 shadow-none outline-none ring-0 focus:outline-none focus:ring-0 transition-all duration-150",
                                selected
                                    ? "bg-stone-900 dark:bg-white"
                                    : "bg-stone-200/80 text-stone-400 hover:bg-stone-300 dark:bg-stone-800 dark:text-stone-500 dark:hover:bg-stone-700"
                            )}
                            title={selected ? t("common.cancel") : t("workbench.selectAll")}
                        >
                            {selected ? (
                                <Check className="size-3.5 stroke-[2.5] !text-white stroke-white dark:!text-stone-900 dark:stroke-stone-900" />
                            ) : null}
                        </button>

                        {log.status === "failed" ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-rose-100/80 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                                <AlertCircle className="size-3" />
                                <span>{t("workbench.generationFailed")}</span>
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1 rounded-md bg-stone-200/80 px-2 py-0.5 text-[11px] font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-400">
                                <ImagePlus className="size-3" />
                                <span>无图像</span>
                            </span>
                        )}
                    </div>

                    {/* Middle: Prompt text */}
                    <div className="my-auto space-y-1.5 py-2">
                        <p className="line-clamp-4 text-xs font-medium leading-relaxed text-stone-800 dark:text-stone-200">
                            {log.prompt || log.title}
                        </p>
                    </div>

                    {/* Bottom: Meta + Actions */}
                    <div className="space-y-2.5">
                        <div className={cn("flex items-center justify-between gap-1 text-xs", log.status === "failed" ? "text-rose-900/60 dark:text-rose-200/60" : "text-stone-400 dark:text-stone-500")}>
                            <span className="truncate">{log.time}</span>
                            {log.model ? (
                                <span className="truncate" title={modelOptionName(log.model)}>
                                    {modelOptionName(log.model)}
                                </span>
                            ) : null}
                        </div>

                        <div className={cn("flex items-center gap-1.5 border-t pt-2", log.status === "failed" ? "border-rose-200/60 dark:border-rose-900/40" : "border-stone-200/60 dark:border-stone-800")}>
                            <button
                                type="button"
                                onClick={onClick}
                                className={cn(
                                    "inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-lg px-2 !text-[11px] font-medium border-0 shadow-none outline-none ring-0 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 transition-colors hover:bg-black/5 active:scale-95 dark:hover:bg-white/10",
                                    log.status === "failed"
                                        ? "!text-rose-700 hover:!text-rose-800 dark:!text-rose-300 dark:hover:!text-rose-200"
                                        : "!text-stone-700 hover:!text-stone-900 dark:!text-stone-300 dark:hover:!text-stone-100"
                                )}
                            >
                                <RotateCcw className="size-3 shrink-0" />
                                <span className="!text-[11px] font-medium leading-none">{t("workbench.loadToComposer")}</span>
                            </button>

                            {onDelete ? (
                                <button
                                    type="button"
                                    onClick={onDelete}
                                    className={cn(
                                        "flex size-7 shrink-0 items-center justify-center rounded-lg border-0 shadow-none outline-none ring-0 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 transition-colors active:scale-95",
                                        log.status === "failed"
                                            ? "text-rose-600 hover:bg-rose-200/50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-900/40"
                                            : "text-stone-400 hover:bg-black/5 hover:text-stone-700 dark:text-stone-500 dark:hover:bg-white/10 dark:hover:text-stone-200"
                                    )}
                                    title={t("common.delete")}
                                >
                                    <Trash2 className="size-3.5" />
                                </button>
                            ) : null}
                        </div>
                    </div>
                </div>
            )}
        </article>
    );
}

async function readStoredLogs() {
    if (typeof window === "undefined") return [];
    try {
        const values: GenerationLog[] = [];
        await logStore.iterate<GenerationLog, void>((value) => {
            values.push(value);
        });
        const logs = await Promise.all(values.map(normalizeLog));
        return logs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } catch {
        return [];
    }
}

async function normalizeLog(log: Partial<GenerationLog>): Promise<GenerationLog> {
    const references = await Promise.all(
        (log.references || []).map(async (item) => {
            void ensureImagePreview(item.storageKey);
            return { ...item, dataUrl: await resolveImageUrl(item.storageKey, item.dataUrl) };
        }),
    );
    const images = await Promise.all(
        (log.images || []).map(async (item) => {
            void ensureImagePreview(item.storageKey);
            return { ...item, dataUrl: await resolveImageUrl(item.storageKey, item.dataUrl) };
        }),
    );
    const config = normalizeLogConfig(log);
    return {
        id: log.id || nanoid(),
        createdAt: log.createdAt || Date.now(),
        title: log.title || log.model || i18n.t("workbench.untitled"),
        prompt: log.prompt || log.title || "",
        time: log.time || new Date().toLocaleString(i18n.resolvedLanguage, { hour12: false }),
        model: log.model || config.imageModel || "",
        config,
        references,
        durationMs: log.durationMs || 0,
        successCount: log.successCount ?? log.imageCount ?? 0,
        failCount: log.failCount || 0,
        imageCount: log.imageCount || log.successCount || 0,
        size: log.size || config.size || "",
        quality: log.quality || config.quality || "",
        status: log.status || "success",
        images,
    };
}

function serializeLog(log: GenerationLog): GenerationLog {
    return {
        ...log,
        references: log.references.map((item) => ({ ...item, dataUrl: item.storageKey ? "" : item.dataUrl })),
        images: log.images.map((image) => ({ ...image, dataUrl: image.storageKey ? "" : image.dataUrl })),
    };
}

function normalizeLogConfig(log: Partial<GenerationLog>): GenerationLogConfig {
    return {
        model: log.config?.model || log.model || "",
        imageModel: log.config?.imageModel || log.model || "",
        quality: log.config?.quality || log.quality || "",
        size: log.config?.size || log.size || "",
        count: log.config?.count || String(log.imageCount || log.successCount || 1),
    };
}

function moveListItem<T>(items: T[], index: number, offset: number) {
    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= items.length) return items;
    const next = [...items];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    return next;
}

function ReferenceOrderButtons({ index, total, onMove }: { index: number; total: number; onMove: (offset: number) => void }) {
    if (total <= 1) return null;
    return (
        <div className="absolute inset-x-1 bottom-1 flex justify-between">
            <Button size="small" className="!h-6 !w-6 !min-w-6 !rounded-full !bg-white/85 !p-0 !shadow-sm" icon={<ArrowLeft className="size-3" />} disabled={index <= 0} onClick={() => onMove(-1)} />
            <Button size="small" className="!h-6 !w-6 !min-w-6 !rounded-full !bg-white/85 !p-0 !shadow-sm" icon={<ArrowRight className="size-3" />} disabled={index >= total - 1} onClick={() => onMove(1)} />
        </div>
    );
}

function buildLog({
    prompt,
    model,
    config,
    references,
    durationMs,
    successCount,
    failCount,
    status,
    images,
}: {
    prompt: string;
    model: string;
    config: GenerationLogConfig;
    references: ReferenceImage[];
    durationMs: number;
    successCount: number;
    failCount: number;
    status: GenerationLog["status"];
    images: GeneratedImage[];
}): GenerationLog {
    const logConfig = {
        model: config.model,
        imageModel: config.imageModel,
        quality: config.quality,
        size: config.size,
        count: config.count,
    };
    return {
        id: nanoid(),
        createdAt: Date.now(),
        title: prompt.slice(0, 12) || i18n.t("workbench.untitled"),
        prompt,
        time: new Date().toLocaleString(i18n.resolvedLanguage, { hour12: false }),
        model,
        config: logConfig,
        references,
        durationMs,
        successCount,
        failCount,
        imageCount: Number(logConfig.count) || successCount,
        size: logConfig.size,
        quality: logConfig.quality,
        status,
        images,
    };
}
