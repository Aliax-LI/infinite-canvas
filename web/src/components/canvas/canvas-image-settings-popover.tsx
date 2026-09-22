import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Settings2 } from "lucide-react";
import { Button } from "antd";
import { useTranslation } from "react-i18next";

import { ImageSettingsPanel, imageQualityLabel, imageSizeLabel } from "@/components/image-settings-panel";
import { canvasThemes } from "@/lib/canvas-theme";
import { inferMediaRatio } from "@/lib/media-size";
import { cn } from "@/lib/utils";
import { useThemeStore } from "@/stores/use-theme-store";
import type { AiConfig } from "@/stores/use-config-store";

type CanvasImageSettingsPopoverProps = {
    config: AiConfig;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
    onMissingConfig?: () => void;
    onOpenChange?: (open: boolean) => void;
    buttonClassName?: string;
    getPopupContainer?: (triggerNode: HTMLElement) => HTMLElement;
    placement?: "topLeft" | "top" | "topRight" | "bottomLeft" | "bottom" | "bottomRight";
    autoAdjustOverflow?: boolean;
    /** 工作台：仅展示「比例｜张数」 */
    summary?: "quality-size-count" | "ratio-count";
    triggerIcon?: ReactNode;
    triggerVariant?: "canvas" | "flat";
    panelVariant?: "canvas" | "app";
    maxCount?: number;
};

export function CanvasImageSettingsPopover({
    config,
    onConfigChange,
    onOpenChange,
    buttonClassName,
    placement = "topLeft",
    summary = "quality-size-count",
    triggerIcon,
    triggerVariant = "canvas",
    panelVariant = "canvas",
    maxCount = 15,
}: CanvasImageSettingsPopoverProps) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const buttonRef = useRef<HTMLSpanElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);
    const quality = config.quality || "auto";
    const count = Math.max(1, Math.min(maxCount, Math.floor(Math.abs(Number(config.count)) || 1)));
    const activeSize = config.size || "auto";
    const updateOpen = (nextOpen: boolean) => {
        setOpen(nextOpen);
        onOpenChange?.(nextOpen);
    };

    useEffect(() => {
        if (!open) return;
        const syncPosition = () => setButtonRect(buttonRef.current?.getBoundingClientRect() || null);
        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            if (document.activeElement instanceof HTMLElement && panelRef.current?.contains(document.activeElement)) document.activeElement.blur();
            setOpen(false);
            onOpenChange?.(false);
        };

        syncPosition();
        window.addEventListener("resize", syncPosition);
        window.addEventListener("scroll", syncPosition, true);
        window.addEventListener("pointerdown", closeOnOutsidePointer, true);
        return () => {
            window.removeEventListener("resize", syncPosition);
            window.removeEventListener("scroll", syncPosition, true);
            window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
        };
    }, [onOpenChange, open]);

    const ratio = inferMediaRatio(activeSize);
    const ratioLabel = ratio === "auto" ? t("settingsPanels.common.auto") : ratio;
    const triggerLabel =
        summary === "ratio-count" ? (
            <span className="inline-flex items-center gap-1 font-medium text-stone-700 dark:text-stone-300">
                <span>{ratioLabel}</span>
                <span className="font-normal text-stone-300 dark:text-stone-600">|</span>
                <span>{t("settingsPanels.image.images", { count })}</span>
            </span>
        ) : (
            <>
                {imageQualityLabel(quality)} · {imageSizeLabel(activeSize)} · {t("canvas.controls.images", { count })}
            </>
        );

    const panel =
        open && buttonRect ? (
            <ImageSettingsPortal buttonRect={buttonRect} panelRef={panelRef} placement={placement} theme={theme} config={config} onConfigChange={onConfigChange} panelVariant={panelVariant} maxCount={maxCount} />
        ) : null;

    return (
        <>
            <span ref={buttonRef} className="inline-flex min-w-0">
                {triggerVariant === "flat" ? (
                    <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => updateOpen(!open)}
                        className={cn(
                            "inline-flex h-8 items-center justify-start gap-1.5 rounded-lg border-0 bg-transparent px-2 text-xs font-medium text-stone-700 shadow-none transition-colors hover:bg-black/5 hover:text-stone-900 focus-visible:outline-none dark:text-stone-300 dark:hover:bg-white/10 dark:hover:text-stone-100",
                            open && "bg-black/5 dark:bg-white/10",
                            buttonClassName,
                        )}
                    >
                        {triggerIcon ?? <Settings2 className="size-3.5 shrink-0 text-stone-500 dark:text-stone-400" />}
                        <span className="truncate">{triggerLabel}</span>
                    </button>
                ) : (
                    <Button
                        size="small"
                        type="text"
                        aria-expanded={open}
                        className={cn(
                            "!h-8 !max-w-[180px] !justify-start !rounded-full !px-2.5",
                            buttonClassName,
                        )}
                        style={{ background: theme.node.fill, color: theme.node.text }}
                        icon={triggerIcon ?? <Settings2 className="size-3.5" />}
                        onClick={() => updateOpen(!open)}
                    >
                        <span className="truncate">{triggerLabel}</span>
                    </Button>
                )}
            </span>
            {panel}
        </>
    );
}

function ImageSettingsPortal({
    buttonRect,
    panelRef,
    placement,
    theme,
    config,
    onConfigChange,
    panelVariant,
    maxCount,
}: {
    buttonRect: DOMRect;
    panelRef: RefObject<HTMLDivElement | null>;
    placement: CanvasImageSettingsPopoverProps["placement"];
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    config: AiConfig;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
    panelVariant: CanvasImageSettingsPopoverProps["panelVariant"];
    maxCount: number;
}) {
    const margin = 12;
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const defaultWidth = 352;
    const width = Math.min(defaultWidth, Math.max(280, viewportWidth - margin * 2));
    const gap = 8;
    const alignRight = placement?.endsWith("Right");
    const alignCenter = placement === "top" || placement === "bottom";
    const rawLeft = alignCenter ? buttonRect.left + buttonRect.width / 2 - width / 2 : alignRight ? buttonRect.right - width : buttonRect.left;
    const left = Math.max(margin, Math.min(viewportWidth - width - margin, rawLeft));
    const topPlacement = placement?.startsWith("top");
    const style = {
        position: "fixed",
        zIndex: 1200,
        width,
        left,
        ...(topPlacement ? { bottom: viewportHeight - buttonRect.top + gap, maxHeight: Math.max(220, buttonRect.top - margin * 2) } : { top: buttonRect.bottom + gap, maxHeight: Math.max(220, viewportHeight - buttonRect.bottom - margin * 2) }),
        overflowY: "auto",
        ...(panelVariant === "app"
            ? {}
            : {
                  background: theme.toolbar.panel,
                  borderRadius: 18,
                  boxShadow: "0 18px 54px rgba(28, 25, 23, 0.16)",
                  padding: 16,
                  color: theme.node.text,
              }),
    } as const;

    return createPortal(
        <div
            ref={panelRef}
            className={cn(
                "canvas-image-settings-popover thin-scrollbar",
                panelVariant === "app" && "rounded-2xl border border-stone-200/80 bg-white/95 p-3.5 shadow-2xl backdrop-blur-md dark:border-stone-800 dark:bg-stone-900/95"
            )}
            style={style}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
        >
            <ImageSettingsPanel config={config} onConfigChange={(key, value) => onConfigChange(key, value)} theme={theme} className="space-y-3" maxCount={maxCount} quickCount={Math.min(10, maxCount)} />
        </div>,
        document.body,
    );
}
