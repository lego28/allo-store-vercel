"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProductWithStock } from "@/lib/schemas";

const formatPrice = (paise: number) => {
  const rupees = paise / 100;
  return rupees.toLocaleString("en-IN");
};

function StockBadge({
  available,
  reserved,
}: {
  available: number;
  reserved: number;
}) {
  if (available === 0) {
    return <span className="stock-badge out-of-stock">Out of stock</span>;
  }
  if (reserved > 0) {
    return <span className="stock-badge pending-stock">{reserved} on hold</span>;
  }
  if (available <= 2) {
    return <span className="stock-badge low-stock">Only {available} left</span>;
  }
  return <span className="stock-badge in-stock">In stock</span>;
}

function ReserveDropdown({
  product,
  onClose,
  onSuccess,
}: {
  product: ProductWithStock;
  onClose: () => void;
  onSuccess: (reservationId: string) => void;
}) {
  const availableWarehouses = product.stock.filter((s) => s.available > 0);
  const [warehouseId, setWarehouseId] = useState(
    availableWarehouses[0]?.warehouseId ?? ""
  );
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const selectedWarehouse = product.stock.find((s) => s.warehouseId === warehouseId);
  const maxQty = selectedWarehouse?.available ?? 0;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const handleReserve = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          warehouseId,
          quantity,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Error ${res.status}`);
        return;
      }
      onSuccess(data.id);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="reserve-dropdown" ref={ref}>
      {availableWarehouses.length === 0 ? (
        <p className="text-muted text-sm">No stock available at any warehouse.</p>
      ) : (
        <>
          <span className="reserve-dropdown-label">Ship from</span>
          <select
            value={warehouseId}
            onChange={(e) => {
              setWarehouseId(e.target.value);
              setQuantity(1);
            }}
          >
            {availableWarehouses.map((s) => (
              <option key={s.warehouseId} value={s.warehouseId}>
                {s.warehouseName} · {s.available} avail.
              </option>
            ))}
          </select>

          <span className="reserve-dropdown-label">Quantity</span>
          <input
            type="number"
            min={1}
            max={maxQty}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Math.min(maxQty, parseInt(e.target.value) || 1)))}
          />

          {error && (
            <div className="alert alert-error" style={{ marginBottom: 8 }}>
              {error}
            </div>
          )}

          <button
            className="btn btn-orange btn-full"
            onClick={handleReserve}
            disabled={loading || quantity < 1 || quantity > maxQty}
          >
            {loading ? "Reserving…" : "Proceed to checkout"}
          </button>
        </>
      )}
    </div>
  );
}

function ProductCard({
  product,
  onReserved,
}: {
  product: ProductWithStock;
  onReserved: (reservationId: string) => void;
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const totalAvailable = product.stock.reduce((sum, s) => sum + s.available, 0);
  const totalReserved = product.stock.reduce((sum, s) => sum + s.reserved, 0);
  const warehouseCount = product.stock.length;

  return (
    <div className="product-card">
      <div className="product-card-topline">
        <span className="product-chip">{warehouseCount} warehouse{warehouseCount === 1 ? "" : "s"}</span>
        {totalReserved > 0 ? (
          <span className="product-chip product-chip-warm">{totalReserved} on hold</span>
        ) : (
          <span className="product-chip product-chip-cool">Ready to reserve</span>
        )}
      </div>

      {product.imageUrl ? (
        <img src={product.imageUrl} alt={product.name} className="product-img" loading="lazy" />
      ) : (
        <div className="product-img-placeholder">📦</div>
      )}

      <div className="product-name">{product.name}</div>

      <div className="product-price">
        <span className="product-price-symbol">₹</span>
        {formatPrice(product.price)}
      </div>

      <p className="product-desc">{product.description}</p>

      <div className="stock-list">
        {product.stock.map((s) => (
          <div className="stock-row" key={s.warehouseId}>
            <span className="stock-warehouse">{s.warehouseName}</span>
            <StockBadge available={s.available} reserved={s.reserved} />
          </div>
        ))}
      </div>

      <div className="relative">
        <button
          className="btn btn-primary btn-full"
          onClick={() => setShowDropdown((v) => !v)}
          disabled={totalAvailable === 0}
        >
          {totalAvailable === 0 ? "Out of stock" : "Reserve now"}
        </button>

        {showDropdown && (
          <ReserveDropdown
            product={product}
            onClose={() => setShowDropdown(false)}
            onSuccess={(id) => {
              setShowDropdown(false);
              onReserved(id);
            }}
          />
        )}
      </div>
    </div>
  );
}

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductWithStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await fetch("/api/products");
      if (!res.ok) throw new Error("Failed to load products");
      setProducts(await res.json());
      setError(null);
    } catch {
      setError("Failed to load products. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();

    const interval = window.setInterval(() => {
      fetchProducts(true);
    }, 15000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchProducts(true);
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fetchProducts]);

  const handleReserved = (reservationId: string) => {
    window.location.href = `/reservation/${reservationId}`;
  };

  return (
    <>
      <div className="flex" style={{ alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div className="page-title" style={{ borderBottom: "none", marginBottom: 0, paddingBottom: 0 }}>
            Live stock and holds
          </div>
          <p className="page-intro" style={{ marginBottom: 0, marginTop: 4 }}>
            Reserved items stay on hold until checkout is confirmed or the timer expires.
          </p>
        </div>
        {!loading && (
          <span className="products-count">{products.length} product{products.length === 1 ? "" : "s"}</span>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="product-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton skeleton-card" />
          ))}
        </div>
      ) : (
        <div className="product-grid">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} onReserved={handleReserved} />
          ))}
        </div>
      )}
    </>
  );
}

export const dynamic = "force-dynamic";
