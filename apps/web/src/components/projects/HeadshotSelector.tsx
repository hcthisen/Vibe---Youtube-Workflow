"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";

interface Headshot {
  id: string;
  bucket: string;
  path: string;
  pose_yaw: number | null;
  pose_pitch: number | null;
  pose_bucket: string | null;
  signedUrl?: string; // Cached signed URL
}

interface HeadshotSelectorProps {
  userId: string;
  selectedHeadshotId?: string;
  autoSelectedHeadshotId?: string; // Highlight the auto-selected one
  onSelect: (headshotId: string) => void;
  label?: string;
}

export function HeadshotSelector({
  userId,
  selectedHeadshotId,
  autoSelectedHeadshotId,
  onSelect,
  label = "Select Headshot",
}: HeadshotSelectorProps) {
  const [headshots, setHeadshots] = useState<Headshot[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function loadHeadshots() {
      const { data, error } = await supabase
        .from("headshots")
        .select("id, bucket, path, pose_yaw, pose_pitch, pose_bucket")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (!error && data) {
        // Generate signed URLs for each headshot
        const headshotsWithUrls = await Promise.all(
          data.map(async (headshot) => {
            const { data: urlData } = await supabase.storage
              .from(headshot.bucket)
              .createSignedUrl(headshot.path, 3600); // Valid for 1 hour
            
            return {
              ...headshot,
              signedUrl: urlData?.signedUrl,
            };
          })
        );
        
        setHeadshots(headshotsWithUrls);
      }
      setLoading(false);
    }

    loadHeadshots();
  }, [userId, supabase]);

  const getHeadshotUrl = (headshot: Headshot) => {
    // Use cached signed URL if available
    if (headshot.signedUrl) {
      return headshot.signedUrl;
    }
    // Fallback to public URL (won't work for private buckets, but better than nothing)
    const { data } = supabase.storage.from(headshot.bucket).getPublicUrl(headshot.path);
    return data.publicUrl;
  };

  const formatPose = (headshot: Headshot): string => {
    if (headshot.pose_bucket) {
      return headshot.pose_bucket.charAt(0).toUpperCase() + headshot.pose_bucket.slice(1);
    }
    if (headshot.pose_yaw !== null && headshot.pose_pitch !== null) {
      const yawDir = headshot.pose_yaw < -15 ? "Right" : headshot.pose_yaw > 15 ? "Left" : "";
      const pitchDir = headshot.pose_pitch > 15 ? "Up" : headshot.pose_pitch < -15 ? "Down" : "";
      return [yawDir, pitchDir].filter(Boolean).join(" ") || "Front";
    }
    return "Unknown";
  };

  if (loading) {
    return (
      <div className="text-sm text-gray-400">Loading headshots...</div>
    );
  }

  if (headshots.length === 0) {
    return (
      <div className="text-sm text-gray-400">
        No headshots available. Please upload headshots in Settings.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm text-gray-400">{label}</label>
      
      <div className="grid grid-cols-3 gap-2">
        {headshots.map((headshot) => {
          const isSelected = selectedHeadshotId === headshot.id;
          const isAutoSelected = autoSelectedHeadshotId === headshot.id;
          
          return (
            <button
              key={headshot.id}
              onClick={() => onSelect(headshot.id)}
              className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                isSelected
                  ? "border-primary-500 ring-2 ring-primary-500/50"
                  : isAutoSelected
                    ? "border-accent-500"
                    : "border-gray-700 hover:border-gray-600"
              }`}
            >
              <Image
                src={getHeadshotUrl(headshot)}
                alt={`Headshot ${formatPose(headshot)}`}
                fill
                className="object-cover"
                unoptimized
                onError={(e) => {
                  console.error('Failed to load headshot image:', getHeadshotUrl(headshot));
                }}
              />
              
              {/* Pose label */}
              <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5 text-xs text-white text-center">
                {formatPose(headshot)}
              </div>
              
              {/* Auto-selected badge */}
              {isAutoSelected && !isSelected && (
                <div className="absolute top-1 right-1 bg-accent-500 text-white text-xs px-1.5 py-0.5 rounded">
                  Auto
                </div>
              )}
              
              {/* Selected checkmark */}
              {isSelected && (
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
          );
        })}
      </div>
      
      {autoSelectedHeadshotId && !selectedHeadshotId && (
        <p className="text-xs text-gray-500">
          Auto-selected based on reference thumbnail face angle
        </p>
      )}
    </div>
  );
}

