import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  research: { label: "Research", color: "bg-blue-500" },
  outline: { label: "Outline", color: "bg-purple-500" },
  record: { label: "Recording", color: "bg-yellow-500" },
  edit: { label: "Editing", color: "bg-orange-500" },
  thumbnail: { label: "Thumbnail", color: "bg-pink-500" },
  done: { label: "Done", color: "bg-accent-500" },
};

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: projects } = await supabase
    .from("projects")
    .select("*, ideas(*), project_assets(*)")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  const params = await searchParams;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Projects</h1>
          <p className="text-gray-400 mt-1">
            Manage your video production projects
          </p>
        </div>
        <Link
          href="/projects/new"
          className="px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors"
        >
          New Project
        </Link>
      </div>

      {/* Projects Grid */}
      {projects && projects.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => {
            const status = STATUS_LABELS[project.status] || STATUS_LABELS.research;
            const assetCount = (project.project_assets as unknown[])?.length || 0;

            return (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="bg-gray-800/30 border border-gray-700 rounded-xl overflow-hidden hover:border-gray-600 transition-all group"
              >
                {/* Status Bar */}
                <div className={`h-1 ${status.color}`} />

                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-lg font-semibold text-white group-hover:text-primary-400 transition-colors line-clamp-2">
                      {project.title}
                    </h3>
                    <span
                      className={`px-2 py-1 ${status.color}/20 text-xs font-medium rounded`}
                      style={{ color: status.color.replace("bg-", "rgb(var(--") }}
                    >
                      {status.label}
                    </span>
                  </div>

                  <div className="mt-4 flex items-center gap-4 text-sm text-gray-400">
                    <span>{assetCount} assets</span>
                    <span>•</span>
                    <span>
                      Updated {new Date(project.updated_at).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Progress Indicators */}
                  <div className="mt-4 flex gap-1">
                    {Object.keys(STATUS_LABELS).map((s) => (
                      <div
                        key={s}
                        className={`h-1 flex-1 rounded-full ${
                          Object.keys(STATUS_LABELS).indexOf(s) <=
                          Object.keys(STATUS_LABELS).indexOf(project.status)
                            ? status.color
                            : "bg-gray-700"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-white mb-2">No projects yet</h3>
          <p className="text-gray-400 mb-6">
            Create a project from a saved idea or start fresh
          </p>
          <div className="flex justify-center gap-4">
            <Link
              href="/projects/new"
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors"
            >
              New Project
            </Link>
            <Link
              href="/ideas?tab=saved"
              className="px-4 py-2 border border-gray-600 hover:border-gray-500 text-gray-300 font-medium rounded-lg transition-colors"
            >
              View Saved Ideas
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

