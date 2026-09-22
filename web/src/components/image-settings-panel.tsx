import { type ReactNode, useState } from "react";
import { ConfigProvider, Switch } from "antd";
import { useTranslation } from "react-i18next";

import i18n from "@/i18n";
import { type CanvasTheme } from "@/lib/canvas-theme";
import { computeMediaSize, inferMediaRatio, inferMediaScale, mediaRatioOptions, mediaScaleOptions, readMediaDimensions } from "@/lib/media-size";
import type { AiConfig } from "@/stores/use-config-store";
import { cn } from "@/lib/utils";

const qualityOptions = [
    { value: "auto", labelKey: "auto" },
    { value: "high", labelKey: "high" },
    { value: "medium", labelKey: "medium" },
    { value: "low", labelKey: "low" },
];
const DIMENSION_STEP = 16;

export const imageQualityOptions = qualityOptions.map((item) => ({ value: item.value, get label() { return i18n.t(`settingsPanels.common.${item.labelKey}`); } }));
export const imageAspectOptions = mediaRatioOptions.map((item) => ({ value: item.value, label: item.value === "auto" ? i18n.t("settingsPanels.common.auto") : item.value }));
export const imageScaleOptions = mediaScaleOptions.map((value) => ({ value, label: value === "auto" ? i18n.t("settingsPanels.common.auto") : value }));

// 5列 x 2行清晰的宽高比编排：第一行主流常用，第二行胶片/宽画幅及自动
const orderedRatios = [
    { value: "1:1", width: 1, height: 1 },
    { value: "4:3", width: 4, height: 3 },
    { value: "3:4", width: 3, height: 4 },
    { value: "16:9", width: 16, height: 9 },
    { value: "9:16", width: 9, height: 16 },
    { value: "3:2", width: 3, height: 2 },
    { value: "2:3", width: 2, height: 3 },
    { value: "21:9", width: 21, height: 9 },
    { value: "9:21", width: 9, height: 21 },
    { value: "auto", width: 0, height: 0 },
] as const;

type ImageSettingsPanelProps = {
    config: AiConfig;
    onConfigChange: (key: "quality" | "size" | "count" | "background", value: string) => void;
    theme: CanvasTheme;
    showTitle?: boolean;
    className?: string;
    maxCount?: number;
    quickCount?: number;
};

