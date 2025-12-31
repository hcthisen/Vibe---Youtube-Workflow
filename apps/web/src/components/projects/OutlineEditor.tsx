"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface OutlineSection {
  title: string;
  beats: string[];
  duration_estimate_seconds?: number;
}

interface Outline {
  intro: OutlineSection;
  sections: OutlineSection[];
  outro: OutlineSection;
}

interface OutlineEditorProps {
  projectId: string;
  outline: Record<string, unknown> | null;
  titleVariants: string[] | null;
}

export function OutlineEditor({ projectId, outline, titleVariants }: OutlineEditorProps) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [generatingTitles, setGeneratingTitles] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const typedOutline = outline as Outline | null;

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

  if (!typedOutline) {
    return (
      <div className="text-center py-8">
        <h2 className="text-lg font-semibold text-white mb-2">Outline</h2>
        <p className="text-gray-400 mb-4">
          Generate an AI-powered outline for your video
        </p>
        {error && (
          <p className="text-red-400 text-sm mb-4">{error}</p>
        )}
        <button
          onClick={handleGenerateOutline}
          disabled={generating}
          className="px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-600/50 text-white font-semibold rounded-lg transition-colors"
        >
          {generating ? "Generating..." : "Generate Outline"}
        </button>
      </div>
    );
  }

  const formatDuration = (seconds?: number) => {
    if (!seconds) return null;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `~${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  const renderSection = (section: OutlineSection, key: string, label: string) => {
    const isExpanded = expandedSection === key;

    return (
      <div key={key} className="border border-gray-700 rounded-lg overflow-hidden">
        <button
          onClick={() => setExpandedSection(isExpanded ? null : key)}
          className="w-full flex items-center justify-between p-4 bg-gray-800/50 hover:bg-gray-800 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-gray-500 uppercase">{label}</span>
            <span className="text-white font-medium">{section.title}</span>
          </div>
          <div className="flex items-center gap-3">
            {section.duration_estimate_seconds && (
              <span className="text-sm text-gray-400">
                {formatDuration(section.duration_estimate_seconds)}
              </span>
            )}
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {isExpanded && (
          <div className="p-4 space-y-2">
            {section.beats.map((beat, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="text-primary-400 font-mono text-sm">{i + 1}.</span>
                <span className="text-gray-300">{beat}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Outline</h2>
        <button
          onClick={handleGenerateOutline}
          disabled={generating}
          className="px-3 py-1 text-sm text-gray-400 hover:text-white transition-colors"
        >
          {generating ? "Regenerating..." : "Regenerate"}
        </button>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="space-y-2">
        {renderSection(typedOutline.intro, "intro", "Intro")}
        {typedOutline.sections.map((section, i) =>
          renderSection(section, `section-${i}`, `Section ${i + 1}`)
        )}
        {renderSection(typedOutline.outro, "outro", "Outro")}
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
            {(titleVariants as Array<{ title: string; style: string }>).map((variant, i) => (
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

