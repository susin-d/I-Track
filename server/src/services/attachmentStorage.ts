import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";

export type AttachmentStorage = {
  put: (key: string, data: Buffer, mimeType: string) => Promise<void>;
  get: (key: string) => Promise<{ body: AsyncIterable<Uint8Array>; contentType?: string } | null>;
  remove: (key: string) => Promise<void>;
};

function localPath(key: string) {
  return path.resolve(process.cwd(), env.attachmentStorageDir, key);
}

const localStorage: AttachmentStorage = {
  async put(key, data) { const target = localPath(key); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, data); },
  async get(key) { try { const data = await fs.readFile(localPath(key)); return { body: (async function* () { yield data; })() }; } catch { return null; } },
  async remove(key) { await fs.rm(localPath(key), { force: true }); },
};

function s3Storage(): AttachmentStorage {
  if (!env.s3Bucket || !env.s3AccessKeyId || !env.s3SecretAccessKey) throw new Error("S3 attachment storage is not configured");
  const client = new S3Client({ region: env.s3Region, endpoint: env.s3Endpoint, forcePathStyle: Boolean(env.s3Endpoint), credentials: { accessKeyId: env.s3AccessKeyId, secretAccessKey: env.s3SecretAccessKey } });
  return {
    async put(key, data, mimeType) { await client.send(new PutObjectCommand({ Bucket: env.s3Bucket, Key: key, Body: data, ContentType: mimeType })); },
    async get(key) { const result = await client.send(new GetObjectCommand({ Bucket: env.s3Bucket, Key: key })); return result.Body ? { body: result.Body as AsyncIterable<Uint8Array>, contentType: result.ContentType } : null; },
    async remove(key) { await client.send(new DeleteObjectCommand({ Bucket: env.s3Bucket, Key: key })); },
  };
}

export function attachmentStorage() { return env.attachmentStorageProvider === "s3" ? s3Storage() : localStorage; }
