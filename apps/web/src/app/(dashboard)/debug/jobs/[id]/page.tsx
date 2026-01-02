import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";
import { notFound } from "next/navigation";
import Link from "next/link";

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: jobData, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .single();

  const job = jobData as unknown as JobRow | null;

  if (error || !job) {
    notFound();
  }

  const projectTitle = job.project_id
    ? (
        (
          await supabase
            .from("projects")
            .select("title")
            .eq("id", job.project_id)
            .single()
        ).data as unknown as { title: string } | null
      )?.title ?? null
    : null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "succeeded":
        return "text-accent-400 bg-accent-500/10";
      case "failed":
        return "text-red-400 bg-red-500/10";
      case "running":
        return "text-yellow-400 bg-yellow-500/10";
      case "queued":
        return "text-blue-400 bg-blue-500/10";
      default:
        return "text-gray-400 bg-gray-500/10";
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/debug?tab=jobs"
          className="text-gray-400 hover:text-white"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">{job.type}</h1>
          {projectTitle && (
            <p className="text-gray-400 text-sm">Project: {projectTitle}</p>
          )}
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(job.status)}`}>
          {job.status === "running" && (
            <span className="inline-block w-2 h-2 bg-yellow-400 rounded-full animate-pulse mr-2" />
          )}
          {job.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-800/30 border border-gray-700 rounded-xl p-4">
          <p className="text-sm text-gray-400">Created</p>
          <p className="text-white mt-1">
            {new Date(job.created_at).toLocaleString()}
          </p>
        </div>
        <div className="bg-gray-800/30 border border-gray-700 rounded-xl p-4">
          <p className="text-sm text-gray-400">Updated</p>
          <p className="text-white mt-1">
            {new Date(job.updated_at).toLocaleString()}
          </p>
        </div>
      </div>

      {job.error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-red-400 mb-2">Error</h2>
          <p className="text-red-300">{job.error}</p>
        </div>
      )}

      <div className="space-y-4">
        <div className="bg-gray-800/30 border border-gray-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Input</h2>
          <pre className="bg-gray-900 rounded-lg p-4 overflow-x-auto text-sm text-gray-300">
            {JSON.stringify(job.input, null, 2)}
          </pre>
        </div>

        {job.output && (
          <div className="bg-gray-800/30 border border-gray-700 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Output</h2>
            <pre className="bg-gray-900 rounded-lg p-4 overflow-x-auto text-sm text-gray-300">
              {JSON.stringify(job.output, null, 2)}
            </pre>
          </div>
        )}
      </div>

      <div className="bg-gray-800/30 border border-gray-700 rounded-xl p-4">
        <p className="text-sm text-gray-400">Job ID</p>
        <p className="text-white font-mono text-sm mt-1">{job.id}</p>
      </div>
    </div>
  );
}

