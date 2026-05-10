"use client";

import { useMemo, type ReactNode } from "react";
import { FileEdit } from "lucide-react";

export interface DiffViewerProps {
  diff: string;
  maxFiles?: number;
  maxLines?: number;
}

export interface SingleFileDiffViewerProps {
  diff: string;
  maxLines?: number;
}

export interface DiffFile {
  oldPath: string;
  newPath: string;
  hunks: DiffHunk[];
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
}

export interface DiffLine {
  type: "add" | "remove" | "context";
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}

const HUNK_HEADER_RE =
  /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

function normalizeRawPath(raw: string): string {
  const tab = raw.split("\t")[0] ?? raw;
  const trimmed = tab.trim();
  if (trimmed === "/dev/null") return "/dev/null";
  if (trimmed.startsWith("a/")) return trimmed.slice(2);
  if (trimmed.startsWith("b/")) return trimmed.slice(2);
  return trimmed;
}

function parseDiffGitPaths(line: string): { oldPath: string; newPath: string } | null {
  const rest = line.slice("diff --git ".length);
  const splitRe = /^a\/(.+?) b\/(.+)$/;
  const m = rest.match(splitRe);
  if (!m) return null;
  return { oldPath: m[1], newPath: m[2] };
}

function parseHunkHeader(line: string): {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  rest: string;
} | null {
  const m = line.match(HUNK_HEADER_RE);
  if (!m) return null;
  const oldStart = parseInt(m[1], 10);
  const oldCount = m[2] !== undefined ? parseInt(m[2], 10) : 1;
  const newStart = parseInt(m[3], 10);
  const newCount = m[4] !== undefined ? parseInt(m[4], 10) : 1;
  return {
    oldStart,
    oldCount,
    newStart,
    newCount,
    rest: (m[5] ?? "").trimEnd(),
  };
}

/** Consumes @@ hunk header at lines[start] and returns hunk + next index. */
function parseHunkAt(lines: string[], start: number): { hunk: DiffHunk; next: number } | null {
  const headerLine = lines[start];
  if (!headerLine?.startsWith("@@")) return null;

  const meta = parseHunkHeader(headerLine);
  if (!meta) return null;

  const outLines: DiffLine[] = [];
  let oldLine = meta.oldStart;
  let newLine = meta.newStart;
  let i = start + 1;

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("@@")) break;
    if (line.startsWith("diff --git ") || line.startsWith("--- ")) break;

    const c0 = line[0];

    // Blank lines terminate a hunk chunk in standard unified patches
    if (c0 === undefined) {
      break;
    }
    if (line.startsWith("Binary files ") && line.endsWith(" differ")) {
      i++;
      break;
    }

    if (c0 === "+" && line[1] !== "+") {
      outLines.push({ type: "add", content: line.slice(1), oldLineNo: undefined, newLineNo: newLine });
      newLine++;
    } else if (c0 === "-" && line[1] !== "-") {
      outLines.push({ type: "remove", content: line.slice(1), oldLineNo: oldLine, newLineNo: undefined });
      oldLine++;
    } else if (c0 === " " || c0 === "\t") {
      outLines.push({
        type: "context",
        content: line.slice(1),
        oldLineNo: oldLine,
        newLineNo: newLine,
      });
      oldLine++;
      newLine++;
    } else if (line.startsWith("\\ No newline at end of file")) {
      outLines.push({ type: "context", content: line, oldLineNo: undefined, newLineNo: undefined });
    } else {
      break;
    }
    i++;
  }

  const hunk: DiffHunk = {
    header: headerLine.trimEnd(),
    oldStart: meta.oldStart,
    newStart: meta.newStart,
    lines: outLines,
  };

  return { hunk, next: i };
}

/** Collect contiguous hunks starting at lines[idx]. */
function parseHunksFrom(lines: string[], idx: number): { hunks: DiffHunk[]; next: number } {
  const hunks: DiffHunk[] = [];
  let i = idx;
  while (i < lines.length) {
    if (!lines[i].startsWith("@@")) break;
    const parsed = parseHunkAt(lines, i);
    if (!parsed) break;
    hunks.push(parsed.hunk);
    i = parsed.next;
  }
  return { hunks, next: i };
}

