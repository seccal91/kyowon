"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";

const METRICS = [
  { value: "revenue", label: "매출" },
  { value: "profit_with_bonus", label: "지사수익(성과포함)" },
  { value: "profit_without_bonus", label: "지사수익(성과제외)" },
  { value: "orders", label: "주문수" },
  { value: "members", label: "회원수" },
  { value: "active_merchants", label: "가동가맹점" },
];

type Org = { id: number; name: string };
type BusinessUnit = { id: number; name: string };

type AllOrgsData = {
  mode: "all_orgs";
  year: number; metric: string; metricLabel: string;
  months: string[];
  orgs: { id: number; name: string; months: Record<string, number>; total: number }[];
  monthTotals: Record<string, number>;
};

type BusinessUnitData = {
  mode: "business_unit";
  year: number; metric: string; metricLabel: string;
  business_unit: { id: number; name: string };
  months: string[];
  orgs: { id: number; name: string; months: Record<string, number>; total: number }[];
  monthTotals: Record<string, number>;
};

type OrgDetailData = {
  mode: "org_detail";
  year: number; org: { id: number; name: string }; metric: string; metricLabel: string;
  months: string[];
  merchants: { merchant_code: string; merchant_name: string; months: Record<string, number>; total: number }[];
  monthTotals: Record<string, number>;
};

type StatsData = AllOrgsData | BusinessUnitData | OrgDetailData;

