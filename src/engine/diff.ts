import type { BlockVersion, DocStateResolved, RenderNode } from "./types";
import diffMatchPatch from "diff-match-patch";

export interface BlockDiffResult {
  blockId: string;
  fromVer: number;
  toVer: number;
  moved: boolean;
  structureChanged: boolean;
  contentChanged: boolean;
  textDiff?: string; // HTML pretty output
}

export function diffBlockVersions(a: BlockVersion, b: BlockVersion): BlockDiffResult {
  const moved = a.parentId !== b.parentId || a.sortKey !== b.sortKey || a.indent !== b.indent;
  const structureChanged = moved || a.collapsed !== b.collapsed;
  const contentChanged = a.hash !== b.hash; // hash covers payload + structure fields we hash
  let textDiff: string | undefined;

  if (a.plainText !== b.plainText) {
    const dmp = new diffMatchPatch();
    const diffs = dmp.diff_main(a.plainText, b.plainText);
    dmp.diff_cleanupSemantic(diffs);
    textDiff = dmp.diff_prettyHtml(diffs);
  }

  return {
    blockId: a.blockId,
    fromVer: a.ver,
    toVer: b.ver,
    moved,
    structureChanged,
    contentChanged,
    textDiff,
  };
}

export interface DocDiff {
  from: number;
  to: number;
  changedBlocks: string[];
}

// doc state diff (only versions)
export function diffDocStates(a: DocStateResolved, b: DocStateResolved): DocDiff {
  const set = new Set<string>();
  const keys = new Set([...Object.keys(a.blockVersionMap), ...Object.keys(b.blockVersionMap)]);
  for (const k of keys) {
    if ((a.blockVersionMap as any)[k] !== (b.blockVersionMap as any)[k]) set.add(k);
  }
  return { from: a.docVer, to: b.docVer, changedBlocks: Array.from(set) };
}

// optional: render tree -> flatten for readability
export function flattenTree(node: RenderNode): RenderNode[] {
  const res: RenderNode[] = [];
  const dfs = (n: RenderNode) => {
    res.push(n);
    for (const c of n.children) dfs(c);
  };
  dfs(node);
  return res;
}
