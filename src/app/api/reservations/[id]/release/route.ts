// src/app/api/reservations/[id]/release/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id },
    });

    if (!reservation) {
      return NextResponse.json(
        { error: "Reservation not found" },
        { status: 404 }
      );
    }

    if (reservation.status !== "PENDING") {
      // Idempotent: already released or confirmed — return current state
      return NextResponse.json({
        message: `Reservation is already ${reservation.status.toLowerCase()}`,
        status: reservation.status,
      });
    }

    // Release: restore the reserved units
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

    return NextResponse.json({
      message: "Reservation released successfully",
      id,
      status: "RELEASED",
    });
  } catch (err) {
    console.error(`[POST /api/reservations/${id}/release]`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
