import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { App, Modal, Select } from "antd";
import { useTranslation } from "react-i18next";

import i18n from "@/i18n";
import { usePromptSourceScheduler } from "@/hooks/use-prompt-source-scheduler";
import { fetchChannelModels } from "@/services/api/image";
import {
    Sub2ApiRequestError,
    createSub2ApiKey,
    findSub2ApiEmbedKey,
    listSub2ApiGroups,
    parseSub2ApiEmbedSearchParams,
    provisionSub2ApiGatewayKey,
    sub2ApiKeyHasGroup,
    suggestSub2ApiGroupId,
    updateSub2ApiKeyGroup,
    type Sub2ApiEmbedDefaults,
    type Sub2ApiGroup,
} from "@/services/api/sub2api";
import { isAppEmbedded } from "@/lib/agent/local-agent-connect-policy";
import { findChannelByImportedBaseUrl, useConfigStore } from "@/stores/use-config-store";
import { useAgentStore } from "@/stores/use-agent-store";
import { useThemeStore } from "@/stores/use-theme-store";

function applyEmbedPreferences(searchParams: URLSearchParams) {
    const theme = searchParams.get("theme");
    if (theme === "light" || theme === "dark") useThemeStore.getState().setTheme(theme);
    const lang = searchParams.get("lang");
    if (lang === "zh" || lang === "zh-CN") void i18n.changeLanguage("zh-CN");
    else if (lang === "en" || lang === "en-US") void i18n.changeLanguage("en-US");
}

function stripSearchParams(searchParams: URLSearchParams, keys: string[]) {
    for (const key of keys) searchParams.delete(key);
    window.history.replaceState(null, "", `${window.location.pathname}${searchParams.size ? `?${searchParams}` : ""}${window.location.hash}`);
}

type Sub2ApiGroupPickerState = {
    srcHost: string;
    sessionToken: string;
    defaults: Sub2ApiEmbedDefaults;
    groups: Sub2ApiGroup[];
    groupId: number | undefined;
    /** 已有「无限画布」Key 但未绑分组时，确认后 PUT 更新 */
    existingKeyId?: number;
};

