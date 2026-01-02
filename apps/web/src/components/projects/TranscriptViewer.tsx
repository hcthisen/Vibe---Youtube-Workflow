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
}

export function TranscriptViewer({ asset }: TranscriptViewerProps) {
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"full" | "segments">("full");

  const supabase = createClient();

  useEffect(() => {
    loadTranscript();
  }, [asset.id]);

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
    </div>
  );
}

