import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const deleteSchema = z.object({
  asset_id: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Parse and validate input
    const body = await request.json();
    const input = deleteSchema.parse(body);

    // Get asset to verify ownership and get storage path
    const { data: asset, error: assetError } = await supabase
      .from("project_assets")
      .select("bucket, path, user_id")
      .eq("id", input.asset_id)
      .single();

    if (assetError || !asset) {
      return NextResponse.json(
        { success: false, error: "Thumbnail not found" },
        { status: 404 }
      );
    }

    // Verify ownership
    if (asset.user_id !== user.id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from(asset.bucket)
      .remove([asset.path]);

    if (storageError) {
      console.error("Failed to delete from storage:", storageError);
      // Continue anyway - we'll still delete the database record
    }

    // Delete database record
    const { error: deleteError } = await supabase
      .from("project_assets")
      .delete()
      .eq("id", input.asset_id);

    if (deleteError) {
      return NextResponse.json(
        { success: false, error: "Failed to delete thumbnail record" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { deleted: true },
    });
  } catch (error) {
    console.error("Thumbnail delete error:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Invalid input", details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

