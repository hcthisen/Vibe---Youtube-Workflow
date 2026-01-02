import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function DashboardPage() {
  const supabase = await createClient();
  
  // Fetch counts
  const [ideasResult, projectsResult, jobsResult] = await Promise.all([
    supabase.from("ideas").select("id", { count: "exact", head: true }),
    supabase.from("projects").select("id", { count: "exact", head: true }),
    supabase.from("jobs").select("id", { count: "exact", head: true }).eq("status", "running"),
  ]);

  const stats = [
    { name: "Saved Ideas", value: ideasResult.count || 0, href: "/ideas" },
    { name: "Active Projects", value: projectsResult.count || 0, href: "/projects" },
    { name: "Running Jobs", value: jobsResult.count || 0, href: "/debug" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 mt-1">
          Overview of your YouTube production workflow
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat) => (
          <Link
            key={stat.name}
            href={stat.href}
            className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 hover:border-gray-600 transition-colors"
          >
            <p className="text-sm text-gray-400">{stat.name}</p>
            <p className="text-3xl font-bold text-white mt-2">{stat.value}</p>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <QuickActionCard
            title="Find Outliers"
            description="Search for viral videos in your niche"
            href="/ideas?tab=outliers"
            icon="🔍"
          />
          <QuickActionCard
            title="Deep Research"
            description="Generate new video ideas with AI"
            href="/ideas?tab=research"
            icon="🧠"
          />
          <QuickActionCard
            title="New Project"
            description="Start a new video production"
            href="/projects/new"
            icon="📁"
          />
          <QuickActionCard
            title="Upload Video"
            description="Process a raw recording"
            href="/projects?action=upload"
            icon="📤"
          />
        </div>
      </div>

      {/* Setup Checklist */}
      <SetupChecklist />
    </div>
  );
}

function QuickActionCard({
  title,
  description,
  href,
  icon,
}: {
  title: string;
  description: string;
  href: string;
  icon: string;
}) {
  return (
    <Link
      href={href}
      className="bg-gray-800/30 border border-gray-700 rounded-xl p-5 hover:border-primary-500/50 hover:bg-gray-800/50 transition-all group"
    >
      <div className="text-3xl mb-3">{icon}</div>
      <h3 className="font-semibold text-white group-hover:text-primary-400 transition-colors">
        {title}
      </h3>
      <p className="text-sm text-gray-400 mt-1">{description}</p>
    </Link>
  );
}

async function SetupChecklist() {
  const supabase = await createClient();
  
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .single();

  const { data: channel } = await supabase
    .from("channels")
    .select("id")
    .limit(1)
    .single();

  const { count: headshotsCount } = await supabase
    .from("headshots")
    .select("id", { count: "exact", head: true });

  const checks = [
    {
      name: "Configure profile settings",
      done: !!profile,
      href: "/settings",
    },
    {
      name: "Connect YouTube channel",
      done: !!channel,
      href: "/settings?tab=channel",
    },
    {
      name: "Upload headshots",
      done: (headshotsCount || 0) >= 3,
      href: "/settings?tab=headshots",
    },
  ];

  const completedCount = checks.filter((c) => c.done).length;
  
  if (completedCount === checks.length) {
    return null;
  }

  return (
    <div className="bg-gray-800/30 border border-gray-700 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Setup Checklist</h2>
        <span className="text-sm text-gray-400">
          {completedCount}/{checks.length} complete
        </span>
      </div>
      <div className="space-y-3">
        {checks.map((check) => (
          <Link
            key={check.name}
            href={check.href}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-700/30 transition-colors"
          >
            <div
              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                check.done
                  ? "border-accent-500 bg-accent-500"
                  : "border-gray-600"
              }`}
            >
              {check.done && (
                <svg
                  className="w-3 h-3 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
            </div>
            <span
              className={check.done ? "text-gray-400 line-through" : "text-white"}
            >
              {check.name}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