/** Skip auxiliary lines between diff --git and --- */
function skipToMinusTriple(lines: string[], i: number): number {
  let j = i;
  while (j < lines.length && !lines[j].startsWith("--- ")) {
    const L = lines[j];
    if (L.startsWith("diff --git ")) break;
    j++;
  }
  return j;
}

export function parseDiff(raw: string): DiffFile[] {
  const text = raw.replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  const files: DiffFile[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("diff --git ")) {
      const paths = parseDiffGitPaths(line);
      let oldPath = paths?.oldPath ?? "";
      let newPath = paths?.newPath ?? "";

      i = skipToMinusTriple(lines, i + 1);
      if (i < lines.length && lines[i].startsWith("--- ")) {
        const op = normalizeRawPath(lines[i].slice(4));
        i++;
        if (i < lines.length && lines[i].startsWith("+++ ")) {
          const np = normalizeRawPath(lines[i].slice(4));
          i++;
          if (op !== "/dev/null") oldPath = op;
          if (np !== "/dev/null") newPath = np;
        }

        const { hunks, next } = parseHunksFrom(lines, i);
        i = next;
        if (oldPath === "" && newPath === "") {
          continue;
        }
        files.push({ oldPath: oldPath || "", newPath: newPath || "", hunks });
        continue;
      }
      files.push({
        oldPath,
        newPath,
        hunks: [],
      });
      i++;
      continue;
    }

    if (line.startsWith("--- ")) {
      const oldPathNorm = normalizeRawPath(line.slice(4));
      i++;
      if (i >= lines.length || !lines[i].startsWith("+++ ")) {
        continue;
      }
      const newPathNorm = normalizeRawPath(lines[i].slice(4));
      i++;

      let oldPath = oldPathNorm;
      let newPath = newPathNorm;
      if (oldPathNorm === "/dev/null") oldPath = "";
      if (newPathNorm === "/dev/null") newPath = "";

      const { hunks, next } = parseHunksFrom(lines, i);
      i = next;

      files.push({
        oldPath,
        newPath,
        hunks,
      });
      continue;
    }

    if (line.startsWith("@@")) {
      const { hunks, next } = parseHunksFrom(lines, i);
      i = next;
      files.push({
        oldPath: "",
        newPath: "",
        hunks,
      });
      continue;
    }

    i++;
  }

  return files;
}

/** Parse unified diff fragment for one file (hunks only); tolerates missing file headers. */
export function parseSingleFileHunks(raw: string): DiffHunk[] {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  const lines = text.split("\n");

  let startIdx = 0;
  while (startIdx < lines.length && lines[startIdx] === "") startIdx++;

  if (startIdx < lines.length && lines[startIdx].startsWith("--- ") && lines[startIdx + 1]?.startsWith("+++ ")) {
    const sliced = parseDiff(text);
    return sliced[0]?.hunks ?? [];
  }

  if (!lines.some((L) => L.startsWith("@@"))) return [];

  if (!lines[startIdx].startsWith("@@")) {
    while (startIdx < lines.length && !lines[startIdx].startsWith("@@")) {
      startIdx++;
    }
  }

  const { hunks } = parseHunksFrom(lines, startIdx);
  return hunks;
}

function truncateHunks(hunks: DiffHunk[], maxLines: number | undefined): DiffHunk[] {
  if (maxLines === undefined) return hunks;
  let remaining = maxLines;
  const next: DiffHunk[] = [];
  for (const h of hunks) {
    if (remaining <= 0) break;
    const slice = h.lines.slice(0, remaining);
    next.push({
      ...h,
      lines: slice,
    });
    remaining -= slice.length;
  }
  return next;
}

function lineRowBg(type: DiffLine["type"]) {
  if (type === "add") return "bg-success/10";
  if (type === "remove") return "bg-danger/10";
  return "";
}

function lineTextClass(type: DiffLine["type"]) {
  if (type === "add") return "text-success";
  if (type === "remove") return "text-danger";
  return "text-text-secondary";
}

function signForLine(type: DiffLine["type"]) {
  if (type === "add") return "+";
  if (type === "remove") return "-";
  return " ";
}

