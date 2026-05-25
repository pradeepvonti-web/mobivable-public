import { useState, useCallback, useEffect, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  FolderOpen,
  File,
  FileCode,
  FileJson,
  FileText,
  Copy,
  Download,
  RotateCcw,
  Search,
  Loader2,
  ChevronRight,
  ChevronDown,
  Check,
  Code2,
} from "lucide-react";
import { toast } from "sonner";
import {
  getProjectFiles,
  saveFileOverride,
  deleteFileOverride,
} from "@/lib/code-viewer.functions";

// ─── Types ──────────────────────────────────────────────────────

type ProjectFile = {
  path: string;
  content: string;
  language: string;
  isOverridden: boolean;
};

type TreeNode = {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
  file?: ProjectFile;
};

// ─── Helpers ────────────────────────────────────────────────────

function getFileIcon(language: string) {
  switch (language) {
    case "tsx":
    case "typescript":
    case "javascript":
    case "jsx":
      return <FileCode className="h-3.5 w-3.5 text-blue-400 shrink-0" />;
    case "json":
      return <FileJson className="h-3.5 w-3.5 text-yellow-400 shrink-0" />;
    case "markdown":
      return <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
    default:
      return <File className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
  }
}

function getLanguageBadge(language: string): string {
  const map: Record<string, string> = {
    tsx: "TSX",
    typescript: "TS",
    javascript: "JS",
    jsx: "JSX",
    json: "JSON",
    markdown: "MD",
    env: "ENV",
    text: "TXT",
  };
  return map[language] ?? language.toUpperCase();
}

function buildFileTree(files: ProjectFile[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const file of files) {
    const parts = file.path.split("/");
    let currentLevel = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const existing = currentLevel.find((n) => n.name === part);

      if (existing) {
        if (isLast) {
          existing.file = file;
          existing.isDir = false;
        }
        currentLevel = existing.children;
      } else {
        const node: TreeNode = {
          name: part,
          path: parts.slice(0, i + 1).join("/"),
          isDir: !isLast,
          children: [],
          file: isLast ? file : undefined,
        };
        currentLevel.push(node);
        currentLevel = node.children;
      }
    }
  }

  // Sort: directories first, then files alphabetically
  function sortNodes(nodes: TreeNode[]) {
    nodes.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) sortNodes(n.children);
  }
  sortNodes(root);
  return root;
}

// ─── FileTreeItem ───────────────────────────────────────────────

function FileTreeItem({
  node,
  depth,
  selectedPath,
  onSelect,
  expandedDirs,
  onToggleDir,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (file: ProjectFile) => void;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
}) {
  const isExpanded = expandedDirs.has(node.path);
  const isSelected = selectedPath === node.path;

  if (node.isDir) {
    return (
      <div>
        <button
          type="button"
          onClick={() => onToggleDir(node.path)}
          className="flex items-center gap-1.5 w-full px-2 py-1 text-left hover:bg-muted/30 rounded transition-colors group"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
          )}
          <FolderOpen className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <span className="text-[11px] text-foreground/80 truncate">
            {node.name}
          </span>
        </button>
        {isExpanded &&
          node.children.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
              expandedDirs={expandedDirs}
              onToggleDir={onToggleDir}
            />
          ))}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => node.file && onSelect(node.file)}
      className={`flex items-center gap-1.5 w-full px-2 py-1 text-left rounded transition-colors ${
        isSelected
          ? "bg-primary/15 text-primary"
          : "hover:bg-muted/30 text-foreground/70"
      }`}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      {getFileIcon(node.file?.language ?? "text")}
      <span className="text-[11px] truncate">{node.name}</span>
      {node.file?.isOverridden && (
        <span className="ml-auto text-[8px] font-mono uppercase tracking-wider text-amber-400 shrink-0">
          mod
        </span>
      )}
    </button>
  );
}

// ─── CodeViewerPanel ────────────────────────────────────────────

