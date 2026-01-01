// Core type definitions for the Document Engine.
export type ID = string;
export type UserID = string;
export type DocID = ID;
export type BlockID = ID;

export type DocVer = number;
export type BlockVer = number;

export type BlockType =
  | "root"
  | "paragraph"
  | "heading"
  | "listItem"
  | "code"
  | "quote"
  | "image"
  | `custom:${string}`;

export interface DocumentMeta {
  _id: DocID;
  workspaceId?: ID;
  title: string;
  createdAt: number;
  createdBy: UserID;
  updatedAt: number;
  updatedBy: UserID;

  head: DocVer; // current editing head
  publishedHead?: DocVer;

  rootBlockId: BlockID;

  status?: "draft" | "normal" | "archived";
  visibility?: "private" | "workspace" | "public";
}

export interface BlockIdentity {
  _id: BlockID;
  docId: DocID;
  type: BlockType;
  createdAt: number;
  createdBy: UserID;

  latestVer: BlockVer;
  latestAt: number;
  latestBy: UserID;

  isDeleted: boolean;
  deletedAt?: number;
  deletedBy?: UserID;
}

export interface RichTextPayload {
  format: "md+";
  source: string; // canonical markdown+
  ast?: any; // optional cached parse result
}

export interface BlockPayloadBase {
  schema: { type: BlockType; ver: number };
  attrs?: Record<string, any>;
  body?: any;
}

export interface BlockVersion {
  _id: string; // `${blockId}@${ver}`
  docId: DocID;
  blockId: BlockID;
  ver: BlockVer;

  createdAt: number;
  createdBy: UserID;

  // structure positioning
  parentId: BlockID;
  sortKey: string;
  indent: number;
  collapsed: boolean;

  payload: BlockPayloadBase;

  hash: string; // sha256(payload + structure)
  plainText: string; // extracted for search/diff
  refs: Array<{ kind: "asset" | "doc" | "block"; id: ID }>;
}

export interface DocRevisionPatch {
  blockId: BlockID;
  from: BlockVer;
  to: BlockVer;
}

export interface DocRevision {
  _id: string; // `${docId}@${docVer}`
  docId: DocID;
  docVer: DocVer;

  createdAt: number;
  createdBy: UserID;
  message: string;
  branch?: "draft" | "published";

  patches: DocRevisionPatch[];

  rootBlockId: BlockID;

  source?: "editor" | "api";
  opSummary?: Record<string, number>;
}

export interface DocSnapshot {
  _id: string; // `${docId}@snap@${docVer}`
  docId: DocID;
  docVer: DocVer;
  createdAt: number;
  rootBlockId: BlockID;

  // huge doc: use chunks in production
  blockVersionMap: Record<BlockID, BlockVer>;
}

// Tree node for rendering
export interface RenderNode {
  id: BlockID;
  ver: BlockVer;
  type: BlockType;
  parentId: BlockID;
  sortKey: string;
  indent: number;
  collapsed: boolean;
  payload: BlockPayloadBase;
  plainText: string;
  children: RenderNode[];
}

export interface DocStateResolved {
  docId: DocID;
  docVer: DocVer;
  rootBlockId: BlockID;
  blockVersionMap: Record<BlockID, BlockVer>;
}
