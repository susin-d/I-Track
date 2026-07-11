import crypto from "node:crypto";

export const hashSha256 = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");

export const randomBase64UrlToken = (bytes = 32) =>
  crypto.randomBytes(bytes).toString("base64url");
