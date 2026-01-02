import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";
import { notFound } from "next/navigation";
import Link from "next/link";

type ToolRunRow = Database["public"]["Tables"]["tool_runs"]["Row"];

export default async function ToolRunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: runData, error } = await supabase
    .from("tool_runs")
    .select("*")
    .eq("id", id)
    .single();

  const run = runData as unknown as ToolRunRow | null;

  if (error || !run) {
    notFound();
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "succeeded":
        return "text-accent-400 bg-accent-500/10";
      case "failed":
        return "text-red-400 bg-red-500/10";
      case "started":
        return "text-yellow-400 bg-yellow-500/10";
      default:
        return "text-gray-400 bg-gray-500/10";
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/debug?tab=tool_runs"
          className="text-gray-400 hover:text-white"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">{run.tool_name}</h1>
          <p className="text-gray-400 text-sm">v{run.tool_version}</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(run.status)}`}>
          {run.status}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-800/30 border border-gray-700 rounded-xl p-4">
          <p className="text-sm text-gray-400">Duration</p>
          <p className="text-xl font-semibold text-white mt-1">
            {run.duration_ms ? `${run.duration_ms}ms` : "-"}
          </p>
        </div>
        <div className="bg-gray-800/30 border border-gray-700 rounded-xl p-4">
          <p className="text-sm text-gray-400">Created</p>
          <p className="text-white mt-1">
            {new Date(run.created_at).toLocaleString()}
          </p>
        </div>
        <div className="bg-gray-800/30 border border-gray-700 rounded-xl p-4">
          <p className="text-sm text-gray-400">Run ID</p>
          <p className="text-white mt-1 font-mono text-sm truncate">{run.id}</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-gray-800/30 border border-gray-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Input</h2>
          <pre className="bg-gray-900 rounded-lg p-4 overflow-x-auto text-sm text-gray-300">
            {JSON.stringify(run.input, null, 2)}
          </pre>
        </div>

        <div className="bg-gray-800/30 border border-gray-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Output</h2>
          <pre className="bg-gray-900 rounded-lg p-4 overflow-x-auto text-sm text-gray-300">
            {run.output ? JSON.stringify(run.output, null, 2) : "null"}
          </pre>
        </div>

        {run.logs && (
          <div className="bg-gray-800/30 border border-gray-700 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Logs</h2>
            <pre className="bg-gray-900 rounded-lg p-4 overflow-x-auto text-sm text-gray-300 whitespace-pre-wrap">
              {run.logs}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

