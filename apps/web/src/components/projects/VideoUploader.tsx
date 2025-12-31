"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface VideoUploaderProps {
  projectId: string;
}

export function VideoUploader({ projectId }: VideoUploaderProps) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Validate file type
      if (!file.type.startsWith("video/")) {
        setError("Please upload a video file");
        return;
      }

      // Validate file size (500MB max)
      if (file.size > 500 * 1024 * 1024) {
        setError("File size must be under 500MB");
        return;
      }

      setUploading(true);
      setError(null);
      setProgress(0);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          throw new Error("Not authenticated");
        }

        const fileExt = file.name.split(".").pop();
        const filePath = `${user.id}/${projectId}/${Date.now()}.${fileExt}`;

        // Upload with progress tracking
        const { error: uploadError } = await supabase.storage
          .from("project-raw-videos")
          .upload(filePath, file, {
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) {
          throw uploadError;
        }

        setProgress(80);

        // Finalize upload and create job
        const response = await fetch("/api/tools/video_upload_finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: projectId,
            asset_path: filePath,
            filename: file.name,
          }),
        });

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || "Failed to finalize upload");
        }

        setProgress(100);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [projectId, supabase, router]
  );

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="border-2 border-dashed border-gray-700 rounded-xl p-8 text-center hover:border-gray-600 transition-colors">
        <input
          type="file"
          accept="video/*"
          onChange={handleUpload}
          disabled={uploading}
          className="hidden"
          id="video-upload"
        />
        <label htmlFor="video-upload" className="cursor-pointer">
          <div className="mx-auto w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4">
            {uploading ? (
              <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full" />
            ) : (
              <svg
                className="w-8 h-8 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
            )}
          </div>
          <p className="text-gray-300 font-medium">
            {uploading ? `Uploading... ${progress}%` : "Upload raw video"}
          </p>
          <p className="text-sm text-gray-500 mt-1">MP4, MOV, or WebM up to 500MB</p>
        </label>
      </div>

      {uploading && (
        <div className="w-full bg-gray-700 rounded-full h-2">
          <div
            className="bg-primary-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <p className="text-sm text-gray-400 text-center">
        Your video will be automatically processed to remove silence and generate a transcript.
      </p>
    </div>
  );
}

