"use client";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const YEARS = [2024, 2025, 2026];
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

interface OrgRow {
  org_id: number;
  org_name: string;
  group_name: string;
  business_unit_id: number | null;
  bu_name: string | null;
  members: number;
  target: number;
  orders: number;
  diff: number;
  rate: number | null;
  new_merchants: number;
  score: number;
  grade: string;
  rank: number;
}

interface BuRow {
  id: number;
  name: string;
  members: number;
  target: number;
  orders: number;
  diff: number;
  rate: number | null;
  new_merchants: number;
  score: number;
}

interface PerfData {
  year: number;
  month: number;
  groups: { blue: OrgRow[]; green: OrgRow[]; exception: OrgRow[] };
  business_units: BuRow[];
}

interface BuOption { id: number; name: string; }

const TH: React.CSSProperties = {
  padding: "10px 14px", background: "#f8fafc", color: "#475569",
  fontWeight: 700, fontSize: 13, textAlign: "left",
  borderBottom: "2px solid #e2e8f0", whiteSpace: "nowrap",
};
const TD: React.CSSProperties = {
  padding: "10px 14px", fontSize: 13, color: "#0f172a",
  borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap",
};

function gradeStyle(g: string): React.CSSProperties {
  const map: Record<string, React.CSSProperties> = {
    S: { background: "#fef3c7", color: "#92400e", fontWeight: 800 },
    A: { background: "#dcfce7", color: "#14532d", fontWeight: 700 },
    B: { background: "#dbeafe", color: "#1e40af", fontWeight: 700 },
    C: { background: "#f1f5f9", color: "#64748b", fontWeight: 600 },
    "-": { background: "#f8fafc", color: "#cbd5e1", fontWeight: 400 },
  };
  return {
    display: "inline-block", padding: "3px 10px", borderRadius: 6, fontSize: 13,
    ...(map[g] || map["-"]),
  };
}

function rankBadge(rank: number): React.CSSProperties {
  if (rank === 1) return { color: "#d97706", fontWeight: 900, fontSize: 14 };
  if (rank === 2) return { color: "#64748b", fontWeight: 800, fontSize: 14 };
  if (rank === 3) return { color: "#b45309", fontWeight: 700, fontSize: 14 };
  return { color: "#94a3b8", fontWeight: 500 };
}

function fmt(n: number) { return n.toLocaleString("ko-KR"); }
function fmtRate(r: number | null) { return r === null ? "-" : `${r.toFixed(1)}%`; }
function fmtDiff(d: number, target: number) {
  if (target === 0) return "-";
  return (d >= 0 ? "+" : "") + fmt(d);
}

// ─── Editable cell ────────────────────────────────────────────────────────────
function EditCell({
  value, orgId, field, year, month, onSave
}: {
  value: number; orgId: number; field: "target" | "new_merchants";
  year: number; month: number; onSave: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(String(value)); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  async function save() {
    setEditing(false);
    const num = Number(draft);
    if (isNaN(num) || num === value) return;
    await fetch("/api/performance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ org_id: orgId, year, month, [field]: num }),
    });
    onSave();
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        min={0}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
        style={{
          width: 72, padding: "4px 8px", borderRadius: 6,
          border: "2px solid #2563eb", textAlign: "right", fontSize: 13,
          outline: "none",
        }}
      />
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      title="클릭하여 편집"
      style={{
        cursor: "pointer", padding: "3px 8px", borderRadius: 6,
        border: "1px dashed #cbd5e1", background: "#f8fafc",
        fontSize: 13, display: "inline-block", minWidth: 48, textAlign: "right",
      }}
    >
      {fmt(value)}
    </span>
  );
}

