import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";
import { redirect, notFound } from "next/navigation";
import { ProjectHeader } from "@/components/projects/ProjectHeader";
import { IdeaBrief } from "@/components/projects/IdeaBrief";
import { OutlineEditor } from "@/components/projects/OutlineEditor";
import { VideoUploader } from "@/components/projects/VideoUploader";
import { VideoPlayer } from "@/components/projects/VideoPlayer";
import { TranscriptViewer } from "@/components/projects/TranscriptViewer";
import { ThumbnailGallery } from "@/components/projects/ThumbnailGallery";

type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
type ProjectAssetRow = Database["public"]["Tables"]["project_assets"]["Row"];
type JobRow = Database["public"]["Tables"]["jobs"]["Row"];

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: projectData, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  const project = projectData as unknown as ProjectRow | null;

  if (error || !project) {
    notFound();
  }

  const { data: assetsData } = await supabase
    .from("project_assets")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: false });

  const assets = (assetsData as unknown as ProjectAssetRow[] | null) ?? [];

  const { data: jobsData } = await supabase
    .from("jobs")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: false });

  const jobs = (jobsData as unknown as JobRow[] | null) ?? [];

  // Categorize assets
  const rawVideo = assets.find((a) => a.type === "raw_video");
  const processedVideo = assets.find((a) => a.type === "processed_video");
  // Find JSON transcript (not plain text)
  const transcript = assets.find((a) => a.type === "transcript" && a.path.endsWith(".json"));
  const editReport = assets.find((a) => a.type === "edit_report");
  const thumbnails = assets.filter((a) => a.type === "thumbnail");

  // Check for running jobs
  const runningJob = jobs.find((j) => j.status === "running" || j.status === "queued");
  const failedJob = jobs.find((j) => j.status === "failed");

  return (
    <div className="space-y-8">
      <ProjectHeader project={project} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Idea Brief Section */}
          {project.idea_brief_markdown && (
            <IdeaBrief
              projectId={project.id}
              markdown={project.idea_brief_markdown}
            />
          )}

          {/* Outline Section */}
          <section className="bg-gray-800/30 border border-gray-700 rounded-xl p-6">
            <OutlineEditor
              projectId={project.id}
              outline={project.outline as Record<string, unknown> | null}
              titleVariants={
                project.title_variants as
                  | Array<{ title: string; style: string; reasoning?: string }>
                  | null
              }
            />
          </section>

          {/* Video Section */}
          <section className="bg-gray-800/30 border border-gray-700 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Video</h2>

            {runningJob ? (
              <div className="text-center py-8">
                <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full mx-auto" />
                <p className="text-gray-400 mt-4">
                  Processing video... This may take a few minutes.
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  Job status: {runningJob.status}
                </p>
              </div>
            ) : failedJob ? (
              <div className="space-y-4">
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                  <p className="text-red-400 font-medium mb-2">Processing Failed</p>
                  <p className="text-sm text-gray-400">{failedJob.error || "Unknown error"}</p>
                  <p className="text-xs text-gray-500 mt-2">
                    Job ID: {failedJob.id}
                  </p>
                </div>
                {rawVideo && (
                  <VideoPlayer rawAsset={rawVideo} processedAsset={processedVideo} />
                )}
              </div>
            ) : rawVideo || processedVideo ? (
              <VideoPlayer rawAsset={rawVideo} processedAsset={processedVideo} />
            ) : (
              <VideoUploader projectId={project.id} />
            )}
          </section>

          {/* Transcript Section */}
          {transcript && (
            <section className="bg-gray-800/30 border border-gray-700 rounded-xl p-6">
              <TranscriptViewer asset={transcript} />
            </section>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Thumbnails Section */}
          <section className="bg-gray-800/30 border border-gray-700 rounded-xl p-6">
            <ThumbnailGallery
              projectId={project.id}
              thumbnails={thumbnails}
            />
          </section>

          {/* Edit Report */}
          {editReport && (
            <section className="bg-gray-800/30 border border-gray-700 rounded-xl p-6">
              <h3 className="text-md font-semibold text-white mb-4">Edit Report</h3>
              <EditReportView metadata={editReport.metadata as Record<string, unknown>} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function EditReportView({ metadata }: { metadata: Record<string, unknown> }) {
  const report = metadata as {
    original_duration_ms?: number;
    processed_duration_ms?: number;
    final_duration_ms?: number;
    total_silence_removed_ms?: number;
    silence_removed_ms?: number;
    cuts_count?: number;
    retake_cuts?: any[];
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  // Handle both field name formats
  const processedDuration = report.processed_duration_ms ?? report.final_duration_ms;
  const silenceRemoved = report.total_silence_removed_ms ?? report.silence_removed_ms;
  const cutsCount = report.cuts_count ?? (report.retake_cuts?.length ?? 0);

  return (
    <div className="space-y-3 text-sm">
      {report.original_duration_ms && (
        <div className="flex justify-between">
          <span className="text-gray-400">Original</span>
          <span className="text-white">{formatDuration(report.original_duration_ms)}</span>
        </div>
      )}
      {processedDuration && (
        <div className="flex justify-between">
          <span className="text-gray-400">Processed</span>
          <span className="text-white">{formatDuration(processedDuration)}</span>
        </div>
      )}
      {silenceRemoved && (
        <div className="flex justify-between">
          <span className="text-gray-400">Silence Removed</span>
          <span className="text-accent-400">{formatDuration(silenceRemoved)}</span>
        </div>
      )}
      {cutsCount > 0 && (
        <div className="flex justify-between">
          <span className="text-gray-400">Total Cuts</span>
          <span className="text-white">{cutsCount}</span>
        </div>
      )}
    </div>
  );
}

