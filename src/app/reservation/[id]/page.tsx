"use client";
// src/app/reservation/[id]/page.tsx

import { useEffect, useState, useCallback } from "react";

type ReservationDetail = {
  id: string;
  productId: string;
  productName: string;
  productDescription: string;
  productImageUrl: string | null;
  productPrice: number;
  warehouseId: string;
  warehouseName: string;
  warehouseLocation: string;
  quantity: number;
  status: "PENDING" | "CONFIRMED" | "RELEASED";
  expiresAt: string;
  createdAt: string;
};

const formatPrice = (paise: number) => (paise / 100).toLocaleString("en-IN");

function useCountdown(expiresAt: string | null) {
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const diff = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(diff);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const formatted = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return { secondsLeft, formatted, expired: secondsLeft === 0 };
}

function StatusBadge({ status }: { status: ReservationDetail["status"] }) {
  const cls =
    status === "PENDING"
      ? "status-pending"
      : status === "CONFIRMED"
      ? "status-confirmed"
      : "status-released";
  return <span className={`status-badge ${cls}`}>{status}</span>;
}

export default function ReservationPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const [reservation, setReservation] = useState<ReservationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<"confirm" | "cancel" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const { secondsLeft, formatted, expired } = useCountdown(
    reservation?.status === "PENDING" ? reservation.expiresAt : null
  );

  const fetchReservation = useCallback(async () => {
    try {
      const res = await fetch(`/api/reservations/${id}`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Reservation not found");
        return;
      }
      setReservation(await res.json());
    } catch {
      setError("Failed to load reservation.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchReservation(); }, [fetchReservation]);

  // Auto-mark expired in UI if timer hits 0 and status is still pending
  useEffect(() => {
    if (expired && reservation?.status === "PENDING") {
      setReservation((r) => r ? { ...r, status: "RELEASED" } : r);
      setActionError("Your reservation has expired. The items have been returned to stock.");
    }
  }, [expired, reservation?.status]);

  const handleConfirm = async () => {
    setActionLoading("confirm");
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch(`/api/reservations/${id}/confirm`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.status === 410) {
        setActionError("This reservation expired before it could be confirmed. Your items have been released.");
        await fetchReservation();
        return;
      }
      if (!res.ok) {
        setActionError(data.error ?? `Error ${res.status}`);
        return;
      }
      setActionSuccess("Payment confirmed! Your order has been placed. Thank you for shopping with Allo.");
      await fetchReservation();
    } catch {
      setActionError("Network error. Please try again.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async () => {
    setActionLoading("cancel");
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch(`/api/reservations/${id}/release`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? `Error ${res.status}`);
        return;
      }
      setActionSuccess("Reservation cancelled. The items have been returned to stock.");
      await fetchReservation();
    } catch {
      setActionError("Network error. Please try again.");
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div>
        <div className="breadcrumb">
          <a href="/">← Back to products</a>
        </div>
        <div className="reservation-layout">
          <div className="skeleton" style={{ height: 300 }} />
          <div className="skeleton" style={{ height: 300 }} />
        </div>
      </div>
    );
  }

  if (error && !reservation) {
    return (
      <div>
        <div className="breadcrumb"><a href="/">← Back to products</a></div>
        <div className="alert alert-error">
          <div className="alert-title">Reservation not found</div>
          {error}
        </div>
      </div>
    );
  }

  if (!reservation) return null;

  const isPending = reservation.status === "PENDING";
  const isConfirmed = reservation.status === "CONFIRMED";
  const totalAmount = reservation.productPrice * reservation.quantity;
  const isUrgent = secondsLeft > 0 && secondsLeft <= 60;

  return (
    <div>
      <div className="breadcrumb">
        <a href="/">Products</a>
        <span>›</span>
        <span>Reservation #{id.slice(0, 8)}</span>
      </div>

      <div className="page-title">Checkout</div>

      {actionError && (
        <div className="alert alert-error">
          <div className="alert-title">
            {actionError.includes("expired") ? "Reservation Expired" : "Action Failed"}
          </div>
          {actionError}
        </div>
      )}

      {actionSuccess && (
        <div className="alert alert-success">
          <div className="alert-title">
            {isConfirmed ? "Order Confirmed!" : "Cancelled"}
          </div>
          {actionSuccess}
        </div>
      )}

      <div className="reservation-layout">
        {/* Left: reservation details */}
        <div>
          <div className="reservation-card">
            <h2>Order Summary</h2>

            <div className="product-summary">
              {reservation.productImageUrl && (
                <img
                  src={reservation.productImageUrl}
                  alt={reservation.productName}
                  className="checkout-product-img"
                />
              )}
              <div className="product-summary-info">
                <h3>{reservation.productName}</h3>
                <p>{reservation.productDescription}</p>
              </div>
            </div>

            <div className="detail-row">
              <span className="detail-label">Reservation ID</span>
              <span className="detail-value" style={{ fontFamily: "monospace", fontSize: 12 }}>
                {reservation.id}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Status</span>
              <span className="detail-value">
                <StatusBadge status={reservation.status} />
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Warehouse</span>
              <span className="detail-value">
                {reservation.warehouseName}
                <br />
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {reservation.warehouseLocation}
                </span>
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Quantity</span>
              <span className="detail-value">{reservation.quantity}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Unit price</span>
              <span className="detail-value">₹{formatPrice(reservation.productPrice)}</span>
            </div>
            <div className="detail-row" style={{ fontWeight: 700 }}>
              <span className="detail-label">Total</span>
              <span className="detail-value">₹{formatPrice(totalAmount)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Reserved at</span>
              <span className="detail-value">
                {new Date(reservation.createdAt).toLocaleString("en-IN")}
              </span>
            </div>
            {!isConfirmed && (
              <div className="detail-row">
                <span className="detail-label">Hold expires</span>
                <span className="detail-value">
                  {new Date(reservation.expiresAt).toLocaleString("en-IN")}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right: action panel */}
        <div>
          <div className="action-panel">
            <h3>Complete your purchase</h3>

            <div className="action-price">₹{formatPrice(totalAmount)}</div>

            {isPending && (
              <>
                <div className="countdown-box">
                  <div className="countdown-label">Reservation expires in</div>
                  <div
                    className={`countdown-time ${
                      expired ? "expired" : isUrgent ? "urgent" : ""
                    }`}
                  >
                    {expired ? "EXPIRED" : formatted}
                  </div>
                  {!expired && (
                    <div className="countdown-subtext">
                      Items held until {new Date(reservation.expiresAt).toLocaleTimeString("en-IN")}
                    </div>
                  )}
                </div>

                {!expired && (
                  <>
                    <button
                      className="btn btn-orange btn-full"
                      onClick={handleConfirm}
                      disabled={!!actionLoading}
                    >
                      {actionLoading === "confirm" ? "Processing…" : "Confirm purchase"}
                    </button>
                    <hr className="action-divider" />
                    <button
                      className="btn btn-secondary btn-full"
                      onClick={handleCancel}
                      disabled={!!actionLoading}
                    >
                      {actionLoading === "cancel" ? "Cancelling…" : "Cancel reservation"}
                    </button>
                  </>
                )}

                <p className="action-note">
                  Your items are temporarily reserved. Completing payment within the
                  countdown confirms your order. If the timer runs out, units return
                  to available stock automatically.
                </p>
              </>
            )}

            {isConfirmed && (
              <>
                <div className="alert alert-success" style={{ marginBottom: 12 }}>
                  <div className="alert-title">✓ Order placed</div>
                  Your payment was successful and the order is confirmed.
                </div>
                <a href="/" className="btn btn-primary btn-full">
                  Continue shopping
                </a>
              </>
            )}

            {reservation.status === "RELEASED" && !isConfirmed && (
              <>
                <div className="alert alert-warning" style={{ marginBottom: 12 }}>
                  <div className="alert-title">Reservation released</div>
                  {actionSuccess?.includes("cancelled")
                    ? "You cancelled this reservation."
                    : "This reservation expired and stock has been returned."}
                </div>
                <a href="/" className="btn btn-primary btn-full">
                  Back to products
                </a>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
