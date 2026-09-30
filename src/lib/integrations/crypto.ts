import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Cifra os tokens das integrações antes de irem ao banco (AES-256-GCM).
// INTEGRATIONS_KEY: 32 bytes em base64 (openssl rand -base64 32).
function key() {
  const raw = process.env.INTEGRATIONS_KEY;
  if (!raw) return null;
  const k = Buffer.from(raw, "base64");
  return k.length === 32 ? k : null;
}

export const canSeal = () => key() !== null;

export function seal(data: unknown): string {
  const k = key();
  if (!k) throw new Error("INTEGRATIONS_KEY ausente ou inválida");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), body].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function unseal<T>(sealed: string): T {
  const k = key();
  if (!k) throw new Error("INTEGRATIONS_KEY ausente ou inválida");
  const [v, iv, tag, body] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !body) throw new Error("segredo em formato desconhecido");
  const decipher = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const text = Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  return JSON.parse(text) as T;
}
