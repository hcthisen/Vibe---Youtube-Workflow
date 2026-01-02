import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";
import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/settings/ProfileForm";
import { HeadshotManager } from "@/components/settings/HeadshotManager";
import { ThumbnailPresetManager } from "@/components/settings/ThumbnailPresetManager";
import { ChannelBaseline } from "@/components/settings/ChannelBaseline";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type HeadshotRow = Database["public"]["Tables"]["headshots"]["Row"];
type ChannelRow = Database["public"]["Tables"]["channels"]["Row"];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profileData } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  const profile = profileData as unknown as ProfileRow | null;

  const { data: headshotsData } = await supabase
    .from("headshots")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  const headshots = (headshotsData as unknown as HeadshotRow[] | null) ?? [];

  const { data: channelData } = await supabase
    .from("channels")
    .select("*")
    .eq("user_id", user.id)
    .single();
  const channel = channelData as unknown as ChannelRow | null;

  const params = await searchParams;
  const activeTab = params.tab || "profile";

  const tabs = [
    { id: "profile", label: "Profile Settings" },
    { id: "headshots", label: "Headshots" },
    { id: "thumbnail-presets", label: "Thumbnail Presets" },
    { id: "channel", label: "Channel Baseline" },
  ];

  // Extract preset styles from profile
  const presetStyles = (profile?.thumbnail_preset_styles as any) || [];

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-gray-400 mt-1">
          Configure your preferences and manage your assets
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-700">
        <nav className="flex gap-4">
          {tabs.map((tab) => (
            <a
              key={tab.id}
              href={`/settings?tab=${tab.id}`}
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
      <div className="bg-gray-800/30 border border-gray-700 rounded-xl p-6">
        {activeTab === "profile" && (
          <ProfileForm
            profile={profile}
            userId={user.id}
          />
        )}
        {activeTab === "headshots" && (
          <HeadshotManager
            headshots={headshots}
            userId={user.id}
          />
        )}
        {activeTab === "thumbnail-presets" && (
          <ThumbnailPresetManager
            userId={user.id}
            presetStyles={presetStyles}
          />
        )}
        {activeTab === "channel" && (
          <ChannelBaseline
            channel={channel}
            userId={user.id}
          />
        )}
      </div>
    </div>
  );
}

