"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getServiceRunScript, updateServiceRunScript } from "@/lib/api";
import type { ServiceRunScriptResponse } from "@/types/api";

export default function ServiceSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const containerName = params.name as string;
  const serviceName = params.service as string;

  const [script, setScript] = useState<string>("");
  const [originalScript, setOriginalScript] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadScript();
  }, [containerName, serviceName]);

  const loadScript = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getServiceRunScript(containerName, serviceName);
      setScript(response.content);
      setOriginalScript(response.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load script");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (script === originalScript) {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess(false);
      await updateServiceRunScript(containerName, serviceName, script);
      setOriginalScript(script);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save script");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setScript(originalScript);
    setError(null);
    setSuccess(false);
  };

  const hasChanges = script !== originalScript;

  const buttonStyle = (isPrimary = false) => ({
    padding: "4px 12px",
    fontSize: "12px",
    fontWeight: "400",
    border: "none",
    borderRadius: "2px",
    cursor: saving ? "not-allowed" : "pointer",
    opacity: saving ? 0.5 : 1,
    backgroundColor: isPrimary
      ? "var(--vscode-button-background)"
      : "var(--vscode-button-secondaryBackground)",
    color: isPrimary
      ? "var(--vscode-button-foreground)"
      : "var(--vscode-button-secondaryForeground)",
    transition: "background-color 0.2s",
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div style={{ color: "var(--vscode-descriptionForeground)" }}>
          Loading script...
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 0 }}>
      <div className="mb-6 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1
              className="text-2xl font-semibold mb-2"
              style={{ color: "var(--vscode-foreground)" }}
            >
              Service Settings
            </h1>
            <p
              className="text-sm"
              style={{ color: "var(--vscode-descriptionForeground)" }}
            >
              Edit run script for {serviceName} in {containerName}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <span
                className="text-xs"
                style={{ color: "var(--vscode-warningForeground)" }}
              >
                Unsaved changes
              </span>
            )}
            {success && (
              <span
                className="text-xs"
                style={{ color: "var(--vscode-successForeground)" }}
              >
                Saved successfully
              </span>
            )}
            <button
              onClick={handleCancel}
              disabled={saving || !hasChanges}
              style={buttonStyle()}
              onMouseEnter={(e) => {
                if (!saving && hasChanges) {
                  e.currentTarget.style.backgroundColor = "var(--vscode-button-secondaryHoverBackground)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--vscode-button-secondaryBackground)";
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              style={buttonStyle(true)}
              onMouseEnter={(e) => {
                if (!saving && hasChanges) {
                  e.currentTarget.style.backgroundColor = "var(--vscode-button-hoverBackground)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--vscode-button-background)";
              }}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>

        {error && (
          <div
            className="border rounded p-4 mb-4"
            style={{
              backgroundColor: "rgba(244, 135, 113, 0.1)",
              borderColor: "rgba(244, 135, 113, 0.3)"
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3
                  className="font-medium mb-1"
                  style={{ color: "var(--vscode-errorForeground)" }}
                >
                  Error
                </h3>
                <p
                  className="text-sm"
                  style={{ color: "var(--vscode-errorForeground)" }}
                >
                  {error}
                </p>
              </div>
              <button
                onClick={() => setError(null)}
                className="px-2 py-1 text-xs rounded"
                style={{
                  backgroundColor: "var(--vscode-button-secondaryBackground)",
                  color: "var(--vscode-button-secondaryForeground)",
                  border: "none",
                  cursor: "pointer"
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <div
          className="mb-2 text-xs font-medium"
          style={{ color: "var(--vscode-descriptionForeground)" }}
        >
          Run Script: docker/s6-services/{serviceName}/run
        </div>
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          className="flex-1 font-mono text-xs p-4 rounded border resize-none"
          style={{
            backgroundColor: "var(--vscode-input-background)",
            borderColor: "var(--vscode-input-border)",
            color: "var(--vscode-input-foreground)",
            fontFamily: "monospace",
            minHeight: "400px"
          }}
          spellCheck={false}
        />
      </div>
    </div>
  );
}
