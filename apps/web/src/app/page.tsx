import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <div className="container mx-auto px-4 py-16">
        <header className="text-center mb-16">
          <h1 className="text-5xl font-bold text-white mb-4 tracking-tight">
            YouTube Production Assistant
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Research video ideas, automatically edit talking-head videos, and
            generate AI-powered thumbnails — all in one workflow.
          </p>
        </header>

        <div className="flex justify-center gap-4 mb-16">
          <Link
            href="/login"
            className="px-8 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors"
          >
            Get Started
          </Link>
          <Link
            href="/login"
            className="px-8 py-3 border border-gray-600 hover:border-gray-500 text-gray-300 font-semibold rounded-lg transition-colors"
          >
            Sign In
          </Link>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <FeatureCard
            title="Smart Research"
            description="Find outlier videos in your niche and cross-niche using DataForSEO. Get AI-powered idea synthesis."
            icon="🔍"
          />
          <FeatureCard
            title="Auto Edit"
            description="Upload raw footage and get silence removed, intro transitions applied, and transcripts generated."
            icon="✂️"
          />
          <FeatureCard
            title="AI Thumbnails"
            description="Generate thumbnail variants using your headshots and reference images with Nano Banana Pro."
            icon="🎨"
          />
        </div>
      </div>
    </div>
  );
}

function FeatureCard({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: string;
}) {
  return (
    <div className="p-6 bg-gray-800/50 border border-gray-700 rounded-xl hover:border-gray-600 transition-colors">
      <div className="text-4xl mb-4">{icon}</div>
      <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
      <p className="text-gray-400">{description}</p>
    </div>
  );
}

