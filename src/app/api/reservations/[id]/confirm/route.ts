// src/app/api/reservations/[id]/confirm/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withIdempotency } from "@/lib/idempotency";

export const dynamic = "force-dynamic";

type ConfirmReservationPayload = ReturnType<typeof formatReservation>;

type ConfirmResponse =
  | {
      status: number;
      body: {
        error: string;
      };
    }
  | {
      status: number;
      body: {
        message: string;
        reservation: ConfirmReservationPayload;
      };
    };

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const idempotencyKey = req.headers.get("Idempotency-Key");

  try {
    const { status, body, cached } = await withIdempotency(
      idempotencyKey,
      async (): Promise<ConfirmResponse> => {
        const reservation = await prisma.reservation.findUnique({
          where: { id },
          include: { product: true, warehouse: true },
        });

        if (!reservation) {
          return { status: 404, body: { error: "Reservation not found" } };
        }

        if (reservation.status === "CONFIRMED") {
          return {
            status: 200,
            body: { message: "Already confirmed", reservation: formatReservation(reservation) },
          };
        }

        if (reservation.status === "RELEASED") {
          return {
            status: 410,
            body: { error: "Reservation has already been released and cannot be confirmed" },
          };
        }

        // Check expiry
        if (new Date() > reservation.expiresAt) {
          // Release the hold since it's expired
          await prisma.$transaction([
            prisma.reservation.update({
              where: { id },
              data: { status: "RELEASED" },
            }),
            prisma.stock.updateMany({
              where: {
                productId: reservation.productId,
                warehouseId: reservation.warehouseId,
              },
              data: { reserved: { decrement: reservation.quantity } },
            }),
          ]);

          return {
            status: 410,
            body: { error: "Reservation has expired. The hold has been released." },
          };
        }

        // Confirm: decrement total stock and reserved, mark confirmed
        const updated = await prisma.$transaction(async (tx) => {
          const confirmed = await tx.reservation.update({
            where: { id },
            data: { status: "CONFIRMED" },
            include: { product: true, warehouse: true },
          });

          // Permanently decrement total stock (units sold)
          await tx.stock.updateMany({
            where: {
              productId: reservation.productId,
              warehouseId: reservation.warehouseId,
            },
            data: {
              total: { decrement: reservation.quantity },
              reserved: { decrement: reservation.quantity },
            },
          });

          return confirmed;
        });

        return {
          status: 200,
          body: {
            message: "Reservation confirmed successfully",
            reservation: formatReservation(updated),
          },
        };
      }
    );

    const headers: Record<string, string> = {};
    if (cached) headers["X-Idempotent-Replay"] = "true";

    return NextResponse.json(body, { status, headers });
  } catch (err) {
    console.error(`[POST /api/reservations/${id}/confirm]`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
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
}) {
  return {
    id: r.id,
    productId: r.productId,
    productName: r.product.name,
    warehouseId: r.warehouseId,
    warehouseName: r.warehouse.name,
    quantity: r.quantity,
    status: r.status,
    expiresAt: r.expiresAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
  };
}
