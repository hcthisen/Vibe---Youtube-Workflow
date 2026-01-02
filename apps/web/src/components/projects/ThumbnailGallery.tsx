"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";
import { HeadshotSelector } from "./HeadshotSelector";
import { ThumbnailModal } from "./ThumbnailModal";

interface Asset {
  id: string;
  bucket: string;
  path: string;
  metadata: {
    headshot_id?: string;
    headshot_pose?: {
      yaw: number;
      pitch: number;
      bucket: string;
    };
    reference_url?: string;
    text_modifications?: string;
    prompt_additions?: string;
  } | null;
}

interface ThumbnailGalleryProps {
  projectId: string;
  userId: string;
  thumbnails: Asset[];
  ideaBriefMarkdown?: string;
}

export function ThumbnailGallery({ projectId, userId, thumbnails, ideaBriefMarkdown }: ThumbnailGalleryProps) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [iterating, setIterating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  
  const [referenceUrl, setReferenceUrl] = useState("");
  const [textModifications, setTextModifications] = useState("");
  const [thumbnailCount, setThumbnailCount] = useState(2);
  const [selectedHeadshotId, setSelectedHeadshotId] = useState<string | undefined>();
  const [autoSelectedHeadshotId, setAutoSelectedHeadshotId] = useState<string | undefined>();
  
  const [selectedThumbnail, setSelectedThumbnail] = useState<Asset | null>(null);
  const [iterateHeadshotId, setIterateHeadshotId] = useState<string | undefined>();
  const [iterateTextMods, setIterateTextMods] = useState("");
  const [refinementPrompt, setRefinementPrompt] = useState("");
  
  const [error, setError] = useState<string | null>(null);
  const [showGenerateForm, setShowGenerateForm] = useState(false);
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  
  // Modal state
  const [modalThumbnail, setModalThumbnail] = useState<Asset | null>(null);
  
  // Job polling state
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const isProcessing = jobStatus === "queued" || jobStatus === "running";

  const supabase = createClient();

  // Check for active thumbnail generation jobs on mount
  useEffect(() => {
    checkForActiveJobs();
  }, []);

  // Poll job status when there's an active job
  useEffect(() => {
    if (!activeJobId) return;

    const pollInterval = setInterval(async () => {
      await checkJobStatus(activeJobId);
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(pollInterval);
  }, [activeJobId]);

  const checkForActiveJobs = async () => {
    try {
      const response = await fetch(`/api/jobs/active?type=thumbnail_generate`);
      const data = await response.json();
      if (data.jobs && data.jobs.length > 0) {
        const activeJob = data.jobs[0];
        // Check if job is for this project
        if (activeJob.input?.project_id === projectId) {
          setActiveJobId(activeJob.id);
          setJobStatus(activeJob.status);
          setGenerating(true);
        }
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
        // Job completed successfully
        setActiveJobId(null);
        setJobStatus(null);
        setGenerating(false);
        // Refresh the page to show new thumbnails
        router.refresh();
      } else if (data.job.status === "failed") {
        setError(data.job.error || "Thumbnail generation failed");
        setActiveJobId(null);
        setJobStatus(null);
        setGenerating(false);
      }
    } catch (err) {
      console.error("Failed to check job status:", err);
    }
  };

  const getThumbnailUrl = (asset: Asset) => {
    // Use cached URL if available
    if (thumbnailUrls[asset.id]) {
      return thumbnailUrls[asset.id];
    }
    
    // project-thumbnails is a public bucket, so public URLs work
    if (asset.bucket === 'project-thumbnails') {
      const { data } = supabase.storage.from(asset.bucket).getPublicUrl(asset.path);
      return data.publicUrl;
    }
    
    // For other buckets, we'd need signed URLs, but thumbnails should always be in project-thumbnails
    const { data } = supabase.storage.from(asset.bucket).getPublicUrl(asset.path);
    return data.publicUrl;
  };

  const handleGenerate = async () => {
    if (!referenceUrl.trim()) {
      setError("Please enter a reference thumbnail URL");
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      const response = await fetch("/api/tools/thumbnail_generate_from_reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          reference_thumbnail_url: referenceUrl.trim(),
          headshot_id: selectedHeadshotId,
          text_modifications: textModifications?.trim() || undefined,
          idea_brief_markdown: ideaBriefMarkdown,
          count: thumbnailCount,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to start thumbnail generation");
      }

      // Store the auto-selected headshot for display
      if (result.data?.headshot_used) {
        setAutoSelectedHeadshotId(result.data.headshot_used);
      }

      // Store job ID for polling
      if (result.data?.job_id) {
        setActiveJobId(result.data.job_id);
        setJobStatus(result.data.status || "queued");
      }

      setReferenceUrl("");
      setTextModifications("");
      setSelectedHeadshotId(undefined);
      setShowGenerateForm(false);
      // Don't refresh yet - wait for job to complete
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
      setGenerating(false);
    }
  };

  const handleIterate = async () => {
    if (!selectedThumbnail || !refinementPrompt.trim()) {
      setError("Please select a thumbnail and enter a refinement prompt");
      return;
    }

    setIterating(true);
    setError(null);

    try {
      const response = await fetch("/api/tools/thumbnail_iterate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          previous_thumbnail_asset_id: selectedThumbnail.id,
          headshot_id: iterateHeadshotId,
          text_modifications: iterateTextMods || undefined,
          refinement_prompt: refinementPrompt,
          count: 3,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to iterate");
      }

      setRefinementPrompt("");
      setIterateTextMods("");
      setIterateHeadshotId(undefined);
      setSelectedThumbnail(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Iteration failed");
    } finally {
      setIterating(false);
    }
  };

  const handleDelete = async (assetId: string) => {
    if (!confirm("Are you sure you want to delete this thumbnail?")) {
      return;
    }

    setDeleting(assetId);
    setError(null);

    try {
      const response = await fetch("/api/tools/thumbnail_delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_id: assetId,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to delete thumbnail");
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  const handleThumbnailClick = (thumbnail: Asset) => {
    if (selectedThumbnail?.id === thumbnail.id) {
      setSelectedThumbnail(null);
      setIterateHeadshotId(undefined);
    } else {
      setSelectedThumbnail(thumbnail);
      // Pre-fill with current headshot
      setIterateHeadshotId(thumbnail.metadata?.headshot_id);
    }
  };

  const handleDownload = (thumbnail: Asset) => {
    const url = getThumbnailUrl(thumbnail);
    const link = document.createElement("a");
    link.href = url;
    link.download = `thumbnail_${thumbnail.id}.png`;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-md font-semibold text-white">Thumbnails</h3>
        <button
          onClick={() => setShowGenerateForm(!showGenerateForm)}
          className="text-sm text-primary-400 hover:text-primary-300 transition-colors"
        >
          {showGenerateForm ? "Cancel" : "+ Generate"}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Generate Form */}
      {showGenerateForm && (
        <div className="space-y-3 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Reference Thumbnail URL
            </label>
            <input
              type="url"
              value={referenceUrl}
              onChange={(e) => setReferenceUrl(e.target.value)}
              placeholder="YouTube video or thumbnail URL (e.g., https://youtube.com/watch?v=...)"
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:border-primary-500 focus:outline-none"
              disabled={isProcessing}
            />
            <p className="mt-1 text-xs text-gray-500">
              Paste a YouTube video URL or direct thumbnail image URL
            </p>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Text Modifications (Optional)
            </label>
            <input
              type="text"
              value={textModifications}
              onChange={(e) => setTextModifications(e.target.value)}
              placeholder="e.g., Change text to 'AGENTIC FLOWS'"
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:border-primary-500 focus:outline-none"
              disabled={isProcessing}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Number of Thumbnails
            </label>
            <select
              value={thumbnailCount}
              onChange={(e) => setThumbnailCount(Number(e.target.value))}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:border-primary-500 focus:outline-none"
              disabled={isProcessing}
            >
              <option value={1}>1 thumbnail</option>
              <option value={2}>2 thumbnails</option>
              <option value={3}>3 thumbnails</option>
              <option value={4}>4 thumbnails</option>
            </select>
          </div>

          <HeadshotSelector
            userId={userId}
            selectedHeadshotId={selectedHeadshotId}
            autoSelectedHeadshotId={autoSelectedHeadshotId}
            onSelect={setSelectedHeadshotId}
            label="Headshot (Auto-selected if not specified)"
          />

          <button
            onClick={handleGenerate}
            disabled={isProcessing}
            className="w-full px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-600/50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {isProcessing ? "Generating..." : `Generate ${thumbnailCount} Variant${thumbnailCount > 1 ? 's' : ''}`}
          </button>
        </div>
      )}

      {/* Job Status Banner */}
      {isProcessing && (
        <div className="p-4 bg-primary-500/10 border border-primary-500/20 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="animate-spin w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full" />
            <div className="flex-1">
              <p className="text-sm font-medium text-primary-400">
                {jobStatus === "queued" ? "Thumbnail generation queued..." : "Generating thumbnails..."}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                This may take a few minutes. You can leave this page and come back later.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Thumbnail Grid */}
      {thumbnails.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          {thumbnails.map((thumbnail) => (
            <div
              key={thumbnail.id}
              className={`relative group rounded-lg overflow-hidden border-2 transition-all ${
                selectedThumbnail?.id === thumbnail.id
                  ? "border-primary-500 ring-2 ring-primary-500/50"
                  : "border-gray-700 hover:border-gray-600"
              }`}
            >
              <button
                onClick={() => handleThumbnailClick(thumbnail)}
                className="relative aspect-video w-full"
              >
                <Image
                  src={getThumbnailUrl(thumbnail)}
                  alt="Thumbnail"
                  fill
                  className="object-cover"
                  unoptimized
                  onError={(e) => {
                    console.error('Failed to load thumbnail image:', getThumbnailUrl(thumbnail));
                  }}
                />
                
                {/* Selected overlay */}
                {selectedThumbnail?.id === thumbnail.id && (
                  <div className="absolute inset-0 bg-primary-500/20 flex items-center justify-center">
                    <svg
                      className="w-8 h-8 text-white"
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
              </button>

              {/* Metadata badge */}
              {thumbnail.metadata?.headshot_pose?.bucket && (
                <div className="absolute top-2 left-2 bg-black/70 px-2 py-1 rounded text-xs text-white">
                  {thumbnail.metadata.headshot_pose.bucket.charAt(0).toUpperCase() + 
                   thumbnail.metadata.headshot_pose.bucket.slice(1)}
                </div>
              )}

              {/* Action Buttons (visible on hover) */}
              <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                {/* View/Enlarge Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setModalThumbnail(thumbnail);
                  }}
                  className="bg-primary-500/80 hover:bg-primary-600 p-1.5 rounded text-white"
                  title="View full size"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                  </svg>
                </button>

                {/* Download Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownload(thumbnail);
                  }}
                  className="bg-accent-500/80 hover:bg-accent-600 p-1.5 rounded text-white"
                  title="Download"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </button>

                {/* Delete button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(thumbnail.id);
                  }}
                  disabled={deleting === thumbnail.id}
                  className="bg-red-500/80 hover:bg-red-600 disabled:bg-red-500/50 p-1.5 rounded text-white"
                  title="Delete thumbnail"
                >
                  {deleting === thumbnail.id ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400 text-center py-8">
          No thumbnails generated yet
        </p>
      )}

      {/* Thumbnail Modal */}
      {modalThumbnail && (
        <ThumbnailModal
          imageUrl={getThumbnailUrl(modalThumbnail)}
          imageName={`thumbnail_${modalThumbnail.id}`}
          onClose={() => setModalThumbnail(null)}
        />
      )}

      {/* Iterate Form */}
      {selectedThumbnail && (
        <div className="space-y-3 p-4 bg-gray-800/50 rounded-lg border border-accent-700">
          <h4 className="text-sm font-medium text-white">Refine Selected Thumbnail</h4>
          
          <HeadshotSelector
            userId={userId}
            selectedHeadshotId={iterateHeadshotId}
            onSelect={setIterateHeadshotId}
            label="Swap Headshot (Optional)"
          />

          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Text Modifications (Optional)
            </label>
            <input
              type="text"
              value={iterateTextMods}
              onChange={(e) => setIterateTextMods(e.target.value)}
              placeholder="e.g., Change text color to teal"
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:border-accent-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Refinement Prompt
            </label>
            <textarea
              value={refinementPrompt}
              onChange={(e) => setRefinementPrompt(e.target.value)}
              placeholder="Make the face more expressive, add more contrast..."
              rows={3}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:border-accent-500 focus:outline-none resize-none"
            />
          </div>
          
          <button
            onClick={handleIterate}
            disabled={iterating}
            className="w-full px-4 py-2 bg-accent-600 hover:bg-accent-700 disabled:bg-accent-600/50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {iterating ? "Generating..." : "Generate 3 Variations"}
          </button>
        </div>
      )}
    </div>
  );
}
