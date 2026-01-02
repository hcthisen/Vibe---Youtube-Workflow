"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";
import { GuidedHeadshotCapture } from "./GuidedHeadshotCapture";

interface Headshot {
  id: string;
  bucket: string;
  path: string;
  pose_yaw: number | null;
  pose_pitch: number | null;
  pose_bucket: string | null;
}

interface HeadshotManagerProps {
  headshots: Headshot[];
  userId: string;
}

type CaptureMode = "upload" | "guided";

function formatDegrees(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  return `${value.toFixed(1)}°`;
}

function yawToHumanDirection(yaw: number | null): "left" | "straight" | "right" | "—" {
  if (yaw === null || Number.isNaN(yaw)) return "—";
  // Convention matches worker:
  // yaw > 0 => left, yaw < 0 => right
  // Front range: ±25°
  if (Math.abs(yaw) < 25) return "straight";
  return yaw > 0 ? "left" : "right";
}

function pitchToHumanDirection(pitch: number | null): "up" | "level" | "down" | "—" {
  if (pitch === null || Number.isNaN(pitch)) return "—";
  // Convention: pitch near ±180 is level (face looking straight at camera)
  // Calculate distance from ±180
  const pitchFromLevel = Math.min(Math.abs(pitch - 180), Math.abs(pitch + 180));
  
  if (pitchFromLevel < 10) return "level";  // Within 10° of ±180 is "level"
  
  if (pitch > 0 && pitch < 180) {
    return "down";  // Closer to 0 = looking down
  } else {
    return "up";    // Closer to -180 = looking up
  }
}

