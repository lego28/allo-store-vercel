// src/lib/expiry.ts
// Releases all PENDING reservations that have passed their expiresAt.
// Called by the Vercel Cron job (GET /api/cron/expire) and also
// lazily before any availability read so the UI is always fresh.

import { prisma } from "./prisma";

export async function releaseExpiredReservations(): Promise<number> {
  const now = new Date();

  // Find all expired pending reservations
  const expired = await prisma.reservation.findMany({
    where: {
      status: "PENDING",
      expiresAt: { lte: now },
    },
    select: {
      id: true,
      productId: true,
      warehouseId: true,
      quantity: true,
    },
  });

  if (expired.length === 0) return 0;

  // For each expired reservation, update status + decrement reserved count atomically
  await prisma.$transaction(
    expired.map((r: any) =>
      prisma.$executeRaw`
        UPDATE "Reservation"
        SET status = 'RELEASED', "updatedAt" = NOW()
        WHERE id = ${r.id} AND status = 'PENDING'
      `
    )
  );

  // Decrement reserved counts on Stock rows (only for the ones we actually released)
  // We do this per (product, warehouse) pair, aggregated
  const grouped = new Map<string, { productId: string; warehouseId: string; qty: number }>();
  for (const r of expired) {
    const k = `${r.productId}:${r.warehouseId}`;
    const existing = grouped.get(k);
    if (existing) {
      existing.qty += r.quantity;
    } else {
      grouped.set(k, { productId: r.productId, warehouseId: r.warehouseId, qty: r.quantity });
    }
  }

  await prisma.$transaction(
    Array.from(grouped.values()).map(({ productId, warehouseId, qty }) =>
      prisma.stock.updateMany({
        where: { productId, warehouseId },
        data: { reserved: { decrement: qty } },
      })
    )
  );

  console.log(`[expiry] Released ${expired.length} expired reservation(s)`);
  return expired.length;
}