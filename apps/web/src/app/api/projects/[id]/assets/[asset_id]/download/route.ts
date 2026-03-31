import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  buildAttachmentDisposition,
  deriveAssetDownloadFilename,
} from "@/lib/storage/asset-download";

export const runtime = "nodejs";

type AssetRecord = {
  id: string;
  bucket: string;
  path: string;
  type: string;
  metadata: unknown;
  user_id: string;
  project_id: string;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; asset_id: string }> }
) {
  try {
    const { id: projectId, asset_id: assetId } = await params;

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serviceClient = await createServiceClient();
    const { data: assetData, error: assetError } = await serviceClient
      .from("project_assets")
      .select("id, bucket, path, type, metadata, user_id, project_id")
      .eq("id", assetId)
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .single();

    const asset = assetData as AssetRecord | null;

    if (assetError || !asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    const filename = deriveAssetDownloadFilename(asset);
    const { data: signedUrlData, error: signedUrlError } = await serviceClient.storage
      .from(asset.bucket)
      .createSignedUrl(asset.path, 60, {
        download: filename,
      });

    if (signedUrlError || !signedUrlData?.signedUrl) {
      return NextResponse.json({ error: "Failed to prepare download" }, { status: 500 });
    }

    const upstream = await fetch(signedUrlData.signedUrl, {
      cache: "no-store",
    });

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: "Failed to fetch asset from storage" }, { status: 502 });
    }

    const headers = new Headers();
    headers.set(
      "Content-Type",
      upstream.headers.get("content-type") || "application/octet-stream"
    );
    headers.set("Content-Disposition", buildAttachmentDisposition(filename));
    headers.set("Cache-Control", "private, no-store, max-age=0");

    const contentLength = upstream.headers.get("content-length");
    if (contentLength) {
      headers.set("Content-Length", contentLength);
    }

    return new Response(upstream.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("Project asset download error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
