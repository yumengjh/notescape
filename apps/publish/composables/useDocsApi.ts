import type {
  ApiEnvelope,
  AuthUserProfile,
  DeepPartial,
  DocumentContent,
  DocumentContentQuery,
  DocumentMeta,
  PaginatedResult,
  PreferenceSettings,
  TagMeta,
  WorkspaceMeta,
} from "~/types/api";

type ListPublishedDocsParams = {
  page?: number;
  pageSize?: number;
};

type ListWorkspaceTagsParams = {
  workspaceId?: string;
  page?: number;
  pageSize?: number;
};

type SettingsPayload = {
  settings?: DeepPartial<PreferenceSettings> | null;
};

export const DEFAULT_WORKSPACE_PREFERENCE_SETTINGS: PreferenceSettings = {
  reader: { contentWidth: 800, fontSize: 16 },
  editor: { contentWidth: 800, fontSize: 16 },
  advanced: {
    compactList: true,
    codeFontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, Courier, monospace',
  },
};

const normalizeMessage = (message: unknown): string => {
  if (typeof message === "string" && message.trim()) return message;
  if (Array.isArray(message)) {
    const joined = message.filter((item) => typeof item === "string").join("；");
    if (joined.trim()) return joined;
  }
  return "请求失败，请稍后重试";
};

const unwrapEnvelope = <T>(envelope: ApiEnvelope<T>): T => {
  if (envelope?.success === true && envelope.data !== undefined) return envelope.data;
  throw new Error(normalizeMessage(envelope?.error?.message));
};

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
};

const toPositiveInteger = (value: unknown, fallback: number) => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return fallback;
  const rounded = Math.round(normalized);
  return rounded > 0 ? rounded : fallback;
};

const extractSettings = (payload: unknown): DeepPartial<PreferenceSettings> | null => {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const fromSettings = root.settings;
  if (fromSettings && typeof fromSettings === "object") {
    return fromSettings as DeepPartial<PreferenceSettings>;
  }
  if ("reader" in root || "editor" in root || "advanced" in root) {
    return payload as DeepPartial<PreferenceSettings>;
  }
  return null;
};

const resolveSettings = (settings?: DeepPartial<PreferenceSettings> | null): PreferenceSettings => {
  const source = settings || {};
  return {
    reader: {
      contentWidth: clamp(
        source.reader?.contentWidth,
        680,
        1200,
        DEFAULT_WORKSPACE_PREFERENCE_SETTINGS.reader.contentWidth,
      ),
      fontSize: clamp(
        source.reader?.fontSize,
        13,
        22,
        DEFAULT_WORKSPACE_PREFERENCE_SETTINGS.reader.fontSize,
      ),
    },
    editor: {
      contentWidth: clamp(
        source.editor?.contentWidth,
        680,
        1200,
        DEFAULT_WORKSPACE_PREFERENCE_SETTINGS.editor.contentWidth,
      ),
      fontSize: clamp(
        source.editor?.fontSize,
        13,
        22,
        DEFAULT_WORKSPACE_PREFERENCE_SETTINGS.editor.fontSize,
      ),
    },
    advanced: {
      compactList:
        typeof source.advanced?.compactList === "boolean"
          ? source.advanced.compactList
          : DEFAULT_WORKSPACE_PREFERENCE_SETTINGS.advanced.compactList,
      codeFontFamily:
        typeof source.advanced?.codeFontFamily === "string" &&
        source.advanced.codeFontFamily.trim().length > 0
          ? source.advanced.codeFontFamily.trim()
          : DEFAULT_WORKSPACE_PREFERENCE_SETTINGS.advanced.codeFontFamily,
    },
  };
};

export const useDocsApi = () => {
  const runtimeConfig = useRuntimeConfig();
  const workspaceId = runtimeConfig.public.workspaceId;

  const ensureWorkspaceId = () => {
    if (workspaceId) return workspaceId;
    throw new Error("缺少 NUXT_PUBLIC_WORKSPACE_ID，无法加载文档");
  };

  const listPublishedDocs = async (params: ListPublishedDocsParams = {}) => {
    const currentWorkspaceId = ensureWorkspaceId();
    const envelope = await $fetch<ApiEnvelope<PaginatedResult<DocumentMeta>>>("/api/v1/documents", {
      query: {
        workspaceId: currentWorkspaceId,
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 20,
        sortBy: "updatedAt",
        sortOrder: "DESC",
      },
    });
    const data = unwrapEnvelope(envelope);
    const items = (data.items || []).filter((item) => {
      return typeof item?.publishedHead === "number" && item.publishedHead > 0;
    });
    return {
      ...data,
      items,
      total: items.length,
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 20,
    };
  };

  const getDocument = async (docId: string) => {
    const envelope = await $fetch<ApiEnvelope<DocumentMeta>>(`/api/v1/documents/${docId}`);
    return unwrapEnvelope(envelope);
  };

  const getDocumentContent = async (docId: string, query: DocumentContentQuery = {}) => {
    const envelope = await $fetch<ApiEnvelope<DocumentContent>>(
      `/api/v1/documents/${docId}/content`,
      {
        query,
      },
    );
    return unwrapEnvelope(envelope);
  };

  const listWorkspaceTags = async (params: ListWorkspaceTagsParams = {}) => {
    const currentWorkspaceId = params.workspaceId || ensureWorkspaceId();
    const page = toPositiveInteger(params.page, 1);
    const pageSize = Math.min(100, toPositiveInteger(params.pageSize, 100));
    const envelope = await $fetch<ApiEnvelope<PaginatedResult<TagMeta>>>("/api/v1/tags", {
      query: {
        workspaceId: currentWorkspaceId,
        page,
        pageSize,
      },
    });
    return unwrapEnvelope(envelope);
  };

  const getWorkspaceDetail = async (workspaceIdOverride?: string) => {
    const currentWorkspaceId = workspaceIdOverride || ensureWorkspaceId();
    const envelope = await $fetch<ApiEnvelope<WorkspaceMeta>>(
      `/api/v1/workspaces/${encodeURIComponent(currentWorkspaceId)}`,
    );
    return unwrapEnvelope(envelope);
  };

  const userProfileCache = new Map<string, Promise<AuthUserProfile | null>>();

  const getUserProfile = async (userId?: string) => {
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) return null;
    const cached = userProfileCache.get(normalizedUserId);
    if (cached) return cached;

    const task = (async () => {
      try {
        const envelope = await $fetch<ApiEnvelope<AuthUserProfile>>(
          `/api/v1/auth/users/${encodeURIComponent(normalizedUserId)}`,
        );
        return unwrapEnvelope(envelope);
      } catch {
        return null;
      }
    })();

    userProfileCache.set(normalizedUserId, task);
    return task;
  };

  const getWorkspacePreferenceSettings = async (workspaceIdOverride?: string) => {
    const currentWorkspaceId = workspaceIdOverride || ensureWorkspaceId();
    const envelope = await $fetch<ApiEnvelope<SettingsPayload | DeepPartial<PreferenceSettings>>>(
      `/api/v1/workspaces/${currentWorkspaceId}/settings`,
    );
    const data = unwrapEnvelope(envelope);
    return resolveSettings(extractSettings(data));
  };

  return {
    workspaceId,
    listPublishedDocs,
    listWorkspaceTags,
    getWorkspaceDetail,
    getDocument,
    getDocumentContent,
    getUserProfile,
    getWorkspacePreferenceSettings,
  };
};
