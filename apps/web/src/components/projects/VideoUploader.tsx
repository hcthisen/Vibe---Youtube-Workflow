"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import * as tus from "tus-js-client";
import { MAX_VIDEO_FILE_SIZE_BYTES } from "@/lib/storage/constants";

interface VideoUploaderProps {
  projectId: string;
}

export function VideoUploader({ projectId }: VideoUploaderProps) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const uploadRef = useRef<tus.Upload | null>(null);

  const supabase = createClient();

  const formatUploadError = useCallback((message: string) => {
    if (/Maximum size exceeded/i.test(message)) {
      return "Storage rejected this upload as too large. The app now auto-configures the raw video bucket for 2GB uploads; if this still happens on self-hosted Supabase, increase the storage service FILE_SIZE_LIMIT above 2GB and redeploy that stack.";
    }

    return message;
  }, []);

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Validate file type
      if (!file.type.startsWith("video/")) {
        setError("Please upload a video file");
        return;
      }

      // Validate file size (2GB max)
      if (file.size > MAX_VIDEO_FILE_SIZE_BYTES) {
        setError(`File size must be under 2GB. Your file is ${(file.size / 1024 / 1024 / 1024).toFixed(2)}GB`);
        return;
      }

      setUploading(true);
      setError(null);
      setProgress(0);

      try {
        // Get authenticated user and session
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          throw new Error("Not authenticated");
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          throw new Error("No active session");
        }

        const prepareResponse = await fetch(`/api/projects/${projectId}/upload-target`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
            fileSize: file.size,
          }),
        });

        const prepareResult = await prepareResponse.json().catch(() => null);

        if (!prepareResponse.ok || !prepareResult?.success || !prepareResult?.data) {
          throw new Error(prepareResult?.error || "Failed to prepare upload");
        }

        const { bucketName, filePath, uploadUrl } = prepareResult.data as {
          bucketName: string;
          filePath: string;
          uploadUrl: string;
        };

        // Create TUS resumable upload
        const upload = new tus.Upload(file, {
          endpoint: uploadUrl,
          retryDelays: [0, 1000, 3000, 5000],
          headers: {
            authorization: `Bearer ${session.access_token}`,
            "x-upsert": "false",
          },
          uploadDataDuringCreation: false,
          removeFingerprintOnSuccess: true,
          metadata: {
            bucketName,
            objectName: filePath,
            contentType: file.type,
            cacheControl: "3600",
          },
          chunkSize: 6 * 1024 * 1024, // 6MB chunks
          onError: (error) => {
            console.error("Upload error:", error);
            setError(formatUploadError(error.message || "Upload failed"));
            setUploading(false);
          },
          onProgress: (bytesUploaded, bytesTotal) => {
            const percentage = Math.round((bytesUploaded / bytesTotal) * 100);
            setProgress(percentage);
          },
          onSuccess: async () => {
            try {
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
              setError(err instanceof Error ? err.message : "Failed to finalize upload");
            } finally {
              setUploading(false);
            }
          },
        });

        uploadRef.current = upload;
        upload.start();
      } catch (err) {
        console.error("Upload initialization error:", err);
        setError(formatUploadError(err instanceof Error ? err.message : "Upload failed"));
        setUploading(false);
      }
    },
    [formatUploadError, projectId, router, supabase]
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
          <p className="text-sm text-gray-500 mt-1">MP4, MOV, or WebM up to 2GB</p>
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
        Your video will be automatically processed to remove silence and generate a transcript
        using the project language.
      </p>
    </div>
  );
}
