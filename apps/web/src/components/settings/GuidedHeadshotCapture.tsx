"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface CapturedImage {
  file: File;
  url: string;
  poseLabel: string;
  poseBucket: string;
}

interface GuidedHeadshotCaptureProps {
  userId: string;
  onComplete: (files: File[], poseBuckets: string[]) => Promise<void>;
  onCancel: () => void;
  maxHeadshots: number;
  currentHeadshotCount: number;
}

type CaptureState = "setup" | "countdown" | "capturing" | "review";

const POSE_INSTRUCTIONS = [
  {
    instruction: "Turn your head all the way to the LEFT",
    label: "Far Left",
    bucket: "left",
  },
  {
    instruction: "Turn your head slightly to the LEFT",
    label: "Left",
    bucket: "left",
  },
  {
    instruction: "Look STRAIGHT at the camera",
    label: "Center",
    bucket: "front",
  },
  {
    instruction: "Turn your head slightly to the RIGHT",
    label: "Right",
    bucket: "right",
  },
  {
    instruction: "Turn your head all the way to the RIGHT",
    label: "Far Right",
    bucket: "right",
  },
];

export function GuidedHeadshotCapture({
  userId,
  onComplete,
  onCancel,
  maxHeadshots,
  currentHeadshotCount,
}: GuidedHeadshotCaptureProps) {
  const [captureState, setCaptureState] = useState<CaptureState>("setup");
  const [currentPoseIndex, setCurrentPoseIndex] = useState(0);
  const [capturedImages, setCapturedImages] = useState<CapturedImage[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showFlash, setShowFlash] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize camera
  useEffect(() => {
    const initCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Camera access error:", err);
        if (err instanceof Error) {
          if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
            setError("Camera permission denied. Please allow camera access to continue.");
          } else if (err.name === "NotFoundError") {
            setError("No camera found. Please connect a camera and try again.");
          } else {
            setError("Failed to access camera. Please check your device settings.");
          }
        }
      }
    };

    initCamera();

    return () => {
      // Cleanup camera stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (countdownTimerRef.current) {
        clearTimeout(countdownTimerRef.current);
      }
    };
  }, []);


  const captureAllPhotos = useCallback(async () => {
    // Loop through all 5 poses
    for (let poseIndex = 0; poseIndex < POSE_INSTRUCTIONS.length; poseIndex++) {
      setCurrentPoseIndex(poseIndex);
      setCaptureState("countdown");
      
      // Countdown: 3, 2, 1
      for (let i = 3; i > 0; i--) {
        setCountdown(i);
        await new Promise((resolve) => {
          countdownTimerRef.current = setTimeout(resolve, 1000);
        });
      }

      // "Click!" moment
      setCountdown(0);
      await new Promise((resolve) => {
        countdownTimerRef.current = setTimeout(resolve, 500);
      });

      // Capture the image
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      if (!video || !canvas) continue;
      
      const context = canvas.getContext("2d");
      if (!context) continue;

      // Set canvas size to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Draw video frame to canvas
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Show flash effect
      setShowFlash(true);
      setTimeout(() => setShowFlash(false), 200);

      // Convert canvas to blob/file
      const file = await new Promise<File>((resolve) => {
        canvas.toBlob((blob) => {
          if (blob) {
            const timestamp = Date.now();
            const poseInfo = POSE_INSTRUCTIONS[poseIndex];
            const file = new File(
              [blob],
              `headshot-${userId}-${poseInfo.bucket}-${timestamp}.jpg`,
              { type: "image/jpeg" }
            );
            resolve(file);
          }
        }, "image/jpeg", 0.95);
      });
      
      if (file) {
        const poseInfo = POSE_INSTRUCTIONS[poseIndex];
        const imageUrl = URL.createObjectURL(file);
        
        setCapturedImages((prev) => [
          ...prev,
          {
            file,
            url: imageUrl,
            poseLabel: poseInfo.label,
            poseBucket: poseInfo.bucket,
          },
        ]);

        setCaptureState("capturing");
        setCountdown(null);

        // Wait 2 seconds before next pose (except after the last one)
        if (poseIndex < POSE_INSTRUCTIONS.length - 1) {
          await new Promise((resolve) => {
            countdownTimerRef.current = setTimeout(resolve, 2000);
          });
        }
      }
    }

    // All photos captured, move to review
    setCaptureState("review");
    setCountdown(null);
    // Stop camera stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
  }, [userId]);

  const handleStart = () => {
    if (currentHeadshotCount + 5 > maxHeadshots) {
      setError(`Cannot capture 5 new headshots. Maximum is ${maxHeadshots}, you already have ${currentHeadshotCount}.`);
      return;
    }
    captureAllPhotos();
  };

  const handleRetake = async () => {
    // Clear captured images
    capturedImages.forEach((img) => URL.revokeObjectURL(img.url));
    setCapturedImages([]);
    setCurrentPoseIndex(0);
    setCaptureState("setup");

    // Restart camera
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      setError("Failed to restart camera");
    }
  };

  const handleUploadAll = async () => {
    setIsUploading(true);
    try {
      const files = capturedImages.map((img) => img.file);
      const poseBuckets = capturedImages.map((img) => img.poseBucket);
      await onComplete(files, poseBuckets);
      
      // Cleanup
      capturedImages.forEach((img) => URL.revokeObjectURL(img.url));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setIsUploading(false);
    }
  };

  const currentPose = POSE_INSTRUCTIONS[currentPoseIndex];

  if (error) {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white transition-colors"
        >
          Back to Upload
        </button>
      </div>
    );
  }

  if (captureState === "review") {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-white mb-2">Review Your Headshots</h3>
          <p className="text-sm text-gray-400">
            Review the captured images. Click &quot;Upload All&quot; to save them or &quot;Retake&quot; to start over.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {capturedImages.map((image, index) => (
            <div key={index} className="space-y-2">
              <div className="aspect-square relative bg-gray-800 rounded-lg overflow-hidden">
                <img
                  src={image.url}
                  alt={image.poseLabel}
                  className="w-full h-full object-cover"
                />
              </div>
              <p className="text-xs text-center text-gray-400">{image.poseLabel}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleRetake}
            disabled={isUploading}
            className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors"
          >
            Retake All
          </button>
          <button
            onClick={handleUploadAll}
            disabled={isUploading}
            className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors"
          >
            {isUploading ? "Uploading..." : "Upload All"}
          </button>
        </div>

        <button
          onClick={onCancel}
          disabled={isUploading}
          className="w-full px-4 py-2 text-gray-400 hover:text-white transition-colors text-sm"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-2">Guided Headshot Capture</h3>
        <p className="text-sm text-gray-400">
          Follow the on-screen instructions. We&apos;ll automatically capture 5 photos with different head angles.
        </p>
      </div>

      {/* Camera Preview */}
      <div className="relative bg-gray-900 rounded-xl overflow-hidden aspect-video max-w-2xl mx-auto">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover scale-x-[-1]"
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Flash effect */}
        {showFlash && (
          <div className="absolute inset-0 bg-white animate-pulse" />
        )}

        {/* Instruction Overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/60 flex flex-col items-center justify-between p-8">
          {/* Top: Progress */}
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-black/60 rounded-full backdrop-blur-sm">
              <span className="text-white text-sm font-medium">
                Photo {currentPoseIndex + 1} of 5
              </span>
            </div>
          </div>

          {/* Center: Countdown or Instruction */}
          <div className="text-center">
            {countdown !== null ? (
              <div className="text-white text-8xl font-bold animate-pulse">
                {countdown === 0 ? "Click!" : countdown}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-white text-2xl md:text-3xl font-bold px-4 py-3 bg-black/60 rounded-lg backdrop-blur-sm">
                  {currentPose.instruction}
                </div>
                {captureState === "setup" && capturedImages.length === 0 && (
                  <button
                    onClick={handleStart}
                    className="px-8 py-4 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-semibold text-lg transition-colors shadow-lg"
                  >
                    Start Capture
                  </button>
                )}
                {captureState === "capturing" && (
                  <div className="text-white text-lg">
                    Get ready for the next pose...
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom: Captured thumbnails */}
          {capturedImages.length > 0 && (
            <div className="flex gap-2 justify-center">
              {capturedImages.map((image, index) => (
                <div
                  key={index}
                  className="w-12 h-12 rounded-lg overflow-hidden border-2 border-green-500 bg-gray-800"
                >
                  <img
                    src={image.url}
                    alt={`Captured ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
              {/* Empty slots */}
              {Array.from({ length: 5 - capturedImages.length }).map((_, index) => (
                <div
                  key={`empty-${index}`}
                  className="w-12 h-12 rounded-lg border-2 border-gray-600 bg-gray-800/50"
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <button
        onClick={onCancel}
        className="w-full px-4 py-2 text-gray-400 hover:text-white transition-colors text-sm"
      >
        Cancel
      </button>
    </div>
  );
}


