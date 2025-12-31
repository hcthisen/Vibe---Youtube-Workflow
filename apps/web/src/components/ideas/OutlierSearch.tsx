"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

interface OutlierSearchProps {
  baselineKeywords: string[];
}

interface SearchResult {
  video_id: string;
  youtube_video_id: string;
  title: string;
  thumbnail_url: string | null;
  channel_name: string | null;
  published_at: string | null;
  views_count: number | null;
  score: number;
  score_breakdown: {
    base_outlier: number;
    recency_boost: number;
    modifiers: Record<string, number>;
    modifiers_sum: number;
    final_score: number;
  };
}

export function OutlierSearch({ baselineKeywords }: OutlierSearchProps) {
  const router = useRouter();
  const [keywords, setKeywords] = useState(baselineKeywords.join(", "));
  const [searchType, setSearchType] = useState<"within_niche" | "cross_niche">("within_niche");
  const [minViews, setMinViews] = useState(10000);
  const [maxAgeDays, setMaxAgeDays] = useState(365);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleSearch = async () => {
    const keywordList = keywords.split(",").map((k) => k.trim()).filter(Boolean);
    if (keywordList.length === 0) {
      setError("Please enter at least one keyword");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/tools/outlier_search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keywords: keywordList,
          search_type: searchType,
          min_views: minViews,
          max_age_days: maxAgeDays,
          limit: 50,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Search failed");
      }

      setResults(result.data.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveIdea = async (result: SearchResult) => {
    try {
      const response = await fetch("/api/ideas/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_id: result.video_id,
          score: result.score,
          score_breakdown: result.score_breakdown,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save idea");
      }

      router.refresh();
      // Remove from results after saving
      setResults(results.filter((r) => r.video_id !== result.video_id));
    } catch (err) {
      console.error("Save error:", err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search Form */}
      <div className="bg-gray-800/30 border border-gray-700 rounded-xl p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Keywords
            </label>
            <input
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="productivity, coding, tutorial"
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
            />
            <p className="mt-1 text-sm text-gray-500">
              Comma-separated keywords to search for
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Search Type
            </label>
            <select
              value={searchType}
              onChange={(e) => setSearchType(e.target.value as "within_niche" | "cross_niche")}
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
            >
              <option value="within_niche">Within Niche</option>
              <option value="cross_niche">Cross-Niche</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Minimum Views
            </label>
            <input
              type="number"
              value={minViews}
              onChange={(e) => setMinViews(parseInt(e.target.value) || 0)}
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
              min={0}
              step={1000}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Max Age (days)
            </label>
            <input
              type="number"
              value={maxAgeDays}
              onChange={(e) => setMaxAgeDays(parseInt(e.target.value) || 365)}
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
              min={1}
              max={730}
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={handleSearch}
              disabled={loading}
              className="w-full px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-600/50 text-white font-semibold rounded-lg transition-colors"
            >
              {loading ? "Searching..." : "Search Outliers"}
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
      {results.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">
            Found {results.length} outliers
          </h3>

          <div className="space-y-3">
            {results.map((result) => (
              <div
                key={result.video_id}
                className="bg-gray-800/30 border border-gray-700 rounded-xl overflow-hidden hover:border-gray-600 transition-colors"
              >
                <div className="flex gap-4 p-4">
                  {/* Thumbnail */}
                  <div className="flex-shrink-0 w-40 aspect-video relative rounded-lg overflow-hidden">
                    {result.thumbnail_url ? (
                      <Image
                        src={result.thumbnail_url}
                        alt={result.title}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                        <span className="text-gray-500 text-xs">No thumbnail</span>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-white font-medium line-clamp-2">{result.title}</h4>
                    <p className="text-sm text-gray-400 mt-1">{result.channel_name}</p>
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                      {result.views_count && (
                        <span>{result.views_count.toLocaleString()} views</span>
                      )}
                      {result.published_at && (
                        <span>
                          {new Date(result.published_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Score */}
                  <div className="flex-shrink-0 text-right">
                    <div className="text-2xl font-bold text-primary-400">
                      {result.score.toFixed(1)}x
                    </div>
                    <button
                      onClick={() =>
                        setExpandedId(expandedId === result.video_id ? null : result.video_id)
                      }
                      className="text-xs text-gray-500 hover:text-gray-300"
                    >
                      {expandedId === result.video_id ? "Hide breakdown" : "Show breakdown"}
                    </button>
                  </div>

                  {/* Actions */}
                  <div className="flex-shrink-0 flex flex-col gap-2">
                    <button
                      onClick={() => handleSaveIdea(result)}
                      className="px-4 py-2 bg-accent-600 hover:bg-accent-700 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      Save Idea
                    </button>
                    <a
                      href={`https://youtube.com/watch?v=${result.youtube_video_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 border border-gray-600 hover:border-gray-500 text-gray-300 text-sm font-medium rounded-lg transition-colors text-center"
                    >
                      Watch
                    </a>
                  </div>
                </div>

                {/* Score Breakdown */}
                {expandedId === result.video_id && (
                  <div className="border-t border-gray-700 p-4 bg-gray-900/50">
                    <h5 className="text-sm font-medium text-gray-300 mb-3">Score Breakdown</h5>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Base Outlier</span>
                        <p className="text-white font-medium">
                          {result.score_breakdown.base_outlier.toFixed(2)}x
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500">Recency Boost</span>
                        <p className="text-white font-medium">
                          {result.score_breakdown.recency_boost.toFixed(2)}x
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500">Modifiers</span>
                        <p className="text-white font-medium">
                          +{(result.score_breakdown.modifiers_sum * 100).toFixed(0)}%
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500">Final Score</span>
                        <p className="text-primary-400 font-bold">
                          {result.score_breakdown.final_score.toFixed(2)}x
                        </p>
                      </div>
                    </div>
                    {Object.keys(result.score_breakdown.modifiers).length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {Object.entries(result.score_breakdown.modifiers).map(([key, value]) => (
                          <span
                            key={key}
                            className="px-2 py-1 bg-gray-800 rounded text-xs text-gray-300"
                          >
                            {key}: +{(value * 100).toFixed(0)}%
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

