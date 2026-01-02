import { createClient } from "@/lib/supabase/server";
import { OutlierSearch } from "@/components/ideas/OutlierSearch";
import { DeepResearch } from "@/components/ideas/DeepResearch";
import { SavedIdeas } from "@/components/ideas/SavedIdeas";
import type { Database } from "@/lib/database.types";

type IdeaRow = Database["public"]["Tables"]["ideas"]["Row"];
type VideoRow = Database["public"]["Tables"]["videos"]["Row"];
type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
type ChannelRow = Database["public"]["Tables"]["channels"]["Row"];

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

  // Fetch ideas (we join videos/projects manually to avoid embedded select typing issues)
  const { data: savedIdeasData, error: ideasError } = await supabase
    .from("ideas")
    .select("*")
    .eq("user_id", user.id)
    .in("status", ["saved", "project_created"])
    .order("created_at", { ascending: false });

  const savedIdeas = (savedIdeasData as unknown as IdeaRow[] | null) ?? [];

  if (ideasError) {
    console.error("Error fetching ideas:", ideasError);
  }

  // Fetch projects for these ideas
  const ideaIds = savedIdeas.map((idea) => idea.id);
  const { data: projectsData } = ideaIds.length > 0
    ? await supabase
        .from("projects")
        .select("id, idea_id, title, status")
        .eq("user_id", user.id)
        .in("idea_id", ideaIds)
    : { data: null };

  const projects =
    (projectsData as unknown as Pick<ProjectRow, "id" | "idea_id" | "title" | "status">[] | null) ??
    [];

  const projectsByIdeaId = new Map(projects.map((p) => [p.idea_id, p]));

  // Fetch source videos referenced by these ideas
  const sourceVideoIds = Array.from(
    new Set(savedIdeas.map((idea) => idea.source_video_id).filter(Boolean))
  ) as string[];

  const { data: videosData } = sourceVideoIds.length
    ? await supabase
        .from("videos")
        .select("id, title, thumbnail_url, views_count, channel_name")
        .in("id", sourceVideoIds)
    : { data: null };

  const videos =
    (videosData as unknown as Pick<
      VideoRow,
      "id" | "title" | "thumbnail_url" | "views_count" | "channel_name"
    >[] | null) ?? [];

  const videosById = new Map(videos.map((v) => [v.id, v]));

  // Merge projects + videos into ideas
  const ideasWithProjects = savedIdeas.map((idea) => ({
    ...idea,
    videos: idea.source_video_id
      ? videosById.get(idea.source_video_id) ?? null
      : null,
    projects: projectsByIdeaId.get(idea.id) ?? null,
  }));

  const { data: channelData } = await supabase
    .from("channels")
    .select("baseline_keywords")
    .eq("user_id", user.id)
    .single();
  const channel = channelData as unknown as Pick<ChannelRow, "baseline_keywords"> | null;

  const params = await searchParams;
  const activeTab = params.tab || "outliers";

  const tabs = [
    { id: "outliers", label: "Outlier Search" },
    { id: "research", label: "Deep Research" },
    { id: "saved", label: `Saved Ideas (${ideasWithProjects?.length || 0})` },
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
      {activeTab === "saved" && <SavedIdeas ideas={ideasWithProjects || []} />}
    </div>
  );
}

