"use client";

import { useState, useEffect } from "react";
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

interface SearchHistory {
  id: string;
  search_params: any;
  results: SearchResult[];
  results_count: number;
  created_at: string;
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
  const [currentSearchId, setCurrentSearchId] = useState<string | null>(null);
  const [searchHistory, setSearchHistory] = useState<SearchHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [savingIdeaId, setSavingIdeaId] = useState<string | null>(null);
  const [savingPresetId, setSavingPresetId] = useState<string | null>(null);
  const [savedPresetIds, setSavedPresetIds] = useState<string[]>([]);
  const isQueued = jobStatus === "queued" || jobStatus === "search_queued";
  const isRunning = jobStatus === "running" || jobStatus === "search_running";

  useEffect(() => {
    loadSearchHistory();
    checkForActiveJobs();
  }, []);

  // Poll job status when there's an active job
  useEffect(() => {
    if (!activeJobId) return;

    const pollInterval = setInterval(async () => {
      await checkJobStatus(activeJobId);
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(pollInterval);
  }, [activeJobId]);

  const checkForActiveJobs = async () => {
    try {
      const response = await fetch("/api/jobs/active?type=outlier_search");
      const data = await response.json();
      if (data.jobs && data.jobs.length > 0) {
        const activeJob = data.jobs[0];
        setActiveJobId(activeJob.id);
        setJobStatus(activeJob.status);
        setLoading(true);
      }
    } catch (err) {
      console.error("Failed to check for active jobs:", err);
    }
  };

  const checkJobStatus = async (jobId: string) => {
    try {
      const response = await fetch(`/api/jobs/${jobId}`);
      const data = await response.json();
      
      if (!data.job) return;

      setJobStatus(data.job.status);

      if (data.job.status === "succeeded") {
        // Load the results
        if (data.searchResults) {
          setResults(data.searchResults.results);
          setCurrentSearchId(data.searchResults.id);
        }
        setActiveJobId(null);
        setJobStatus(null);
        setLoading(false);
        // Reload history
        loadSearchHistory();
      } else if (data.job.status === "failed") {
        setError(data.job.error || "Search failed");
        setActiveJobId(null);
        setJobStatus(null);
        setLoading(false);
      }
    } catch (err) {
      console.error("Failed to check job status:", err);
    }
  };

  const loadSearchHistory = async () => {
    setLoadingHistory(true);
    try {
      const response = await fetch("/api/ideas/search-history?search_type=outlier_search&limit=5");
      const data = await response.json();
      if (data.searchHistory) {
        setSearchHistory(data.searchHistory);
      }
    } catch (err) {
      console.error("Failed to load search history:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSearch = async () => {
    const keywordList = keywords.split(",").map((k) => k.trim()).filter(Boolean);
    if (keywordList.length === 0) {
      setError("Please enter at least one keyword");
      return;
    }

    setLoading(true);
    setError(null);
    setCurrentSearchId(null);
    setResults([]);

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

      // Now we get a job_id instead of immediate results
      if (result.data.job_id) {
        setActiveJobId(result.data.job_id);
        setJobStatus("search_queued");
        // Start polling for results
      } else {
        throw new Error("No job_id returned from search");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setLoading(false);
    }
  };

  const loadHistoricalSearch = (history: SearchHistory) => {
    setCurrentSearchId(history.id);
    setResults(history.results);
    
    // Restore search parameters
    const params = history.search_params;
    if (params.keywords && Array.isArray(params.keywords)) {
      setKeywords(params.keywords.join(", "));
    }
    if (params.search_type) {
      setSearchType(params.search_type);
    }
    if (params.min_views) {
      setMinViews(params.min_views);
    }
    if (params.max_age_days) {
      setMaxAgeDays(params.max_age_days);
    }
    
    setShowHistory(false);
  };

  const handleSaveIdea = async (result: SearchResult) => {
    try {
      setSavingIdeaId(result.video_id);
      const response = await fetch("/api/ideas/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_id: result.video_id,
          score: result.score,
          score_breakdown: result.score_breakdown,
          search_result_id: currentSearchId,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message =
          payload?.error ||
          `Failed to save idea (HTTP ${response.status})`;
        throw new Error(message);
      }

      router.refresh();
      // Remove from results after saving
      setResults(results.filter((r) => r.video_id !== result.video_id));
    } catch (err) {
      console.error("Save error:", err);
      setError(err instanceof Error ? err.message : "Failed to save idea");
    } finally {
      setSavingIdeaId(null);
    }
  };

  const handleAddPreset = async (result: SearchResult) => {
    if (!result.thumbnail_url) {
      setError("This video does not have a thumbnail URL to save.");
      return;
    }

    if (savedPresetIds.includes(result.video_id)) {
      return;
    }

    try {
      setSavingPresetId(result.video_id);
      const response = await fetch("/api/thumbnail-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: result.thumbnail_url,
          name: result.title || "Outlier thumbnail",
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message = payload?.error || `Failed to save preset (HTTP ${response.status})`;
        throw new Error(message);
      }

      setSavedPresetIds((prev) => [...prev, result.video_id]);
    } catch (err) {
      console.error("Preset save error:", err);
      setError(err instanceof Error ? err.message : "Failed to save preset");
    } finally {
      setSavingPresetId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search History */}
      {searchHistory.length > 0 && (
        <div className="bg-gray-800/30 border border-gray-700 rounded-xl p-4">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="w-full flex items-center justify-between text-left"
          >
            <span className="text-sm font-medium text-gray-300">
              Recent Searches ({searchHistory.length})
            </span>
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform ${showHistory ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {showHistory && (
            <div className="mt-4 space-y-2">
              {searchHistory.map((history) => (
                <button
                  key={history.id}
                  onClick={() => loadHistoricalSearch(history)}
                  className="w-full text-left p-3 bg-gray-900/50 hover:bg-gray-900 rounded-lg transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">
                        {history.search_params.keywords?.join(", ") || "Search"}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {history.results_count} results • {new Date(history.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="ml-2 px-2 py-1 bg-gray-700 rounded text-xs text-gray-300">
                      {history.search_params.search_type === "cross_niche" ? "Cross-Niche" : "Within Niche"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

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
              disabled={loading || !!activeJobId}
              className="w-full px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-600/50 text-white font-semibold rounded-lg transition-colors"
            >
              {loading && isQueued && "Queued..."}
              {loading && isRunning && "Searching..."}
              {loading && !jobStatus && "Creating search..."}
              {!loading && "Search Outliers"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Job Status Banner */}
      {activeJobId && loading && (
        <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full" />
            <div className="flex-1">
              <p className="text-blue-400 font-medium">
                {isQueued && "Search queued - waiting to start..."}
                {isRunning && "Search in progress..."}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                You can navigate away. Results will be saved automatically.
              </p>
            </div>
          </div>
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
                      disabled={savingIdeaId === result.video_id}
                      className="px-4 py-2 bg-accent-600 hover:bg-accent-700 disabled:bg-accent-600/60 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      {savingIdeaId === result.video_id ? "Saving..." : "Save Idea"}
                    </button>
                    <button
                      onClick={() => handleAddPreset(result)}
                      disabled={savingPresetId === result.video_id || savedPresetIds.includes(result.video_id)}
                      className="px-4 py-2 border border-gray-600 hover:border-gray-500 disabled:border-gray-700 text-gray-300 disabled:text-gray-500 text-sm font-medium rounded-lg transition-colors"
                    >
                      {savedPresetIds.includes(result.video_id)
                        ? "Preset Added"
                        : savingPresetId === result.video_id
                        ? "Saving..."
                        : "Add to Presets"}
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

