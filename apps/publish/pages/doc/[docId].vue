<template>
  <section class="doc-page-shell">
    <div v-if="pageData && showDocDebugMeta" class="doc-page-meta-sticky">
      <div class="doc-page-meta-inner">
        <span>预计阅读 {{ estimatedReadMinutes }} 分钟</span>
        <span>已加载 {{ loadedBlocks }} / {{ totalBlocks }}</span>
        <span>剩余 {{ remainingBlocks }} 块</span>
        <span>状态：已发布 v{{ pageData.publishedHead }}</span>
        <span>未加载：{{ hasMore ? "是" : "否" }}</span>
        <span>渲染中：{{ renderedBlocks }} 块</span>
        <span>更新于：{{ formatTime(pageData.meta.updatedAt || pageData.meta.createdAt) }}</span>
      </div>
    </div>

    <div class="doc-page-container doc-page-header-container">
      <header class="doc-page-header">
        <!-- <NuxtLink to="/" class="doc-page-back-link">
          <NButton size="small" class="doc-page-back-btn">← 返回文章列表</NButton>
        </NuxtLink> -->

        <div v-if="pending" class="doc-page-loading-wrap">
          <NSpin size="large" />
        </div>

        <NAlert v-else-if="error" type="error" title="文档加载失败">
          {{ error.message }}
        </NAlert>

        <template v-else-if="pageData">
          <h1 class="doc-page-title">
            <span class="doc-page-title-icon">{{ pageData.meta.icon || "📄" }}</span>
            <span>{{ pageData.meta.title || "未命名文档" }}</span>
          </h1>
          <div class="doc-page-meta-row">
            <div class="doc-page-submeta">
              <span class="doc-page-submeta-item">作者：{{ authorText }}</span>
              <span class="doc-page-submeta-item">时间：{{ displayTimeText }}</span>
            </div>
            <div v-if="displayTags.length > 0" class="doc-page-tags">
              <span
                v-for="tag in displayTags"
                :key="tag.tagId"
                class="doc-page-tag"
                :style="tag.style"
              >
                {{ tag.label }}
              </span>
            </div>
          </div>
        </template>
      </header>
    </div>

    <div class="doc-page-container">
      <DocVirtualReader
        v-if="pageData"
        :doc-id="pageData.meta.docId"
        :published-head="pageData.publishedHead"
        :initial-state="pageData.initialState"
        @stats-change="handleReaderStatsChange"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive } from "vue";
import type { CSSProperties } from "vue";
import { createError } from "h3";
import { NAlert, NSpin } from "naive-ui";
import DocVirtualReader from "~/components/docs/DocVirtualReader.vue";
import { DOC_READER_SSR_LIMIT } from "~/constants/docReader";
import { useDocsApi } from "~/composables/useDocsApi";
import {
  contentTreeToFlatBlocks,
  resolvePagination,
  toRenderBlocks,
} from "~/composables/useDocsTransform";
import type { PublishedDocPageData, TagMeta } from "~/types/api";

type ReaderStats = {
  totalBlocks: number;
  loadedBlocks: number;
  renderedBlocks: number;
  hasMore: boolean;
  loadedChars: number;
};

const route = useRoute();
const runtimeConfig = useRuntimeConfig();
const docId = computed(() => String(route.params.docId || "").trim());
const { getDocument, getDocumentContent, getUserProfile, listWorkspaceTags } = useDocsApi();

const toBoolean = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    return ["1", "true", "yes", "y", "on"].includes(normalized);
  }
  return false;
};

const showDocDebugMeta = computed(() => toBoolean(runtimeConfig.public.showDocDebugMeta));

const readerStats = reactive<ReaderStats>({
  totalBlocks: 0,
  loadedBlocks: 0,
  renderedBlocks: 0,
  hasMore: false,
  loadedChars: 0,
});

const {
  data: pageData,
  pending,
  error,
} = await useAsyncData<PublishedDocPageData>(
  () => `doc-page-${docId.value}`,
  async () => {
    if (!docId.value) {
      throw createError({ statusCode: 400, statusMessage: "缺少 docId" });
    }

    const meta = await getDocument(docId.value);
    const publishedHead = typeof meta.publishedHead === "number" ? meta.publishedHead : 0;
    if (publishedHead <= 0) {
      throw createError({ statusCode: 404, statusMessage: "当前文档尚未发布" });
    }

    const [content, authorProfile] = await Promise.all([
      getDocumentContent(docId.value, {
        version: publishedHead,
        limit: DOC_READER_SSR_LIMIT,
      }),
      getUserProfile(meta.createdBy),
    ]);
    const initialItems = toRenderBlocks(contentTreeToFlatBlocks(content));
    const initialCount = initialItems.length;
    const initialChars = initialItems.reduce((sum, item) => sum + item.markdown.length, 0);
    const pagination = resolvePagination(
      content.pagination,
      {
        totalBlocks: content.totalBlocks,
        hasMore: content.hasMore,
        nextStartBlockId: content.nextStartBlockId,
      },
      initialCount,
      0,
    );
    const fallbackNext =
      initialItems.length > 0 ? initialItems[initialItems.length - 1]?.blockId : null;
    const nextStartBlockId =
      pagination.responseNextStartBlockId ||
      (pagination.responseHasMore || pagination.inferredHasMore ? fallbackNext : null);
    const hasMore = Boolean(
      (pagination.responseHasMore || pagination.inferredHasMore) && nextStartBlockId,
    );

    readerStats.totalBlocks = pagination.totalBlocks;
    readerStats.loadedBlocks = initialCount;
    readerStats.renderedBlocks = Math.min(initialCount, 40);
    readerStats.hasMore = hasMore;
    readerStats.loadedChars = initialChars;

    return {
      meta: {
        ...meta,
        authorDisplayName:
          authorProfile?.displayName ||
          meta.authorDisplayName ||
          meta.displayName ||
          meta.createdByDisplayName ||
          meta.authorName ||
          meta.createdByName,
        authorUsername: authorProfile?.username || meta.authorUsername,
      },
      publishedHead,
      initialState: {
        items: initialItems,
        totalBlocks: pagination.totalBlocks,
        returnedBlocks: initialCount,
        hasMore,
        nextStartBlockId: nextStartBlockId || null,
      },
    };
  },
  { watch: [docId] },
);

