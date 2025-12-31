"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";

interface Channel {
  id: string;
  channel_identifier: string;
  baseline_video_ids: unknown;
  baseline_summary: string | null;
  baseline_keywords: unknown;
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

      // Initialize videos with all selected
      setVideos(
        result.data.videos.map((v: Video) => ({
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

      // Calculate average views
      const totalViews = selectedVideos.reduce((sum, v) => sum + (v.views_count || 0), 0);
      const avgViews = totalViews / selectedVideos.length;

      // Generate summary using OpenAI (via API) - send video IDs to fetch transcripts
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

      // Save channel baseline
      const { error: dbError } = await supabase.from("channels").upsert({
        id: channel?.id || crypto.randomUUID(),
        user_id: userId,
        channel_identifier: channelId,
        baseline_video_ids: selectedVideos.map((v) => v.youtube_video_id),
        baseline_summary: generatedSummary,
        baseline_keywords: generatedKeywords,
        avg_views: avgViews,
      });

      if (dbError) throw dbError;

      setSummary(generatedSummary);
      setKeywords(generatedKeywords);
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
        <div className="bg-gray-800/50 rounded-xl p-6 space-y-4">
          <h3 className="text-md font-semibold text-white">Current Baseline</h3>
          <p className="text-gray-300">{summary}</p>
          {keywords.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {keywords.map((keyword, i) => (
                <span
                  key={i}
                  className="px-3 py-1 bg-gray-700 rounded-full text-sm text-gray-300"
                >
                  {keyword}
                </span>
              ))}
            </div>
          )}
          {channel.avg_views && (
            <p className="text-sm text-gray-400">
              Average views: {Math.round(channel.avg_views).toLocaleString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

