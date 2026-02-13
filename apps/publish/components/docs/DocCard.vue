<template>
  <NuxtLink :to="`/doc/${doc.docId}`" class="block no-underline text-inherit">
    <NCard hoverable class="h-full border border-#ebeef5!">
      <template #header>
        <div class="flex items-center gap-8px">
          <span class="text-lg leading-none">{{ doc.icon || "📄" }}</span>
          <span class="line-clamp-1 text-15px font-600 text-#111827">{{
            doc.title || "未命名文档"
          }}</span>
        </div>
      </template>
      <NSpace vertical size="small">
        <div v-if="visibleTagIds.length > 0" class="doc-card-tags">
          <span
            v-for="tagId in visibleTagIds"
            :key="tagId"
            class="doc-card-tag"
            :style="resolveTagStyle(tagId)"
          >
            {{ resolveTagLabel(tagId) }}
          </span>
          <span v-if="hiddenTagCount > 0" class="doc-card-tag doc-card-tag-more">
            +{{ hiddenTagCount }}
          </span>
        </div>
        <div class="text-13px text-#6b7280">文档 ID：{{ doc.docId }}</div>
        <div class="text-13px text-#6b7280">已发布版本：v{{ doc.publishedHead }}</div>
        <div class="text-12px text-#9ca3af">{{ formatTime(doc.updatedAt || doc.createdAt) }}</div>
      </NSpace>
    </NCard>
  </NuxtLink>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { NCard, NSpace } from "naive-ui";
import type { DocumentMeta, TagMeta } from "~/types/api";

const props = defineProps<{
  doc: DocumentMeta;
  tagMap?: Record<string, TagMeta>;
}>();

const MAX_VISIBLE_TAGS = 4;

const normalizeTagIds = (value?: string[]) => {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const normalized = item.trim();
    if (!normalized || unique.has(normalized)) continue;
    unique.add(normalized);
    result.push(normalized);
  }
  return result;
};

const allTagIds = computed(() => normalizeTagIds(props.doc.tags));
const visibleTagIds = computed(() => allTagIds.value.slice(0, MAX_VISIBLE_TAGS));
const hiddenTagCount = computed(() => Math.max(allTagIds.value.length - MAX_VISIBLE_TAGS, 0));

const resolveTagLabel = (tagId: string) => {
  const name = props.tagMap?.[tagId]?.name;
  if (typeof name === "string" && name.trim()) return name.trim();
  return tagId;
};

const normalizeTagColor = (value?: string) => {
  if (typeof value !== "string") return "";
  const color = value.trim();
  if (!color) return "";
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color) ? color : "";
};

const resolveTagStyle = (tagId: string) => {
  const color = normalizeTagColor(props.tagMap?.[tagId]?.color);
  if (!color) return undefined;
  return {
    borderColor: color,
    color,
  };
};

const formatTime = (value?: string) => {
  if (!value) return "时间未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
};
</script>

<style scoped>
.doc-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.doc-card-tag {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid #dbe3f5;
  background: #f8faff;
  color: #4f5f80;
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.doc-card-tag-more {
  border-style: dashed;
  color: #64748b;
}
</style>
