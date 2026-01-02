import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function DebugPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: toolRunsData } = await supabase
    .from("tool_runs")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const { data: jobsData } = await supabase
    .from("jobs")
    .select("*, projects(title)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const params = await searchParams;
  const activeTab = params.tab || "tool_runs";

  const tabs = [
    { id: "tool_runs", label: "Tool Runs" },
    { id: "jobs", label: "Jobs" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Debug</h1>
        <p className="text-gray-400 mt-1">
          View tool execution logs and background job history
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-700">
        <nav className="flex gap-4">
          {tabs.map((tab) => (
            <a
              key={tab.id}
              href={`/debug?tab=${tab.id}`}
              className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.id
                  ? "border-primary-500 text-primary-400"
                  : "border-transparent text-gray-400 hover:text-white"
              }`}
            >
              {tab.label}
            </a>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === "tool_runs" && (
        <ToolRunsTable runs={(toolRunsData as unknown as ToolRun[] | null) ?? []} />
      )}
      {activeTab === "jobs" && (
        <JobsTable jobs={(jobsData as unknown as Job[] | null) ?? []} />
      )}
    </div>
  );
}

interface ToolRun {
  id: string;
  tool_name: string;
  tool_version: string;
  status: string;
  input: unknown;
  output: unknown;
  logs: string | null;
  duration_ms: number | null;
  created_at: string;
}

function ToolRunsTable({ runs }: { runs: ToolRun[] }) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "succeeded":
        return "text-accent-400";
      case "failed":
        return "text-red-400";
      case "started":
        return "text-yellow-400";
      default:
        return "text-gray-400";
    }
  };

  if (runs.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        No tool runs yet
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="text-left text-sm text-gray-400 border-b border-gray-700">
            <th className="pb-3 font-medium">Tool</th>
            <th className="pb-3 font-medium">Status</th>
            <th className="pb-3 font-medium">Duration</th>
            <th className="pb-3 font-medium">Time</th>
            <th className="pb-3 font-medium">Details</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {runs.map((run) => (
            <tr key={run.id} className="hover:bg-gray-800/30">
              <td className="py-4">
                <div className="text-white font-medium">{run.tool_name}</div>
                <div className="text-xs text-gray-500">v{run.tool_version}</div>
              </td>
              <td className={`py-4 font-medium ${getStatusColor(run.status)}`}>
                {run.status}
              </td>
              <td className="py-4 text-gray-400">
                {run.duration_ms ? `${run.duration_ms}ms` : "-"}
              </td>
              <td className="py-4 text-gray-400 text-sm">
                {new Date(run.created_at).toLocaleString()}
              </td>
              <td className="py-4">
                <Link
                  href={`/debug/tool-runs/${run.id}`}
                  className="text-primary-400 hover:text-primary-300 text-sm"
                >
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface Job {
  id: string;
  type: string;
  status: string;
  input: unknown;
  output: unknown;
  error: string | null;
  created_at: string;
  updated_at: string;
  projects: { title: string } | null;
}

function JobsTable({ jobs }: { jobs: Job[] }) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "succeeded":
        return "text-accent-400";
      case "failed":
        return "text-red-400";
      case "running":
        return "text-yellow-400";
      case "queued":
        return "text-blue-400";
      default:
        return "text-gray-400";
    }
  };

  if (jobs.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        No jobs yet
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="text-left text-sm text-gray-400 border-b border-gray-700">
            <th className="pb-3 font-medium">Type</th>
            <th className="pb-3 font-medium">Project</th>
            <th className="pb-3 font-medium">Status</th>
            <th className="pb-3 font-medium">Created</th>
            <th className="pb-3 font-medium">Details</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {jobs.map((job) => (
            <tr key={job.id} className="hover:bg-gray-800/30">
              <td className="py-4">
                <div className="text-white font-medium">{job.type}</div>
              </td>
              <td className="py-4 text-gray-400">
                {job.projects?.title || "-"}
              </td>
              <td className={`py-4 font-medium ${getStatusColor(job.status)}`}>
                <div className="flex items-center gap-2">
                  {job.status === "running" && (
                    <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                  )}
                  {job.status}
                </div>
              </td>
              <td className="py-4 text-gray-400 text-sm">
                {new Date(job.created_at).toLocaleString()}
              </td>
              <td className="py-4">
                <Link
                  href={`/debug/jobs/${job.id}`}
                  className="text-primary-400 hover:text-primary-300 text-sm"
                >
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

