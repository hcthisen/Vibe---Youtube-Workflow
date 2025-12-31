import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { ProjectHeader } from "@/components/projects/ProjectHeader";
import { OutlineEditor } from "@/components/projects/OutlineEditor";
import { VideoUploader } from "@/components/projects/VideoUploader";
import { VideoPlayer } from "@/components/projects/VideoPlayer";
import { TranscriptViewer } from "@/components/projects/TranscriptViewer";
import { ThumbnailGallery } from "@/components/projects/ThumbnailGallery";

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

  const { data: project, error } = await supabase
    .from("projects")
    .select("*, ideas(*)")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !project) {
    notFound();
  }

  const { data: assets } = await supabase
    .from("project_assets")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: false });

  const { data: jobs } = await supabase
    .from("jobs")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: false });

  // Categorize assets
  const rawVideo = assets?.find((a) => a.type === "raw_video");
  const processedVideo = assets?.find((a) => a.type === "processed_video");
  const transcript = assets?.find((a) => a.type === "transcript");
  const editReport = assets?.find((a) => a.type === "edit_report");
  const thumbnails = assets?.filter((a) => a.type === "thumbnail") || [];

  // Check for running jobs
  const runningJob = jobs?.find((j) => j.status === "running" || j.status === "queued");

  return (
    <div className="space-y-8">
      <ProjectHeader project={project} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Outline Section */}
          <section className="bg-gray-800/30 border border-gray-700 rounded-xl p-6">
            <OutlineEditor
              projectId={project.id}
              outline={project.outline as Record<string, unknown> | null}
              titleVariants={project.title_variants as string[] | null}
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
            ) : processedVideo ? (
              <VideoPlayer asset={processedVideo} />
            ) : rawVideo ? (
              <div className="text-center py-8">
                <p className="text-gray-400">
                  Raw video uploaded. Processing will begin shortly.
                </p>
              </div>
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
    total_silence_removed_ms?: number;
    cuts_count?: number;
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-3 text-sm">
      {report.original_duration_ms && (
        <div className="flex justify-between">
          <span className="text-gray-400">Original</span>
          <span className="text-white">{formatDuration(report.original_duration_ms)}</span>
        </div>
      )}
      {report.processed_duration_ms && (
        <div className="flex justify-between">
          <span className="text-gray-400">Processed</span>
          <span className="text-white">{formatDuration(report.processed_duration_ms)}</span>
        </div>
      )}
      {report.total_silence_removed_ms && (
        <div className="flex justify-between">
          <span className="text-gray-400">Silence Removed</span>
          <span className="text-accent-400">{formatDuration(report.total_silence_removed_ms)}</span>
        </div>
      )}
      {report.cuts_count && (
        <div className="flex justify-between">
          <span className="text-gray-400">Total Cuts</span>
          <span className="text-white">{report.cuts_count}</span>
        </div>
      )}
    </div>
  );
}

