import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    // Authenticate user
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify project ownership
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, user_id")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Get service role client for storage operations
    const serviceClient = await createServiceClient();

    // Fetch all project assets
    const { data: assets, error: assetsError } = await serviceClient
      .from("project_assets")
      .select("id, bucket, path, type")
      .eq("project_id", projectId);

    if (assetsError) {
      console.error("Error fetching project assets:", assetsError);
      // Continue with deletion even if we can't fetch assets
    }

    // Delete files from storage (best effort)
    const deletionErrors: string[] = [];
    
    if (assets && assets.length > 0) {
      // Group assets by bucket for efficient deletion
      const assetsByBucket = assets.reduce((acc, asset) => {
        if (!acc[asset.bucket]) {
          acc[asset.bucket] = [];
        }
        acc[asset.bucket].push(asset.path);
        return acc;
      }, {} as Record<string, string[]>);

      // Delete files from each bucket
      for (const [bucket, paths] of Object.entries(assetsByBucket)) {
        try {
          const { error: storageError } = await serviceClient.storage
            .from(bucket)
            .remove(paths);

          if (storageError) {
            console.error(`Error deleting files from bucket ${bucket}:`, storageError);
            deletionErrors.push(`${bucket}: ${storageError.message}`);
          } else {
            console.log(`Successfully deleted ${paths.length} files from ${bucket}`);
          }
        } catch (error) {
          console.error(`Exception deleting files from bucket ${bucket}:`, error);
          deletionErrors.push(`${bucket}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    // Delete the project (this will cascade to project_assets and jobs)
    const { error: deleteError } = await supabase
      .from("projects")
      .delete()
      .eq("id", projectId)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("Error deleting project:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete project", details: deleteError.message },
        { status: 500 }
      );
    }

    // Project deleted successfully
    const response: {
      success: boolean;
      message: string;
      warnings?: string[];
    } = {
      success: true,
      message: "Project deleted successfully",
    };

    if (deletionErrors.length > 0) {
      response.warnings = deletionErrors;
      console.warn("Project deleted but some storage files failed to delete:", deletionErrors);
    }

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error("Unexpected error in DELETE /api/projects/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

