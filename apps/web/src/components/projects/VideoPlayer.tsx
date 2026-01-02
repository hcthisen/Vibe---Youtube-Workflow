"use client";

import { createClient } from "@/lib/supabase/client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Asset {
  id: string;
  bucket: string;
  path: string;
  metadata: unknown;
  type: string;
}

interface VideoPlayerProps {
  rawAsset?: Asset;
  processedAsset?: Asset;
  projectId: string;
  hasFailedJob?: boolean;
}

export function VideoPlayer({ rawAsset, processedAsset, projectId, hasFailedJob }: VideoPlayerProps) {
  const supabase = createClient();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"processed" | "raw">(
    processedAsset ? "processed" : "raw"
  );
  const [rawUrl, setRawUrl] = useState<string | null>(null);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reprocessing, setReprocessing] = useState(false);
  const [reprocessError, setReprocessError] = useState<string | null>(null);
  
  // Lazy loading state
  const [shouldLoadVideo, setShouldLoadVideo] = useState(false);
  const [previewGenerated, setPreviewGenerated] = useState(false);

  // Generate appropriate URL based on bucket type
  const getVideoUrl = async (asset: Asset): Promise<string | null> => {
    // Check if bucket is public
    const isPublic = asset.bucket === 'project-thumbnails';
    
    if (isPublic) {
      return supabase.storage.from(asset.bucket).getPublicUrl(asset.path).data.publicUrl;
    }
    
    // Generate signed URL for private buckets (valid for 1 hour)
    const { data, error } = await supabase.storage
      .from(asset.bucket)
      .createSignedUrl(asset.path, 3600);
    
    if (error) {
      console.error('Failed to generate signed URL:', error);
      return null;
    }
    
    return data?.signedUrl || null;
  };

  // Get signed URLs for private buckets (only when user wants to play)
  useEffect(() => {
    if (!shouldLoadVideo) {
      setLoading(false);
      return;
    }

    async function loadVideoUrls() {
      setLoading(true);
      
      // Load raw video URL
      if (rawAsset) {
        const url = await getVideoUrl(rawAsset);
        setRawUrl(url);
      }
      
      // Load processed video URL
      if (processedAsset) {
        const url = await getVideoUrl(processedAsset);
        setProcessedUrl(url);
      }
      
      setLoading(false);
    }
    
    loadVideoUrls();
  }, [shouldLoadVideo, rawAsset?.id, processedAsset?.id]);

  const handleReprocess = async () => {
    setReprocessing(true);
    setReprocessError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/reprocess`, {
        method: "POST",
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to start reprocessing");
      }

      // Refresh the page to show the new job status
      router.refresh();
    } catch (error) {
      setReprocessError(error instanceof Error ? error.message : "Failed to start reprocessing");
    } finally {
      setReprocessing(false);
    }
  };

  const currentAsset = activeTab === "processed" ? processedAsset : rawAsset;
  const currentUrl = activeTab === "processed" ? processedUrl : rawUrl;

  // Show re-process button if video has been processed or failed
  const showReprocessButton = (processedAsset || hasFailedJob) && rawAsset;

  if (!rawAsset && !processedAsset) {
    return (
      <div className="text-center py-8 text-gray-400">
        No video available
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full mx-auto" />
        <p className="text-gray-400 mt-2">Loading video...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Re-process button and error message */}
      {showReprocessButton && (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <button
              onClick={handleReprocess}
              disabled={reprocessing}
              className="px-4 py-2 bg-accent-600 hover:bg-accent-700 disabled:bg-accent-600/50 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              {reprocessing ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  Reprocessing...
                </>
              ) : (
                <>
                  <span>🔄</span>
                  Re-Process Video
                </>
              )}
            </button>
            <p className="text-sm text-gray-400">
              {hasFailedJob 
                ? "Previous processing failed. Re-process with current settings." 
                : "Re-process video with current settings (retake detection, intro transition, etc.)"}
            </p>
          </div>
          {reprocessError && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {reprocessError}
            </div>
          )}
        </div>
      )}

      {/* Tab selector - only show if both videos exist */}
      {rawAsset && processedAsset && (
        <div className="flex gap-2 border-b border-gray-700">
          <button
            onClick={() => setActiveTab("processed")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "processed"
                ? "text-primary-400 border-b-2 border-primary-400"
                : "text-gray-400 hover:text-gray-300"
            }`}
          >
            Processed Video
          </button>
          <button
            onClick={() => setActiveTab("raw")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "raw"
                ? "text-primary-400 border-b-2 border-primary-400"
                : "text-gray-400 hover:text-gray-300"
            }`}
          >
            Original Video
          </button>
        </div>
      )}

      {/* Video player or preview */}
      {!shouldLoadVideo ? (
        // Show preview with play button
        <div className="relative aspect-video bg-gray-900 rounded-lg overflow-hidden group cursor-pointer" onClick={() => setShouldLoadVideo(true)}>
          {/* Dark overlay */}
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center group-hover:bg-black/50 transition-colors">
            {/* Play button */}
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-primary-500/90 group-hover:bg-primary-600 flex items-center justify-center transition-colors">
                <svg
                  className="w-10 h-10 text-white ml-1"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
              <div className="absolute inset-0 rounded-full bg-primary-500/20 animate-ping" />
            </div>
          </div>

          {/* Video info overlay */}
          <div className="absolute bottom-4 left-4 right-4 text-white">
            <p className="text-sm font-medium">
              {activeTab === "processed" ? "Processed Video" : "Original Video"}
            </p>
            {currentAsset &&
            typeof currentAsset.metadata === "object" &&
            currentAsset.metadata !== null &&
            (currentAsset.metadata as any).original_duration_ms ? (
              <p className="text-xs text-gray-300 mt-1">
                Duration: {Math.floor((currentAsset.metadata as any).original_duration_ms / 1000)}s
              </p>
            ) : null}
            <p className="text-xs text-gray-400 mt-2">Click to load video</p>
          </div>
        </div>
      ) : currentUrl ? (
        // Show actual video player
        <>
          <video
            key={currentUrl}
            controls
            autoPlay
            className="w-full rounded-lg bg-black"
            src={currentUrl}
          >
            Your browser does not support the video element.
          </video>

          {/* Download button and metadata */}
          <div className="flex items-center justify-between text-sm">
            <a
              href={currentUrl}
              download
              className="text-primary-400 hover:text-primary-300 transition-colors"
            >
              Download {activeTab === "processed" ? "processed" : "original"} video
            </a>

            {currentAsset &&
            typeof currentAsset.metadata === "object" &&
            currentAsset.metadata !== null ? (
              <div className="text-gray-400">
                {(currentAsset.metadata as any).original_duration_ms ? (
                  <span>
                    Duration:{" "}
                    {Math.floor(
                      (currentAsset.metadata as any).original_duration_ms / 1000
                    )}
                    s
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

