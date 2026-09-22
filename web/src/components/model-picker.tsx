import { useEffect, useId, useMemo, useState } from "react";
import { Cpu } from "lucide-react";
import { useTranslation } from "react-i18next";

import i18n from "@/i18n";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { decodeChannelModel, modelOptionLabel, modelOptionName, selectableModelsByCapability, type AiConfig, type ModelCapability } from "@/stores/use-config-store";

type ModelPickerProps = {
    config: AiConfig;
    value?: string;
    onChange: (model: string) => void;
    capability?: ModelCapability;
    className?: string;
    fullWidth?: boolean;
    /** 底栏等窄位：主文案只显示模型名，渠道以次要样式并列 */
    compact?: boolean;
    placeholder?: string;
    onMissingConfig?: () => void;
};

export function ModelPicker({ config, value, onChange, capability, className, fullWidth = false, compact = false, placeholder, onMissingConfig }: ModelPickerProps) {
    const { t } = useTranslation();
    const pickerId = useId();
    const [open, setOpen] = useState(false);
    const options = useMemo(() => Array.from(new Set([...(config.channelMode === "local" && !capability ? [value] : []), ...selectableModelsByCapability(config, capability)].filter((model): model is string => Boolean(model)))), [capability, config, value]);
    const current = value || "";
    const pickerPlaceholder = placeholder || t("settingsPanels.model.select");
    const modelName = current ? modelOptionName(current) : "";

    useEffect(() => {
        const closeOtherPicker = (event: Event) => {
            if ((event as CustomEvent<string>).detail !== pickerId) setOpen(false);
        };
        window.addEventListener("model-picker-open", closeOtherPicker);
        return () => window.removeEventListener("model-picker-open", closeOtherPicker);
    }, [pickerId]);

    return (
        <Select
            open={open}
            value={current}
            onOpenChange={(nextOpen) => {
                if (nextOpen && !options.length && config.channelMode === "local") onMissingConfig?.();
                if (nextOpen) window.dispatchEvent(new CustomEvent("model-picker-open", { detail: pickerId }));
                setOpen(nextOpen);
            }}
            onValueChange={onChange}
        >
            <SelectTrigger
                className={cn(
                    "canvas-composer-model-picker h-8 w-fit gap-1.5 transition-colors",
                    compact
                        ? "min-w-0 max-w-[130px] sm:max-w-[220px] justify-start rounded-lg border-0 bg-transparent px-2 text-xs font-medium text-stone-700 shadow-none hover:bg-black/5 hover:text-stone-900 focus-visible:ring-0 dark:bg-transparent dark:text-stone-300 dark:hover:bg-white/10 dark:hover:text-stone-100 [&_.canvas-select-chevron]:size-3.5 [&_.canvas-select-chevron]:text-stone-400 dark:[&_.canvas-select-chevron]:text-stone-500 [&_.canvas-select-chevron]:transition-transform data-[state=open]:[&_.canvas-select-chevron]:rotate-180"
                        : "min-w-[9rem] justify-start rounded-lg border border-input bg-transparent px-3 text-sm font-normal shadow-xs hover:bg-stone-50 dark:hover:bg-stone-800",
                    fullWidth && "w-full min-w-0 justify-start",
                    className,
                )}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                title={current ? modelOptionLabel(config, current) : pickerPlaceholder}
            >
                <ModelIcon model={current} className="size-3.5" />
                {current ? (
                    compact ? (
                        <span className="canvas-model-picker-text min-w-0 flex-1 truncate text-left font-medium text-stone-700 dark:text-stone-300">
                            {modelName}
                        </span>
                    ) : (
                        <span className="canvas-model-picker-text min-w-0 flex-1 truncate text-left">{modelOptionLabel(config, current)}</span>
                    )
                ) : (
                    <span className="canvas-model-picker-text min-w-0 flex-1 truncate text-left text-muted-foreground">{pickerPlaceholder}</span>
                )}
            </SelectTrigger>
            <SelectContent
                data-canvas-no-zoom
                className="z-[1200] w-72 max-w-[calc(100vw-24px)] rounded-xl border border-stone-200 bg-popover p-1 shadow-lg dark:border-stone-800"
                position="popper"
                align="start"
                side="bottom"
                sideOffset={6}
                onPointerDown={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
            >
                <div className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium text-stone-400 select-none dark:text-stone-500">
                    {t("settingsPanels.model.select")}
                </div>
                {options.length ? (
                    options.map((model) => {
                        const optModelName = modelOptionName(model);
                        const optChannelName = modelOptionChannelName(config, model);
                        return (
                            <SelectItem
                                key={model}
                                value={model}
                                textValue={modelOptionLabel(config, model)}
                                className="my-0.5 cursor-pointer rounded-lg px-2.5 py-1.5 text-xs transition-colors focus:bg-stone-100 dark:focus:bg-stone-800"
                            >
                                <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                                    <div className="flex min-w-0 items-center gap-1.5">
                                        <ModelIcon model={model} />
                                        <span className="truncate font-medium text-stone-800 dark:text-stone-200">{optModelName}</span>
                                    </div>
                                    {optChannelName ? (
                                        <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                                            {optChannelName}
                                        </span>
                                    ) : null}
                                </div>
                            </SelectItem>
                        );
                    })
                ) : (
                    <SelectItem value="__empty__" disabled>
                        {emptyModelLabel(config, capability)}
                    </SelectItem>
                )}
            </SelectContent>
        </Select>
    );
}

function emptyModelLabel(config: AiConfig, capability?: ModelCapability) {
    const label = capability ? i18n.t(`settingsPanels.model.capabilities.${capability}`) : "";
    if (capability && config.models.length) return i18n.t("settingsPanels.model.assign", { capability: label });
    return config.models.length ? i18n.t("settingsPanels.model.noMatch", { capability: label }) : i18n.t("settingsPanels.model.addFirst");
}

function ModelLabel({ config, model }: { config: AiConfig; model: string }) {
    return (
        <span className="flex min-w-0 items-center gap-2">
            <ModelIcon model={model} />
            <span className="truncate">{modelOptionLabel(config, model)}</span>
        </span>
    );
}

function modelOptionChannelName(config: AiConfig, value: string) {
    const decoded = decodeChannelModel(value);
    if (!decoded) return null;
    return config.channels.find((item) => item.id === decoded.channelId)?.name ?? null;
}

function ModelIcon({ model, className }: { model: string; className?: string }) {
    const icon = resolveModelIcon(modelOptionName(model));
    return icon ? <img src={icon} alt="" className={cn("size-4 shrink-0 dark:invert", className)} /> : <Cpu className={cn("size-4 shrink-0 opacity-70", className)} />;
}

function resolveModelIcon(model: string) {
    const name = model.toLowerCase();
    if (name.includes("claude") || name.includes("anthropic")) return "/icons/claude.svg";
    if (name.includes("gemini") || name.includes("google")) return "/icons/gemini.svg";
    if (name.includes("gpt") || name.includes("openai")) return "/icons/openai.svg";
    if (name.includes("grok") || name.includes("grok")) return "/icons/grok.svg";
    if (name.includes("deepseek") || name.includes("deepseek")) return "/icons/deepseek.svg";
    if (name.includes("glm") || name.includes("glm")) return "/icons/glm.svg";
    return "";
}