export function HeadshotManager({ headshots, userId }: HeadshotManagerProps) {
  const router = useRouter();
  const [mode, setMode] = useState<CaptureMode>("upload");
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);
  const [headshotUrls, setHeadshotUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadSignedUrls() {
      if (headshots.length === 0) {
        setHeadshotUrls({});
        return;
      }

      const entries = await Promise.all(
        headshots.map(async (h) => {
          const { data, error } = await supabase.storage
            .from(h.bucket)
            .createSignedUrl(h.path, 60 * 60); // 1 hour

          if (error || !data?.signedUrl) {
            // Fallback (may still fail for private buckets, but won't crash rendering)
            const { data: publicData } = supabase.storage.from(h.bucket).getPublicUrl(h.path);
            return [h.id, publicData.publicUrl] as const;
          }

          return [h.id, data.signedUrl] as const;
        })
      );

      if (!cancelled) {
        setHeadshotUrls(Object.fromEntries(entries));
      }
    }

    loadSignedUrls();

    return () => {
      cancelled = true;
    };
  }, [headshots, supabase]);

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      if (headshots.length >= 5) {
        setError("Maximum 5 headshots allowed. Delete some to add more.");
        return;
      }

      setUploading(true);
      setError(null);

      try {
        for (const file of Array.from(files)) {
          if (!file.type.startsWith("image/")) {
            continue;
          }

          const fileExt = file.name.split(".").pop();
          const filePath = `${userId}/${Date.now()}.${fileExt}`;

          // Upload to storage
          const { error: uploadError } = await supabase.storage
            .from("user-headshots")
            .upload(filePath, file);

          if (uploadError) {
            throw uploadError;
          }

          // Create headshot record
          const { data: headshotData, error: dbError } = await supabase
            .from("headshots")
            .insert({
              user_id: userId,
              bucket: "user-headshots",
              path: filePath,
            })
            .select()
            .single();

          if (dbError) {
            throw dbError;
          }

          // Trigger pose analysis
          const headshot = headshotData as unknown as { id: string } | null;
          if (headshot?.id) {
            analyzePose(headshot.id);
          }
        }

        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [headshots.length, userId, supabase, router]
  );

  const analyzePose = async (headshotId: string) => {
    setAnalyzing(headshotId);
    try {
      const response = await fetch("/api/tools/headshot_pose_analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headshot_id: headshotId }),
      });

      if (!response.ok) {
        throw new Error("Pose analysis failed");
      }

      router.refresh();
    } catch (err) {
      console.error("Pose analysis error:", err);
    } finally {
      setAnalyzing(null);
    }
  };

  const handleDelete = async (headshot: Headshot) => {
    if (!confirm("Delete this headshot?")) return;

    try {
      // Delete from storage
      await supabase.storage.from(headshot.bucket).remove([headshot.path]);

      // Delete from database
      await supabase.from("headshots").delete().eq("id", headshot.id);

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleOverrideBucket = async (headshotId: string, newBucket: string) => {
    try {
      await supabase
        .from("headshots")
        .update({ pose_bucket: newBucket })
        .eq("id", headshotId);

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  const getHeadshotUrl = (headshot: Headshot) => {
    return headshotUrls[headshot.id] || "";
  };

  const handleGuidedCapture = async (files: File[], poseBuckets: string[]) => {
    setUploading(true);
    setError(null);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const poseBucket = poseBuckets[i];
        
        const fileExt = file.name.split(".").pop();
        const filePath = `${userId}/${Date.now()}-${i}.${fileExt}`;

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from("user-headshots")
          .upload(filePath, file);

        if (uploadError) {
          throw uploadError;
        }

        // Create headshot record with pose_bucket hint
        const { data: headshotData, error: dbError } = await supabase
          .from("headshots")
          .insert({
            user_id: userId,
            bucket: "user-headshots",
            path: filePath,
            pose_bucket: poseBucket,
          })
          .select()
          .single();

        if (dbError) {
          throw dbError;
        }

        // Trigger pose analysis
        const headshot = headshotData as unknown as { id: string } | null;
        if (headshot?.id) {
          analyzePose(headshot.id);
        }
      }

      setMode("upload");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      throw err;
    } finally {
      setUploading(false);
    }
  };

  const poseBuckets = [
    "front",
    "left",
    "right",
    "up",
    "down",
    "up-left",
    "up-right",
    "down-left",
    "down-right",
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Headshots</h2>
          <p className="text-sm text-gray-400 mt-1">
            Upload 3-5 headshots for thumbnail generation. They&apos;ll be automatically analyzed for
            face direction.
          </p>
        </div>
        <span className="text-sm text-gray-500">{headshots.length}/5 uploaded</span>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Mode Toggle */}
      <div className="flex gap-2 p-1 bg-gray-800 rounded-lg w-fit">
        <button
          onClick={() => setMode("upload")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            mode === "upload"
              ? "bg-gray-700 text-white"
              : "text-gray-400 hover:text-white"
          }`}
        >
          Upload Files
        </button>
        <button
          onClick={() => setMode("guided")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            mode === "guided"
              ? "bg-gray-700 text-white"
              : "text-gray-400 hover:text-white"
          }`}
        >
          Guided Capture
        </button>
      </div>

      {/* Capture Mode Content */}
      {mode === "guided" ? (
        <GuidedHeadshotCapture
          userId={userId}
          onComplete={handleGuidedCapture}
          onCancel={() => setMode("upload")}
          maxHeadshots={5}
          currentHeadshotCount={headshots.length}
        />
      ) : (
        <>
          {/* Upload Area */}
          <div className="border-2 border-dashed border-gray-700 rounded-xl p-8 text-center hover:border-gray-600 transition-colors">
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleUpload}
              disabled={uploading || headshots.length >= 5}
              className="hidden"
              id="headshot-upload"
            />
            <label
              htmlFor="headshot-upload"
              className={`cursor-pointer ${headshots.length >= 5 ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <div className="mx-auto w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center mb-4">
                <svg
                  className="w-6 h-6 text-gray-400"
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
              </div>
              <p className="text-gray-300 font-medium">
                {uploading ? "Uploading..." : "Click to upload headshots"}
              </p>
              <p className="text-sm text-gray-500 mt-1">PNG, JPG up to 10MB each</p>
            </label>
          </div>
        </>
      )}

      {/* Headshot Grid */}
      {mode === "upload" && headshots.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {headshots.map((headshot) => (
            <div
              key={headshot.id}
              className="relative group bg-gray-800 rounded-xl overflow-hidden"
            >
              <div className="aspect-square relative">
                {getHeadshotUrl(headshot) ? (
                  <Image
                    src={getHeadshotUrl(headshot)}
                    alt="Headshot"
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 bg-gray-900/40 animate-pulse" />
                )}
                {analyzing === headshot.id && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <div className="animate-spin w-6 h-6 border-2 border-white border-t-transparent rounded-full" />
                  </div>
                )}
              </div>

              {/* Pose Badge */}
              <div className="absolute top-2 left-2">
                <span className="px-2 py-1 bg-gray-900/80 rounded text-xs text-white">
                  {headshot.pose_bucket || "analyzing..."}
                </span>
              </div>

              {/* Human-friendly angles (debuggable) */}
              <div className="absolute bottom-2 left-2">
                <div className="px-2 py-1 bg-gray-900/80 rounded text-[11px] leading-tight text-white space-y-0.5">
                  <div>
                    yaw <span className="text-gray-200">{formatDegrees(headshot.pose_yaw)}</span>{" "}
                    <span className="text-gray-400">({yawToHumanDirection(headshot.pose_yaw)})</span>
                  </div>
                  <div>
                    pitch <span className="text-gray-200">{formatDegrees(headshot.pose_pitch)}</span>{" "}
                    <span className="text-gray-400">({pitchToHumanDirection(headshot.pose_pitch)})</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                <select
                  value={headshot.pose_bucket || ""}
                  onChange={(e) => handleOverrideBucket(headshot.id, e.target.value)}
                  className="px-2 py-1 bg-gray-800 border border-gray-600 rounded text-xs text-white"
                  onClick={(e) => e.stopPropagation()}
                >
                  <option value="">Auto</option>
                  {poseBuckets.map((bucket) => (
                    <option key={bucket} value={bucket}>
                      {bucket}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => analyzePose(headshot.id)}
                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs text-white transition-colors"
                >
                  Re-analyze
                </button>

                <button
                  onClick={() => handleDelete(headshot)}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-xs text-white transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

