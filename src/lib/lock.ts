// src/lib/lock.ts
// Distributed lock via Redis SET NX with auto-expiry.
// Used to serialize reservation attempts on the same (product, warehouse) pair.

import { redis } from "./redis";

const LOCK_TTL_MS = 5_000; // 5 s — enough for one DB transaction

export async function withLock<T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  const lockKey = `lock:${key}`;
  const lockValue = `${Date.now()}-${Math.random()}`;

  // Try to acquire the lock (SET key value NX PX ttl)
  const acquired = await (redis as any).set(lockKey, lockValue, "NX", "PX", LOCK_TTL_MS);

  if (!acquired) {
    throw new LockConflictError(
      "Another request is modifying this inventory right now. Please retry."
    );
  }

  try {
    return await fn();
  } finally {
    // Release only if we still own the lock (Lua script for atomicity)
    const releaseScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    await redis.eval(releaseScript, 1, lockKey, lockValue);
  }
}

export class LockConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LockConflictError";
  }
}