import { createServiceClient } from "@/lib/supabase/service";
import { MAX_VIDEO_FILE_SIZE_BYTES, RAW_VIDEO_BUCKET } from "@/lib/storage/constants";

type BucketRecord = {
  public?: boolean | null;
  file_size_limit?: number | string | null;
  fileSizeLimit?: number | string | null;
  allowed_mime_types?: string[] | null;
  allowedMimeTypes?: string[] | null;
};

function normalizeStorageLimitError(message: string): string {
  if (/exceeded the maximum allowed size/i.test(message)) {
    return "The storage backend global file size limit is lower than 2GB. Increase the Supabase Storage global limit first, then retry. On self-hosted Supabase this is the storage service FILE_SIZE_LIMIT setting.";
  }

  return message;
}

function readFileSizeLimit(bucket: BucketRecord): number {
  const rawValue = bucket.file_size_limit ?? bucket.fileSizeLimit ?? 0;
  return typeof rawValue === "string" ? Number(rawValue) : (rawValue ?? 0);
}

function readAllowedMimeTypes(bucket: BucketRecord): string[] | null {
  if (Array.isArray(bucket.allowed_mime_types)) {
    return bucket.allowed_mime_types;
  }

  if (Array.isArray(bucket.allowedMimeTypes)) {
    return bucket.allowedMimeTypes;
  }

  return null;
}

export async function ensureRawVideoBucketReady() {
  const supabase = await createServiceClient();
  const desiredConfig = {
    public: false,
    fileSizeLimit: MAX_VIDEO_FILE_SIZE_BYTES,
    allowedMimeTypes: null as string[] | null,
  };

  const { data, error } = await supabase.storage.getBucket(RAW_VIDEO_BUCKET);

  if (error) {
    if (!/not found/i.test(error.message)) {
      throw new Error(`Failed to inspect ${RAW_VIDEO_BUCKET}: ${error.message}`);
    }

    const { error: createError } = await supabase.storage.createBucket(
      RAW_VIDEO_BUCKET,
      desiredConfig
    );

    if (createError && !/already exists/i.test(createError.message)) {
      throw new Error(
        `Failed to create ${RAW_VIDEO_BUCKET}: ${normalizeStorageLimitError(createError.message)}`
      );
    }

    return;
  }

  const bucket = (data ?? {}) as BucketRecord;
  const currentLimit = readFileSizeLimit(bucket);
  const currentMimeTypes = readAllowedMimeTypes(bucket);
  const needsUpdate =
    bucket.public !== false ||
    currentLimit < MAX_VIDEO_FILE_SIZE_BYTES ||
    (Array.isArray(currentMimeTypes) && currentMimeTypes.length > 0);

  if (!needsUpdate) {
    return;
  }

  const { error: updateError } = await supabase.storage.updateBucket(
    RAW_VIDEO_BUCKET,
    desiredConfig
  );

  if (updateError) {
    throw new Error(
      `Failed to update ${RAW_VIDEO_BUCKET}: ${normalizeStorageLimitError(updateError.message)}`
    );
  }
}
