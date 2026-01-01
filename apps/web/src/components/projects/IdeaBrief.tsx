"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface IdeaBriefProps {
  projectId: string;
  markdown: string;
}

export function IdeaBrief({ projectId, markdown }: IdeaBriefProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(markdown);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/idea-brief`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea_brief_markdown: content,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save idea brief");
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
    setContent(markdown);
    setIsEditing(false);
    setError(null);
  };

  return (
    <div className="bg-gray-800/30 border border-gray-700 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Idea Brief</h2>
        {!isEditing ? (
          <button
            onClick={() => setIsEditing(true)}
            className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white border border-gray-600 hover:border-gray-500 rounded-lg transition-colors"
          >
            Edit
          </button>
        ) : (
          <div className="flex gap-2">
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
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {isEditing ? (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full h-96 px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors font-mono text-sm"
          placeholder="Enter markdown content..."
        />
      ) : (
        <div className="prose prose-invert prose-gray max-w-none">
          <MarkdownViewer content={content} />
        </div>
      )}
    </div>
  );
}

function MarkdownViewer({ content }: { content: string }) {
  // Simple markdown parsing
  const lines = content.split("\n");
  const elements: JSX.Element[] = [];
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


