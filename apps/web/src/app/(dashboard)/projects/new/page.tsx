import { Suspense } from "react";
import { NewProjectClient } from "./NewProjectClient";

export default function NewProjectPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-xl mx-auto py-12 text-center">
          <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full mx-auto" />
          <p className="text-gray-400 mt-4">Loading…</p>
        </div>
      }
    >
      <NewProjectClient />
    </Suspense>
  );
}