export default function StatisticsPage() {
  const { status } = useSession();
  const router = useRouter();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [orgId, setOrgId] = useState<string>("");
  const [businessUnitId, setBusinessUnitId] = useState<string>("");
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const [metric, setMetric] = useState<string>("revenue");
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/signin");
  }, [status, router]);

  useEffect(() => {
    fetch("/api/organizations").then((r) => r.json()).then((b) => setOrgs(b.organizations || []));
    fetch("/api/business-units").then((r) => r.json()).then((b) => setBusinessUnits(b.business_units || []));
  }, []);

  const fetchStats = useCallback(async () => {
    setError(null); setInfoMessage(null); setLoading(true);
    try {
      let url = `/api/statistics?year=${year}&metric=${metric}`;
      if (orgId) url += `&org_id=${orgId}`;
      else if (businessUnitId) url += `&business_unit_id=${businessUnitId}`;
      const res = await fetch(url);
      const body = await res.json();
      if (!res.ok) return setError(body.message || "오류가 발생했습니다.");
      setData(body);
    } finally {
      setLoading(false);
    }
  }, [orgId, businessUnitId, year, metric]);

  useEffect(() => {
    if (status === "authenticated") fetchStats();
  }, [status]);

  async function recalculateAll() {
    setRecalcLoading(true); setInfoMessage(null);
    try {
      const res = await fetch("/api/statistics", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full: true }),
      });
      const b = await res.json();
      setInfoMessage(b.message || "완료");
      fetchStats();
    } finally {
      setRecalcLoading(false);
    }
  }

  function handleOrgChange(v: string) { setOrgId(v); if (v) setBusinessUnitId(""); }
  function handleBuChange(v: string) { setBusinessUnitId(v); if (v) setOrgId(""); }

  const isRevenue = ["revenue", "profit_with_bonus", "profit_without_bonus"].includes(metric);

  function fmt(n: number) {
    if (isRevenue) {
      if (n >= 100_000_000) return `₩${(n / 100_000_000).toFixed(1)}억`;
      if (n >= 10_000) return `₩${(n / 10_000).toFixed(0)}만`;
      return `₩${Math.round(n).toLocaleString()}`;
    }
    return Math.round(n).toLocaleString();
  }

  function fmtFull(n: number) {
    return isRevenue ? `₩${Math.round(n).toLocaleString()}` : Math.round(n).toLocaleString();
  }

  const rows = data
    ? data.mode === "all_orgs"
      ? (data as AllOrgsData).orgs.map((o) => ({ key: String(o.id), label: o.name, months: o.months, total: o.total }))
      : data.mode === "business_unit"
      ? (data as BusinessUnitData).orgs.map((o) => ({ key: String(o.id), label: o.name, months: o.months, total: o.total }))
      : (data as OrgDetailData).merchants.map((m) => ({
          key: m.merchant_code,
          label: m.merchant_name || m.merchant_code,
          sublabel: m.merchant_name !== m.merchant_code ? m.merchant_code : undefined,
          months: m.months, total: m.total,
        }))
    : [];

  const monthTotals = data?.monthTotals ?? {};
  const months = data?.months ?? [];
  const annualTotal = Object.values(monthTotals).reduce((a, b) => a + b, 0);

  const chartData = months.map((m) => ({
    month: `${Number(m.split("-")[1])}월`,
    value: monthTotals[m] || 0,
  }));

  function getViewLabel() {
    if (!data) return "";
    if (data.mode === "org_detail") return `${(data as OrgDetailData).org.name} · 가맹점별 상세 데이터`;
    if (data.mode === "business_unit") return `${(data as BusinessUnitData).business_unit.name} · 지사별 데이터`;
    return "전체 지사 월별 실적 데이터";
  }

  function getRowCountLabel() {
    if (!data) return "";
    if (data.mode === "all_orgs") return `${(data as AllOrgsData).orgs.length}개 지사`;
    if (data.mode === "business_unit") return `${(data as BusinessUnitData).orgs.length}개 지사`;
    return `${(data as OrgDetailData).merchants.length}개 가맹점`;
  }

  if (status === "loading") return <div style={{ padding: 24, color: "#0f172a" }}>Loading...</div>;

  const selectStyle: React.CSSProperties = {
    padding: "11px 14px", borderRadius: 10, border: "1px solid #cbd5e1",
    color: "#0f172a", background: "#ffffff", fontSize: 14, width: "100%",
  };

  return (
    <div style={{ padding: 24, background: "#f8fafc", minHeight: "100vh" }}>
      <div style={{ maxWidth: 1300, margin: "0 auto", display: "grid", gap: 20 }}>
        {/* Header */}
        <section style={{ background: "#ffffff", borderRadius: 20, padding: 24, boxShadow: "0 4px 16px rgba(15,23,42,0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2 style={{ margin: 0, color: "#0f172a", fontSize: 24, fontWeight: 800 }}>통계관리</h2>
              <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 14 }}>{getViewLabel()}</p>
            </div>
            <button onClick={recalculateAll} disabled={recalcLoading}
              style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid #cbd5e1", background: "#f8fafc", color: "#0f172a", fontWeight: 700, cursor: recalcLoading ? "not-allowed" : "pointer", fontSize: 13 }}>
              {recalcLoading ? "재계산 중..." : "🔄 전체 재계산"}
            </button>
          </div>
        </section>

        {/* Filters */}
        <section style={{ background: "#ffffff", borderRadius: 20, padding: 20, boxShadow: "0 4px 16px rgba(15,23,42,0.06)" }}>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: "0 1 130px" }}>
              <label style={{ display: "block", marginBottom: 6, color: "#0f172a", fontWeight: 600, fontSize: 13 }}>연도</label>
              <select value={year} onChange={(e) => setYear(e.target.value)} style={selectStyle}>
                {[2022, 2023, 2024, 2025, 2026].map((y) => <option key={y} value={y}>{y}년</option>)}
              </select>
            </div>
            <div style={{ flex: "1 1 180px" }}>
              <label style={{ display: "block", marginBottom: 6, color: "#0f172a", fontWeight: 600, fontSize: 13 }}>구분</label>
              <select value={metric} onChange={(e) => setMetric(e.target.value)} style={selectStyle}>
                {METRICS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div style={{ flex: "1 1 180px" }}>
              <label style={{ display: "block", marginBottom: 6, color: "#0f172a", fontWeight: 600, fontSize: 13 }}>
                사업단 <span style={{ color: "#94a3b8", fontWeight: 400 }}>(선택 시 사업단별 보기)</span>
              </label>
              <select value={businessUnitId} onChange={(e) => handleBuChange(e.target.value)} style={selectStyle} disabled={!!orgId}>
                <option value="">사업단 전체</option>
                {businessUnits.map((bu) => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
              </select>
            </div>
            <div style={{ flex: "1 1 180px" }}>
              <label style={{ display: "block", marginBottom: 6, color: "#0f172a", fontWeight: 600, fontSize: 13 }}>
                지사 <span style={{ color: "#94a3b8", fontWeight: 400 }}>(선택 시 가맹점 상세)</span>
              </label>
              <select value={orgId} onChange={(e) => handleOrgChange(e.target.value)} style={selectStyle} disabled={!!businessUnitId}>
                <option value="">전체 지사</option>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={fetchStats} disabled={loading}
                style={{ padding: "11px 28px", borderRadius: 10, border: "none", background: loading ? "#93c5fd" : "#2563eb", color: "#ffffff", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontSize: 14, whiteSpace: "nowrap" }}>
                {loading ? "조회 중..." : "조회"}
              </button>
              {data && (
                <button onClick={fetchStats} disabled={loading}
                  style={{ padding: "11px 18px", borderRadius: 10, border: "1px solid #cbd5e1", background: "#ffffff", color: "#0f172a", fontWeight: 600, cursor: "pointer", fontSize: 14, whiteSpace: "nowrap" }}>
                  새로고침
                </button>
              )}
            </div>
          </div>
          {error && <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: "#fee2e2", color: "#b91c1c", fontSize: 14 }}>{error}</div>}
          {infoMessage && <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: "#f0fdf4", color: "#166534", fontSize: 14 }}>{infoMessage}</div>}
        </section>

        {data && (
          <>
            {/* Summary Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
              {[
                { label: "조회 연도", value: `${data.year}년` },
                { label: "지표", value: data.metricLabel },
                { label: "건수", value: getRowCountLabel() },
                { label: "연간 합계", value: fmt(annualTotal) },
              ].map((c) => (
                <div key={c.label} style={{ background: "#ffffff", borderRadius: 14, padding: "16px 18px", boxShadow: "0 4px 16px rgba(15,23,42,0.06)", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>{c.label}</div>
                  <div style={{ fontSize: 18, color: "#0f172a", fontWeight: 800 }}>{c.value}</div>
                </div>
              ))}
            </div>

            {/* Bar Chart */}
            <section style={{ background: "#ffffff", borderRadius: 20, padding: 24, boxShadow: "0 4px 16px rgba(15,23,42,0.06)" }}>
              <h3 style={{ margin: "0 0 16px", color: "#0f172a", fontWeight: 700, fontSize: 15 }}>월별 {data.metricLabel} 추이</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => isRevenue ? (v >= 10000 ? `${(v / 10000).toFixed(0)}만` : String(v)) : v.toLocaleString()} />
                  <Tooltip formatter={(v: any) => [fmtFull(Number(v)), data.metricLabel]} contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", color: "#0f172a" }} />
                  <Bar dataKey="value" radius={[5, 5, 0, 0]}>
                    {chartData.map((entry, i) => <Cell key={i} fill={entry.value > 0 ? "#2563eb" : "#e2e8f0"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </section>

            {/* Data Table */}
            <section style={{ background: "#ffffff", borderRadius: 20, padding: 24, boxShadow: "0 4px 16px rgba(15,23,42,0.06)", overflowX: "auto" }}>
              <h3 style={{ margin: "0 0 16px", color: "#0f172a", fontWeight: 700, fontSize: 15 }}>
                {data.mode === "all_orgs" ? "지사별 월별 데이터" : data.mode === "business_unit" ? `${(data as BusinessUnitData).business_unit.name} · 지사별 데이터` : "가맹점별 월별 데이터"}
              </h3>
              {rows.length === 0 ? (
                <div style={{ padding: "40px 0", textAlign: "center", color: "#94a3b8", fontWeight: 600 }}>
                  데이터가 없습니다.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900, fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
                      <th style={{ padding: "12px 14px", textAlign: "left", color: "#475569", fontWeight: 700, whiteSpace: "nowrap", minWidth: 120 }}>
                        {data.mode === "org_detail" ? "가맹점" : "지사명"}
                      </th>
                      {months.map((m) => (
                        <th key={m} style={{ padding: "12px 8px", textAlign: "right", color: "#475569", fontWeight: 700, whiteSpace: "nowrap", minWidth: 70 }}>
                          {Number(m.split("-")[1])}월
                        </th>
                      ))}
                      <th style={{ padding: "12px 14px", textAlign: "right", color: "#1d4ed8", fontWeight: 800, whiteSpace: "nowrap" }}>합계</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.key} style={{ borderBottom: "1px solid #f1f5f9" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#fafbff")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                        <td style={{ padding: "10px 14px", color: "#0f172a", fontWeight: 600, whiteSpace: "nowrap" }}>
                          <div>{row.label}</div>
                          {"sublabel" in row && typeof row.sublabel === "string" && row.sublabel && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{row.sublabel}</div>}
                        </td>
                        {months.map((mk) => {
                          const val = row.months[mk] || 0;
                          return (
                            <td key={mk} style={{ padding: "10px 8px", textAlign: "right", color: val > 0 ? "#0f172a" : "#cbd5e1", fontSize: 12 }}>
                              {val > 0 ? fmt(val) : "—"}
                            </td>
                          );
                        })}
                        <td style={{ padding: "10px 14px", textAlign: "right", color: row.total > 0 ? "#1d4ed8" : "#cbd5e1", fontWeight: 800 }}>
                          {row.total > 0 ? fmt(row.total) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "#f8fafc", borderTop: "2px solid #e2e8f0" }}>
                      <td style={{ padding: "12px 14px", color: "#0f172a", fontWeight: 800 }}>합계</td>
                      {months.map((m) => {
                        const t = monthTotals[m] || 0;
                        return (
                          <td key={m} style={{ padding: "12px 8px", textAlign: "right", color: t > 0 ? "#0f172a" : "#cbd5e1", fontWeight: 700, fontSize: 12 }}>
                            {t > 0 ? fmt(t) : "—"}
                          </td>
                        );
                      })}
                      <td style={{ padding: "12px 14px", textAlign: "right", color: "#1d4ed8", fontWeight: 800, fontSize: 14 }}>{fmt(annualTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
