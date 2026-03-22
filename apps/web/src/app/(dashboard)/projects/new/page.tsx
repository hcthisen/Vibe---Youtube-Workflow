import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { normalizeProjectLanguageCode } from "@/lib/project-language";
import { NewProjectClient } from "./NewProjectClient";

export default async function NewProjectPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let defaultLanguageCode = "en";

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("default_language_code")
      .eq("id", user.id)
      .single();

    defaultLanguageCode = normalizeProjectLanguageCode(profile?.default_language_code);
  }

  return (
    <Suspense
      fallback={
        <div className="max-w-xl mx-auto py-12 text-center">
          <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full mx-auto" />
          <p className="text-gray-400 mt-4">Loading…</p>
        </div>
      }
    >
      <NewProjectClient defaultLanguageCode={defaultLanguageCode} />
    </Suspense>
  );
}
