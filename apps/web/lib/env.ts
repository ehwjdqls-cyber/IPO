import "server-only";
import { parsePublicEnv, parseServerEnv, type PublicEnv, type ServerEnv } from "@ipo/contracts";

let cachedServerEnv: ServerEnv | undefined;
let cachedPublicEnv: PublicEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (!cachedServerEnv) {
    cachedServerEnv = parseServerEnv(process.env);
  }
  return cachedServerEnv;
}

export function getPublicEnv(): PublicEnv {
  if (!cachedPublicEnv) {
    cachedPublicEnv = parsePublicEnv(process.env);
  }
  return cachedPublicEnv;
}