export function ImageSettingsPanel({ config, onConfigChange, theme, showTitle = true, className = "w-full space-y-3", maxCount = 15 }: ImageSettingsPanelProps) {
    const { t } = useTranslation();
    const [snapDimensionToStep, setSnapDimensionToStep] = useState(true);
    const quality = config.quality || "auto";
    const count = Math.max(1, Math.min(maxCount, Math.floor(Math.abs(Number(config.count)) || 1)));
    const activeSize = config.size || "auto";
    const transparentBackground = config.background === "transparent";
    const selectedScale = inferMediaScale(activeSize);
    const selectedRatio = inferMediaRatio(activeSize);
    const dimensions = readMediaDimensions(activeSize, selectedScale, selectedRatio);
    const applySize = (scale: string, ratio: string) => onConfigChange("size", computeMediaSize(scale, ratio));
    const selectScale = (scale: string) => applySize(scale, selectedRatio === "auto" ? "1:1" : selectedRatio);
    const selectRatio = (ratio: string) => applySize(selectedScale, ratio);
    const updateDimension = (key: "width" | "height", value: number | null) => {
        const next = Math.max(1, Math.floor(value || dimensions[key] || 1024));
        const width = key === "width" ? next : dimensions.width;
        const height = key === "height" ? next : dimensions.height;
        onConfigChange("size", `${alignDimension(width, snapDimensionToStep)}x${alignDimension(height, snapDimensionToStep)}`);
    };

    return (
        <ImageSettingsTheme theme={theme}>
            <div
                className={className}
                style={{ color: theme.node.text }}
                onMouseDown={(event) => {
                    event.stopPropagation();
                    if (event.target instanceof HTMLInputElement) return;
                    if (document.activeElement instanceof HTMLInputElement && event.currentTarget.contains(document.activeElement)) document.activeElement.blur();
                }}
            >
                {showTitle ? (
                    <div className="flex items-center justify-between pb-2 border-b border-stone-200/60 dark:border-stone-800/80">
                        <span className="text-[13px] font-semibold tracking-tight text-stone-900 dark:text-stone-100">
                            {t("settingsPanels.image.title")}
                        </span>
                        <span className="font-mono text-[11.5px] text-stone-400 dark:text-stone-500">
                            {dimensions.width}×{dimensions.height}
                        </span>
                    </div>
                ) : null}

                {/* 宽高比 (Aspect Ratio) */}
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11.5px]">
                        <span className="font-medium text-stone-600 dark:text-stone-400">{t("settingsPanels.image.aspectRatio")}</span>
                        <span className="font-mono text-stone-400 dark:text-stone-500">
                            {selectedRatio === "auto" ? t("settingsPanels.common.auto") : selectedRatio}
                        </span>
                    </div>
                    <div className="grid grid-cols-5 gap-1 rounded-xl bg-stone-100/80 p-1 dark:bg-stone-950/60">
                        {orderedRatios.map((item) => {
                            const isSelected = selectedRatio === item.value;
                            return (
                                <button
                                    key={item.value}
                                    type="button"
                                    onClick={() => selectRatio(item.value)}
                                    className={cn(
                                        "group flex h-11 flex-col items-center justify-center gap-1 rounded-lg transition-all active:scale-95",
                                        isSelected
                                            ? "bg-white !text-stone-900 shadow-xs dark:bg-stone-700 dark:!text-white"
                                            : "text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200"
                                    )}
                                    title={item.value === "auto" ? t("settingsPanels.common.auto") : item.value}
                                >
                                    <AspectVisual width={item.width} height={item.height} isAuto={item.value === "auto"} active={isSelected} />
                                    <span className="!text-[11.5px] font-medium leading-none">
                                        {item.value === "auto" ? t("settingsPanels.common.auto") : item.value}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* 分辨率 (Scale / Resolution) */}
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11.5px]">
                        <span className="font-medium text-stone-600 dark:text-stone-400">{t("settingsPanels.image.resolution")}</span>
                        <span className="font-mono text-stone-400 dark:text-stone-500">
                            {selectedScale === "auto" ? t("settingsPanels.common.auto") : selectedScale.toUpperCase()}
                        </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1 rounded-xl bg-stone-100/80 p-1 dark:bg-stone-950/60">
                        {mediaScaleOptions.map((value) => {
                            const active = selectedScale === value;
                            return (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => selectScale(value)}
                                    className={cn(
                                        "flex h-7 items-center justify-center rounded-lg transition-all active:scale-95",
                                        active
                                            ? "bg-white !text-stone-900 shadow-xs dark:bg-stone-700 dark:!text-white"
                                            : "text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200"
                                    )}
                                >
                                    <span className="!text-[11.5px] font-medium leading-none">
                                        {value === "auto" ? t("settingsPanels.common.auto") : value.toUpperCase()}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* 质量 (Quality) */}
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11.5px]">
                        <span className="font-medium text-stone-600 dark:text-stone-400">{t("settingsPanels.image.quality")}</span>
                        <span className="text-stone-400 dark:text-stone-500">
                            {t(`settingsPanels.common.${qualityOptions.find((q) => q.value === quality)?.labelKey || "auto"}`)}
                        </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1 rounded-xl bg-stone-100/80 p-1 dark:bg-stone-950/60">
                        {qualityOptions.map((item) => {
                            const active = quality === item.value;
                            return (
                                <button
                                    key={item.value}
                                    type="button"
                                    onClick={() => onConfigChange("quality", item.value)}
                                    className={cn(
                                        "flex h-7 items-center justify-center rounded-lg transition-all active:scale-95",
                                        active
                                            ? "bg-white !text-stone-900 shadow-xs dark:bg-stone-700 dark:!text-white"
                                            : "text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200"
                                    )}
                                >
                                    <span className="!text-[11.5px] font-medium leading-none">
                                        {t(`settingsPanels.common.${item.labelKey}`)}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* 生成张数 (Count) */}
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11.5px]">
                        <span className="font-medium text-stone-600 dark:text-stone-400">{t("settingsPanels.image.count")}</span>
                        <span className="font-mono text-stone-400 dark:text-stone-500">
                            {t("settingsPanels.image.images", { count })}
                        </span>
                    </div>
                    <div className="flex items-center gap-1 rounded-xl bg-stone-100/80 p-1 dark:bg-stone-950/60">
                        {[1, 2, 3, 4].map((num) => {
                            const active = count === num;
                            return (
                                <button
                                    key={num}
                                    type="button"
                                    onClick={() => onConfigChange("count", String(num))}
                                    className={cn(
                                        "flex h-7 flex-1 items-center justify-center rounded-lg transition-all active:scale-95",
                                        active
                                            ? "bg-white !text-stone-900 shadow-xs dark:bg-stone-700 dark:!text-white"
                                            : "text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200"
                                    )}
                                >
                                    <span className="!text-[11.5px] font-medium leading-none">
                                        {t("settingsPanels.image.images", { count: num })}
                                    </span>
                                </button>
                            );
                        })}
                        <div
                            className={cn(
                                "flex h-7 w-16 items-center rounded-lg px-1.5 transition-all",
                                count > 4
                                    ? "bg-white shadow-xs dark:bg-stone-700"
                                    : "hover:bg-black/5 dark:hover:bg-white/5"
                            )}
                        >
                            <input
                                type="number"
                                min={1}
                                max={maxCount}
                                value={count}
                                onChange={(e) => {
                                    const val = Math.max(1, Math.min(maxCount, Number(e.target.value) || 1));
                                    onConfigChange("count", String(val));
                                }}
                                className={cn(
                                    "w-full bg-transparent text-center font-mono !text-[11.5px] font-medium outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                                    count > 4
                                        ? "!text-stone-900 dark:!text-white"
                                        : "text-stone-600 dark:text-stone-300"
                                )}
                                placeholder="自定义"
                            />
                            <span className="shrink-0 !text-[10.5px] text-stone-400 dark:text-stone-500">张</span>
                        </div>
                    </div>
                </div>

                {/* 精确尺寸 (W x H) 与 16 对齐 */}
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11.5px]">
                        <span className="font-medium text-stone-600 dark:text-stone-400">{t("settingsPanels.image.size")}</span>
                        <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200" title={t("settingsPanels.image.align16Hint")}>
                            <span>{t("settingsPanels.image.align16")}</span>
                            <Switch size="small" checked={snapDimensionToStep} onChange={setSnapDimensionToStep} />
                        </label>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex-1 flex items-center h-7.5 rounded-xl bg-stone-100/80 px-2.5 dark:bg-stone-950/60 focus-within:bg-white focus-within:ring-1 focus-within:ring-stone-200 dark:focus-within:bg-stone-900 dark:focus-within:ring-stone-700">
                            <span className="!text-[11px] font-mono font-semibold text-stone-400 dark:text-stone-500 mr-1.5 shrink-0">W</span>
                            <input
                                type="number"
                                min={1}
                                disabled={selectedRatio === "auto"}
                                defaultValue={dimensions.width || ""}
                                key={`w-${dimensions.width}`}
                                onBlur={(e) => updateDimension("width", Number(e.currentTarget.value) || null)}
                                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                                className="w-full bg-transparent !text-[11.5px] font-mono font-medium !text-stone-800 dark:!text-stone-100 outline-none disabled:opacity-40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            />
                        </div>
                        <span className="!text-[11.5px] text-stone-400 dark:text-stone-500 font-medium">×</span>
                        <div className="flex-1 flex items-center h-7.5 rounded-xl bg-stone-100/80 px-2.5 dark:bg-stone-950/60 focus-within:bg-white focus-within:ring-1 focus-within:ring-stone-200 dark:focus-within:bg-stone-900 dark:focus-within:ring-stone-700">
                            <span className="!text-[11px] font-mono font-semibold text-stone-400 dark:text-stone-500 mr-1.5 shrink-0">H</span>
                            <input
                                type="number"
                                min={1}
                                disabled={selectedRatio === "auto"}
                                defaultValue={dimensions.height || ""}
                                key={`h-${dimensions.height}`}
                                onBlur={(e) => updateDimension("height", Number(e.currentTarget.value) || null)}
                                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                                className="w-full bg-transparent !text-[11.5px] font-mono font-medium !text-stone-800 dark:!text-stone-100 outline-none disabled:opacity-40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            />
                        </div>
                    </div>
                </div>

                {/* 透明背景 (Transparent Background) */}
                <div className="flex items-center justify-between rounded-xl bg-stone-100/80 px-3 py-2 dark:bg-stone-950/60">
                    <div className="space-y-0.5">
                        <div className="text-[11.5px] font-medium text-stone-700 dark:text-stone-300">
                            {t("settingsPanels.image.transparent")}
                        </div>
                        <div className="text-[11px] text-stone-400 dark:text-stone-500">
                            {t("settingsPanels.image.transparentHint")}
                        </div>
                    </div>
                    <Switch size="small" checked={transparentBackground} onChange={(checked) => onConfigChange("background", checked ? "transparent" : "")} />
                </div>
            </div>
        </ImageSettingsTheme>
    );
}

function AspectVisual({ width, height, isAuto, active }: { width: number; height: number; isAuto: boolean; active: boolean }) {
    if (isAuto) {
        return (
            <span className={cn("flex h-3.5 w-4 items-center justify-center text-[10px] font-semibold leading-none", active ? "!text-stone-900 dark:!text-stone-100" : "text-stone-400")}>
                ✦
            </span>
        );
    }
    const ratio = width / height;
    const boxW = ratio >= 1 ? 15 : Math.max(6, Math.round(15 * ratio));
    const boxH = ratio >= 1 ? Math.max(6, Math.round(15 / ratio)) : 15;

    return (
        <span className="flex h-3.5 w-4 items-center justify-center">
            <span
                className={cn(
                    "rounded-[2px] transition-all",
                    active
                        ? "border-[1.5px] border-stone-900 bg-stone-900/15 dark:border-white dark:bg-white/20"
                        : "border-[1.2px] border-stone-400 group-hover:border-stone-600 dark:border-stone-500 dark:group-hover:border-stone-300"
                )}
                style={{ width: boxW, height: boxH }}
            />
        </span>
    );
}

export function ImageSettingsTheme({ theme, children }: { theme: CanvasTheme; children: ReactNode }) {
    return (
        <ConfigProvider
            theme={{
                token: { colorBgContainer: theme.toolbar.panel, colorBgElevated: theme.toolbar.panel, colorBorder: theme.node.stroke, colorPrimary: theme.node.activeStroke, colorText: theme.node.text, colorTextLightSolid: theme.node.panel },
                components: {
                    Button: { defaultBg: theme.toolbar.panel, defaultBorderColor: theme.node.stroke, defaultColor: theme.node.text },
                    Slider: { railBg: theme.node.stroke, railHoverBg: theme.node.stroke, trackBg: theme.node.activeStroke, handleColor: theme.node.text, handleActiveColor: theme.node.text },
                },
            }}
        >
            {children}
        </ConfigProvider>
    );
}

export function imageQualityLabel(value: string) {
    return (["auto", "high", "medium", "low"].includes(value) ? i18n.t(`settingsPanels.common.${value}`) : value);
}

export function imageSizeLabel(size: string) {
    const scale = inferMediaScale(size);
    const ratio = inferMediaRatio(size);
    if (ratio === "auto" || size === "auto") return i18n.t("settingsPanels.common.auto");
    if (scale === "auto") return ratio;
    return `${scale} · ${ratio}`;
}

function alignDimension(value: number, enabled: boolean) {
    return enabled ? Math.ceil(value / DIMENSION_STEP) * DIMENSION_STEP : value;
}
