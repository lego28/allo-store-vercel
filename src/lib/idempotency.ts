// src/lib/idempotency.ts
// Bonus: idempotency key support.
// On first call: run fn(), store result, return it.
// On retry with same key: return stored result without side effects.

import { prisma } from "./prisma";

type IdempotentResponse = {
  status: number;
  body: object;
};

export async function withIdempotency<R extends IdempotentResponse>(
  idempotencyKey: string | null | undefined,
  fn: () => Promise<R>
): Promise<R & { cached: boolean }> {
  if (!idempotencyKey) {
    const result = await fn();
    return { ...result, cached: false } as R & { cached: boolean };
  }

  // Check for existing record
  const existing = await prisma.idempotencyRecord.findUnique({
    where: { key: idempotencyKey },
  });

  if (existing) {
    return {
      status: existing.responseStatus,
      body: existing.responseBody as R["body"],
      cached: true,
    } as R & { cached: boolean };
  }

  // Execute the operation
  const result = await fn();

  // Store the result (ignore duplicate key races — first writer wins)
  try {
    await prisma.idempotencyRecord.create({
      data: {
        key: idempotencyKey,
        responseBody: result.body,
        responseStatus: result.status,
      },
    });
  } catch {
    // Unique constraint violation: another concurrent request stored it first.
    // Re-fetch and return that result.
    const stored = await prisma.idempotencyRecord.findUnique({
      where: { key: idempotencyKey },
    });
    if (stored) {
      return {
        status: stored.responseStatus,
        body: stored.responseBody as R["body"],
        cached: true,
      } as R & { cached: boolean };
    }
  }

  return { ...result, cached: false } as R & { cached: boolean };
}