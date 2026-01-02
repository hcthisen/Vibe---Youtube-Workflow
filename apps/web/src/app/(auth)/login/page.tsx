import { Suspense } from "react";
import { LoginClient } from "./LoginClient";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center px-4">
          <div className="w-full max-w-md">
            <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-8 text-center text-gray-400">
              Loading…
            </div>
          </div>
        </div>
      }
    >
      <LoginClient />
    </Suspense>
  );
}