function renderHunkRows(
  hunk: DiffHunk,
  hi: number,
  keyPrefix: string,
): ReactNode[] {
  const rows: React.ReactNode[] = [
    <tr key={`${keyPrefix}-h${hi}-hdr`} className="bg-surface-0">
      <td colSpan={4} className="px-(--of-space-md) py-(--of-space-xs) text-[11px] text-text-tertiary border-t border-stroke-subtle first:border-t-0">
        {hunk.header}
      </td>
    </tr>,
  ];

  hunk.lines.forEach((line, li) => {
    rows.push(
      <tr key={`${keyPrefix}-h${hi}-l${li}`} className={lineRowBg(line.type)}>
        <td className="w-10 py-px pr-1 pl-(--of-space-sm) text-right align-top select-none text-[11px] tabular-nums text-text-tertiary border-r border-stroke-subtle/60">
          {line.oldLineNo !== undefined ? line.oldLineNo : ""}
        </td>
        <td className="w-10 py-px pr-1 pl-1 text-right align-top select-none text-[11px] tabular-nums text-text-tertiary border-r border-stroke-subtle/60">
          {line.newLineNo !== undefined ? line.newLineNo : ""}
        </td>
        <td className="w-5 py-px px-1 text-center align-top select-none text-text-tertiary text-[11px] font-mono">
          {signForLine(line.type)}
        </td>
        <td className="px-(--of-space-sm) py-px whitespace-pre-wrap break-all align-top">
          <span className={lineTextClass(line.type)}>{line.content}</span>
        </td>
      </tr>,
    );
  });

  return rows;
}

export function UnifiedDiffViewer({ diff, maxFiles, maxLines }: DiffViewerProps) {
  const files = useMemo(() => {
    const parsed = parseDiff(diff);
    const sliced = maxFiles ? parsed.slice(0, maxFiles) : parsed;
    if (!maxLines) return sliced;
    let budget = maxLines;
    return sliced.map((f) => {
      if (budget <= 0) return { ...f, hunks: [] };
      const nextHunks: DiffHunk[] = [];
      for (const h of f.hunks) {
        if (budget <= 0) break;
        const cap = Math.min(h.lines.length, budget);
        nextHunks.push({ ...h, lines: h.lines.slice(0, cap) });
        budget -= cap;
      }
      return { ...f, hunks: nextHunks };
    });
  }, [diff, maxFiles, maxLines]);

  if (files.length === 0) {
    return <div className="text-xs text-text-tertiary p-4">No changes to display</div>;
  }

  const displayPath = (file: DiffFile) => {
    const p = file.newPath || file.oldPath;
    if (!p && file.oldPath !== file.newPath) {
      if (file.oldPath) return file.oldPath;
      if (file.newPath) return file.newPath;
    }
    return p || "(file)";
  };

  return (
    <div className="flex flex-col gap-3">
      {files.map((file, fi) => (
        <div
          key={fi}
          className="border border-stroke-subtle bg-surface-1 overflow-hidden text-[13px] font-mono"
        >
          <div className="flex items-center gap-2 px-(--of-space-md) py-(--of-space-xs) border-b border-stroke-subtle bg-surface-1">
            <FileEdit className="h-3.5 w-3.5 shrink-0 text-text-tertiary" aria-hidden />
            <span className="text-[11px] text-text-tertiary truncate">{displayPath(file)}</span>
          </div>
          <div className="overflow-auto max-h-128">
            <table className="w-full border-collapse">
              <tbody>
                {file.hunks.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-(--of-space-md) py-(--of-space-sm) text-[11px] text-text-secondary">
                      No textual hunks
                    </td>
                  </tr>
                ) : (
                  file.hunks.flatMap((hunk, hi) => renderHunkRows(hunk, hi, `${fi}`))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SingleFileDiffViewer({ diff, maxLines }: SingleFileDiffViewerProps) {
  const hunks = useMemo(() => truncateHunks(parseSingleFileHunks(diff), maxLines), [diff, maxLines]);

  if (hunks.length === 0) {
    return (
      <div className="text-xs text-text-tertiary py-(--of-space-sm) px-(--of-space-md) border border-stroke-subtle bg-surface-1/50">
        No diff content to display
      </div>
    );
  }

  return (
    <div className="border border-stroke-subtle bg-surface-1 overflow-hidden text-[13px] font-mono">
      <div className="overflow-auto max-h-128">
        <table className="w-full border-collapse">
          <tbody>{hunks.flatMap((hunk, hi) => renderHunkRows(hunk, hi, "sf"))}</tbody>
        </table>
      </div>
    </div>
  );
}
