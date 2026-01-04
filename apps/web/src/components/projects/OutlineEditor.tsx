"use client";

import { useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";

interface OutlineEditorProps {
  projectId: string;
  outline: Record<string, any> | null;
  titleVariants: Array<{ title: string; style: string; reasoning?: string }> | null;
}

export function OutlineEditor({ projectId, outline, titleVariants }: OutlineEditorProps) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [generatingTitles, setGeneratingTitles] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Outline state
  const initialContent = outline?.markdown || (
    // Fallback for legacy structured outlines
    outline?.sections ? JSON.stringify(outline, null, 2) : ""
  );
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(initialContent);
  const [saving, setSaving] = useState(false);

  const handleGenerateOutline = async () => {
    setGenerating(true);
    setError(null);

    try {
      const response = await fetch("/api/tools/project_generate_outline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to generate outline");
      }

      // Update local content with the generated markdown
      if (result.data?.outline?.markdown) {
        setContent(result.data.outline.markdown);
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate outline");
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateTitles = async () => {
    setGeneratingTitles(true);
    setError(null);

    try {
      const response = await fetch("/api/tools/project_generate_titles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, count: 10 }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to generate titles");
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate titles");
    } finally {
      setGeneratingTitles(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/outline`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outline: { markdown: content },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save outline");
      }

      setIsEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setContent(initialContent);
    setIsEditing(false);
    setError(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Outline</h2>
        <div className="flex gap-2">
          {!isEditing && content && (
            <button
              onClick={() => setIsEditing(true)}
              className="px-3 py-1 text-sm text-gray-400 hover:text-white transition-colors border border-transparent hover:border-gray-600 rounded"
            >
              Edit
            </button>
          )}
          <button
            onClick={handleGenerateOutline}
            disabled={generating}
            className="px-3 py-1 text-sm text-gray-400 hover:text-white transition-colors"
          >
            {generating ? "Generating..." : content ? "Regenerate" : "Generate Outline"}
          </button>
        </div>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {/* Editor / Viewer Area */}
      <div className="bg-gray-800/30 border border-gray-700 rounded-xl p-6">
        {isEditing ? (
          <div className="space-y-4">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full h-96 px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors font-mono text-sm"
              placeholder="Enter outline markdown..."
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={handleCancel}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white border border-gray-600 hover:border-gray-500 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <div className="prose prose-invert prose-gray max-w-none">
            {content ? (
              <MarkdownViewer content={content} />
            ) : (
              <div className="text-gray-500 italic py-8 text-center">
                No outline generated yet. Click "Generate Outline" to start.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Title Variants */}
      <div className="pt-4 border-t border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-md font-semibold text-white">Title Variants</h3>
          <button
            onClick={handleGenerateTitles}
            disabled={generatingTitles}
            className="px-3 py-1 text-sm text-gray-400 hover:text-white transition-colors"
          >
            {generatingTitles ? "Generating..." : titleVariants ? "Regenerate" : "Generate"}
          </button>
        </div>

        {titleVariants && titleVariants.length > 0 ? (
          <div className="space-y-2">
            {titleVariants.map((variant, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg"
              >
                <span className="text-white">{variant.title}</span>
                <span className="text-xs text-gray-500 uppercase">{variant.style}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-400 text-sm">No title variants generated yet</p>
        )}
      </div>
    </div>
  );
}

function MarkdownViewer({ content }: { content: string }) {
  // Simple markdown parsing (duplicated from IdeaBrief to avoid dependency issues)
  const lines = content.split("\n");
  const elements: ReactElement[] = [];
  let currentList: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const flushList = (index: number) => {
    if (currentList.length > 0) {
      const ListTag = listType === "ol" ? "ol" : "ul";
      elements.push(
        <ListTag key={`list-${index}`} className="list-disc list-inside space-y-1 text-gray-300">
          {currentList.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ListTag>
      );
      currentList = [];
      listType = null;
    }
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    // Headers
    if (trimmed.startsWith("# ")) {
      flushList(index);
      elements.push(
        <h1 key={index} className="text-2xl font-bold text-white mt-6 mb-3">
          {trimmed.slice(2)}
        </h1>
      );
    } else if (trimmed.startsWith("## ")) {
      flushList(index);
      elements.push(
        <h2 key={index} className="text-xl font-semibold text-white mt-5 mb-2">
          {trimmed.slice(3)}
        </h2>
      );
    } else if (trimmed.startsWith("### ")) {
      flushList(index);
      elements.push(
        <h3 key={index} className="text-lg font-medium text-white mt-4 mb-2">
          {trimmed.slice(4)}
        </h3>
      );
    }
    // Unordered list
    else if (trimmed.startsWith("- ")) {
      if (listType !== "ul") {
        flushList(index);
        listType = "ul";
      }
      currentList.push(trimmed.slice(2));
    }
    // Ordered list
    else if (/^\d+\.\s/.test(trimmed)) {
      if (listType !== "ol") {
        flushList(index);
        listType = "ol";
      }
      currentList.push(trimmed.replace(/^\d+\.\s/, ""));
    }
    // Bold text
    else if (trimmed.includes("**")) {
      flushList(index);
      const parts = trimmed.split("**");
      const formatted = parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-bold text-white">
            {part}
          </strong>
        ) : (
          part
        )
      );
      elements.push(
        <p key={index} className="text-gray-300 mb-2">
          {formatted}
        </p>
      );
    }
    // Links
    else if (trimmed.includes("http")) {
      flushList(index);
      const urlMatch = trimmed.match(/(https?:\/\/[^\s]+)/);
      if (urlMatch) {
        const url = urlMatch[1];
        const beforeUrl = trimmed.substring(0, trimmed.indexOf(url));
        const afterUrl = trimmed.substring(trimmed.indexOf(url) + url.length);
        elements.push(
          <p key={index} className="text-gray-300 mb-2">
            {beforeUrl}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-400 hover:text-primary-300 underline"
            >
              {url}
            </a>
            {afterUrl}
          </p>
        );
      } else {
        elements.push(
          <p key={index} className="text-gray-300 mb-2">
            {trimmed}
          </p>
        );
      }
    }
    // Regular paragraph
    else if (trimmed) {
      flushList(index);
      elements.push(
        <p key={index} className="text-gray-300 mb-2">
          {trimmed}
        </p>
      );
    }
    // Empty line
    else {
      flushList(index);
    }
  });

  // Flush any remaining list
  flushList(lines.length);

  return <div className="space-y-2">{elements}</div>;
}

