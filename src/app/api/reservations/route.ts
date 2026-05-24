// src/app/api/reservations/route.ts
//
// Concurrency strategy:
//   1. Acquire a Redis distributed lock on `(productId, warehouseId)`.
//      Only one request per SKU pair can proceed at a time.
//   2. Inside the lock, run a Postgres transaction that:
//      a. Reads the Stock row with SELECT ... FOR UPDATE (row-level lock).
//      b. Checks available = total - reserved >= quantity.
//      c. Increments reserved and creates the Reservation atomically.
//   This double-lock (Redis + PG row lock) gives us correctness even if
//   Redis is temporarily unavailable — the PG FOR UPDATE alone prevents
//   double-spends within a single DB instance.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withLock, LockConflictError } from "@/lib/lock";
import { withIdempotency } from "@/lib/idempotency";
import { ReserveSchema } from "@/lib/schemas";
import type { ReservationResponse } from "@/lib/schemas";

export const dynamic = "force-dynamic";

const RESERVATION_TTL_MINUTES = 10;

type CreateReservationResponse =
  | {
      status: 201;
      body: ReservationResponse;
    }
  | {
      status: 404;
      body: { error: string };
    }
  | {
      status: 409;
      body: { error: string };
    };

export async function GET() {
  try {
    const reservations = await prisma.reservation.findMany({
      include: { product: true, warehouse: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json(
      reservations.map(formatReservation)
    );
  } catch (err) {
    console.error("[GET /api/reservations]", err);
    return NextResponse.json({ error: "Failed to fetch reservations" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = ReserveSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const { productId, warehouseId, quantity } = parsed.data;
    const idempotencyKey = req.headers.get("Idempotency-Key");

    const { status, body: responseBody, cached } = await withIdempotency(
      idempotencyKey,
      async (): Promise<CreateReservationResponse> => {
        const lockKey = `stock:${productId}:${warehouseId}`;

        try {
          const reservation = await withLock(lockKey, async () => {
            // Use a raw transaction with FOR UPDATE to lock the stock row
            const result = await prisma.$transaction(async (tx: any) => {
              // Lock the stock row for this SKU
              const stocks = await tx.$queryRaw<
                Array<{
                  id: string;
                  total: number;
                  reserved: number;
                  productId: string;
                  warehouseId: string;
                }>
              >`
                SELECT id, total, reserved, "productId", "warehouseId"
                FROM "Stock"
                WHERE "productId" = ${productId}
                  AND "warehouseId" = ${warehouseId}
                FOR UPDATE
              `;

              const stock = stocks[0];

              if (!stock) {
                return { error: "Product not found in this warehouse", status: 404 };
              }

              const available = stock.total - stock.reserved;
              if (available < quantity) {
                return {
                  error: `Not enough stock. Requested: ${quantity}, available: ${available}`,
                  status: 409,
                };
              }

              // Increment reserved
              await tx.stock.update({
                where: { id: stock.id },
                data: { reserved: { increment: quantity } },
              });

              // Create the reservation
              const expiresAt = new Date(
                Date.now() + RESERVATION_TTL_MINUTES * 60 * 1000
              );

              const reservation = await tx.reservation.create({
                data: {
                  productId,
                  warehouseId,
                  quantity,
                  expiresAt,
                  status: "PENDING",
                },
                include: { product: true, warehouse: true },
              });

              return { reservation };
            });

            return result;
          });

          if ("error" in reservation) {
            return {
              status: reservation.status as 404 | 409,
              body: { error: reservation.error ?? "Request failed" },
            };
          }

          return {
            status: 201,
            body: formatReservation(reservation.reservation),
          };
        } catch (err) {
          if (err instanceof LockConflictError) {
            return {
              status: 409,
              body: { error: "Request conflict — please retry in a moment." },
            };
          }
          throw err;
        }
      }
    );

    const headers: Record<string, string> = {};
    if (cached) headers["X-Idempotent-Replay"] = "true";

    return NextResponse.json(responseBody, { status, headers });
  } catch (err) {
    console.error("[POST /api/reservations]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function formatReservation(r: {
  id: string;
  productId: string;
  product: { name: string };
  warehouseId: string;
  warehouse: { name: string };
  quantity: number;
  status: string;
  expiresAt: Date;
  createdAt: Date;
}): ReservationResponse {
  return {
    id: r.id,
    productId: r.productId,
    productName: r.product.name,
    warehouseId: r.warehouseId,
    warehouseName: r.warehouse.name,
    quantity: r.quantity,
    status: r.status as ReservationResponse["status"],
    expiresAt: r.expiresAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
  };
}
