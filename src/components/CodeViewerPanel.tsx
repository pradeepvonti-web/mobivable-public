import { useState, useCallback, useEffect, useMemo, useRef } from "react";
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
  X,
  Save,
  Settings2,
  Terminal,
  Maximize2,
  Minimize2,
  AlertCircle,
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

type OpenTab = {
  path: string;
  file: ProjectFile;
  isDirty: boolean;
  editedContent: string | null;
};

// ─── Monaco Language Mapping ────────────────────────────────────

const MONACO_LANG_MAP: Record<string, string> = {
  tsx: "typescriptreact",
  ts: "typescript",
  typescript: "typescript",
  javascript: "javascript",
  jsx: "javascript",
  json: "json",
  markdown: "markdown",
  md: "markdown",
  css: "css",
  html: "html",
  env: "plaintext",
  text: "plaintext",
  yaml: "yaml",
  yml: "yaml",
  sql: "sql",
  graphql: "graphql",
  xml: "xml",
  shell: "shell",
  sh: "shell",
};

function getMonacoLang(language: string): string {
  return MONACO_LANG_MAP[language] ?? "plaintext";
}

// ─── Helpers ────────────────────────────────────────────────────

function getFileIcon(language: string, className = "h-3.5 w-3.5 shrink-0") {
  switch (language) {
    case "tsx":
    case "typescript":
    case "typescriptreact":
      return <FileCode className={`${className} text-blue-400`} />;
    case "javascript":
    case "jsx":
      return <FileCode className={`${className} text-yellow-300`} />;
    case "json":
      return <FileJson className={`${className} text-amber-400`} />;
    case "markdown":
    case "md":
      return <FileText className={`${className} text-muted-foreground`} />;
    case "css":
      return <FileCode className={`${className} text-purple-400`} />;
    default:
      return <File className={`${className} text-muted-foreground`} />;
  }
}

