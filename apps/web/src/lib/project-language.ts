export const DEFAULT_PROJECT_LANGUAGE_CODE = "en";

export const PROJECT_LANGUAGE_OPTIONS = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "es", label: "Spanish", nativeLabel: "Espanol" },
  { code: "fr", label: "French", nativeLabel: "Francais" },
  { code: "de", label: "German", nativeLabel: "Deutsch" },
  { code: "da", label: "Danish", nativeLabel: "Dansk" },
] as const;

export type ProjectLanguageCode = (typeof PROJECT_LANGUAGE_OPTIONS)[number]["code"];

export function normalizeProjectLanguageCode(
  value: string | null | undefined
): ProjectLanguageCode {
  const normalized = value?.trim().toLowerCase();
  const match = PROJECT_LANGUAGE_OPTIONS.find((option) => option.code === normalized);
  return match?.code ?? DEFAULT_PROJECT_LANGUAGE_CODE;
}

export function getProjectLanguage(
  value: string | null | undefined
): (typeof PROJECT_LANGUAGE_OPTIONS)[number] {
  const code = normalizeProjectLanguageCode(value);
  return (
    PROJECT_LANGUAGE_OPTIONS.find((option) => option.code === code) ??
    PROJECT_LANGUAGE_OPTIONS[0]
  );
}

export function getProjectLanguageName(value: string | null | undefined): string {
  return getProjectLanguage(value).label;
}
