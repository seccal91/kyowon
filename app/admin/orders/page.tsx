"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type OrderSummary = {
  merchant_code: string;
  year: number;
  month: number;
  product_counts: Record<string, number>;
  total_quantity: number;
};

const ORDER_TYPES = ["정규", "신규", "복회", "초도", "영업교재", "미분류"];

export default function OrdersPage() {
  const { status } = useSession();
  const router = useRouter();
  const [year, setYear] = useState(new Date().getFullYear());
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/signin");
  }, [router, status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    setLoading(true);
    setMessage(null);
    fetch(`/api/orders/upload?year=${year}`)
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) {
          setMessage(body.message ?? "주문 현황을 불러오지 못했습니다.");
          return;
        }
        setOrders(body.orders ?? []);
      })
      .catch(() => setMessage("네트워크 오류가 발생했습니다."))
      .finally(() => setLoading(false));
  }, [status, year]);

  if (status === "loading") return <div style={{ padding: 24, color: "#0f172a" }}>Loading...</div>;

  const years = Array.from({ length: 5 }, (_, index) => new Date().getFullYear() - index);

  return (
    <div style={{ padding: 24, background: "#f1f5f9", minHeight: "100vh", color: "#0f172a" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", display: "grid", gap: 20 }}>
        <section style={{ background: "#ffffff", borderRadius: 12, padding: 20, boxShadow: "0 4px 24px rgba(15,23,42,0.07)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 22, color: "#0f172a" }}>주문 현황</h2>
              <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13 }}>
                주문 파일 등록은 데이터 등록 화면에서 진행합니다. 이 화면은 등록된 주문의 월별 요약을 확인합니다.
              </p>
            </div>
            <select
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
              style={{
                padding: "9px 12px",
                borderRadius: 8,
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                color: "#0f172a",
                fontWeight: 700,
              }}
            >
              {years.map((item) => (
                <option key={item} value={item}>
                  {item}년
                </option>
              ))}
            </select>
          </div>
        </section>

        {message && (
          <div style={{ padding: 12, borderRadius: 8, background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}>
            {message}
          </div>
        )}

        <section style={{ background: "#ffffff", borderRadius: 12, boxShadow: "0 4px 24px rgba(15,23,42,0.07)", overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>불러오는 중...</div>
          ) : orders.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>등록된 주문 데이터가 없습니다.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>조직코드</th>
                    <th style={{ ...thStyle, textAlign: "center" }}>월</th>
                    {ORDER_TYPES.map((type) => (
                      <th key={type} style={{ ...thStyle, textAlign: "right" }}>
                        {type}
                      </th>
                    ))}
                    <th style={{ ...thStyle, textAlign: "right" }}>합계</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={`${order.merchant_code}-${order.year}-${order.month}`}>
                      <td style={{ ...tdStyle, fontWeight: 800 }}>{order.merchant_code}</td>
                      <td style={{ ...tdStyle, textAlign: "center", color: "#64748b" }}>
                        {order.year}-{String(order.month).padStart(2, "0")}
                      </td>
                      {ORDER_TYPES.map((type) => (
                        <td key={type} style={{ ...tdStyle, textAlign: "right" }}>
                          {(order.product_counts[type] || 0).toLocaleString()}
                        </td>
                      ))}
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 900, color: "#2563eb" }}>
                        {order.total_quantity.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px 12px",
  background: "#f8fafc",
  color: "#475569",
  borderBottom: "2px solid #e2e8f0",
  fontSize: 12,
  fontWeight: 800,
  textAlign: "left",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  color: "#0f172a",
  borderBottom: "1px solid #f1f5f9",
  fontSize: 13,
  whiteSpace: "nowrap",
};