function getLanguageBadge(language: string): string {
  const map: Record<string, string> = {
    tsx: "TSX",
    typescript: "TS",
    typescriptreact: "TSX",
    javascript: "JS",
    jsx: "JSX",
    json: "JSON",
    markdown: "MD",
    env: "ENV",
    text: "TXT",
    css: "CSS",
    html: "HTML",
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
  openTabs,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (file: ProjectFile) => void;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
  openTabs: OpenTab[];
}) {
  const isExpanded = expandedDirs.has(node.path);
  const isSelected = selectedPath === node.path;
  const tab = openTabs.find((t) => t.path === node.path);

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
          <FolderOpen className={`h-3.5 w-3.5 shrink-0 ${isExpanded ? "text-amber-400" : "text-amber-400/60"}`} />
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
              openTabs={openTabs}
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
      {tab?.isDirty && (
        <span className="ml-auto h-2 w-2 rounded-full bg-primary shrink-0" title="Unsaved changes" />
      )}
      {node.file?.isOverridden && !tab?.isDirty && (
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
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Multi-tab state
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);
  const activeTab = openTabs.find((t) => t.path === activeTabPath) ?? null;

  // Monaco editor
  const [MonacoEditor, setMonacoEditor] = useState<any>(null);
  const [monacoLoaded, setMonacoLoaded] = useState(false);
  const editorRef = useRef<any>(null);

  const fetchFilesFn = useServerFn(getProjectFiles);
  const saveOverrideFn = useServerFn(saveFileOverride);
  const deleteOverrideFn = useServerFn(deleteFileOverride);

  // ─── Load Monaco lazily ───────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    import("@monaco-editor/react").then((mod) => {
      setMonacoEditor(() => mod.default);
      setMonacoLoaded(true);
    });
  }, []);

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
      // Auto-open first file if no tabs
      if (res.files.length > 0 && openTabs.length === 0) {
        const first = res.files[0];
        setOpenTabs([{ path: first.path, file: first, isDirty: false, editedContent: null }]);
        setActiveTabPath(first.path);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load project files");
    } finally {
      setLoading(false);
    }
  }, [fetchFilesFn, projectId]);

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

  // ─── Open file in tab ─────────────────────────────────────
  const openFileInTab = useCallback((file: ProjectFile) => {
    setOpenTabs((prev) => {
      const existing = prev.find((t) => t.path === file.path);
      if (existing) return prev;
      return [...prev, { path: file.path, file, isDirty: false, editedContent: null }];
    });
    setActiveTabPath(file.path);
  }, []);

  // ─── Close tab ────────────────────────────────────────────
  const closeTab = useCallback((path: string) => {
    setOpenTabs((prev) => {
      const filtered = prev.filter((t) => t.path !== path);
      if (activeTabPath === path) {
        setActiveTabPath(filtered.length > 0 ? filtered[filtered.length - 1].path : null);
      }
      return filtered;
    });
  }, [activeTabPath]);

  // ─── Handle editor content change ─────────────────────────
  const handleEditorChange = useCallback((value: string | undefined) => {
    if (!activeTabPath || value === undefined) return;
    setOpenTabs((prev) =>
      prev.map((t) =>
        t.path === activeTabPath
          ? { ...t, editedContent: value, isDirty: value !== t.file.content }
          : t,
      ),
    );
  }, [activeTabPath]);

  // ─── Copy ───────────────────────────────────────────────────
  const handleCopy = useCallback(() => {
    if (!activeTab) return;
    const content = activeTab.editedContent ?? activeTab.file.content;
    navigator.clipboard.writeText(content).catch(() => {});
    setCopied(true);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  }, [activeTab]);

  // ─── Save ──────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!activeTab || activeTab.editedContent === null) return;
    setSaving(true);
    try {
      const res = await saveOverrideFn({
        data: {
          projectId,
          filePath: activeTab.path,
          content: activeTab.editedContent,
        },
      });
      if (!res.ok) {
        toast.error("Save failed", { description: res.error });
        return;
      }
      toast.success("File saved");
      // Update file in list
      const updatedFile = { ...activeTab.file, content: activeTab.editedContent, isOverridden: true };
      setFiles((prev) =>
        prev.map((f) => (f.path === activeTab.path ? updatedFile : f)),
      );
      // Update tab
      setOpenTabs((prev) =>
        prev.map((t) =>
          t.path === activeTab.path
            ? { ...t, file: updatedFile, editedContent: null, isDirty: false }
            : t,
        ),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [saveOverrideFn, projectId, activeTab]);

  // ─── Revert ────────────────────────────────────────────────
  const handleRevert = useCallback(async () => {
    if (!activeTab) return;
    setReverting(true);
    try {
      const res = await deleteOverrideFn({
        data: { projectId, filePath: activeTab.path },
      });
      if (!res.ok) {
        toast.error("Revert failed", { description: res.error });
        return;
      }
      toast.success("Reverted to generated code");
      await loadFiles();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to revert");
    } finally {
      setReverting(false);
    }
  }, [deleteOverrideFn, projectId, activeTab, loadFiles]);

  // ─── Download ZIP ──────────────────────────────────────────
  const handleDownloadZip = useCallback(async () => {
    if (files.length === 0) return;
    const encoder = new TextEncoder();
    const parts: Uint8Array[] = [];
    const centralDir: Uint8Array[] = [];
    let offset = 0;

    for (const file of files) {
      const nameBytes = encoder.encode(file.path);
      const contentBytes = encoder.encode(file.content);
      let crc = 0xffffffff;
      for (let i = 0; i < contentBytes.length; i++) {
        crc = crc ^ contentBytes[i];
        for (let j = 0; j < 8; j++) {
          crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
        }
      }
      crc = (crc ^ 0xffffffff) >>> 0;

      const header = new Uint8Array(30 + nameBytes.length);
      const hv = new DataView(header.buffer);
      hv.setUint32(0, 0x04034b50, true);
      hv.setUint16(4, 20, true);
      hv.setUint16(8, 0, true);
      hv.setUint32(14, crc, true);
      hv.setUint32(18, contentBytes.length, true);
      hv.setUint32(22, contentBytes.length, true);
      hv.setUint16(26, nameBytes.length, true);
      header.set(nameBytes, 30);

      const cd = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(cd.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, contentBytes.length, true);
      cv.setUint32(24, contentBytes.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint32(38, 0x20, true);
      cv.setUint32(42, offset, true);
      cd.set(nameBytes, 46);

      parts.push(header, contentBytes);
      centralDir.push(cd);
      offset += header.length + contentBytes.length;
    }

    const cdSize = centralDir.reduce((sum, c) => sum + c.length, 0);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, centralDir.length, true);
    ev.setUint16(10, centralDir.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, offset, true);

    const blob = new Blob([...parts, ...centralDir, eocd] as BlobPart[], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "expo-project.zip";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Project ZIP downloaded!");
  }, [files]);

  // ─── Editor mount handler ─────────────────────────────────
  const handleEditorMount = useCallback((editor: any, monaco: any) => {
    editorRef.current = editor;

    // Define custom dark theme matching the app
    const isDark = document.documentElement.classList.contains('dark');
    monaco.editor.defineTheme("mobivable-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "6a737d", fontStyle: "italic" },
        { token: "keyword", foreground: "c678dd" },
        { token: "string", foreground: "98c379" },
        { token: "number", foreground: "d19a66" },
        { token: "type", foreground: "e5c07b" },
        { token: "function", foreground: "61afef" },
        { token: "variable", foreground: "e06c75" },
      ],
      colors: {
        "editor.background": "#0a0a12",
        "editor.foreground": "#abb2bf",
        "editor.lineHighlightBackground": "#ffffff08",
        "editor.selectionBackground": "#3e4451",
        "editorCursor.foreground": "#528bff",
        "editorLineNumber.foreground": "#ffffff20",
        "editorLineNumber.activeForeground": "#ffffff50",
        "editor.inactiveSelectionBackground": "#3e445155",
        "editorIndentGuide.background1": "#ffffff08",
        "editorIndentGuide.activeBackground1": "#ffffff15",
        "editorBracketMatch.background": "#ffffff10",
        "editorBracketMatch.border": "#528bff50",
      },
    });
    monaco.editor.defineTheme("mobivable-light", {
      base: "vs",
      inherit: true,
      rules: [
        { token: "comment", foreground: "6a737d", fontStyle: "italic" },
        { token: "keyword", foreground: "d73a49" },
        { token: "string", foreground: "22863a" },
        { token: "number", foreground: "005cc5" },
        { token: "type", foreground: "6f42c1" },
        { token: "function", foreground: "005cc5" },
        { token: "variable", foreground: "e36209" },
      ],
      colors: {
        "editor.background": "#ffffff",
        "editor.foreground": "#24292e",
        "editor.lineHighlightBackground": "#f6f8fa",
        "editor.selectionBackground": "#0366d625",
        "editorCursor.foreground": "#044289",
        "editorLineNumber.foreground": "#1b1f2344",
        "editorLineNumber.activeForeground": "#24292e",
        "editor.inactiveSelectionBackground": "#0366d611",
        "editorIndentGuide.background1": "#eaecef",
        "editorIndentGuide.activeBackground1": "#d1d5da",
        "editorBracketMatch.background": "#0366d610",
        "editorBracketMatch.border": "#0366d650",
      },
    });
    monaco.editor.setTheme(isDark ? "mobivable-dark" : "mobivable-light");

    // Ctrl+S / Cmd+S keyboard shortcut to save
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      handleSave();
    });
  }, [handleSave]);

  // ─── Computed values ──────────────────────────────────────
  const displayContent = activeTab?.editedContent ?? activeTab?.file.content ?? "";
  const lineCount = displayContent.split("\n").length;
  const dirtyCount = openTabs.filter((t) => t.isDirty).length;
  const activeMonacoLang = activeTab ? getMonacoLang(activeTab.file.language) : "plaintext";

  // ─── Render ───────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* ─── Header Bar ──────────────────────────────────────── */}
      <header className="px-3 py-2 border-b border-border flex items-center justify-between gap-3 bg-card/40">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 grid place-items-center shadow-sm">
            <Code2 className="h-3.5 w-3.5 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-sm uppercase tracking-tight">Code Editor</h2>
            <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
              {files.length} files · Expo Project
              {dirtyCount > 0 && (
                <span className="text-primary ml-1">· {dirtyCount} unsaved</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSidebarCollapsed((v) => !v)}
            className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            title="Toggle sidebar"
          >
            {sidebarCollapsed ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={handleDownloadZip}
            disabled={files.length === 0}
            className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-50"
            title="Download ZIP"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            title="Close editor"
          >
            <X className="h-3.5 w-3.5" />
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
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-xs text-red-400 max-w-[300px] text-center flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
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
          {!sidebarCollapsed && (
            <div className="w-[200px] shrink-0 border-r border-border flex flex-col bg-card" style={{ animation: 'fadeInUp 0.2s ease-out' }}>
              {/* Search */}
              <div className="p-2 border-b border-border/60">
                <div className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-background/30 px-2 py-1.5">
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
              <div className="flex-1 overflow-y-auto py-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent' }}>
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
                    selectedPath={activeTabPath}
                    onSelect={openFileInTab}
                    expandedDirs={expandedDirs}
                    onToggleDir={toggleDir}
                    openTabs={openTabs}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ─── Editor Area ─────────────────────────────────── */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Tab bar */}
            {openTabs.length > 0 && (
              <div className="flex items-center border-b border-border bg-card overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                {openTabs.map((tab) => {
                  const isActive = tab.path === activeTabPath;
                  const fileName = tab.path.split("/").pop() ?? tab.path;
                  return (
                    <div
                      key={tab.path}
                      className={`flex items-center gap-1.5 px-3 py-1.5 border-r border-border/30 cursor-pointer transition-colors shrink-0 ${
                        isActive
                          ? "bg-background text-foreground border-b-2 border-b-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                      }`}
                      onClick={() => setActiveTabPath(tab.path)}
                    >
                      {getFileIcon(tab.file.language, "h-3 w-3 shrink-0")}
                      <span className="text-[11px] truncate max-w-[120px]">{fileName}</span>
                      {tab.isDirty && (
                        <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          closeTab(tab.path);
                        }}
                        className="h-4 w-4 grid place-items-center rounded hover:bg-muted/40 transition-colors ml-0.5"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab ? (
              <>
                {/* File action bar */}
                <div className="flex items-center justify-between px-3 py-1 border-b border-border/40 bg-card">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-mono text-muted-foreground/60 truncate">
                      {activeTab.path}
                    </span>
                    {activeTab.file.isOverridden && (
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 shrink-0">
                        Modified
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {activeTab.isDirty && (
                      <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                      >
                        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                        Save
                      </button>
                    )}
                    {activeTab.file.isOverridden && (
                      <button
                        type="button"
                        onClick={handleRevert}
                        disabled={reverting}
                        className="inline-flex items-center gap-1 rounded-md border border-border/50 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                      >
                        {reverting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                        Revert
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="inline-flex items-center gap-1 rounded-md border border-border/50 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>

                {/* Monaco Editor */}
                <div className="flex-1 overflow-hidden bg-background">
                  {monacoLoaded && MonacoEditor ? (
                    <MonacoEditor
                      height="100%"
                      language={activeMonacoLang}
                      value={activeTab.editedContent ?? activeTab.file.content}
                      theme="mobivable-dark"
                      onChange={handleEditorChange}
                      onMount={handleEditorMount}
                      options={{
                        minimap: { enabled: true, maxColumn: 60, renderCharacters: false },
                        fontSize: 13,
                        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Menlo', monospace",
                        fontLigatures: true,
                        lineNumbers: "on",
                        scrollBeyondLastLine: false,
                        wordWrap: "on",
                        padding: { top: 12, bottom: 12 },
                        renderLineHighlight: "line",
                        renderLineHighlightOnlyWhenFocus: true,
                        folding: true,
                        foldingStrategy: "indentation",
                        bracketPairColorization: { enabled: true },
                        guides: { bracketPairs: true, indentation: true },
                        suggest: { showWords: false },
                        quickSuggestions: false,
                        tabSize: 2,
                        smoothScrolling: true,
                        cursorBlinking: "smooth",
                        cursorSmoothCaretAnimation: "on",
                        automaticLayout: true,
                        scrollbar: {
                          verticalScrollbarSize: 6,
                          horizontalScrollbarSize: 6,
                          vertical: "auto",
                          horizontal: "auto",
                        },
                      }}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span className="text-xs font-mono">Loading editor…</span>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3 bg-[#0a0a12]">
                <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/10 grid place-items-center">
                  <Code2 className="h-7 w-7 text-blue-400/40" />
                </div>
                <p className="text-xs text-center max-w-[200px]">
                  Select a file from the tree to view and edit.
                </p>
                <p className="text-[10px] text-muted-foreground/50 font-mono">
                  Ctrl+S to save · Monaco Editor
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Status Bar (VS Code-style) ───────────────────────── */}
      <div className="border-t border-border px-3 py-1 flex items-center justify-between text-[9px] font-mono bg-[#0d0d15]">
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="flex items-center gap-1">
            <Terminal className="h-3 w-3" />
            Mobivable Editor
          </span>
          {activeTab && (
            <span className="text-primary/60">
              {getLanguageBadge(activeTab.file.language)}
            </span>
          )}
          {dirtyCount > 0 && (
            <span className="text-primary">
              {dirtyCount} unsaved
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-muted-foreground/60">
          {activeTab && (
            <>
              <span>Ln {lineCount}</span>
              <span>UTF-8</span>
              <span>Spaces: 2</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
