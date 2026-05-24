import { prisma } from "@/lib/prisma";

async function getReservations() {
  return prisma.reservation.findMany({
    include: { product: true, warehouse: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export default async function ReservationsPage() {
  let reservations: Array<{
    id: string;
    productName: string;
    warehouseName: string;
    quantity: number;
    status: string;
    expiresAt: string;
  }> = [];

  try {
    const rows = await getReservations();
    reservations = rows.map((reservation: any) => ({
      id: reservation.id,
      productName: reservation.product.name,
      warehouseName: reservation.warehouse.name,
      quantity: reservation.quantity,
      status: reservation.status,
      expiresAt: reservation.expiresAt.toISOString(),
    }));
  } catch {
    reservations = [];
  }

  return (
    <>
      <div className="page-title">Recent reservations</div>
      <div className="simple-list">
        {reservations.map((reservation) => (
          <div key={reservation.id} className="simple-card">
            <strong>{reservation.productName}</strong>
            <p>
              {reservation.quantity} from {reservation.warehouseName} · {reservation.status}
            </p>
          </div>
        ))}
        {reservations.length === 0 ? <p className="text-muted">No reservations found.</p> : null}
      </div>
    </>
  );
}
