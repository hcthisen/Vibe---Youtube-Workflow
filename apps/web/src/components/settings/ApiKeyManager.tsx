"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ApiKey {
  id: string;
  key_prefix: string;
  name: string;
  last_used_at: string | null;
  created_at: string;
}

interface ApiKeyManagerProps {
  apiKeys: ApiKey[];
}

export function ApiKeyManager({ apiKeys: initialKeys }: ApiKeyManagerProps) {
  const router = useRouter();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>(initialKeys);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState("claude-code");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const createKey = async () => {
    setCreating(true);
    setMessage(null);
    setRevealedKey(null);

    try {
      const res = await fetch("/api/v1/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName }),
      });
      const data = await res.json();

      if (!data.success) {
        setMessage({ type: "error", text: data.error || "Failed to create key" });
        return;
      }

      setRevealedKey(data.data.key);
      setMessage({
        type: "success",
        text: "API key created. Copy it now — it won't be shown again.",
      });
      setNewKeyName("claude-code");
      router.refresh();

      // Refresh the key list
      const listRes = await fetch("/api/v1/keys");
      const listData = await listRes.json();
      if (listData.success) setApiKeys(listData.data.keys);
    } catch {
      setMessage({ type: "error", text: "Failed to create API key" });
    } finally {
      setCreating(false);
    }
  };

  const revokeKey = async (id: string) => {
    setRevoking(id);
    setMessage(null);

    try {
      const res = await fetch(`/api/v1/keys/${id}`, { method: "DELETE" });
      const data = await res.json();

      if (!data.success) {
        setMessage({ type: "error", text: data.error || "Failed to revoke key" });
        return;
      }

      setApiKeys((prev) => prev.filter((k) => k.id !== id));
      setMessage({ type: "success", text: "API key revoked." });
      if (revealedKey) setRevealedKey(null);
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Failed to revoke key" });
    } finally {
      setRevoking(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setMessage({ type: "success", text: "Copied to clipboard!" });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">API Keys</h2>
        <p className="text-sm text-gray-400 mt-1">
          Generate API keys to access your workspace programmatically — for
          example, from Claude Code in the terminal.
        </p>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`p-3 rounded-lg text-sm ${
            message.type === "success"
              ? "bg-accent-500/10 border border-accent-500/20 text-accent-400"
              : "bg-red-500/10 border border-red-500/20 text-red-400"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Revealed key */}
      {revealedKey && (
        <div className="p-4 bg-gray-900 border border-primary-500/30 rounded-lg space-y-3">
          <p className="text-sm font-medium text-primary-400">
            Your new API key (shown once):
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 bg-gray-950 rounded text-sm text-white font-mono break-all select-all">
              {revealedKey}
            </code>
            <button
              onClick={() => copyToClipboard(revealedKey)}
              className="px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm rounded-lg transition-colors shrink-0"
            >
              Copy
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Use as: <code className="text-gray-400">Authorization: Bearer {revealedKey.slice(0, 12)}...</code>
          </p>
        </div>
      )}

      {/* Create new key */}
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Key name
          </label>
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="e.g. claude-code"
            className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
          />
        </div>
        <button
          onClick={createKey}
          disabled={creating || !newKeyName.trim()}
          className="px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-600/50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
        >
          {creating ? "Creating..." : "Generate Key"}
        </button>
      </div>

      {/* Existing keys */}
      {apiKeys.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-300">Active Keys</h3>
          <div className="space-y-2">
            {apiKeys.map((key) => (
              <div
                key={key.id}
                className="flex items-center justify-between px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg"
              >
                <div className="flex items-center gap-4">
                  <code className="text-sm text-gray-300 font-mono">
                    {key.key_prefix}...
                  </code>
                  <span className="text-sm text-gray-400">{key.name}</span>
                  <span className="text-xs text-gray-500">
                    {key.last_used_at
                      ? `Last used ${new Date(key.last_used_at).toLocaleDateString()}`
                      : "Never used"}
                  </span>
                </div>
                <button
                  onClick={() => revokeKey(key.id)}
                  disabled={revoking === key.id}
                  className="px-3 py-1 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors disabled:opacity-50"
                >
                  {revoking === key.id ? "Revoking..." : "Revoke"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {apiKeys.length === 0 && !revealedKey && (
        <div className="py-8 text-center text-gray-500 text-sm">
          No API keys yet. Generate one to get started.
        </div>
      )}

      {/* Usage hint */}
      <div className="border-t border-gray-700 pt-4">
        <p className="text-xs text-gray-500">
          API docs available at <code className="text-gray-400">/API.md</code> in the repo.
          All endpoints live under <code className="text-gray-400">/api/v1/</code> and
          require <code className="text-gray-400">Authorization: Bearer vibe_...</code>
        </p>
      </div>
    </div>
  );
}
