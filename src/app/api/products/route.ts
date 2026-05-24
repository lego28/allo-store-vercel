// src/app/api/products/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { releaseExpiredReservations } from "@/lib/expiry";
import type { ProductWithStock } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await releaseExpiredReservations();

    const products = await prisma.product.findMany({
      include: {
        stock: {
          include: {
            warehouse: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    const response = products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      imageUrl: p.imageUrl,
      price: p.price,
      stock: p.stock.map((s) => ({
        warehouseId: s.warehouseId,
        warehouseName: s.warehouse.name,
        warehouseLocation: s.warehouse.location,
        total: s.total,
        reserved: s.reserved,
        available: Math.max(0, s.total - s.reserved),
      })),
    })) satisfies ProductWithStock[];

    return NextResponse.json(response);
  } catch (err) {
    console.error("[GET /api/products]", err);
    return NextResponse.json(
      { error: "Failed to fetch products" },
      { status: 500 }
    );
  }
}