"use client";

import { useEffect } from "react";
import Image from "next/image";

interface ThumbnailModalProps {
  imageUrl: string;
  imageName?: string;
  onClose: () => void;
}

export function ThumbnailModal({ imageUrl, imageName, onClose }: ThumbnailModalProps) {
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, []);

  const handleDownload = () => {
    // Create a temporary anchor element to trigger download
    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = imageName || `thumbnail_${Date.now()}.png`;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-w-6xl max-h-[90vh] w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 p-2 text-white hover:text-gray-300 transition-colors"
          title="Close (Esc)"
        >
          <svg
            className="w-8 h-8"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {/* Download Button */}
        <button
          onClick={handleDownload}
          className="absolute -top-12 right-12 p-2 text-white hover:text-gray-300 transition-colors"
          title="Download"
        >
          <svg
            className="w-8 h-8"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
        </button>

        {/* Image */}
        <div className="relative bg-gray-900 rounded-lg overflow-hidden shadow-2xl">
          <div className="relative aspect-video w-full">
            <Image
              src={imageUrl}
              alt="Thumbnail preview"
              fill
              className="object-contain"
              unoptimized
              priority
            />
          </div>
        </div>

        {/* Image Name (if provided) */}
        {imageName && (
          <div className="mt-4 text-center text-sm text-gray-400">
            {imageName}
          </div>
        )}
      </div>
    </div>
  );
}

