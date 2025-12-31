"use client";

import { createClient } from "@/lib/supabase/client";

interface Asset {
  id: string;
  bucket: string;
  path: string;
  metadata: unknown;
}

interface VideoPlayerProps {
  asset: Asset;
}

export function VideoPlayer({ asset }: VideoPlayerProps) {
  const supabase = createClient();
  const { data } = supabase.storage.from(asset.bucket).getPublicUrl(asset.path);

  return (
    <div className="space-y-4">
      <video
        controls
        className="w-full rounded-lg bg-black"
        src={data.publicUrl}
      >
        Your browser does not support the video element.
      </video>

      <div className="flex items-center justify-between text-sm">
        <a
          href={data.publicUrl}
          download
          className="text-primary-400 hover:text-primary-300 transition-colors"
        >
          Download processed video
        </a>
      </div>
    </div>
  );
}

