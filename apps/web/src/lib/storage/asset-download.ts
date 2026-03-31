type AssetLike = {
  path: string;
  type: string;
  metadata: unknown;
};

function sanitizeFilename(filename: string): string {
  return filename.replace(/[/\\?%*:|"<>]/g, "_").trim();
}

export function deriveAssetDownloadFilename(asset: AssetLike): string {
  const metadata =
    asset.metadata && typeof asset.metadata === "object" && !Array.isArray(asset.metadata)
      ? (asset.metadata as { filename?: string })
      : null;

  if (metadata?.filename) {
    const sanitized = sanitizeFilename(metadata.filename);
    if (sanitized) {
      return sanitized;
    }
  }

  const pathFilename = asset.path.split("/").pop();
  if (pathFilename) {
    const sanitized = sanitizeFilename(pathFilename);
    if (sanitized) {
      return sanitized;
    }
  }

  return `${asset.type || "asset"}.bin`;
}

export function buildAttachmentDisposition(filename: string): string {
  const fallback = filename.replace(/["\\]/g, "_") || "download.bin";
  const encoded = encodeURIComponent(filename || "download.bin");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
