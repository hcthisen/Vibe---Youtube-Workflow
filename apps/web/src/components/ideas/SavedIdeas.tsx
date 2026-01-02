"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";

interface Video {
  id: string;
  title: string;
  thumbnail_url: string | null;
  views_count: number | null;
  channel_name: string | null;
}

interface Project {
  id: string;
  title: string;
  status: string;
}

interface Idea {
  id: string;
  score: number;
  score_breakdown: unknown;
  ai_summary: string | null;
  title_variants: unknown;
  hook_options: unknown;
  status: string;
  created_at: string;
  videos: Video | null;
  projects: Project | null;
}

interface SavedIdeasProps {
  ideas: Idea[];
}

export function SavedIdeas({ ideas }: SavedIdeasProps) {
  const router = useRouter();
  const supabase = createClient();

  const handleCreateProject = async (idea: Idea) => {
    // If project already exists, navigate to it
    if (idea.projects) {
      router.push(`/projects/${idea.projects.id}`);
    } else {
      // Navigate to project creation with this idea
      router.push(`/projects/new?idea_id=${idea.id}`);
    }
  };

  const handleDiscard = async (ideaId: string) => {
    if (!confirm("Discard this idea?")) return;

    await supabase.from("ideas").update({ status: "discarded" }).eq("id", ideaId);

    router.refresh();
  };

  if (ideas.length === 0) {
    return (
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
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-white mb-2">No saved ideas yet</h3>
        <p className="text-gray-400 mb-6">
          Use the Outlier Search or Deep Research to find and save ideas
        </p>
        <div className="flex justify-center gap-4">
          <a
            href="/ideas?tab=outliers"
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors"
          >
            Search Outliers
          </a>
          <a
            href="/ideas?tab=research"
            className="px-4 py-2 border border-gray-600 hover:border-gray-500 text-gray-300 font-medium rounded-lg transition-colors"
          >
            Deep Research
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {ideas.map((idea) => (
        <div
          key={idea.id}
          className="bg-gray-800/30 border border-gray-700 rounded-xl overflow-hidden hover:border-gray-600 transition-colors"
        >
          <div className="flex gap-4 p-4">
            {/* Thumbnail */}
            {idea.videos?.thumbnail_url && (
              <div className="flex-shrink-0 w-40 aspect-video relative rounded-lg overflow-hidden">
                <Image
                  src={idea.videos.thumbnail_url}
                  alt={idea.videos.title || "Video thumbnail"}
                  fill
                  className="object-cover"
                />
              </div>
            )}

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-2">
                <h4 className="text-white font-medium line-clamp-2 flex-1">
                  {idea.videos?.title || idea.ai_summary?.slice(0, 100) || "Untitled Idea"}
                </h4>
                {idea.status === "project_created" && (
                  <span className="px-2 py-1 bg-accent-600/20 border border-accent-600/30 rounded text-xs text-accent-400 font-medium whitespace-nowrap">
                    Project Created
                  </span>
                )}
              </div>
              {idea.videos?.channel_name && (
                <p className="text-sm text-gray-400 mt-1">{idea.videos.channel_name}</p>
              )}
              {idea.ai_summary && (
                <p className="text-sm text-gray-400 mt-2 line-clamp-2">{idea.ai_summary}</p>
              )}
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                {idea.videos?.views_count && (
                  <span>{idea.videos.views_count.toLocaleString()} views</span>
                )}
                <span>Saved {new Date(idea.created_at).toLocaleDateString()}</span>
              </div>
            </div>

            {/* Score */}
            {idea.score > 0 && (
              <div className="flex-shrink-0 text-right">
                <div className="text-2xl font-bold text-primary-400">
                  {idea.score.toFixed(1)}x
                </div>
                <span className="text-xs text-gray-500">outlier score</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex-shrink-0 flex flex-col gap-2">
              <button
                onClick={() => handleCreateProject(idea)}
                className={`px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors ${
                  idea.status === "project_created"
                    ? "bg-primary-600 hover:bg-primary-700"
                    : "bg-accent-600 hover:bg-accent-700"
                }`}
              >
                {idea.status === "project_created" ? "View Project" : "Create Project"}
              </button>
              {idea.status !== "project_created" && (
                <button
                  onClick={() => handleDiscard(idea.id)}
                  className="px-4 py-2 border border-gray-600 hover:border-red-500 text-gray-400 hover:text-red-400 text-sm font-medium rounded-lg transition-colors"
                >
                  Discard
                </button>
              )}
            </div>
          </div>

          {/* Hook Options */}
          {Array.isArray(idea.hook_options) && idea.hook_options.length > 0 && (
            <div className="border-t border-gray-700 p-4 bg-gray-900/30">
              <h5 className="text-xs font-medium text-gray-400 mb-2">HOOK OPTIONS</h5>
              <div className="flex flex-wrap gap-2">
                {(idea.hook_options as string[]).slice(0, 3).map((hook, i) => (
                  <span
                    key={i}
                    className="px-3 py-1 bg-gray-800 rounded-full text-sm text-gray-300"
                  >
                    {hook}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

