import "server-only";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getServerEnv } from "./env";

let client: S3Client | undefined;

/**
 * S3-compatible client pointed at whatever OBJECT_STORAGE_* points to
 * (Supabase Storage's S3 connection for now -- see packages/db README-style
 * rationale in the M2 plan: no new external account needed). forcePathStyle
 * is required for S3-compatible providers that aren't AWS itself.
 */
function getClient(): S3Client {
  if (!client) {
    const env = getServerEnv();
    client = new S3Client({
      endpoint: env.OBJECT_STORAGE_ENDPOINT,
      region: env.OBJECT_STORAGE_REGION,
      credentials: {
        accessKeyId: env.OBJECT_STORAGE_ACCESS_KEY_ID,
        secretAccessKey: env.OBJECT_STORAGE_SECRET_ACCESS_KEY,
      },
      forcePathStyle: true,
    });
  }
  return client;
}

/**
 * Generates a short-lived presigned PUT URL (default 5 minutes, per spec
 * section 32's threat model: "Presigned URL 유출 -> 5분 TTL, 단일 object").
 * This is a local signing operation (no network call), so it's safe and
 * meaningful to unit test without a real object storage account.
 */
export async function createPresignedUploadUrl(
  storageKey: string,
  contentType: string,
  expiresInSeconds = 300
): Promise<string> {
  const env = getServerEnv();
  const command = new PutObjectCommand({
    Bucket: env.OBJECT_STORAGE_BUCKET,
    Key: storageKey,
    ContentType: contentType,
  });
  return getSignedUrl(getClient(), command, { expiresIn: expiresInSeconds });
}
