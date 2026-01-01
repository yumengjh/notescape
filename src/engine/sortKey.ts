// Sort key utilities for infinite ordering between siblings.
const BASE = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function charToIndex(c: string) {
  const i = BASE.indexOf(c);
  if (i < 0) throw new Error(`Invalid sortKey char: ${c}`);
  return i;
}
function indexToChar(i: number) {
  return BASE[i];
}

// generate a key between a and b (lexicographically)
// a < newKey < b
export function between(a: string | null, b: string | null): string {
  // null means -infinity / +infinity
  const A = a ?? "";
  const B = b ?? "";

  let i = 0;
  let res = "";

  while (true) {
    const ca = i < A.length ? charToIndex(A[i]) : 0;
    const cb = i < B.length ? charToIndex(B[i]) : BASE.length - 1;

    if (ca === cb) {
      res += indexToChar(ca);
      i++;
      continue;
    }

    if (cb - ca > 1) {
      const mid = Math.floor((ca + cb) / 2);
      res += indexToChar(mid);
      return res;
    }

    // cb = ca+1 => need extend
    res += indexToChar(ca);
    i++;
  }
}

// helpers
export function firstKey() {
  return "U"; // middle-ish
}

export function after(key: string) {
  return key + "U";
}

export function before(key: string) {
  // produce something smaller than key, simplest: shorten or add prefix
  return key.length > 1 ? key.slice(0, -1) : "0";
}