// ─── Team table ───────────────────────────────────────────────────────────────
function TeamTable({
  rows, year, month, onSave,
}: {
  rows: OrgRow[]; year: number; month: number;
  onSave: () => void;
}) {
  if (rows.length === 0) {
    return <div style={{ padding: 20, color: "#94a3b8", fontSize: 13 }}>해당 그룹의 지사가 없습니다.</div>;
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
        <thead>
          <tr>
            <th style={{ ...TH, textAlign: "center", width: 48 }}>순위</th>
            <th style={TH}>지사명</th>
            <th style={{ ...TH, textAlign: "right" }}>회원수</th>
            <th style={{ ...TH, textAlign: "right" }}>당월목표</th>
            <th style={{ ...TH, textAlign: "right" }}>주문수</th>
            <th style={{ ...TH, textAlign: "right" }}>목표대비</th>
            <th style={{ ...TH, textAlign: "right" }}>달성률</th>
            <th style={{ ...TH, textAlign: "center" }}>신규가맹</th>
            <th style={{ ...TH, textAlign: "right" }}>최종점수</th>
            <th style={{ ...TH, textAlign: "center" }}>등급</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const diffColor = row.target === 0 ? "#94a3b8" : row.diff >= 0 ? "#15803d" : "#dc2626";
            return (
              <tr key={row.org_id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ ...TD, textAlign: "center" }}>
                  <span style={rankBadge(row.rank)}>{row.rank}위</span>
                </td>
                <td style={{ ...TD, fontWeight: 600 }}>{row.org_name}</td>
                <td style={{ ...TD, textAlign: "right" }}>{fmt(row.members)}</td>
                <td style={{ ...TD, textAlign: "right" }}>
                  <EditCell value={row.target} orgId={row.org_id} field="target" year={year} month={month} onSave={onSave} />
                </td>
                <td style={{ ...TD, textAlign: "right", fontWeight: 600 }}>{fmt(row.orders)}</td>
                <td style={{ ...TD, textAlign: "right", color: diffColor, fontWeight: 600 }}>
                  {fmtDiff(row.diff, row.target)}
                </td>
                <td style={{ ...TD, textAlign: "right", fontWeight: 600 }}>
                  {fmtRate(row.rate)}
                </td>
                <td style={{ ...TD, textAlign: "center" }}>
                  <EditCell value={row.new_merchants} orgId={row.org_id} field="new_merchants" year={year} month={month} onSave={onSave} />
                </td>
                <td style={{ ...TD, textAlign: "right", fontWeight: 700 }}>{row.score.toFixed(1)}</td>
                <td style={{ ...TD, textAlign: "center" }}>
                  <span style={gradeStyle(row.grade)}>{row.grade}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Business unit table ──────────────────────────────────────────────────────
function BuTable({ rows }: { rows: BuRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 780 }}>
        <thead>
          <tr>
            <th style={TH}>사업단명</th>
            <th style={{ ...TH, textAlign: "right" }}>회원수</th>
            <th style={{ ...TH, textAlign: "right" }}>당월목표</th>
            <th style={{ ...TH, textAlign: "right" }}>주문수</th>
            <th style={{ ...TH, textAlign: "right" }}>목표대비</th>
            <th style={{ ...TH, textAlign: "right" }}>달성률</th>
            <th style={{ ...TH, textAlign: "right" }}>신규가맹</th>
            <th style={{ ...TH, textAlign: "right" }}>최종점수</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(bu => {
            const diffColor = bu.target === 0 ? "#94a3b8" : bu.diff >= 0 ? "#15803d" : "#dc2626";
            return (
              <tr key={bu.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ ...TD, fontWeight: 700 }}>{bu.name}</td>
                <td style={{ ...TD, textAlign: "right" }}>{fmt(bu.members)}</td>
                <td style={{ ...TD, textAlign: "right" }}>{fmt(bu.target)}</td>
                <td style={{ ...TD, textAlign: "right", fontWeight: 700 }}>{fmt(bu.orders)}</td>
                <td style={{ ...TD, textAlign: "right", color: diffColor, fontWeight: 600 }}>
                  {fmtDiff(bu.diff, bu.target)}
                </td>
                <td style={{ ...TD, textAlign: "right" }}>{fmtRate(bu.rate)}</td>
                <td style={{ ...TD, textAlign: "right" }}>{fmt(bu.new_merchants)}</td>
                <td style={{ ...TD, textAlign: "right", fontWeight: 700, color: "#2563eb" }}>{bu.score.toFixed(1)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────
function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 16, boxShadow: "0 4px 24px rgba(15,23,42,0.06)",
      overflow: "hidden",
    }}>
      <div style={{
        padding: "14px 20px", background: color,
        fontWeight: 800, fontSize: 15, color: "#fff", letterSpacing: "-0.01em",
      }}>
        {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PerformancePage() {
  const { status } = useSession();
  const router = useRouter();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [buId, setBuId] = useState(0);
  const [data, setData] = useState<PerfData | null>(null);
  const [buOptions, setBuOptions] = useState<BuOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/signin");
  }, [status, router]);

  useEffect(() => {
    fetch("/api/business-units").then(r => r.json()).then(d => setBuOptions(d.units || [])).catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ year: String(year), month: String(month) });
      if (buId) params.set("business_unit_id", String(buId));
      const res = await fetch(`/api/performance?${params}`);
      if (res.ok) setData(await res.json());
    } catch {}
    setLoading(false);
  }, [year, month, buId]);

  useEffect(() => {
    if (status === "authenticated") fetchData();
  }, [fetchData, status]);

  if (status === "loading") return <div style={{ padding: 40, color: "#0f172a" }}>Loading...</div>;

  const controlStyle: React.CSSProperties = {
    padding: "9px 14px", borderRadius: 10, border: "1px solid #e2e8f0",
    background: "#fff", fontSize: 14, color: "#0f172a", cursor: "pointer",
  };

  return (
    <div style={{ padding: "24px 28px", background: "#f1f5f9", minHeight: "100vh" }}>
      <div style={{ maxWidth: 1300, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a" }}>성과관리</h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
              당월목표·신규가맹 클릭 시 편집 가능 · 신규가맹 1개당 5점
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select value={year} onChange={e => setYear(Number(e.target.value))} style={controlStyle}>
              {YEARS.map(y => <option key={y} value={y}>{y}년</option>)}
            </select>
            <select value={month} onChange={e => setMonth(Number(e.target.value))} style={controlStyle}>
              {MONTHS.map(m => <option key={m} value={m}>{m}월</option>)}
            </select>
            {buOptions.length > 0 && (
              <select value={buId} onChange={e => setBuId(Number(e.target.value))} style={controlStyle}>
                <option value={0}>전체 사업단</option>
                {buOptions.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
          </div>
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: 48, color: "#64748b", fontSize: 14 }}>데이터를 불러오는 중...</div>
        )}

        {!loading && data && (
          <>
            {/* 사업단 합계 */}
            {data.business_units.length > 0 && (
              <Section title="사업단 합계" color="#334155">
                <BuTable rows={data.business_units} />
              </Section>
            )}

            {/* 블루팀 */}
            <Section title={`블루팀 (${data.groups.blue.length}개 지사)`} color="#1d4ed8">
              <TeamTable
                rows={data.groups.blue}
                year={year} month={month}
                onSave={fetchData}
              />
            </Section>

            {/* 그린팀 */}
            <Section title={`그린팀 (${data.groups.green.length}개 지사)`} color="#15803d">
              <TeamTable
                rows={data.groups.green}
                year={year} month={month}
                onSave={fetchData}
              />
            </Section>

            {/* 예외그룹 */}
            <Section title={`예외그룹 (${data.groups.exception.length}개 지사)`} color="#7c3aed">
              <TeamTable
                rows={data.groups.exception}
                year={year} month={month}
                onSave={fetchData}
              />
            </Section>

            {/* 등급 기준 안내 */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12, color: "#64748b" }}>
              <span style={{ padding: "4px 10px", borderRadius: 6, ...gradeStyle("S") }}>S: 달성률 110% 이상</span>
              <span style={{ padding: "4px 10px", borderRadius: 6, ...gradeStyle("A") }}>A: 100% 이상</span>
              <span style={{ padding: "4px 10px", borderRadius: 6, ...gradeStyle("B") }}>B: 90% 이상</span>
              <span style={{ padding: "4px 10px", borderRadius: 6, ...gradeStyle("C") }}>C: 90% 미만</span>
              <span style={{ padding: "4px 10px", borderRadius: 6, background: "#f1f5f9", color: "#64748b" }}>
                최종점수 = 달성률(%) + 신규가맹 × 5
              </span>
            </div>
          </>
        )}

        {!loading && !data && (
          <div style={{ textAlign: "center", padding: 64, color: "#94a3b8", fontSize: 14 }}>
            데이터가 없습니다. 주문 데이터를 먼저 업로드해 주세요.
          </div>
        )}
      </div>
    </div>
  );
}
