"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function NewProjectClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ideaId = searchParams.get("idea_id");

  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingIdea, setLoadingIdea] = useState(!!ideaId);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    if (ideaId) {
      loadIdea(ideaId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ideaId]);

  const loadIdea = async (id: string) => {
    const { data: ideaData } = await supabase
      .from("ideas")
      .select("ai_summary, source_video_id")
      .eq("id", id)
      .single();

    const idea = ideaData as
      | { ai_summary: string | null; source_video_id: string | null }
      | null;

    const videoTitle = idea?.source_video_id
      ? (
          (
            await supabase
              .from("videos")
              .select("title")
              .eq("id", idea.source_video_id)
              .single()
          ).data as unknown as { title: string } | null
        )?.title ?? null
      : null;

    // Use video title or extract from summary
    setTitle(videoTitle || idea?.ai_summary?.split("\n")[0] || "Untitled Project");
    setLoadingIdea(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Please enter a project title");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (ideaId) {
        // Create from idea using tool
        const response = await fetch("/api/tools/project_create_from_idea", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idea_id: ideaId,
            title: title.trim(),
          }),
        });

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || "Failed to create project");
        }

        router.push(`/projects/${result.data.project_id}`);
      } else {
        // Create blank project
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          throw new Error("Not authenticated");
        }

        const { data: project, error: dbError } = await (supabase
          .from("projects") as any)
          .insert({
            user_id: user.id,
            title: title.trim(),
            status: "research",
          })
          .select()
          .single();

        if (dbError) {
          throw dbError;
        }

        router.push(`/projects/${project.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
      setLoading(false);
    }
  };

  if (loadingIdea) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full mx-auto" />
        <p className="text-gray-400 mt-4">Loading idea...</p>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">New Project</h1>
        <p className="text-gray-400 mt-1">
          {ideaId ? "Create a project from your saved idea" : "Start a new video project"}
        </p>
      </div>

      <form onSubmit={handleCreate} className="space-y-6">
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Project Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="My Awesome Video"
            className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
            autoFocus
          />
        </div>

        <div className="flex gap-4">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-600/50 text-white font-semibold rounded-lg transition-colors"
          >
            {loading ? "Creating..." : "Create Project"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-3 border border-gray-600 hover:border-gray-500 text-gray-300 font-medium rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}


