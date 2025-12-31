"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface DeepResearchProps {
  baselineKeywords: string[];
}

interface IdeaResult {
  title_concept: string;
  thesis: string;
  why_now: string;
  hook_options: string[];
  thumbnail_text_ideas: string[];
  search_queries_used: string[];
}

export function DeepResearch({ baselineKeywords }: DeepResearchProps) {
  const router = useRouter();
  const [avoidTopics, setAvoidTopics] = useState("");
  const [targetViewer, setTargetViewer] = useState("");
  const [ideaCount, setIdeaCount] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<IdeaResult[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const handleResearch = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/tools/deep_research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          avoid_topics: avoidTopics.split(",").map((t) => t.trim()).filter(Boolean),
          target_viewer_description: targetViewer || undefined,
          idea_count: ideaCount,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Research failed");
      }

      setIdeas(result.data.ideas);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Research failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveIdea = async (idea: IdeaResult) => {
    try {
      const response = await fetch("/api/ideas/save-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title_concept: idea.title_concept,
          thesis: idea.thesis,
          hook_options: idea.hook_options,
          thumbnail_text_ideas: idea.thumbnail_text_ideas,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save idea");
      }

      router.refresh();
      // Remove from results
      setIdeas(ideas.filter((i) => i.title_concept !== idea.title_concept));
    } catch (err) {
      console.error("Save error:", err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Research Form */}
      <div className="bg-gray-800/30 border border-gray-700 rounded-xl p-6 space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-white mb-2">Deep Research</h3>
          <p className="text-sm text-gray-400">
            Generate new video ideas based on your niche baseline using AI analysis
          </p>
        </div>

        {baselineKeywords.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <span className="text-sm text-gray-400">Based on:</span>
            {baselineKeywords.slice(0, 5).map((keyword, i) => (
              <span key={i} className="px-2 py-1 bg-gray-700 rounded text-xs text-gray-300">
                {keyword}
              </span>
            ))}
            {baselineKeywords.length > 5 && (
              <span className="text-xs text-gray-500">
                +{baselineKeywords.length - 5} more
              </span>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Topics to Avoid
            </label>
            <input
              type="text"
              value={avoidTopics}
              onChange={(e) => setAvoidTopics(e.target.value)}
              placeholder="politics, controversy, drama"
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
            />
            <p className="mt-1 text-sm text-gray-500">Optional, comma-separated</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Target Viewer
            </label>
            <input
              type="text"
              value={targetViewer}
              onChange={(e) => setTargetViewer(e.target.value)}
              placeholder="Beginner developers looking to improve"
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
            />
            <p className="mt-1 text-sm text-gray-500">Optional viewer description</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Number of Ideas
            </label>
            <select
              value={ideaCount}
              onChange={(e) => setIdeaCount(parseInt(e.target.value))}
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
            >
              <option value={10}>10 ideas</option>
              <option value={20}>20 ideas</option>
              <option value={30}>30 ideas</option>
              <option value={50}>50 ideas</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={handleResearch}
              disabled={loading}
              className="w-full px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-600/50 text-white font-semibold rounded-lg transition-colors"
            >
              {loading ? "Researching..." : "Generate Ideas"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Results */}
      {ideas.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">
            Generated {ideas.length} ideas
          </h3>

          <div className="space-y-3">
            {ideas.map((idea, index) => (
              <div
                key={index}
                className="bg-gray-800/30 border border-gray-700 rounded-xl overflow-hidden hover:border-gray-600 transition-colors"
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h4 className="text-white font-medium text-lg">
                        {idea.title_concept}
                      </h4>
                      <p className="text-gray-400 mt-2">{idea.thesis}</p>
                      <p className="text-sm text-accent-400 mt-2">
                        Why now: {idea.why_now}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => handleSaveIdea(idea)}
                        className="px-4 py-2 bg-accent-600 hover:bg-accent-700 text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        Save Idea
                      </button>
                      <button
                        onClick={() => setExpandedId(expandedId === index ? null : index)}
                        className="px-4 py-2 border border-gray-600 hover:border-gray-500 text-gray-300 text-sm font-medium rounded-lg transition-colors"
                      >
                        {expandedId === index ? "Less" : "More"}
                      </button>
                    </div>
                  </div>

                  {expandedId === index && (
                    <div className="mt-4 pt-4 border-t border-gray-700 space-y-4">
                      <div>
                        <h5 className="text-sm font-medium text-gray-300 mb-2">
                          Hook Options
                        </h5>
                        <ul className="space-y-2">
                          {idea.hook_options.map((hook, i) => (
                            <li key={i} className="text-sm text-gray-400 flex items-start gap-2">
                              <span className="text-primary-400">{i + 1}.</span>
                              {hook}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <h5 className="text-sm font-medium text-gray-300 mb-2">
                          Thumbnail Text Ideas
                        </h5>
                        <div className="flex flex-wrap gap-2">
                          {idea.thumbnail_text_ideas.map((text, i) => (
                            <span
                              key={i}
                              className="px-3 py-1 bg-gray-700 rounded-full text-sm text-white"
                            >
                              {text}
                            </span>
                          ))}
                        </div>
                      </div>

                      {idea.search_queries_used.length > 0 && (
                        <div>
                          <h5 className="text-sm font-medium text-gray-300 mb-2">
                            Based on searches
                          </h5>
                          <div className="flex flex-wrap gap-2">
                            {idea.search_queries_used.map((query, i) => (
                              <span
                                key={i}
                                className="px-2 py-1 bg-gray-800 rounded text-xs text-gray-400"
                              >
                                {query}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

