"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";

interface PresetStyle {
  id: string;
  bucket: string;
  path: string;
  name: string;
  created_at: string;
}

interface ThumbnailPresetManagerProps {
  userId: string;
  presetStyles: PresetStyle[];
  maxPresets?: number;
}

export function ThumbnailPresetManager({
  userId,
  presetStyles: initialPresets,
  maxPresets = 5,
}: ThumbnailPresetManagerProps) {
  const router = useRouter();
  const supabase = createClient();

  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [presetStyles, setPresetStyles] = useState<PresetStyle[]>(initialPresets);

  const canUploadMore = presetStyles.length < maxPresets;

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError("Image must be smaller than 10MB");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const presetId = crypto.randomUUID();
      const timestamp = Date.now();
      const fileExt = file.name.split(".").pop();
      const fileName = `preset_${timestamp}.${fileExt}`;
      const path = `${userId}/${fileName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("thumbnail-preset-styles")
        .upload(path, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      // Create preset style record
      const newPreset: PresetStyle = {
        id: presetId,
        bucket: "thumbnail-preset-styles",
        path,
        name: file.name,
        created_at: new Date().toISOString(),
      };

      // Update profile with new preset
      const updatedPresets = [...presetStyles, newPreset];

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          thumbnail_preset_styles: updatedPresets,
        })
        .eq("id", userId);

      if (updateError) {
        // Rollback storage upload
        await supabase.storage.from("thumbnail-preset-styles").remove([path]);
        throw updateError;
      }

      setPresetStyles(updatedPresets);
      router.refresh();
    } catch (err) {
      console.error("Upload error:", err);
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      // Reset file input
      event.target.value = "";
    }
  };

  const handleDelete = async (presetId: string) => {
    const preset = presetStyles.find((p) => p.id === presetId);
    if (!preset) return;

    if (!confirm(`Delete preset style "${preset.name}"?`)) {
      return;
    }

    setDeleting(presetId);
    setError(null);

    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from(preset.bucket)
        .remove([preset.path]);

      if (storageError) {
        throw storageError;
      }

      // Update profile
      const updatedPresets = presetStyles.filter((p) => p.id !== presetId);

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          thumbnail_preset_styles: updatedPresets,
        })
        .eq("id", userId);

      if (updateError) {
        throw updateError;
      }

      setPresetStyles(updatedPresets);
      router.refresh();
    } catch (err) {
      console.error("Delete error:", err);
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  const getPresetUrl = async (preset: PresetStyle): Promise<string> => {
    const { data } = await supabase.storage
      .from(preset.bucket)
      .createSignedUrl(preset.path, 3600); // Valid for 1 hour
    return data?.signedUrl || "";
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-2">
          Thumbnail Preset Styles
        </h3>
        <p className="text-sm text-gray-400">
          Upload up to {maxPresets} preset thumbnail styles. These can be used as reference images when generating new thumbnails.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Upload Button */}
      {canUploadMore && (
        <div>
          <label
            htmlFor="preset-upload"
            className={`inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-600/50 text-white font-medium rounded-lg transition-colors cursor-pointer ${
              uploading ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            {uploading ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                Uploading...
              </>
            ) : (
              <>
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Upload Preset Style
              </>
            )}
          </label>
          <input
            id="preset-upload"
            type="file"
            accept="image/*"
            onChange={handleUpload}
            disabled={uploading}
            className="hidden"
          />
          <p className="text-xs text-gray-500 mt-2">
            {presetStyles.length} of {maxPresets} slots used
          </p>
        </div>
      )}

      {!canUploadMore && (
        <div className="p-3 bg-accent-500/10 border border-accent-500/20 rounded-lg text-accent-400 text-sm">
          You've reached the maximum of {maxPresets} preset styles. Delete one to upload another.
        </div>
      )}

      {/* Preset Styles Grid */}
      {presetStyles.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {presetStyles.map((preset) => (
            <PresetStyleCard
              key={preset.id}
              preset={preset}
              onDelete={handleDelete}
              isDeleting={deleting === preset.id}
              getPresetUrl={getPresetUrl}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-800/30 border border-gray-700 rounded-xl">
          <svg
            className="w-12 h-12 text-gray-600 mx-auto mb-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <p className="text-gray-400 text-sm">No preset styles uploaded yet</p>
          <p className="text-gray-500 text-xs mt-1">
            Upload reference thumbnails to use as style guides
          </p>
        </div>
      )}
    </div>
  );
}

function PresetStyleCard({
  preset,
  onDelete,
  isDeleting,
  getPresetUrl,
}: {
  preset: PresetStyle;
  onDelete: (id: string) => void;
  isDeleting: boolean;
  getPresetUrl: (preset: PresetStyle) => Promise<string>;
}) {
  const [imageUrl, setImageUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Load image URL
  useState(() => {
    getPresetUrl(preset).then((url) => {
      setImageUrl(url);
      setLoading(false);
    });
  });

  return (
    <div className="relative group rounded-lg overflow-hidden border border-gray-700 bg-gray-800/50">
      <div className="relative aspect-video">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <div className="animate-spin w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          <Image
            src={imageUrl}
            alt={preset.name}
            fill
            className="object-cover"
            unoptimized
          />
        )}
      </div>

      {/* Name */}
      <div className="p-2 border-t border-gray-700">
        <p className="text-xs text-gray-400 truncate" title={preset.name}>
          {preset.name}
        </p>
      </div>

      {/* Delete Button */}
      <button
        onClick={() => onDelete(preset.id)}
        disabled={isDeleting}
        className="absolute top-2 right-2 bg-red-500/80 hover:bg-red-600 disabled:bg-red-500/50 p-1.5 rounded text-white opacity-0 group-hover:opacity-100 transition-opacity"
        title="Delete preset style"
      >
        {isDeleting ? (
          <svg
            className="w-4 h-4 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : (
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        )}
      </button>
    </div>
  );
}

