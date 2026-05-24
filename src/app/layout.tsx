// src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  title: "Allo Store",
  description: "Multi-warehouse inventory & fulfillment",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const navItems = [
    { href: "/products", label: "Products", description: "Browse live stock and reserve items" },
    { href: "/reservations", label: "Reservations", description: "Track active and recent holds" },
    { href: "/warehouses", label: "Warehouses", description: "See fulfilment locations" },
  ];

  return (
    <html lang="en">
      <body className="app-body">
        <AppShell title="Allo Store" navItems={navItems}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