export function ClientRootInit({ children }: { children: ReactNode }) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const handledConfigParams = useRef(false);
    const importChannelCredentials = useConfigStore((state) => state.importChannelCredentials);
    const enrichImportedChannelFromEmbed = useConfigStore((state) => state.enrichImportedChannelFromEmbed);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const [groupPicker, setGroupPicker] = useState<Sub2ApiGroupPickerState | null>(null);
    const [groupSubmitting, setGroupSubmitting] = useState(false);

    usePromptSourceScheduler();

    useEffect(() => {
        if (!isAppEmbedded()) return;
        useAgentStore.getState().disconnectAgent();
    }, []);

    const finishSub2ApiImport = useCallback(
        async (srcHost: string, gatewayKey: string, defaults: Sub2ApiEmbedDefaults) => {
            const result = importChannelCredentials({ baseUrl: srcHost, apiKey: gatewayKey });
            const channel = findChannelByImportedBaseUrl(useConfigStore.getState().config, srcHost);
            let modelNames: string[] = [];
            if (channel?.baseUrl.trim() && channel.apiKey.trim()) {
                try {
                    modelNames = await fetchChannelModels(channel);
                } catch {
                    modelNames = [];
                }
            }
            const hasDefaults = Object.values(defaults).some(Boolean);
            if (modelNames.length || hasDefaults) enrichImportedChannelFromEmbed(srcHost, modelNames, defaults);
            openConfigDialog(false, "channels");
            if (result.status === "created") message.success(t("config.importedChannelCreated", { name: result.channelName }));
            else if (result.status === "updated") message.success(t("config.importedChannelUpdated", { name: result.channelName }));
            else if (result.status === "missing-base-url") message.error(t("config.importedChannelBaseUrlRequired"));
            else message.error(t("config.importedChannelBaseUrlInvalid"));
        },
        [enrichImportedChannelFromEmbed, importChannelCredentials, message, openConfigDialog, t],
    );

    const openGroupPicker = useCallback(
        (
            payload: Omit<Sub2ApiGroupPickerState, "groups" | "groupId"> & { groups: Sub2ApiGroup[]; urlGroupId?: number },
        ) => {
            setGroupPicker({
                ...payload,
                groupId: suggestSub2ApiGroupId(payload.groups, payload.urlGroupId),
            });
        },
        [],
    );

    const runSub2ApiImport = useCallback(
        async (srcHost: string, sessionToken: string, defaults: Sub2ApiEmbedDefaults, urlGroupId?: number) => {
            const localApiKey = findChannelByImportedBaseUrl(useConfigStore.getState().config, srcHost)?.apiKey;
            const hide = message.loading(t("config.sub2apiImporting"), 0);
            try {
                let groups: Sub2ApiGroup[] = [];
                try {
                    groups = await listSub2ApiGroups(srcHost, sessionToken);
                } catch {
                    groups = [];
                }

                const existing = await findSub2ApiEmbedKey(srcHost, sessionToken);
                if (existing) {
                    if (!sub2ApiKeyHasGroup(existing) && groups.length >= 1) {
                        hide();
                        openGroupPicker({ srcHost, sessionToken, defaults, groups, urlGroupId, existingKeyId: existing.id });
                        return;
                    }
                    const gatewayKey = await provisionSub2ApiGatewayKey(srcHost, sessionToken, { localApiKey });
                    await finishSub2ApiImport(srcHost, gatewayKey, defaults);
                    return;
                }

                if (groups.length >= 1) {
                    hide();
                    openGroupPicker({ srcHost, sessionToken, defaults, groups, urlGroupId });
                    return;
                }

                if (urlGroupId == null) {
                    message.error(t("config.sub2apiGroupsLoadFailed"));
                    return;
                }

                const gatewayKey = await createSub2ApiKey(srcHost, sessionToken, { groupId: urlGroupId });
                await finishSub2ApiImport(srcHost, gatewayKey, defaults);
            } catch (error) {
                if (error instanceof Sub2ApiRequestError && error.code === "SUB2API_EMBED_KEY_EXISTS") {
                    message.error(t("config.sub2apiExistingKeyNoSecret"));
                    return;
                }
                message.error(error instanceof Sub2ApiRequestError ? error.message : t("config.sub2apiImportFailed"));
            } finally {
                hide();
            }
        },
        [finishSub2ApiImport, message, openGroupPicker, t],
    );

    const confirmGroupPick = async () => {
        if (!groupPicker?.groupId) {
            message.warning(t("config.sub2apiGroupRequired"));
            return;
        }
        setGroupSubmitting(true);
        const hide = message.loading(t("config.sub2apiImporting"), 0);
        try {
            let gatewayKey: string;
            if (groupPicker.existingKeyId) {
                await updateSub2ApiKeyGroup(groupPicker.srcHost, groupPicker.sessionToken, groupPicker.existingKeyId, groupPicker.groupId);
                const localApiKey = findChannelByImportedBaseUrl(useConfigStore.getState().config, groupPicker.srcHost)?.apiKey;
                gatewayKey = await provisionSub2ApiGatewayKey(groupPicker.srcHost, groupPicker.sessionToken, { localApiKey });
            } else {
                gatewayKey = await createSub2ApiKey(groupPicker.srcHost, groupPicker.sessionToken, { groupId: groupPicker.groupId });
            }
            await finishSub2ApiImport(groupPicker.srcHost, gatewayKey, groupPicker.defaults);
            setGroupPicker(null);
        } catch (error) {
            message.error(error instanceof Sub2ApiRequestError ? error.message : t("config.sub2apiImportFailed"));
        } finally {
            hide();
            setGroupSubmitting(false);
        }
    };

    useEffect(() => {
        if (handledConfigParams.current) return;
        const searchParams = new URLSearchParams(window.location.search);
        const srcHost = searchParams.get("src_host") || searchParams.get("srcHost");
        const sessionToken = searchParams.get("token");
        const baseUrl = searchParams.get("baseUrl") || searchParams.get("baseurl");
        const apiKey = searchParams.get("apiKey") || searchParams.get("apikey");

        if (srcHost && sessionToken) {
            handledConfigParams.current = true;
            const embed = parseSub2ApiEmbedSearchParams(searchParams);
            applyEmbedPreferences(searchParams);
            stripSearchParams(searchParams, embed.stripKeys);
            void runSub2ApiImport(srcHost, sessionToken, embed.defaults, embed.groupId);
            return;
        }

        if (!baseUrl && !apiKey) return;
        handledConfigParams.current = true;
        stripSearchParams(searchParams, ["baseUrl", "baseurl", "apiKey", "apikey"]);
        const result = importChannelCredentials({ baseUrl, apiKey });
        openConfigDialog(false, "channels");
        if (result.status === "created") message.success(t("config.importedChannelCreated", { name: result.channelName }));
        else if (result.status === "updated") message.success(t("config.importedChannelUpdated", { name: result.channelName }));
        else if (result.status === "missing-base-url") message.error(t("config.importedChannelBaseUrlRequired"));
        else message.error(t("config.importedChannelBaseUrlInvalid"));
    }, [importChannelCredentials, message, openConfigDialog, runSub2ApiImport, t]);

    return (
        <>
            {children}
            <Modal
                open={Boolean(groupPicker)}
                title={t("config.sub2apiGroupPickerTitle")}
                okText={groupPicker?.existingKeyId ? t("config.sub2apiGroupPickerAssignConfirm") : t("config.sub2apiGroupPickerConfirm")}
                cancelText={t("common.cancel")}
                confirmLoading={groupSubmitting}
                onOk={() => void confirmGroupPick()}
                onCancel={() => setGroupPicker(null)}
                destroyOnHidden
            >
                <p className="mb-3 text-sm text-stone-500 dark:text-stone-400">
                    {groupPicker?.existingKeyId ? t("config.sub2apiGroupPickerAssignDescription") : t("config.sub2apiGroupPickerDescription")}
                </p>
                <Select
                    className="w-full"
                    placeholder={t("config.sub2apiGroupPickerPlaceholder")}
                    value={groupPicker?.groupId}
                    options={groupPicker?.groups.map((group) => ({
                        value: group.id,
                        label: group.name?.trim() || t("config.sub2apiGroupFallbackName", { id: group.id }),
                    }))}
                    onChange={(groupId) => setGroupPicker((current) => (current ? { ...current, groupId } : current))}
                />
            </Modal>
        </>
    );
}
