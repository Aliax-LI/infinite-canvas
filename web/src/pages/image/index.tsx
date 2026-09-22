import { ArrowLeft, ArrowRight, ArrowUp, BookOpen, CheckSquare, ClipboardPaste, Download, FolderPlus, History, ImagePlus, LoaderCircle, PenLine, Plus, SlidersHorizontal, Trash2, Upload, X } from "lucide-react";
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
import { modelOptionLabel, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { nanoid } from "nanoid";
import { formatDuration } from "@/lib/image-utils";
import { inferMediaRatio } from "@/lib/media-size";
import { requestEdit, requestGeneration } from "@/services/api/image";
import { deleteStoredImages, ensureImagePreview, getImagePreviewRevision, previewUrlFor, resolveImageUrl, subscribeImagePreviews, uploadImage } from "@/services/image-storage";
import { useAssetStore } from "@/stores/use-asset-store";
import { useWorkbenchAgentStore } from "@/stores/use-workbench-agent-store";
import type { ReferenceImage } from "@/types/image";
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

    useEffect(() => {
        if (!running || !startedAt) return;
        const timer = window.setInterval(() => setElapsedMs(performance.now() - startedAt), 1000);
        return () => window.clearInterval(timer);
    }, [running, startedAt]);

    useEffect(() => {
        void refreshLogs();
    }, []);

    useEffect(() => {
        const node = threadRef.current;
        if (!node) return;
        node.scrollTo({ top: node.scrollHeight, behavior: running ? "smooth" : "auto" });
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
                    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-end gap-5 px-4 py-5">
                        {historyTurns.map((log) => (
                            <ThreadTurn
                                key={log.id}
                                prompt={log.prompt}
                                references={log.references}
                                tags={[modelOptionLabel(effectiveConfig, log.config.imageModel || log.model), inferMediaRatio(log.config.size || log.size || "auto"), formatDuration(log.durationMs)].filter(Boolean)}
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
                                tags={[modelOptionLabel(effectiveConfig, model), running ? t("workbench.waiting", { time: formatDuration(elapsedMs) }) : ""].filter(Boolean)}
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

            <div className="shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1">
                <div className={`mx-auto w-full max-w-3xl rounded-2xl border bg-card p-3 shadow-sm transition-colors ${isReferenceDragActive ? "border-stone-900 dark:border-stone-100" : "border-stone-200 dark:border-stone-800"}`}>
                    {isReferenceDragActive ? <p className="mb-2 text-center text-sm text-stone-500 dark:text-stone-400">{t("imageWorkbench.dropReferences")}</p> : null}
                    {references.length ? (
                        <div
                            className="hover-scrollbar mb-2 flex gap-2 overflow-x-auto overscroll-x-contain pb-1"
                            onWheel={(event) => {
                                if (event.currentTarget.scrollWidth <= event.currentTarget.clientWidth) return;
                                event.preventDefault();
                                event.currentTarget.scrollLeft += event.deltaY;
                            }}
                        >
                            <Image.PreviewGroup items={references.map((item) => item.dataUrl || previewUrlFor(item.storageKey)).filter(Boolean)} preview={{ zIndex: 1300 }}>
                            {references.map((item, index) => (
                                <div key={item.id} className="group relative size-16 shrink-0 overflow-hidden rounded-lg border border-stone-200 dark:border-stone-800">
                                    <Image src={previewUrlFor(item.storageKey) || item.dataUrl} preview={{ src: item.dataUrl || previewUrlFor(item.storageKey) }} alt={item.name} classNames={{ root: "block size-full", img: "!h-full !w-full object-cover" }} />
                                    <span className="pointer-events-none absolute left-1 top-1 rounded bg-black/60 px-1 py-px text-[10px] font-medium text-white">{imageReferenceLabel(index)}</span>
                                    <ReferenceOrderButtons index={index} total={references.length} onMove={(offset) => setReferences((value) => moveListItem(value, index, offset))} />
                                    <button
                                        type="button"
                                        className="absolute right-0.5 top-0.5 hidden size-5 items-center justify-center rounded bg-black/60 text-white group-hover:flex"
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
                        autoSize={{ minRows: 2, maxRows: 8 }}
                        variant="borderless"
                        placeholder={t("imageWorkbench.promptPlaceholder")}
                        className="!min-h-[3.25rem] text-base leading-6"
                        onKeyDown={(event) => {
                            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
                            event.preventDefault();
                            if (canGenerate && !running) void generate();
                        }}
                    />
                    <div className="mt-2 flex items-center gap-1">
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
                                <Button type="text" size="small" icon={<Plus className="size-4" />} aria-label={t("imageWorkbench.references")} />
                            </Tooltip>
                        </Dropdown>
                        <Tooltip title={t("workbench.viewPrompts")}>
                            <Button type="text" size="small" icon={<BookOpen className="size-4" />} onClick={() => setPromptDialogOpen(true)} aria-label={t("workbench.viewPrompts")} />
                        </Tooltip>
                        <Tooltip title={t("workbench.logs")}>
                            <Button type="text" size="small" icon={<History className="size-4" />} onClick={() => setLogsOpen(true)} aria-label={t("workbench.logs")} />
                        </Tooltip>
                        <div className="ml-auto flex min-w-0 items-center gap-1">
                            <ModelPicker
                                config={effectiveConfig}
                                value={model}
                                onChange={(value) => updateConfig("imageModel", value)}
                                capability="image"
                                compact
                                className="!h-8 !min-w-0 !max-w-[min(100%,12.5rem)] sm:!max-w-[15rem]"
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
                                triggerIcon={<SlidersHorizontal className="size-3.5" />}
                                buttonClassName="!h-8 max-w-[8rem] truncate !px-1.5 sm:max-w-none"
                            />
                            <Tooltip title={t("workbench.generate")}>
                                <Button type="primary" shape="circle" icon={<ArrowUp className="size-4" />} loading={running} disabled={!canGenerate || running} onClick={() => void generate()} aria-label={t("workbench.generate")} />
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
    const bubbleClass = "flex max-w-[min(100%,20rem)] flex-col items-stretch rounded-2xl bg-stone-200 px-3.5 py-2.5 text-left dark:bg-stone-800";

    return (
        <article className="space-y-1.5">
            <div className="flex justify-end">
                {onPromptClick ? (
                    <button type="button" className={bubbleClass} onClick={onPromptClick} title={t("imageWorkbench.fillComposer")}>
                        <ThreadPrompt prompt={prompt} references={references} />
                    </button>
                ) : (
                    <div className={bubbleClass}>
                        <ThreadPrompt prompt={prompt} references={references} />
                    </div>
                )}
            </div>
            <div className="flex justify-start">
                <div className="max-w-[min(100%,20rem)] space-y-1.5">
                    <div className={slots.length > 1 ? "grid grid-cols-2 gap-2" : "space-y-2"}>
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
                        <div className="flex flex-wrap gap-1">
                            {tags.map((tag) => (
                                <Tag key={tag} className="m-0 rounded-md px-1.5 text-xs leading-5">
                                    {tag}
                                </Tag>
                            ))}
                        </div>
                    ) : null}
                </div>
            </div>
        </article>
    );
}

function ThreadPrompt({ prompt, references }: { prompt: string; references: ReferenceImage[] }) {
    const previewItems = references.map((item) => item.dataUrl || previewUrlFor(item.storageKey)).filter(Boolean);

    return (
        <>
            {references.length ? (
                <div className="mb-2 flex flex-wrap justify-end gap-1.5" onClick={(event) => event.stopPropagation()}>
                    <Image.PreviewGroup items={previewItems} preview={{ zIndex: 1300 }}>
                        {references.map((item, index) => (
                            <div key={item.id} className="relative size-16 overflow-hidden rounded-lg bg-stone-300 dark:bg-stone-700">
                                <Image src={previewUrlFor(item.storageKey) || item.dataUrl} preview={{ src: item.dataUrl || previewUrlFor(item.storageKey) }} alt={item.name} classNames={{ root: "block size-full", img: "!h-full !w-full object-cover" }} />
                                <span className="pointer-events-none absolute left-0.5 top-0.5 rounded bg-black/60 px-1 text-[10px] leading-4 text-white">{imageReferenceLabel(index)}</span>
                            </div>
                        ))}
                    </Image.PreviewGroup>
                </div>
            ) : null}
            <p className="whitespace-pre-wrap text-left text-sm leading-5 text-stone-900 dark:text-stone-100">{prompt}</p>
        </>
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
    return (
        <div className="group overflow-hidden rounded-2xl">
            <Image
                src={previewUrlFor(image.storageKey) || image.dataUrl}
                preview={{ src: image.dataUrl }}
                alt={t("imageWorkbench.resultAlt", { count: index + 1 })}
                className="max-h-64 w-auto max-w-full object-contain"
            />
            <div className="mt-1 flex items-center gap-0.5">
                <Tooltip title={t("common.addToAssets")}>
                    <Button type="text" size="small" className="!h-7 !w-7 !min-w-7 !p-0" icon={<FolderPlus className="size-3.5" />} onClick={() => void onSaveAsset(image, index)} />
                </Tooltip>
                <Tooltip title={t("imageWorkbench.addReference")}>
                    <Button type="text" size="small" className="!h-7 !w-7 !min-w-7 !p-0" icon={<PenLine className="size-3.5" />} onClick={() => void onEdit(image, index)} />
                </Tooltip>
                <Tooltip title={t("common.download")}>
                    <Button type="text" size="small" className="!h-7 !w-7 !min-w-7 !p-0" icon={<Download className="size-3.5" />} onClick={() => onDownload(image, index)} />
                </Tooltip>
                <span className="ml-1 text-[11px] text-stone-400">
                    {image.width}×{image.height}
                </span>
            </div>
        </div>
    );
}

function PendingImageCard() {
    const { t } = useTranslation();
    return (
        <div className="flex h-40 w-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-stone-300 bg-stone-100 text-sm text-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400">
            <LoaderCircle className="size-5 animate-spin" />
            <span>{t("workbench.generating")}</span>
        </div>
    );
}

function FailedImageCard({ error, onRetry }: { error: string; onRetry?: () => void }) {
    const { t } = useTranslation();
    return (
        <div className="rounded-2xl bg-stone-100 px-3.5 py-2.5 dark:bg-stone-900">
            <p className="text-sm text-stone-800 dark:text-stone-200">{t("workbench.failed")}</p>
            <Typography.Paragraph ellipsis={{ rows: 3 }} className="!mb-0 !mt-0.5 !text-xs !text-stone-500 dark:!text-stone-400">
                {error}
            </Typography.Paragraph>
            {onRetry ? (
                <Button type="link" size="small" className="!h-7 !px-0" onClick={onRetry}>
                    {t("workbench.retry")}
                </Button>
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
    onCreateSession,
    onDeleteSelected,
    onPreviewLog,
}: {
    logs: GenerationLog[];
    selectedLogIds: string[];
    activeLogId?: string;
    onClose: () => void;
    onSelectedLogIdsChange: (ids: string[]) => void;
    onCreateSession: () => void;
    onDeleteSelected: () => void;
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
            <header className="shrink-0 border-b border-stone-200/80 px-3 pb-3 pt-[max(0.5rem,env(safe-area-inset-top))] dark:border-stone-800 sm:px-4">
                <div className="flex items-center gap-2">
                    <Button type="text" size="small" className="!-ml-1" icon={<X className="size-4" />} onClick={onClose} aria-label={t("common.close")} />
                    <div className="min-w-0 flex-1">
                        <h2 className="truncate text-lg font-semibold leading-tight">{t("workbench.logs")}</h2>
                        <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">{t("workbench.logCount", { count: logs.length })}</p>
                    </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1">
                    <Button type="text" size="small" icon={<Plus className="size-3.5" />} onClick={onCreateSession}>
                        {t("workbench.new")}
                    </Button>
                    <Button type="text" size="small" icon={<CheckSquare className="size-3.5" />} disabled={!logs.length} onClick={toggleAll}>
                        {allSelected ? t("common.cancel") : t("workbench.selectAll")}
                    </Button>
                    <Button type="text" size="small" danger icon={<Trash2 className="size-3.5" />} disabled={!selectedLogIds.length} onClick={onDeleteSelected}>
                        {t("common.delete")}
                    </Button>
                </div>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-3">
                {logs.length ? (
                    <div className="columns-2 gap-1.5 sm:columns-3 lg:columns-4 2xl:columns-5">
                        {logs.map((log) => (
                            <LogCard
                                key={log.id}
                                log={log}
                                selected={selectedLogIds.includes(log.id)}
                                active={activeLogId === log.id}
                                onSelectedChange={(checked) => onSelectedLogIdsChange(checked ? [...selectedLogIds, log.id] : selectedLogIds.filter((id) => id !== log.id))}
                                onClick={() => onPreviewLog(log)}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="flex min-h-48 items-center justify-center text-sm text-stone-500">{t("workbench.noLogs")}</div>
                )}
            </div>
        </div>
    );
}

function LogCard({ log, selected, active, onSelectedChange, onClick }: { log: GenerationLog; selected: boolean; active: boolean; onSelectedChange: (checked: boolean) => void; onClick: () => void }) {
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    const images = log.images.filter((image) => previewUrlFor(image.storageKey) || image.dataUrl);
    const thumb = images[0];
    const extra = Math.max(0, images.length - 1);
    const previewItems = images.map((image) => image.dataUrl || previewUrlFor(image.storageKey)).filter(Boolean);
    const hoverReveal = thumb ? "opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100" : "opacity-100";
    const selectedRing = selected || active ? "ring-2 ring-stone-400/90 dark:ring-stone-500" : "";

    return (
        <article className={`group mb-1.5 break-inside-avoid overflow-hidden rounded-md bg-stone-200 dark:bg-stone-800 ${selectedRing}`}>
            <div className="relative">
                {thumb ? (
                    <Image.PreviewGroup items={previewItems} preview={{ zIndex: 1300 }}>
                        <Image
                            src={previewUrlFor(thumb.storageKey) || thumb.dataUrl}
                            preview={{ src: thumb.dataUrl || previewUrlFor(thumb.storageKey) }}
                            alt=""
                            classNames={{ root: "block w-full", img: "block h-auto w-full" }}
                            style={thumb.width && thumb.height ? { aspectRatio: `${thumb.width} / ${thumb.height}` } : undefined}
                        />
                    </Image.PreviewGroup>
                ) : (
                    <div className="grid min-h-36 w-full place-items-center text-stone-400">
                        <ImagePlus className="size-6" />
                    </div>
                )}
                <button
                    type="button"
                    className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent p-2.5 pt-10 text-left ${hoverReveal}`}
                    onClick={onClick}
                    title={log.prompt || log.title}
                >
                    <p className="line-clamp-3 text-xs leading-5 text-white">{log.prompt || log.title}</p>
                    <p className="mt-1 text-[11px] text-white/70">{[log.time, formatDuration(log.durationMs)].filter(Boolean).join(" · ")}</p>
                </button>
                <span className="absolute left-1.5 top-1.5 z-10 rounded bg-white/90 px-0.5 dark:bg-black/55" onClick={(event) => event.stopPropagation()}>
                    <Checkbox checked={selected} onChange={(event) => onSelectedChange(event.target.checked)} />
                </span>
                {extra ? <span className="pointer-events-none absolute right-1.5 top-1.5 rounded bg-black/60 px-1 text-[10px] leading-4 text-white">+{extra}</span> : null}
            </div>
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
