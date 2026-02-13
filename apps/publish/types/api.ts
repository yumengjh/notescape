export interface ApiEnvelope<T = unknown> {
  success?: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string | string[];
  };
}

export interface PaginatedResult<T> {
  items: T[];
  total?: number;
  page?: number;
  pageSize?: number;
  hasMore?: boolean;
}

export interface PreferenceSettings {
  reader: {
    contentWidth: number;
    fontSize: number;
  };
  editor: {
    contentWidth: number;
    fontSize: number;
  };
  advanced: {
    compactList: boolean;
    codeFontFamily: string;
  };
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Record<string, unknown> ? DeepPartial<T[K]> : T[K];
};

export interface DocumentMeta {
  docId: string;
  workspaceId?: string;
  title?: string;
  icon?: string | null;
  author?: string;
  authorDisplayName?: string;
  authorName?: string;
  authorUsername?: string;
  createdBy?: string;
  createdByDisplayName?: string;
  createdByName?: string;
  createdByUsername?: string;
  displayName?: string;
  username?: string;
  status?: string;
  visibility?: string;
  tags?: string[];
  head?: number;
  publishedHead?: number | null;
  updatedAt?: string;
  createdAt?: string;
}

export interface TagMeta {
  tagId: string;
  workspaceId: string;
  name: string;
  color?: string;
  createdAt?: string;
}

export interface AuthUserProfile {
  userId?: string;
  username?: string;
  email?: string;
  displayName?: string;
  avatar?: string | null;
  bio?: string | null;
  status?: string;
  updatedAt?: string;
}

export interface WorkspaceMeta {
  workspaceId: string;
  name?: string;
  description?: string | null;
  icon?: string | null;
  ownerId?: string | null;
  userRole?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DocumentContentTreeNode {
  blockId: string;
  type: string;
  payload?: unknown;
  parentId?: string;
  sortKey?: string;
  indent?: number;
  collapsed?: boolean;
  children?: DocumentContentTreeNode[];
}

export interface DocumentContentPagination {
  totalBlocks?: number;
  returnedBlocks?: number;
  hasMore?: boolean;
  nextStartBlockId?: string | null;
}

export interface DocumentContent {
  docId: string;
  docVer?: number;
  title?: string;
  tree?: DocumentContentTreeNode;
  pagination?: DocumentContentPagination;
  totalBlocks?: number;
  returnedBlocks?: number;
  hasMore?: boolean;
  nextStartBlockId?: string | null;
}

export interface DocumentContentQuery {
  version?: number;
  startBlockId?: string;
  limit?: number;
  maxDepth?: number;
}

export type NormalizedBlockType = "paragraph" | "heading" | "quote" | "list_item" | "code";

export interface NormalizedDocBlock {
  type: NormalizedBlockType;
  text: string;
  level?: number;
  ordered?: boolean;
  checked?: boolean;
  language?: string;
  payload: Record<string, unknown>;
}

export interface FlatContentBlock {
  blockId: string;
  type: string;
  depth: number;
  sortKey?: string;
  indent?: number;
  markdown: string;
  normalized: NormalizedDocBlock;
}

export interface RenderBlock extends FlatContentBlock {
  html: string;
  renderKey: string;
}

export interface VirtualReaderInitialState {
  items: RenderBlock[];
  totalBlocks: number;
  returnedBlocks: number;
  hasMore: boolean;
  nextStartBlockId: string | null;
}

export interface PublishedDocPageData {
  meta: DocumentMeta;
  publishedHead: number;
  initialState: VirtualReaderInitialState;
}
