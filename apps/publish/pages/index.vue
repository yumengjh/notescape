<template>
  <section class="mx-auto max-w-980px px-20px pt-24px space-y-20px md:px-24px">
    <header class="workspace-hero">
      <div class="workspace-hero-main">
        <div class="workspace-hero-title-row">
          <NAvatar round :size="44" class="workspace-hero-avatar">
            {{ workspaceIcon }}
          </NAvatar>
          <h1 class="workspace-hero-title">
            {{ workspaceTitle }}
          </h1>
        </div>
        <p class="workspace-hero-desc">
          {{ workspaceDescription }}
        </p>
      </div>

      <div class="workspace-hero-side">
        <NCard size="small" embedded class="workspace-owner-card">
          <div class="workspace-owner-row">
            <span class="workspace-owner-label">所有者</span>
            <span class="workspace-owner-name">{{ ownerDisplayName }}</span>
          </div>
        </NCard>
        <NButton
          size="small"
          secondary
          :loading="pending || workspacePending || ownerPending"
          @click="handleRefresh"
        >
          刷新列表
        </NButton>
      </div>
    </header>

    <NAlert v-if="workspaceError" type="warning" title="工作空间信息加载失败">
      {{ workspaceError.message }}
    </NAlert>

    <NAlert v-if="error" type="error" title="文档列表加载失败">
      {{ error.message }}
    </NAlert>

    <div v-else-if="pending" class="flex justify-center py-40px">
      <NSpin size="large" />
    </div>

    <NEmpty v-else-if="docs.length === 0" description="当前工作空间暂无已发布文档" />

    <div v-else class="grid grid-cols-1 gap-12px md:grid-cols-2">
      <DocCard v-for="doc in docs" :key="doc.docId" :doc="doc" :tag-map="tagMap" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { NAlert, NAvatar, NButton, NCard, NEmpty, NSpin } from "naive-ui";
import DocCard from "~/components/docs/DocCard.vue";
import { useDocsApi } from "~/composables/useDocsApi";
import type { TagMeta } from "~/types/api";

const { listPublishedDocs, workspaceId, getWorkspaceDetail, getUserProfile, listWorkspaceTags } =
  useDocsApi();

const { data, pending, error, refresh } = await useAsyncData("published-doc-list", async () => {
  return listPublishedDocs({ page: 1, pageSize: 50 });
});

const {
  data: workspace,
  pending: workspacePending,
  error: workspaceError,
  refresh: refreshWorkspace,
} = await useAsyncData(
  () => `workspace-meta-${workspaceId || "missing"}`,
  async () => {
    if (!workspaceId) return null;
    return getWorkspaceDetail(workspaceId);
  },
  {
    watch: [() => workspaceId],
  },
);

const ownerId = computed(() => {
  const raw = workspace.value?.ownerId;
  if (!raw || typeof raw !== "string") return "";
  return raw.trim();
});

const {
  data: ownerProfile,
  pending: ownerPending,
  refresh: refreshOwnerProfile,
} = await useAsyncData(
  () => `workspace-owner-${ownerId.value || "missing"}`,
  async () => {
    if (!ownerId.value) return null;
    return getUserProfile(ownerId.value);
  },
  {
    watch: [ownerId],
  },
);

const docs = computed(() => data.value?.items || []);

const { data: workspaceTagItems, refresh: refreshWorkspaceTags } = await useAsyncData(
  () => `workspace-tags-${workspaceId || "missing"}`,
  async () => {
    if (!workspaceId) return [] as TagMeta[];
    try {
      const response = await listWorkspaceTags({
        workspaceId,
        page: 1,
        pageSize: 100,
      });
      return response.items || [];
    } catch {
      return [] as TagMeta[];
    }
  },
  {
    watch: [() => workspaceId],
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

const workspaceTitle = computed(() => {
  return workspace.value?.name?.trim() || workspaceId || "未配置工作空间";
});

const workspaceIcon = computed(() => {
  return workspace.value?.icon?.trim() || "📚";
});

const workspaceDescription = computed(() => {
  const raw = workspace.value?.description;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return "暂无工作空间描述";
});

const ownerDisplayName = computed(() => {
  if (ownerPending.value) return "加载中...";
  const profile = ownerProfile.value;
  if (profile?.displayName?.trim()) return profile.displayName.trim();
  if (profile?.username?.trim()) return profile.username.trim();
  return "未知用户";
});

const handleRefresh = async () => {
  await Promise.all([refresh(), refreshWorkspace(), refreshOwnerProfile(), refreshWorkspaceTags()]);
};
</script>

<style scoped>
.workspace-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #ffffff;
  padding: 20px;
}

.workspace-hero-main {
  flex: 1;
  min-width: 0;
}

.workspace-hero-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.workspace-hero-avatar {
  flex: 0 0 auto;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 20px;
}

.workspace-hero-title {
  margin: 0;
  font-size: 28px;
  line-height: 1.2;
  font-weight: 700;
  color: #111827;
}

.workspace-hero-desc {
  margin: 10px 0 0;
  color: #64748b;
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.workspace-hero-side {
  width: 190px;
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}

.workspace-owner-card {
  border-radius: 10px;
}

.workspace-owner-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.workspace-owner-label {
  flex: 0 0 auto;
  color: #64748b;
  font-size: 12px;
  line-height: 1;
}

.workspace-owner-name {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  line-height: 1.2;
  word-break: break-word;
  text-align: right;
}

.workspace-owner-card :deep(.n-card__content) {
  padding: 8px 10px !important;
}

@media (max-width: 768px) {
  .workspace-hero {
    flex-direction: column;
    align-items: stretch;
    padding: 14px;
    gap: 14px;
  }

  .workspace-hero-title {
    font-size: 24px;
  }

  .workspace-hero-side {
    width: 100%;
  }
}
</style>
