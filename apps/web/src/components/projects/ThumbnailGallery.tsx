"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";

interface Asset {
  id: string;
  bucket: string;
  path: string;
  metadata: unknown;
}

interface ThumbnailGalleryProps {
  projectId: string;
  thumbnails: Asset[];
}

export function ThumbnailGallery({ projectId, thumbnails }: ThumbnailGalleryProps) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [iterating, setIterating] = useState(false);
  const [referenceUrl, setReferenceUrl] = useState("");
  const [refinementPrompt, setRefinementPrompt] = useState("");
  const [selectedThumbnail, setSelectedThumbnail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showGenerateForm, setShowGenerateForm] = useState(false);

  const supabase = createClient();

  const getThumbnailUrl = (asset: Asset) => {
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
          reference_thumbnail_url: referenceUrl,
          count: 3,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to generate thumbnails");
      }

      setReferenceUrl("");
      setShowGenerateForm(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
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
          previous_thumbnail_asset_id: selectedThumbnail,
          refinement_prompt: refinementPrompt,
          count: 3,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to iterate");
      }

      setRefinementPrompt("");
      setSelectedThumbnail(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Iteration failed");
    } finally {
      setIterating(false);
    }
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
        <div className="space-y-3 p-4 bg-gray-800/50 rounded-lg">
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Reference Thumbnail URL
            </label>
            <input
              type="url"
              value={referenceUrl}
              onChange={(e) => setReferenceUrl(e.target.value)}
              placeholder="https://i.ytimg.com/..."
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:border-primary-500"
            />
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-600/50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {generating ? "Generating..." : "Generate 3 Variants"}
          </button>
        </div>
      )}

      {/* Thumbnail Grid */}
      {thumbnails.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {thumbnails.map((thumbnail) => (
            <div
              key={thumbnail.id}
              onClick={() =>
                setSelectedThumbnail(
                  selectedThumbnail === thumbnail.id ? null : thumbnail.id
                )
              }
              className={`relative aspect-video rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${
                selectedThumbnail === thumbnail.id
                  ? "border-primary-500"
                  : "border-transparent hover:border-gray-600"
              }`}
            >
              <Image
                src={getThumbnailUrl(thumbnail)}
                alt="Thumbnail"
                fill
                className="object-cover"
              />
              {selectedThumbnail === thumbnail.id && (
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
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400 text-center py-4">
          No thumbnails generated yet
        </p>
      )}

      {/* Iterate Form */}
      {selectedThumbnail && (
        <div className="space-y-3 p-4 bg-gray-800/50 rounded-lg">
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Refinement Prompt
            </label>
            <textarea
              value={refinementPrompt}
              onChange={(e) => setRefinementPrompt(e.target.value)}
              placeholder="Make the face more expressive, add more contrast..."
              rows={3}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:border-primary-500 resize-none"
            />
          </div>
          <button
            onClick={handleIterate}
            disabled={iterating}
            className="w-full px-4 py-2 bg-accent-600 hover:bg-accent-700 disabled:bg-accent-600/50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {iterating ? "Iterating..." : "Generate Variations"}
          </button>
        </div>
      )}
    </div>
  );
}

