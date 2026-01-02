"use client";

import { createClient } from "@/lib/supabase/client";
import { useState } from "react";

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
}

export function VideoPlayer({ rawAsset, processedAsset }: VideoPlayerProps) {
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<"processed" | "raw">(
    processedAsset ? "processed" : "raw"
  );

  // Get URLs for both videos
  const rawUrl = rawAsset
    ? supabase.storage.from(rawAsset.bucket).getPublicUrl(rawAsset.path).data.publicUrl
    : null;

  const processedUrl = processedAsset
    ? supabase.storage.from(processedAsset.bucket).getPublicUrl(processedAsset.path).data.publicUrl
    : null;

  const currentAsset = activeTab === "processed" ? processedAsset : rawAsset;
  const currentUrl = activeTab === "processed" ? processedUrl : rawUrl;

  if (!rawAsset && !processedAsset) {
    return (
      <div className="text-center py-8 text-gray-400">
        No video available
      </div>
    );
  }

  return (
    <div className="space-y-4">
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

      {/* Video player */}
      {currentUrl && (
        <>
          <video
            key={currentUrl}
            controls
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
      )}
    </div>
  );
}

