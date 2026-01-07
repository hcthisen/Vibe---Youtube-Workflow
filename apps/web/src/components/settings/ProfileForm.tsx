"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface ProfileFormProps {
  profile: {
    id: string;
    display_name: string | null;
    silence_threshold_ms: number;
    retake_markers: unknown;
    intro_transition_enabled: boolean;
    default_language_code: string | null;
    default_location_code: number | null;
    retake_detection_enabled: boolean;
    retake_context_window_seconds: number;
    retake_min_confidence: number;
    retake_prefer_sentence_boundaries: boolean;
  } | null;
  userId: string;
}

export function ProfileForm({ profile, userId }: ProfileFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [formData, setFormData] = useState({
    display_name: profile?.display_name || "",
    silence_threshold_ms: profile?.silence_threshold_ms || 500,
    retake_markers: (profile?.retake_markers as string[])?.join(", ") || "",
    intro_transition_enabled: profile?.intro_transition_enabled || false,
    default_language_code: profile?.default_language_code || "en",
    default_location_code: profile?.default_location_code || 2840,
    retake_detection_enabled: profile?.retake_detection_enabled || false,
    retake_context_window_seconds: profile?.retake_context_window_seconds || 30,
    retake_min_confidence: profile?.retake_min_confidence || 0.7,
    retake_prefer_sentence_boundaries: profile?.retake_prefer_sentence_boundaries ?? true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const supabase = createClient();

    const retakeMarkers = formData.retake_markers
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);

    const { error } = await supabase.from("profiles").upsert({
      id: userId,
      display_name: formData.display_name || null,
      silence_threshold_ms: formData.silence_threshold_ms,
      retake_markers: retakeMarkers,
      intro_transition_enabled: formData.intro_transition_enabled,
      default_language_code: formData.default_language_code || null,
      default_location_code: formData.default_location_code || null,
      retake_detection_enabled: formData.retake_detection_enabled,
      retake_context_window_seconds: formData.retake_context_window_seconds,
      retake_min_confidence: formData.retake_min_confidence,
      retake_prefer_sentence_boundaries: formData.retake_prefer_sentence_boundaries,
    });

    setSaving(false);

    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMessage({ type: "success", text: "Settings saved successfully!" });
      router.refresh();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Profile Settings</h2>
      </div>

      {message && (
        <div
          className={`p-4 rounded-lg text-sm ${
            message.type === "success"
              ? "bg-accent-500/10 border border-accent-500/20 text-accent-400"
              : "bg-red-500/10 border border-red-500/20 text-red-400"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Display Name
          </label>
          <input
            type="text"
            value={formData.display_name}
            onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
            className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
            placeholder="Your name"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Silence Threshold (ms)
          </label>
          <input
            type="number"
            value={formData.silence_threshold_ms}
            onChange={(e) =>
              setFormData({ ...formData, silence_threshold_ms: parseInt(e.target.value) || 500 })
            }
            className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
            min={100}
            max={5000}
            step={100}
          />
          <p className="mt-1 text-sm text-gray-500">
            Pauses longer than this will be removed during video processing
          </p>
        </div>

        {/* Enable Retake Detection Checkbox */}
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="retake_detection_enabled"
            checked={formData.retake_detection_enabled}
            onChange={(e) =>
              setFormData({ ...formData, retake_detection_enabled: e.target.checked })
            }
            className="w-5 h-5 rounded border-gray-600 bg-gray-900 text-primary-500 focus:ring-primary-500"
          />
          <label htmlFor="retake_detection_enabled" className="text-sm text-gray-300">
            Enable intelligent retake detection (AI-powered)
          </label>
        </div>

        {/* Show retake settings only when enabled */}
        {formData.retake_detection_enabled && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Retake Markers
              </label>
              <input
                type="text"
                value={formData.retake_markers}
                onChange={(e) => setFormData({ ...formData, retake_markers: e.target.value })}
                className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                placeholder="cut cut, oops, let me try again"
              />
              <p className="mt-1 text-sm text-gray-500">
                Comma-separated phrases that trigger intelligent retake detection
              </p>
            </div>

            {/* Advanced Retake Detection Settings */}
            <div className="border-t border-gray-700 pt-6">
              <h3 className="text-md font-semibold text-white mb-4">Advanced Retake Detection</h3>
              <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Context Window (seconds)
                </label>
                <input
                  type="number"
                  value={formData.retake_context_window_seconds}
                  onChange={(e) =>
                    setFormData({ 
                      ...formData, 
                      retake_context_window_seconds: parseInt(e.target.value) || 30 
                    })
                  }
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                  min={10}
                  max={120}
                  step={5}
                />
                <p className="mt-1 text-sm text-gray-500">
                  Pattern detection context window (LLM uses full transcript)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Minimum Confidence
                </label>
                <input
                  type="number"
                  value={formData.retake_min_confidence}
                  onChange={(e) =>
                    setFormData({ 
                      ...formData, 
                      retake_min_confidence: parseFloat(e.target.value) || 0.7 
                    })
                  }
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                  min={0.0}
                  max={1.0}
                  step={0.1}
                />
                <p className="mt-1 text-sm text-gray-500">
                  Required confidence score (0.0-1.0) to accept AI cuts
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="retake_prefer_sentence_boundaries"
                checked={formData.retake_prefer_sentence_boundaries}
                onChange={(e) =>
                  setFormData({ 
                    ...formData, 
                    retake_prefer_sentence_boundaries: e.target.checked 
                  })
                }
                className="w-5 h-5 rounded border-gray-600 bg-gray-900 text-primary-500 focus:ring-primary-500"
              />
              <label htmlFor="retake_prefer_sentence_boundaries" className="text-sm text-gray-300">
                Prefer sentence boundaries for natural cuts
              </label>
            </div>
          </div>
            </div>
          </>
        )}

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="intro_transition"
            checked={formData.intro_transition_enabled}
            onChange={(e) =>
              setFormData({ ...formData, intro_transition_enabled: e.target.checked })
            }
            className="w-5 h-5 rounded border-gray-600 bg-gray-900 text-primary-500 focus:ring-primary-500"
          />
          <label htmlFor="intro_transition" className="text-sm text-gray-300">
            Apply intro transition to processed videos
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Default Language Code
            </label>
            <select
              value={formData.default_language_code}
              onChange={(e) => setFormData({ ...formData, default_language_code: e.target.value })}
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
            >
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="pt">Portuguese</option>
              <option value="it">Italian</option>
              <option value="ja">Japanese</option>
              <option value="ko">Korean</option>
              <option value="zh">Chinese</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Default Location
            </label>
            <select
              value={formData.default_location_code}
              onChange={(e) =>
                setFormData({ ...formData, default_location_code: parseInt(e.target.value) })
              }
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
            >
              <option value={2840}>United States</option>
              <option value={2826}>United Kingdom</option>
              <option value={2124}>Canada</option>
              <option value={2036}>Australia</option>
              <option value={2276}>Germany</option>
              <option value={2250}>France</option>
              <option value={2392}>Japan</option>
              <option value={2076}>Brazil</option>
              <option value={2356}>India</option>
            </select>
          </div>
        </div>
      </div>

      <div className="pt-4">
        <button
          type="submit"
          disabled={saving}
          className="px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-600/50 text-white font-semibold rounded-lg transition-colors"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </form>
  );
}