export function CodeViewerPanel({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<ProjectFile | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [editedContent, setEditedContent] = useState<string | null>(null);

  const fetchFilesFn = useServerFn(getProjectFiles);
  const saveOverrideFn = useServerFn(saveFileOverride);
  const deleteOverrideFn = useServerFn(deleteFileOverride);

  // ─── Load files ─────────────────────────────────────────────
  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchFilesFn({ data: { projectId } });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setFiles(res.files);
      // Auto-expand root directories
      const dirs = new Set<string>();
      for (const f of res.files) {
        const parts = f.path.split("/");
        if (parts.length > 1) {
          dirs.add(parts[0]);
        }
      }
      setExpandedDirs(dirs);
      // Auto-select first file
      if (res.files.length > 0 && !selectedFile) {
        setSelectedFile(res.files[0]);
        setEditedContent(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load project files");
    } finally {
      setLoading(false);
    }
  }, [fetchFilesFn, projectId, selectedFile]);

  useEffect(() => {
    loadFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // ─── Filter files for search ────────────────────────────────
  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return files;
    const q = searchQuery.toLowerCase();
    return files.filter((f) => f.path.toLowerCase().includes(q));
  }, [files, searchQuery]);

  const fileTree = useMemo(() => buildFileTree(filteredFiles), [filteredFiles]);

  // ─── Toggle directory ───────────────────────────────────────
  const toggleDir = useCallback((path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  // ─── Select a file ─────────────────────────────────────────
  const handleSelectFile = useCallback((file: ProjectFile) => {
    setSelectedFile(file);
    setEditedContent(null);
    setCopied(false);
  }, []);

  // ─── Copy ───────────────────────────────────────────────────
  const handleCopy = useCallback(() => {
    if (!selectedFile) return;
    const content = editedContent ?? selectedFile.content;
    navigator.clipboard.writeText(content).catch(() => {});
    setCopied(true);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  }, [selectedFile, editedContent]);

  // ─── Save override ─────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!selectedFile || editedContent === null) return;
    setSaving(true);
    try {
      const res = await saveOverrideFn({
        data: {
          projectId,
          filePath: selectedFile.path,
          content: editedContent,
        },
      });
      if (!res.ok) {
        toast.error("Save failed", { description: res.error });
        return;
      }
      toast.success("File saved");
      // Update local state
      setFiles((prev) =>
        prev.map((f) =>
          f.path === selectedFile.path
            ? { ...f, content: editedContent, isOverridden: true }
            : f,
        ),
      );
      setSelectedFile((prev) =>
        prev ? { ...prev, content: editedContent, isOverridden: true } : prev,
      );
      setEditedContent(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [saveOverrideFn, projectId, selectedFile, editedContent]);

  // ─── Revert to generated ───────────────────────────────────
  const handleRevert = useCallback(async () => {
    if (!selectedFile) return;
    setReverting(true);
    try {
      const res = await deleteOverrideFn({
        data: { projectId, filePath: selectedFile.path },
      });
      if (!res.ok) {
        toast.error("Revert failed", { description: res.error });
        return;
      }
      toast.success("Reverted to generated code");
      setEditedContent(null);
      // Reload files to get the original generated content
      await loadFiles();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to revert");
    } finally {
      setReverting(false);
    }
  }, [deleteOverrideFn, projectId, selectedFile, loadFiles]);

  // ─── Download ZIP ──────────────────────────────────────────
  const handleDownloadZip = useCallback(async () => {
    if (files.length === 0) return;

    // Create a simple ZIP using the same manual approach as export-project.ts
    const encoder = new TextEncoder();
    const parts: Uint8Array[] = [];
    const centralDir: Uint8Array[] = [];
    let offset = 0;

    for (const file of files) {
      const nameBytes = encoder.encode(file.path);
      const contentBytes = encoder.encode(file.content);

      // Simple CRC32
      let crc = 0xffffffff;
      for (let i = 0; i < contentBytes.length; i++) {
        crc = crc ^ contentBytes[i];
        for (let j = 0; j < 8; j++) {
          crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
        }
      }
      crc = (crc ^ 0xffffffff) >>> 0;

      // Local file header
      const header = new Uint8Array(30 + nameBytes.length);
      const hv = new DataView(header.buffer);
      hv.setUint32(0, 0x04034b50, true);
      hv.setUint16(4, 20, true);
      hv.setUint16(6, 0, true);
      hv.setUint16(8, 0, true);
      hv.setUint16(10, 0, true);
      hv.setUint16(12, 0, true);
      hv.setUint32(14, crc, true);
      hv.setUint32(18, contentBytes.length, true);
      hv.setUint32(22, contentBytes.length, true);
      hv.setUint16(26, nameBytes.length, true);
      hv.setUint16(28, 0, true);
      header.set(nameBytes, 30);

      // Central directory entry
      const cd = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(cd.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, contentBytes.length, true);
      cv.setUint32(24, contentBytes.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0x20, true);
      cv.setUint32(42, offset, true);
      cd.set(nameBytes, 46);

      parts.push(header, contentBytes);
      centralDir.push(cd);
      offset += header.length + contentBytes.length;
    }

    // End of central directory
    const cdSize = centralDir.reduce((sum, c) => sum + c.length, 0);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, centralDir.length, true);
    ev.setUint16(10, centralDir.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);

    const blob = new Blob([...parts, ...centralDir, eocd] as BlobPart[], {
      type: "application/zip",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "expo-project.zip";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Project ZIP downloaded!");
  }, [files]);

  // ─── Line numbers ─────────────────────────────────────────
  const displayContent = editedContent ?? selectedFile?.content ?? "";
  const lineCount = displayContent.split("\n").length;

  // ─── Render ───────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="p-4 border-b border-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 grid place-items-center">
            <Code2 className="h-4 w-4 text-white" />
          </div>
          <div>
            <h2 className="font-display text-base">Project Files</h2>
            <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
              {files.length} files · Expo Project
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadZip}
            disabled={files.length === 0}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-50"
          >
            <Download className="h-3 w-3" />
            ZIP
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
          >
            Close
          </button>
        </div>
      </header>

      {/* Loading */}
      {loading && (
        <div className="flex-1 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-xs">Loading project files…</span>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-3">
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-xs text-red-400 max-w-[300px] text-center">
            {error}
          </div>
          <button
            type="button"
            onClick={loadFiles}
            className="text-[10px] uppercase tracking-widest text-primary hover:text-primary/80 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main content */}
      {!loading && !error && (
        <div className="flex-1 flex min-h-0">
          {/* ─── File Tree Sidebar ───────────────────────────── */}
          <div className="w-[200px] shrink-0 border-r border-border flex flex-col bg-card/20">
            {/* Search */}
            <div className="p-2 border-b border-border">
              <div className="flex items-center gap-1.5 rounded-lg border border-border bg-background/50 px-2 py-1.5">
                <Search className="h-3 w-3 text-muted-foreground shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter files…"
                  className="flex-1 bg-transparent text-[11px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none min-w-0"
                />
              </div>
            </div>

            {/* Tree */}
            <div className="flex-1 overflow-y-auto py-1">
              {fileTree.length === 0 && (
                <p className="text-[10px] text-muted-foreground px-3 py-2">
                  No files found
                </p>
              )}
              {fileTree.map((node) => (
                <FileTreeItem
                  key={node.path}
                  node={node}
                  depth={0}
                  selectedPath={selectedFile?.path ?? null}
                  onSelect={handleSelectFile}
                  expandedDirs={expandedDirs}
                  onToggleDir={toggleDir}
                />
              ))}
            </div>
          </div>

          {/* ─── Code Viewer ─────────────────────────────────── */}
          <div className="flex-1 flex flex-col min-w-0">
            {selectedFile ? (
              <>
                {/* File header */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-card/30">
                  <div className="flex items-center gap-2 min-w-0">
                    {getFileIcon(selectedFile.language)}
                    <span className="text-xs font-medium text-foreground truncate">
                      {selectedFile.path}
                    </span>
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground shrink-0">
                      {getLanguageBadge(selectedFile.language)}
                    </span>
                    {selectedFile.isOverridden && (
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 shrink-0">
                        Modified
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Save button (when edited) */}
                    {editedContent !== null && (
                      <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                      >
                        {saving ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                        Save
                      </button>
                    )}
                    {/* Revert button */}
                    {selectedFile.isOverridden && (
                      <button
                        type="button"
                        onClick={handleRevert}
                        disabled={reverting}
                        className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-50"
                        title="Revert to generated"
                      >
                        {reverting ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3 w-3" />
                        )}
                        Revert
                      </button>
                    )}
                    {/* Copy button */}
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                    >
                      {copied ? (
                        <Check className="h-3 w-3 text-emerald-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>

                {/* Code area */}
                <div className="flex-1 overflow-auto bg-[#0a0a0f]">
                  <div className="flex min-h-full">
                    {/* Line numbers */}
                    <div className="shrink-0 select-none py-3 pl-3 pr-2 text-right border-r border-white/5">
                      {Array.from({ length: lineCount }, (_, i) => (
                        <div
                          key={i}
                          className="text-[10px] leading-[1.7] font-mono text-white/15"
                        >
                          {i + 1}
                        </div>
                      ))}
                    </div>
                    {/* Code content — editable textarea */}
                    <div className="flex-1 relative min-w-0">
                      <textarea
                        value={displayContent}
                        onChange={(e) => setEditedContent(e.target.value)}
                        spellCheck={false}
                        className="absolute inset-0 w-full h-full resize-none bg-transparent py-3 px-4 text-[10px] leading-[1.7] font-mono text-emerald-300/90 focus:outline-none whitespace-pre overflow-auto"
                      />
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
                <Code2 className="h-10 w-10 opacity-20" />
                <p className="text-xs text-center max-w-[200px]">
                  Select a file from the tree to view and edit its contents.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
