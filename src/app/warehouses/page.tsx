import { prisma } from "@/lib/prisma";

async function getWarehouses() {
  return prisma.warehouse.findMany({
    orderBy: { name: "asc" },
    include: {
      stock: {
        select: {
          productId: true,
          total: true,
          reserved: true,
        },
      },
    },
  });
}

export default async function WarehousesPage() {
  let warehouses: Array<{
    id: string;
    name: string;
    location: string;
    stock: Array<{ productId: string; total: number; reserved: number }>;
  }> = [];

  try {
    warehouses = await getWarehouses();
  } catch {
    warehouses = [];
  }

  const warehousesWithStats = warehouses.map((warehouse) => {
    const totalItems = warehouse.stock.reduce((sum, stock) => sum + stock.total, 0);
    const reservedItems = warehouse.stock.reduce((sum, stock) => sum + stock.reserved, 0);
    const availableItems = Math.max(0, totalItems - reservedItems);
    const productCount = new Set(warehouse.stock.map((stock) => stock.productId)).size;

    return {
      ...warehouse,
      totalItems,
      reservedItems,
      availableItems,
      productCount,
    };
  });

  return (
    <>
      <div className="page-title">Fulfilment locations</div>
      <div className="simple-list">
        {warehousesWithStats.map((warehouse) => (
          <div key={warehouse.id} className="simple-card warehouse-card">
            <div className="warehouse-card-head">
              <div>
                <strong>{warehouse.name}</strong>
                <p>{warehouse.location}</p>
              </div>
              <span className="warehouse-pill">{warehouse.productCount} products</span>
            </div>

            <div className="warehouse-stats">
              <div className="warehouse-stat">
                <span className="warehouse-stat-label">Total items</span>
                <strong>{warehouse.totalItems}</strong>
              </div>
              <div className="warehouse-stat">
                <span className="warehouse-stat-label">Available</span>
                <strong>{warehouse.availableItems}</strong>
              </div>
              <div className="warehouse-stat">
                <span className="warehouse-stat-label">Reserved</span>
                <strong>{warehouse.reservedItems}</strong>
              </div>
            </div>
          </div>
        ))}
        {warehouses.length === 0 ? <p className="text-muted">No warehouses found.</p> : null}
      </div>
    </>
  );
}
