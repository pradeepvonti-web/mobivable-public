import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Wand2, Copy } from "lucide-react";

type Props = {
  children: ReactNode;
  onError?: (error: Error, errorInfo: string) => void;
  fallbackTitle?: string;
};

type State = {
  hasError: boolean;
  error: Error | null;
  errorInfo: string;
  recovering: boolean;
  attemptCount: number;
};

/**
 * React Error Boundary for the mobile app preview.
 * Catches runtime rendering errors and displays a recovery UI
 * instead of crashing the entire workspace.
 */
export class MobileErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: "", recovering: false, attemptCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const info = errorInfo.componentStack ?? "";
    this.setState({ errorInfo: info });
    this.props.onError?.(error, info);
    console.error("[MobileErrorBoundary] Caught:", error.message, info);
  }

  handleRetry = () => {
    this.setState(s => ({
      hasError: false, error: null, errorInfo: "",
      recovering: false, attemptCount: s.attemptCount + 1,
    }));
  };

  handleCopy = () => {
    const { error, errorInfo } = this.state;
    const text = `Error: ${error?.message ?? "Unknown"}\n\nStack:\n${error?.stack ?? ""}\n\nComponent:\n${errorInfo}`;
    navigator.clipboard.writeText(text).catch(() => {});
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const { error, errorInfo, attemptCount } = this.state;

    return (
      <div style={{
        height: "100%", width: "100%", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", padding: 24,
        background: "#0a0a1a", color: "#f8fafc",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}>
        {/* Error icon */}
        <div style={{
          width: 56, height: 56, borderRadius: "50%",
          background: "rgba(239, 68, 68, 0.15)", display: "grid", placeItems: "center",
          marginBottom: 16,
        }}>
          <AlertTriangle style={{ width: 28, height: 28, color: "#ef4444" }} />
        </div>

        {/* Title */}
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, marginBottom: 4 }}>
          {this.props.fallbackTitle ?? "Preview Error"}
        </h3>
        <p style={{ fontSize: 11, color: "#64748b", margin: 0, marginBottom: 16, textAlign: "center", lineHeight: 1.5 }}>
          The generated UI encountered a rendering error.
          {attemptCount > 0 && ` (Attempt ${attemptCount + 1})`}
        </p>

        {/* Error message */}
        <div style={{
          width: "100%", maxHeight: 120, overflow: "auto",
          borderRadius: 10, background: "rgba(239, 68, 68, 0.08)",
          border: "1px solid rgba(239, 68, 68, 0.2)",
          padding: 12, marginBottom: 16,
        }}>
          <p style={{ fontSize: 10, fontFamily: "monospace", color: "#fca5a5", margin: 0, wordBreak: "break-word" }}>
            {error?.message ?? "Unknown error"}
          </p>
          {errorInfo && (
            <p style={{ fontSize: 9, fontFamily: "monospace", color: "#64748b", margin: 0, marginTop: 8, whiteSpace: "pre-wrap" }}>
              {errorInfo.slice(0, 300)}
            </p>
          )}
        </div>

        {/* Self-healing indicator */}
        <div style={{
          width: "100%", borderRadius: 10, padding: 10,
          background: "rgba(99, 102, 241, 0.08)", border: "1px solid rgba(99, 102, 241, 0.2)",
          marginBottom: 16, display: "flex", alignItems: "center", gap: 8,
        }}>
          <Wand2 style={{ width: 14, height: 14, color: "#818cf8", flexShrink: 0 }} />
          <span style={{ fontSize: 10, color: "#818cf8" }}>
            The error detector agent can analyze and fix this automatically during the next build.
          </span>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, width: "100%" }}>
          <button
            type="button"
            onClick={this.handleRetry}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              padding: "10px 0", borderRadius: 10, border: "none",
              background: "#6366f1", color: "#fff", fontSize: 12, fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <RefreshCw style={{ width: 14, height: 14 }} />
            Retry
          </button>
          <button
            type="button"
            onClick={this.handleCopy}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              padding: "10px 0", borderRadius: 10,
              border: "1px solid #27272a", background: "transparent", color: "#94a3b8",
              fontSize: 12, fontWeight: 500, cursor: "pointer",
            }}
          >
            <Copy style={{ width: 14, height: 14 }} />
            Copy Error
          </button>
        </div>
      </div>
    );
  }
}