const syncReaderStatsFromInitialState = (data?: PublishedDocPageData | null) => {
  if (!data?.initialState) return;
  const initialItems = data.initialState.items || [];
  const loadedCount = initialItems.length;
  const loadedChars = initialItems.reduce((sum, item) => sum + item.markdown.length, 0);

  readerStats.totalBlocks = Math.max(data.initialState.totalBlocks, loadedCount, 0);
  readerStats.loadedBlocks = loadedCount;
  readerStats.renderedBlocks = Math.min(loadedCount, 40);
  readerStats.hasMore = Boolean(data.initialState.hasMore && data.initialState.nextStartBlockId);
  readerStats.loadedChars = loadedChars;
};

syncReaderStatsFromInitialState(pageData.value);

const tagWorkspaceId = computed(() => {
  const fromDoc = pageData.value?.meta?.workspaceId;
  if (typeof fromDoc === "string" && fromDoc.trim()) return fromDoc.trim();
  const fromRuntime = runtimeConfig.public.workspaceId;
  return typeof fromRuntime === "string" ? fromRuntime.trim() : "";
});

const { data: workspaceTagItems } = await useAsyncData(
  () => `doc-page-tags-${tagWorkspaceId.value || "missing"}`,
  async () => {
    if (!tagWorkspaceId.value) return [] as TagMeta[];
    try {
      const response = await listWorkspaceTags({
        workspaceId: tagWorkspaceId.value,
        page: 1,
        pageSize: 100,
      });
      return response.items || [];
    } catch {
      return [] as TagMeta[];
    }
  },
  {
    watch: [tagWorkspaceId],
    default: () => [] as TagMeta[],
  },
);

const tagMap = computed<Record<string, TagMeta>>(() => {
  const map: Record<string, TagMeta> = {};
  for (const tag of workspaceTagItems.value || []) {
    const tagId = typeof tag?.tagId === "string" ? tag.tagId.trim() : "";
    if (!tagId) continue;
    map[tagId] = tag;
  }
  return map;
});

const normalizeTagColor = (value?: string) => {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (!normalized) return "";
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(normalized) ? normalized : "";
};

const displayTags = computed(() => {
  const metaTags = pageData.value?.meta?.tags;
  if (!Array.isArray(metaTags))
    return [] as Array<{
      tagId: string;
      label: string;
      style?: CSSProperties;
    }>;

  const unique = new Set<string>();
  const result: Array<{
    tagId: string;
    label: string;
    style?: CSSProperties;
  }> = [];

  for (const rawTagId of metaTags) {
    if (typeof rawTagId !== "string") continue;
    const tagId = rawTagId.trim();
    if (!tagId || unique.has(tagId)) continue;
    unique.add(tagId);

    const tagMeta = tagMap.value[tagId];
    const label =
      typeof tagMeta?.name === "string" && tagMeta.name.trim() ? tagMeta.name.trim() : tagId;
    const color = normalizeTagColor(tagMeta?.color);

    result.push({
      tagId,
      label,
      style: color
        ? {
            borderColor: color,
            color,
          }
        : undefined,
    });
  }

  return result;
});

const totalBlocks = computed(() => Math.max(readerStats.totalBlocks, readerStats.loadedBlocks, 0));
const loadedBlocks = computed(() => readerStats.loadedBlocks);
const remainingBlocks = computed(() => Math.max(totalBlocks.value - loadedBlocks.value, 0));
const hasMore = computed(() => readerStats.hasMore);
const renderedBlocks = computed(() => readerStats.renderedBlocks);

const estimatedReadMinutes = computed(() => {
  const safeLoadedChars = Math.max(readerStats.loadedChars, 0);
  if (safeLoadedChars <= 0 || loadedBlocks.value <= 0 || totalBlocks.value <= 0) return 1;
  const ratio = Math.max(loadedBlocks.value / totalBlocks.value, 0.05);
  const estimatedTotalChars = Math.round(safeLoadedChars / ratio);
  return Math.max(1, Math.round(estimatedTotalChars / 450));
});

