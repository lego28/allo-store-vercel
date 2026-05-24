// src/lib/schemas.ts
import { z } from "zod";

export const ReserveSchema = z.object({
  productId: z.string().min(1, "productId is required"),
  warehouseId: z.string().min(1, "warehouseId is required"),
  quantity: z.number().int().min(1, "quantity must be at least 1").max(100),
});

export type ReserveInput = z.infer<typeof ReserveSchema>;

export const ReservationStatusSchema = z.enum(["PENDING", "CONFIRMED", "RELEASED"]);

// API response types (shared between server and client)
export type ProductWithStock = {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  price: number;
  stock: {
    warehouseId: string;
    warehouseName: string;
    warehouseLocation: string;
    total: number;
    reserved: number;
    available: number;
  }[];
};

export type WarehouseResponse = {
  id: string;
  name: string;
  location: string;
};

export type ReservationResponse = {
  id: string;
  productId: string;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  status: "PENDING" | "CONFIRMED" | "RELEASED";
  expiresAt: string;
  createdAt: string;
};

export type ApiError = {
  error: string;
  code?: string;
};
