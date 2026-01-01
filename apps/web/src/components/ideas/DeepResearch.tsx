"use client";

import { useState, useEffect } from "react";
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

interface SearchHistory {
  id: string;
  search_params: any;
  results: IdeaResult[];
  results_count: number;
  created_at: string;
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
  const [currentSearchId, setCurrentSearchId] = useState<string | null>(null);
  const [searchHistory, setSearchHistory] = useState<SearchHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const isQueued = jobStatus === "queued" || jobStatus === "search_queued";
  const isRunning = jobStatus === "running" || jobStatus === "search_running";

  useEffect(() => {
    loadSearchHistory();
    checkForActiveJobs();
  }, []);

  const checkForActiveJobs = async () => {
    try {
      const response = await fetch("/api/jobs/active?type=deep_research");
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

  // Poll job status when there's an active job
  useEffect(() => {
    if (!activeJobId) return;

    const pollInterval = setInterval(async () => {
      await checkJobStatus(activeJobId);
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(pollInterval);
  }, [activeJobId]);

  const filterSavedIdeas = async (ideas: IdeaResult[], searchResultId: string | null): Promise<IdeaResult[]> => {
    if (!searchResultId || ideas.length === 0) return ideas;

    try {
      // Fetch saved ideas for this search result
      const response = await fetch(`/api/ideas/saved?search_result_id=${searchResultId}`);
      const data = await response.json();
      
      if (!data.savedIdeas || data.savedIdeas.length === 0) {
        return ideas;
      }

      // Create a set of saved idea identifiers (title_concept + thesis)
      const savedIdentifiers = new Set(
        data.savedIdeas.map((idea: any) => {
          // Extract title_concept from ai_summary (format: "title_concept\n\nthesis")
          const parts = idea.ai_summary?.split("\n\n") || [];
          return parts[0] || idea.ai_summary || "";
        })
      );

      // Filter out saved ideas
      return ideas.filter((idea) => !savedIdentifiers.has(idea.title_concept));
    } catch (err) {
      console.error("Failed to filter saved ideas:", err);
      return ideas; // Return all ideas if filtering fails
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
          const searchResultId = data.searchResults.id;
          const filteredIdeas = await filterSavedIdeas(data.searchResults.results, searchResultId);
          setIdeas(filteredIdeas);
          setCurrentSearchId(searchResultId);
        }
        setActiveJobId(null);
        setJobStatus(null);
        setLoading(false);
        // Reload history
        loadSearchHistory();
      } else if (data.job.status === "failed") {
        setError(data.job.error || "Research failed");
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
      const response = await fetch("/api/ideas/search-history?search_type=deep_research&limit=5");
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

  const handleResearch = async () => {
    setLoading(true);
    setError(null);
    setCurrentSearchId(null);
    setIdeas([]);

    try {
      const avoidTopicsList = avoidTopics.split(",").map((t) => t.trim()).filter(Boolean);
      
      const response = await fetch("/api/tools/deep_research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          avoid_topics: avoidTopicsList,
          target_viewer_description: targetViewer || undefined,
          idea_count: ideaCount,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Research failed");
      }

      // Now we get a job_id instead of immediate results
      if (result.data.job_id) {
        setActiveJobId(result.data.job_id);
        setJobStatus("search_queued");
        // Start polling for results
      } else {
        throw new Error("No job_id returned from research");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Research failed");
      setLoading(false);
    }
  };

  const loadHistoricalSearch = async (history: SearchHistory) => {
    setCurrentSearchId(history.id);
    
    // Filter out saved ideas before setting
    const filteredIdeas = await filterSavedIdeas(history.results, history.id);
    setIdeas(filteredIdeas);
    
    // Restore search parameters
    const params = history.search_params;
    if (params.avoid_topics && Array.isArray(params.avoid_topics)) {
      setAvoidTopics(params.avoid_topics.join(", "));
    }
    if (params.target_viewer_description) {
      setTargetViewer(params.target_viewer_description);
    }
    if (params.idea_count) {
      setIdeaCount(params.idea_count);
    }
    
    setShowHistory(false);
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
          search_result_id: currentSearchId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save idea");
      }

      // Remove from results immediately
      setIdeas(ideas.filter((i) => i.title_concept !== idea.title_concept));
      
      // Refresh the page to update the saved ideas count
      router.refresh();
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
              disabled={loading || !!activeJobId}
              className="w-full px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-600/50 text-white font-semibold rounded-lg transition-colors"
            >
              {loading && isQueued && "Queued..."}
              {loading && isRunning && "Researching..."}
              {loading && !jobStatus && "Creating research..."}
              {!loading && "Generate Ideas"}
            </button>
          </div>
        </div>
      </div>

      {/* Search History */}
      {searchHistory.length > 0 && (
        <div className="bg-gray-800/30 border border-gray-700 rounded-xl p-4">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="w-full flex items-center justify-between text-left"
          >
            <span className="text-sm font-medium text-gray-300">
              Recent Research ({searchHistory.length})
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
                        {history.search_params.target_viewer_description || "Deep Research"}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {history.results_count} ideas • {new Date(history.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

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
                {isQueued && "Research queued - waiting to start..."}
                {isRunning && "AI research in progress..."}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                You can navigate away. Ideas will be saved automatically.
              </p>
            </div>
          </div>
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