const authorText = computed(() => {
  const meta = pageData.value?.meta;
  if (!meta) return "未知作者";
  const isLikelyUserId = (value: string) => {
    const normalized = value.trim();
    return /^u_[a-z0-9_]+$/i.test(normalized) || /^user[_-]/i.test(normalized);
  };
  const candidates = [
    meta.authorDisplayName,
    meta.displayName,
    meta.createdByDisplayName,
    meta.authorName,
    meta.createdByName,
    meta.authorUsername,
    meta.createdByUsername,
    meta.username,
    typeof meta.author === "string" && !isLikelyUserId(meta.author) ? meta.author : undefined,
  ];
  const picked = candidates.find((item) => typeof item === "string" && item.trim().length > 0);
  return picked ? String(picked) : "未知作者";
});

const displayTimeText = computed(() => {
  const meta = pageData.value?.meta;
  return formatTime(meta?.updatedAt || meta?.createdAt);
});

const handleReaderStatsChange = (stats: ReaderStats) => {
  readerStats.totalBlocks = stats.totalBlocks;
  readerStats.loadedBlocks = stats.loadedBlocks;
  readerStats.renderedBlocks = stats.renderedBlocks;
  readerStats.hasMore = stats.hasMore;
  readerStats.loadedChars = stats.loadedChars;
};

const formatTime = (value?: string) => {
  if (!value) return "时间未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
};
</script>

<style scoped>
.doc-page-shell {
  --doc-main-max-width: var(--doc-reader-content-width, 800px);
  --doc-main-side-padding: 8px;
  width: 100%;
  background: #ffffff;
}

.doc-page-container {
  width: min(var(--doc-main-max-width), 100%);
  margin: 0 auto;
  padding: 0 var(--doc-main-side-padding) 24px;
}

.doc-page-header-container {
  padding-top: 16px;
}

.doc-page-header {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin: 16px 0;
  padding: 0 20px;
}

.doc-page-back-link {
  display: inline-flex;
  align-self: flex-start;
  text-decoration: none;
}

:deep(.doc-page-back-btn.n-button) {
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  color: #1d4ed8;
  border-radius: 999px;
  font-weight: 500;
}

:deep(.doc-page-back-btn.n-button:hover) {
  border-color: #93c5fd;
  background: #dbeafe;
  color: #1e40af;
}

.doc-page-loading-wrap {
  width: 100%;
  min-height: 220px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.doc-page-title {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: clamp(30px, 3vw, 40px);
  line-height: 1.24;
  font-weight: 700;
  color: #0f172a;
}

.doc-page-title-icon {
  flex: 0 0 auto;
  line-height: 1;
}

.doc-page-submeta {
  display: inline-flex;
  flex: 0 1 auto;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 14px;
  color: #64748b;
  font-size: 13px;
  line-height: 1.45;
}

.doc-page-submeta-item {
  white-space: nowrap;
}

.doc-page-meta-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
}

.doc-page-tags {
  display: inline-flex;
  flex: 0 1 auto;
  flex-wrap: wrap;
  gap: 8px;
}

.doc-page-tag {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  padding: 2px 10px;
  border-radius: 999px;
  border: 1px solid #dbe3f5;
  background: #f8faff;
  color: #4f5f80;
  font-size: 12px;
  line-height: 20px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.doc-page-meta-sticky {
  position: sticky;
  top: 0;
  z-index: 12;
  width: 100%;
  background: #eff6ff;
  border-top: 1px solid #dbeafe;
  border-bottom: 1px solid #dbeafe;
}

.doc-page-meta-inner {
  width: min(var(--doc-main-max-width), 100%);
  margin: 0 auto;
  padding: 8px var(--doc-main-side-padding);
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  align-items: center;
  gap: 6px 14px;
  color: #334155;
  font-size: 12px;
  line-height: 1.5;
  text-align: left;
}

.doc-page-meta-inner > span {
  white-space: nowrap;
}

.doc-page-meta-inner > span::before {
  content: "•";
  margin-right: 6px;
  color: #60a5fa;
}

.doc-page-meta-inner > span:first-child::before {
  content: "";
  margin-right: 0;
}

@media (max-width: 1024px) {
  .doc-page-shell {
    --doc-main-side-padding: 6px;
  }

  .doc-page-container {
    padding: 0 var(--doc-main-side-padding) 18px;
  }

  .doc-page-meta-inner {
    padding: 8px var(--doc-main-side-padding);
  }
}

@media (max-width: 768px) {
  .doc-page-shell {
    --doc-main-side-padding: 4px;
  }

  .doc-page-header-container {
    padding-top: 24px;
  }

  .doc-page-title {
    font-size: 26px;
  }

  .doc-page-meta-inner {
    gap: 4px 10px;
    padding: 8px var(--doc-main-side-padding);
  }

  .doc-page-submeta {
    font-size: 12px;
    gap: 4px 10px;
  }

  .doc-page-tags {
    gap: 6px;
  }

  .doc-page-tag {
    font-size: 11px;
  }
}
</style>
