"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Project {
  id: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface ProjectHeaderProps {
  project: Project;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  research: { label: "Research", color: "text-blue-400" },
  outline: { label: "Outline", color: "text-purple-400" },
  record: { label: "Recording", color: "text-yellow-400" },
  edit: { label: "Editing", color: "text-orange-400" },
  thumbnail: { label: "Thumbnail", color: "text-pink-400" },
  done: { label: "Done", color: "text-accent-400" },
};

export function ProjectHeader({ project }: ProjectHeaderProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(project.title);
  const [saving, setSaving] = useState(false);

  const status = STATUS_LABELS[project.status] || STATUS_LABELS.research;

  const handleSaveTitle = async () => {
    if (!title.trim() || title === project.title) {
      setEditing(false);
      return;
    }

    setSaving(true);
    const supabase = createClient();

    await supabase.from("projects").update({ title: title.trim() }).eq("id", project.id);

    setSaving(false);
    setEditing(false);
    router.refresh();
  };

  const handleDelete = async () => {
    if (!confirm("Delete this project? This cannot be undone.")) return;

    const supabase = createClient();
    await supabase.from("projects").delete().eq("id", project.id);
    router.push("/projects");
  };

  const handleStatusChange = async (newStatus: string) => {
    const supabase = createClient();
    await supabase.from("projects").update({ status: newStatus }).eq("id", project.id);
    router.refresh();
  };

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleSaveTitle}
              onKeyDown={(e) => e.key === "Enter" && handleSaveTitle()}
              className="text-2xl font-bold bg-transparent border-b-2 border-primary-500 text-white outline-none"
              autoFocus
            />
            {saving && (
              <div className="animate-spin w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full" />
            )}
          </div>
        ) : (
          <h1
            onClick={() => setEditing(true)}
            className="text-2xl font-bold text-white cursor-pointer hover:text-primary-400 transition-colors"
          >
            {project.title}
          </h1>
        )}
        <div className="flex items-center gap-4 mt-2 text-sm text-gray-400">
          <span className={status.color}>{status.label}</span>
          <span>•</span>
          <span>Created {new Date(project.created_at).toLocaleDateString()}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <select
          value={project.status}
          onChange={(e) => handleStatusChange(e.target.value)}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:border-primary-500"
        >
          {Object.entries(STATUS_LABELS).map(([key, val]) => (
            <option key={key} value={key}>
              {val.label}
            </option>
          ))}
        </select>

        <button
          onClick={handleDelete}
          className="p-2 text-gray-400 hover:text-red-400 transition-colors"
          title="Delete project"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

