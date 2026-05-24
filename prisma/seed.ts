// prisma/seed.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Clear existing data
  await prisma.reservation.deleteMany();
  await prisma.stock.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();

  // Warehouses
  const [mumbai, delhi, bangalore] = await Promise.all([
    prisma.warehouse.create({
      data: { name: "Mumbai Fulfillment Centre", location: "Mumbai, MH" },
    }),
    prisma.warehouse.create({
      data: { name: "Delhi Distribution Hub", location: "Delhi, DL" },
    }),
    prisma.warehouse.create({
      data: { name: "Bangalore Tech Warehouse", location: "Bangalore, KA" },
    }),
  ]);

  // Products
  const products = await Promise.all([
    prisma.product.create({
      data: {
        name: "Sony WH-1000XM5 Headphones",
        description:
          "Industry-leading noise cancellation with Auto NC Optimizer. Up to 30-hour battery life.",
        price: 2999900, // ₹29,999
        imageUrl:
          "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400",
      },
    }),
    prisma.product.create({
      data: {
        name: "Apple MacBook Air M3",
        description:
          "Supercharged by M3 chip. 18-hour battery. Fanless design. 13.6-inch Liquid Retina display.",
        price: 11490000, // ₹1,14,900
        imageUrl:
          "https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?w=400",
      },
    }),
    prisma.product.create({
      data: {
        name: "Samsung 65\" QLED 4K TV",
        description:
          "Quantum Dot technology. 120Hz refresh rate. Smart TV with Tizen OS.",
        price: 8999900, // ₹89,999
        imageUrl:
          "https://images.unsplash.com/photo-1593784991095-a205069470b6?w=400",
      },
    }),
    prisma.product.create({
      data: {
        name: "Dyson V15 Detect Vacuum",
        description:
          "Laser dust detection. 60 minutes of fade-free power. Powerful suction.",
        price: 5299900, // ₹52,999
        imageUrl:
          "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400",
      },
    }),
    prisma.product.create({
      data: {
        name: "Kindle Paperwhite (2024)",
        description:
          "300 ppi glare-free display. 3 months of battery life. IPX8 waterproof.",
        price: 1699900, // ₹16,999
        imageUrl:
          "https://images.unsplash.com/photo-1592496431122-2349e0fbc666?w=400",
      },
    }),
    prisma.product.create({
      data: {
        name: "Nintendo Switch OLED",
        description:
          "7-inch OLED screen. Enhanced audio. 64 GB internal storage.",
        price: 3499900, // ₹34,999
        imageUrl:
          "https://images.unsplash.com/photo-1578303512597-81e6cc155b3e?w=400",
      },
    }),
  ]);

  // Stock per product per warehouse
  const stockData = [
    // Sony Headphones
    { productId: products[0].id, warehouseId: mumbai.id, total: 1, reserved: 0 }, // tight stock to demo race condition
    { productId: products[0].id, warehouseId: delhi.id, total: 8, reserved: 0 },
    { productId: products[0].id, warehouseId: bangalore.id, total: 5, reserved: 0 },
    // MacBook Air
    { productId: products[1].id, warehouseId: mumbai.id, total: 4, reserved: 0 },
    { productId: products[1].id, warehouseId: delhi.id, total: 1, reserved: 0 }, // tight
    { productId: products[1].id, warehouseId: bangalore.id, total: 6, reserved: 0 },
    // Samsung TV
    { productId: products[2].id, warehouseId: mumbai.id, total: 3, reserved: 0 },
    { productId: products[2].id, warehouseId: bangalore.id, total: 2, reserved: 0 },
    // Dyson
    { productId: products[3].id, warehouseId: delhi.id, total: 0, reserved: 0 }, // OOS
    { productId: products[3].id, warehouseId: bangalore.id, total: 7, reserved: 0 },
    // Kindle
    { productId: products[4].id, warehouseId: mumbai.id, total: 15, reserved: 0 },
    { productId: products[4].id, warehouseId: delhi.id, total: 12, reserved: 0 },
    { productId: products[4].id, warehouseId: bangalore.id, total: 10, reserved: 0 },
    // Nintendo Switch
    { productId: products[5].id, warehouseId: mumbai.id, total: 1, reserved: 0 }, // tight
    { productId: products[5].id, warehouseId: delhi.id, total: 4, reserved: 0 },
  ];

  await prisma.stock.createMany({ data: stockData });

  console.log(
    `✅ Seeded: 3 warehouses, ${products.length} products, ${stockData.length} stock records`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
