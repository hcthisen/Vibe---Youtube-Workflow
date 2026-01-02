"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";

// Saved video item component with collapsible transcript
function SavedVideoItem({ 
  video, 
  onRemove 
}: { 
  video: VideoTranscript; 
  onRemove: (videoId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  
  // YouTube thumbnail URL format
  const thumbnailUrl = `https://img.youtube.com/vi/${video.video_id}/mqdefault.jpg`;
  
  return (
    <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4 space-y-3">
      <div className="flex gap-4">
        {/* Thumbnail */}
        <div className="flex-shrink-0 w-32 h-18 relative rounded overflow-hidden bg-gray-800">
          <Image
            src={thumbnailUrl}
            alt={video.title}
            fill
            className="object-cover"
            unoptimized
          />
        </div>
        
        {/* Title and actions */}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-white line-clamp-2 mb-2">
            {video.title}
          </h4>
          <div className="flex gap-2">
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-gray-400 hover:text-white transition-colors"
            >
              {expanded ? "Hide" : "Show"} Transcript
            </button>
            <span className="text-gray-600">•</span>
            <button
              onClick={() => onRemove(video.video_id)}
              className="text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              Remove
            </button>
          </div>
        </div>
      </div>
      
      {/* Collapsible transcript */}
      {expanded && video.transcript && (
        <div className="pt-3 border-t border-gray-700">
          <p className="text-xs text-gray-400 max-h-48 overflow-y-auto">
            {video.transcript}
          </p>
        </div>
      )}
    </div>
  );
}

interface VideoTranscript {
  video_id: string;
  title: string;
  transcript: string | null;
}

interface Channel {
  id: string;
  channel_identifier: string;
  baseline_video_ids: unknown;
  baseline_summary: string | null;
  baseline_keywords: unknown;
  baseline_transcripts: unknown;
  avg_views: number | null;
}

interface ChannelBaselineProps {
  channel: Channel | null;
  userId: string;
}

interface Video {
  youtube_video_id: string;
  title: string;
  thumbnail_url: string | null;
  views_count: number | null;
  selected?: boolean;
}

export function ChannelBaseline({ channel, userId }: ChannelBaselineProps) {
  const router = useRouter();
  const [channelId, setChannelId] = useState(channel?.channel_identifier || "");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [summary, setSummary] = useState(channel?.baseline_summary || "");
  const [keywords, setKeywords] = useState<string[]>(
    (channel?.baseline_keywords as string[]) || []
  );
  const [savedTranscripts, setSavedTranscripts] = useState<VideoTranscript[]>(
    (channel?.baseline_transcripts as VideoTranscript[]) || []
  );
  const [regenerating, setRegenerating] = useState(false);
  const [editingSummary, setEditingSummary] = useState(false);
  const [editedSummary, setEditedSummary] = useState("");
  const [newKeywordInput, setNewKeywordInput] = useState("");

  const handleImport = async () => {
    if (!channelId.trim()) {
      setError("Please enter a channel name (e.g., @channelname) or channel URL");
      return;
    }

    setImporting(true);
    setError(null);

    try {
      const response = await fetch("/api/tools/channel_import_latest_20", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_identifier: channelId }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Import failed");
      }

      // Get list of already saved video IDs
      const savedVideoIds = new Set(
        (channel?.baseline_video_ids as string[]) || []
      );

      // Filter out already saved videos and mark remaining as selected
      const newVideos = result.data.videos.filter(
        (v: Video) => !savedVideoIds.has(v.youtube_video_id)
      );

      if (newVideos.length === 0 && result.data.videos.length > 0) {
        setError("All imported videos are already in your baseline. No new videos to add.");
        setVideos([]);
        return;
      }

      if (newVideos.length < result.data.videos.length) {
        const skippedCount = result.data.videos.length - newVideos.length;
        setError(`${skippedCount} video(s) already in baseline were excluded from selection.`);
      }

      // Initialize videos with all selected
      setVideos(
        newVideos.map((v: Video) => ({
          ...v,
          selected: true,
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const toggleVideo = (videoId: string) => {
    setVideos(
      videos.map((v) =>
        v.youtube_video_id === videoId ? { ...v, selected: !v.selected } : v
      )
    );
  };

  const handleRemoveSavedVideo = async (videoId: string) => {
    if (!channel) return;
    
    try {
      const supabase = createClient();
      
      // Remove from baseline_video_ids and baseline_transcripts
      const updatedVideoIds = (channel.baseline_video_ids as string[]).filter(id => id !== videoId);
      const updatedTranscripts = savedTranscripts.filter(t => t.video_id !== videoId);
      
      const { error: dbError } = await supabase.from("channels").update({
        baseline_video_ids: updatedVideoIds,
        baseline_transcripts: updatedTranscripts as any,
      }).eq("id", channel.id);

      if (dbError) throw dbError;

      // Update local state
      setSavedTranscripts(updatedTranscripts);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove video");
    }
  };

  const handleRegenerateBaseline = async () => {
    if (!channel || savedTranscripts.length === 0) return;

    setRegenerating(true);
    setError(null);

    try {
      const supabase = createClient();

      // Use existing transcripts to regenerate summary
      const summaryResponse = await fetch("/api/baseline/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videos: savedTranscripts, // Send with transcripts included
        }),
      });

      if (!summaryResponse.ok) {
        const errorBody = await summaryResponse.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(`Failed to regenerate baseline: ${errorBody.error || summaryResponse.status}`);
      }

      const summaryResult = await summaryResponse.json();
      const generatedSummary = summaryResult.summary || "";
      const generatedKeywords = summaryResult.keywords || [];

      // Update baseline with new summary/keywords
      const { error: dbError } = await supabase.from("channels").update({
        baseline_summary: generatedSummary,
        baseline_keywords: generatedKeywords,
      }).eq("id", channel.id);

      if (dbError) throw dbError;

      setSummary(generatedSummary);
      setKeywords(generatedKeywords);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to regenerate baseline");
    } finally {
      setRegenerating(false);
    }
  };

  const handleEditSummary = () => {
    setEditedSummary(summary);
    setEditingSummary(true);
  };

  const handleSaveSummary = async () => {
    if (!channel || !editedSummary.trim()) {
      setError("Summary cannot be empty");
      return;
    }

    try {
      const supabase = createClient();
      
      const { error: dbError } = await supabase.from("channels").update({
        baseline_summary: editedSummary,
      }).eq("id", channel.id);

      if (dbError) throw dbError;

      setSummary(editedSummary);
      setEditingSummary(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save summary");
    }
  };

  const handleCancelEditSummary = () => {
    setEditingSummary(false);
    setEditedSummary("");
  };

  const handleRemoveKeyword = async (keywordToRemove: string) => {
    if (!channel) return;

    try {
      const supabase = createClient();
      const updatedKeywords = keywords.filter(k => k !== keywordToRemove);
      
      const { error: dbError } = await supabase.from("channels").update({
        baseline_keywords: updatedKeywords,
      }).eq("id", channel.id);

      if (dbError) throw dbError;

      setKeywords(updatedKeywords);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove keyword");
    }
  };

  const handleAddKeywords = async () => {
    if (!channel || !newKeywordInput.trim()) return;

    try {
      const supabase = createClient();
      
      // Parse comma-separated keywords
      const newKeywords = newKeywordInput
        .split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0)
        .filter(k => !keywords.includes(k)); // Remove duplicates

      if (newKeywords.length === 0) {
        setError("No new keywords to add (duplicates or empty)");
        return;
      }

      const updatedKeywords = [...keywords, ...newKeywords];
      
      const { error: dbError } = await supabase.from("channels").update({
        baseline_keywords: updatedKeywords,
      }).eq("id", channel.id);

      if (dbError) throw dbError;

      setKeywords(updatedKeywords);
      setNewKeywordInput("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add keywords");
    }
  };

  const handleSaveBaseline = async () => {
    const selectedVideos = videos.filter((v) => v.selected);
    if (selectedVideos.length === 0) {
      setError("Please select at least one video");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const supabase = createClient();

      // Get existing saved video IDs and transcripts
      const existingVideoIds = (channel?.baseline_video_ids as string[]) || [];
      const existingTranscripts = savedTranscripts;

      // Generate summary using OpenAI (via API) - send video IDs to fetch transcripts for NEW videos only
      const summaryResponse = await fetch("/api/baseline/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videos: selectedVideos.map((v) => ({
            video_id: v.youtube_video_id,
            title: v.title,
          })),
        }),
      });

      // Throw error if summary generation fails so user sees what went wrong
      if (!summaryResponse.ok) {
        const errorBody = await summaryResponse.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(`Failed to generate baseline summary: ${errorBody.error || summaryResponse.status}`);
      }

      const summaryResult = await summaryResponse.json();
      const generatedSummary = summaryResult.summary || "";
      const generatedKeywords = summaryResult.keywords || [];
      const newTranscripts = summaryResult.transcripts || [];
      
      // Show warning if some transcripts weren't available
      if (summaryResult.warnings) {
        console.warn("Baseline generation warning:", summaryResult.warnings);
      }

      // Merge existing and new video IDs (avoid duplicates)
      const mergedVideoIds = [
        ...existingVideoIds,
        ...selectedVideos.map((v) => v.youtube_video_id).filter(id => !existingVideoIds.includes(id))
      ];

      // Merge existing and new transcripts (avoid duplicates)
      const existingVideoIdsSet = new Set(existingTranscripts.map(t => t.video_id));
      const mergedTranscripts = [
        ...existingTranscripts,
        ...newTranscripts.filter((t: VideoTranscript) => !existingVideoIdsSet.has(t.video_id))
      ];

      // Calculate average views
      // If we have existing baseline, keep the existing avg_views (we don't want to recalculate with partial data)
      // Only calculate new avg if this is the first time setting baseline
      let avgViews = channel?.avg_views || 0;
      if (!channel?.avg_views) {
        const totalViews = selectedVideos.reduce((sum, v) => sum + (v.views_count || 0), 0);
        avgViews = selectedVideos.length > 0 ? totalViews / selectedVideos.length : 0;
      }

      // Save channel baseline with merged data
      const { error: dbError } = await supabase.from("channels").upsert({
        id: channel?.id || crypto.randomUUID(),
        user_id: userId,
        channel_identifier: channelId,
        baseline_video_ids: mergedVideoIds,
        baseline_summary: generatedSummary,
        baseline_keywords: generatedKeywords,
        baseline_transcripts: mergedTranscripts as any,
        avg_views: avgViews,
      });

      if (dbError) throw dbError;

      setSummary(generatedSummary);
      setKeywords(generatedKeywords);
      setSavedTranscripts(mergedTranscripts);
      setVideos([]); // Hide the video selection panel after successful save
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Channel Baseline</h2>
        <p className="text-sm text-gray-400 mt-1">
          Import your latest videos to establish your niche baseline for outlier scoring
        </p>
        <p className="text-xs text-gray-500 mt-2">
          Enter your channel name (e.g., @channelname) or full channel URL
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Channel Input */}
      <div className="flex gap-4">
        <input
          type="text"
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
          placeholder="@channelname or YouTube channel URL"
          className="flex-1 px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
        />
        <button
          onClick={handleImport}
          disabled={importing}
          className="px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-600/50 text-white font-semibold rounded-lg transition-colors"
        >
          {importing ? "Importing..." : "Import Videos"}
        </button>
      </div>

      {/* Video Selection Grid */}
      {videos.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">
              {videos.filter((v) => v.selected).length} of {videos.length} videos selected
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setVideos(videos.map((v) => ({ ...v, selected: true })))}
                className="px-3 py-1 text-sm text-gray-400 hover:text-white"
              >
                Select All
              </button>
              <button
                onClick={() => setVideos(videos.map((v) => ({ ...v, selected: false })))}
                className="px-3 py-1 text-sm text-gray-400 hover:text-white"
              >
                Deselect All
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-h-96 overflow-y-auto">
            {videos.map((video) => (
              <div
                key={video.youtube_video_id}
                onClick={() => toggleVideo(video.youtube_video_id)}
                className={`cursor-pointer rounded-xl overflow-hidden border-2 transition-all ${
                  video.selected
                    ? "border-primary-500 bg-primary-500/10"
                    : "border-gray-700 opacity-50 hover:opacity-75"
                }`}
              >
                <div className="aspect-video relative">
                  {video.thumbnail_url ? (
                    <Image
                      src={video.thumbnail_url}
                      alt={video.title}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                      <span className="text-gray-500">No thumbnail</span>
                    </div>
                  )}
                  {video.selected && (
                    <div className="absolute top-2 right-2 w-6 h-6 bg-primary-500 rounded-full flex items-center justify-center">
                      <svg
                        className="w-4 h-4 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="p-2">
                  <p className="text-xs text-white line-clamp-2">{video.title}</p>
                  {video.views_count && (
                    <p className="text-xs text-gray-500 mt-1">
                      {video.views_count.toLocaleString()} views
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={handleSaveBaseline}
            disabled={saving || videos.filter((v) => v.selected).length === 0}
            className="w-full px-6 py-3 bg-accent-600 hover:bg-accent-700 disabled:bg-accent-600/50 text-white font-semibold rounded-lg transition-colors"
          >
            {saving ? "Saving Baseline..." : "Save Baseline"}
          </button>
        </div>
      )}

      {/* Existing Baseline */}
      {channel && summary && (
        <div className="space-y-6">
          <div className="bg-gray-800/50 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-md font-semibold text-white">Current Baseline</h3>
              <button
                onClick={handleRegenerateBaseline}
                disabled={regenerating || savedTranscripts.length === 0}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-600/50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {regenerating ? "Regenerating..." : "Re-Generate Baseline"}
              </button>
            </div>

            {/* Summary Section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-400">Summary</label>
                {!editingSummary && (
                  <button
                    onClick={handleEditSummary}
                    className="text-xs text-primary-400 hover:text-primary-300"
                  >
                    Edit
                  </button>
                )}
              </div>
              {editingSummary ? (
                <div className="space-y-2">
                  <textarea
                    value={editedSummary}
                    onChange={(e) => setEditedSummary(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors min-h-24"
                    placeholder="Enter baseline summary..."
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveSummary}
                      className="px-4 py-2 bg-accent-600 hover:bg-accent-700 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      Save
                    </button>
                    <button
                      onClick={handleCancelEditSummary}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-gray-300">{summary}</p>
              )}
            </div>

            {/* Keywords Section */}
            <div>
              <label className="text-sm font-medium text-gray-400 block mb-2">Keywords</label>
              {keywords.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {keywords.map((keyword, i) => (
                    <span
                      key={i}
                      className="px-3 py-1 bg-gray-700 rounded-full text-sm text-gray-300 flex items-center gap-2 group"
                    >
                      {keyword}
                      <button
                        onClick={() => handleRemoveKeyword(keyword)}
                        className="text-gray-500 hover:text-red-400 transition-colors"
                        aria-label="Remove keyword"
                      >
                        <svg
                          className="w-3 h-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newKeywordInput}
                  onChange={(e) => setNewKeywordInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddKeywords()}
                  placeholder="Enter keywords (comma-separated)"
                  className="flex-1 px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                />
                <button
                  onClick={handleAddKeywords}
                  disabled={!newKeywordInput.trim()}
                  className="px-4 py-2 bg-accent-600 hover:bg-accent-700 disabled:bg-accent-600/50 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Add Keyword
                </button>
              </div>
            </div>

            {channel.avg_views && (
              <p className="text-sm text-gray-400">
                Average views: {Math.round(channel.avg_views).toLocaleString()}
              </p>
            )}
          </div>

          {/* Saved Baseline Videos */}
          {savedTranscripts.length > 0 && (
            <div className="bg-gray-800/50 rounded-xl p-6 space-y-4">
              <h3 className="text-md font-semibold text-white">
                Baseline Videos ({savedTranscripts.length})
              </h3>
              <div className="space-y-3">
                {savedTranscripts.map((video) => (
                  <SavedVideoItem
                    key={video.video_id}
                    video={video}
                    onRemove={handleRemoveSavedVideo}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

