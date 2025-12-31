import { createClient } from "@/lib/supabase/server";
import { OutlierSearch } from "@/components/ideas/OutlierSearch";
import { DeepResearch } from "@/components/ideas/DeepResearch";
import { SavedIdeas } from "@/components/ideas/SavedIdeas";

export default async function IdeasPage({
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

  const { data: savedIdeas } = await supabase
    .from("ideas")
    .select("*, videos(*)")
    .eq("user_id", user.id)
    .eq("status", "saved")
    .order("created_at", { ascending: false });

  const { data: channel } = await supabase
    .from("channels")
    .select("baseline_keywords")
    .eq("user_id", user.id)
    .single();

  const params = await searchParams;
  const activeTab = params.tab || "outliers";

  const tabs = [
    { id: "outliers", label: "Outlier Search" },
    { id: "research", label: "Deep Research" },
    { id: "saved", label: `Saved Ideas (${savedIdeas?.length || 0})` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Ideas</h1>
        <p className="text-gray-400 mt-1">
          Discover viral video opportunities and generate new ideas
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-700">
        <nav className="flex gap-4">
          {tabs.map((tab) => (
            <a
              key={tab.id}
              href={`/ideas?tab=${tab.id}`}
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
      {activeTab === "outliers" && (
        <OutlierSearch
          baselineKeywords={(channel?.baseline_keywords as string[]) || []}
        />
      )}
      {activeTab === "research" && (
        <DeepResearch
          baselineKeywords={(channel?.baseline_keywords as string[]) || []}
        />
      )}
      {activeTab === "saved" && <SavedIdeas ideas={savedIdeas || []} />}
    </div>
  );
}

