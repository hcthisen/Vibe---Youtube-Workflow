"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

interface Asset {
  id: string;
  bucket: string;
  path: string;
  metadata: unknown;
}

interface TranscriptSegment {
  start_ms: number;
  end_ms: number;
  text: string;
}

interface Transcript {
  segments: TranscriptSegment[];
  full_text: string;
  language: string;
}

interface WordLevelTranscript {
  word: string;
  start: number;
  end: number;
}

interface TranscriptViewerProps {
  asset: Asset;
  projectId: string;
  initialDescription?: string | null;
}

export function TranscriptViewer({ asset, projectId, initialDescription }: TranscriptViewerProps) {
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"full" | "segments">("full");
  const [description, setDescription] = useState<string>(initialDescription || "");
  const [draftDescription, setDraftDescription] = useState<string>(initialDescription || "");
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [descriptionLoading, setDescriptionLoading] = useState(false);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    loadTranscript();
  }, [asset.id]);

  useEffect(() => {
    setDescription(initialDescription || "");
    setDraftDescription(initialDescription || "");
  }, [initialDescription]);

  const convertWordLevelToSegments = (words: WordLevelTranscript[]): Transcript => {
    const segments: TranscriptSegment[] = [];
    let currentSegment: TranscriptSegment | null = null;
    const segmentGap = 1.0; // 1 second gap creates new segment
    
    for (const word of words) {
      const startMs = Math.floor(word.start * 1000);
      const endMs = Math.floor(word.end * 1000);
      
      if (!currentSegment || (word.start - currentSegment.end_ms / 1000) > segmentGap) {
        // Start new segment
        if (currentSegment) segments.push(currentSegment);
        currentSegment = {
          start_ms: startMs,
          end_ms: endMs,
          text: word.word
        };
      } else {
        // Append to current segment
        currentSegment.text += " " + word.word;
        currentSegment.end_ms = endMs;
      }
    }
    
    if (currentSegment) segments.push(currentSegment);
    
    return {
      segments,
      full_text: words.map(w => w.word).join(" "),
      language: "en"
    };
  };

  const loadTranscript = async () => {
    try {
      const { data } = await supabase.storage.from(asset.bucket).download(asset.path);

      if (data) {
        const text = await data.text();
        const parsed = JSON.parse(text);
        
        // Check if it's word-level format (array of {word, start, end})
        if (Array.isArray(parsed) && parsed.length > 0 && 'word' in parsed[0]) {
          // Convert word-level format to segment format
          const converted = convertWordLevelToSegments(parsed);
          setTranscript(converted);
        } else if (parsed.segments && parsed.full_text) {
          // Already in segment format
          setTranscript(parsed);
        } else {
          console.error("Unknown transcript format:", parsed);
          setTranscript(null);
        }
      }
    } catch (error) {
      console.error("Failed to load transcript:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full mx-auto" />
        <p className="text-gray-400 mt-2">Loading transcript...</p>
      </div>
    );
  }

  if (!transcript) {
    return (
      <div className="text-center py-8 text-gray-400">
        Failed to load transcript
      </div>
    );
  }

  const handleGenerateDescription = async () => {
    setDescriptionLoading(true);
    setDescriptionError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/youtube-description`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: transcript.full_text }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to generate description");
      }

      const nextDescription = result.description || "";
      setDescription(nextDescription);
      setDraftDescription(nextDescription);
      setIsEditingDescription(false);
    } catch (error) {
      setDescriptionError(error instanceof Error ? error.message : "Failed to generate description");
    } finally {
      setDescriptionLoading(false);
    }
  };

  const handleSaveDescription = async () => {
    setDescriptionLoading(true);
    setDescriptionError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/youtube-description`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: draftDescription }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to save description");
      }

      const nextDescription = result.description || "";
      setDescription(nextDescription);
      setDraftDescription(nextDescription);
      setIsEditingDescription(false);
    } catch (error) {
      setDescriptionError(error instanceof Error ? error.message : "Failed to save description");
    } finally {
      setDescriptionLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Transcript</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setView("full")}
            className={`px-3 py-1 text-sm rounded transition-colors ${
              view === "full"
                ? "bg-primary-600 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Full Text
          </button>
          <button
            onClick={() => setView("segments")}
            className={`px-3 py-1 text-sm rounded transition-colors ${
              view === "segments"
                ? "bg-primary-600 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Timestamps
          </button>
        </div>
      </div>

      <div className="text-xs text-gray-500">
        Language: {transcript.language}
      </div>

      {view === "full" ? (
        <div className="bg-gray-900 rounded-lg p-4 max-h-96 overflow-y-auto">
          <p className="text-gray-300 whitespace-pre-wrap leading-relaxed">
            {transcript.full_text}
          </p>
        </div>
      ) : (
        <div className="bg-gray-900 rounded-lg max-h-96 overflow-y-auto divide-y divide-gray-800">
          {transcript.segments.map((segment, i) => (
            <div key={i} className="flex gap-4 p-3 hover:bg-gray-800/50">
              <span className="text-xs text-gray-500 font-mono whitespace-nowrap">
                {formatTime(segment.start_ms)}
              </span>
              <p className="text-gray-300 text-sm">{segment.text}</p>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => {
          navigator.clipboard.writeText(transcript.full_text);
        }}
        className="text-sm text-gray-400 hover:text-white transition-colors"
      >
        Copy transcript
      </button>

      <div className="border-t border-gray-700 pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-md font-semibold text-white">Generate YouTube Description</h3>
          <div className="flex items-center gap-3">
            {isEditingDescription ? (
              <>
                <button
                  onClick={handleSaveDescription}
                  disabled={descriptionLoading}
                  className="px-3 py-1 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  {descriptionLoading ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={() => {
                    setDraftDescription(description);
                    setIsEditingDescription(false);
                    setDescriptionError(null);
                  }}
                  disabled={descriptionLoading}
                  className="px-3 py-1 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                {description && (
                  <button
                    onClick={() => {
                      setDraftDescription(description);
                      setIsEditingDescription(true);
                      setDescriptionError(null);
                    }}
                    disabled={descriptionLoading}
                    className="px-3 py-1 text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    Edit
                  </button>
                )}
                <button
                  onClick={handleGenerateDescription}
                  disabled={descriptionLoading}
                  className="px-3 py-1 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  {descriptionLoading ? "Generating..." : description ? "Regenerate" : "Generate"}
                </button>
              </>
            )}
          </div>
        </div>

        {descriptionError && (
          <p className="text-red-400 text-sm">{descriptionError}</p>
        )}

        {description || isEditingDescription ? (
          <div className="bg-gray-900 rounded-lg p-4">
            {isEditingDescription ? (
              <textarea
                value={draftDescription}
                onChange={(event) => setDraftDescription(event.target.value)}
                rows={6}
                className="w-full bg-transparent text-gray-300 text-sm leading-relaxed outline-none resize-y"
              />
            ) : (
              <p className="text-gray-300 whitespace-pre-wrap leading-relaxed">
                {description}
              </p>
            )}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">
            Generate a short YouTube description based on the transcript.
          </p>
        )}

        {description && !isEditingDescription && (
          <button
            onClick={() => {
              navigator.clipboard.writeText(description);
            }}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Copy description
          </button>
        )}
      </div>
    </div>
  );
}

