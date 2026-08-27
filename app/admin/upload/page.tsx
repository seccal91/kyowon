"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";

type Mode = "orders" | "merchants" | "merchant_patch" | "branches";
type Step = "idle" | "previewing" | "preview" | "confirming" | "done";

interface PreviewRow {
  rowNum: number;
  key?: string;
  after: Record<string, unknown>;
}

interface UpdateRow {
  rowNum: number;
  key?: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  changes: Record<string, { from: unknown; to: unknown }>;
}

interface ErrorRow {
  rowNum: number;
  reason: string;
  data: Record<string, unknown>;
}

interface PreviewData {
  filename: string;
  mode: string;
  total_rows: number;
  stats: { new: number; update: number; error: number; skip: number; unmatched: number };
  new_rows: PreviewRow[];
  update_rows: UpdateRow[];
  error_rows: ErrorRow[];
  unmatched_rows: PreviewRow[];
}

interface ConfirmResult {
  ok: boolean;
  total_rows: number;
  inserted: number;
  updated: number;
  errors: number;
  skipped: number;
  unmatched: number;
}

interface HistoryRow {
  id: number;
  filename: string;
  mode: string;
  uploaded_at: string;
  total_rows: number;
  inserted: number;
  updated: number;
  errors: number;
  skipped: number;
  unmatched: number;
}

const TABS: Record<Mode, { label: string; desc: string; columns: string[]; required: string[] }> = {
  orders: {
    label: "주문 데이터 업로드",
    desc: "주문 계산에 필요한 최소 정보만 저장합니다. 원본 엑셀 파일과 개인정보 컬럼은 저장하지 않습니다.",
    columns: ["조직코드", "주문일", "주문구분", "수량", "취소여부", "학년", "신규여부"],
    required: ["조직코드", "주문일", "주문구분", "수량"],
  },
  merchants: {
    label: "가맹점 등록",
    desc: "조직코드를 기준으로 가맹점을 등록하거나 업데이트합니다. 기존 조직코드와 일치하면 입력된 정보로 업데이트됩니다.",
    columns: ["조직코드", "교실명", "주소(대분류)", "주소(중분류)", "계약일", "해지일자"],
    required: ["조직코드"],
  },
  merchant_patch: {
    label: "가맹점 데이터 업데이트",
    desc: "조직코드를 기준으로 기존 가맹점 데이터를 부분 업데이트합니다. 입력된 항목만 덮어쓰며 공란은 기존 DB 값을 유지합니다.",
    columns: ["조직코드", "가맹점명", "대분류", "중분류"],
    required: ["조직코드"],
  },
  branches: {
    label: "조직 데이터 업데이트",
    desc: "지사명과 지역 정보를 기준으로 조직을 등록하거나 담당 지역을 추가합니다.",
    columns: ["지사명", "대분류", "중분류"],
    required: ["지사명"],
  },
};

const thStyle: React.CSSProperties = {
  padding: "9px 12px",
  background: "#f8fafc",
  color: "#475569",
  fontSize: 12,
  fontWeight: 800,
  borderBottom: "2px solid #e2e8f0",
  textAlign: "left",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 12px",
  color: "#0f172a",
  fontSize: 12,
  borderBottom: "1px solid #f1f5f9",
  whiteSpace: "nowrap",
};

const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: 12,
  boxShadow: "0 4px 24px rgba(15,23,42,0.07)",
  overflow: "hidden",
};

function Button({
  children,
  onClick,
  disabled,
  tone = "primary",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "primary" | "dark" | "muted";
}) {
  const background = tone === "primary" ? "#2563eb" : tone === "dark" ? "#0f172a" : "#64748b";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        border: "none",
        borderRadius: 8,
        padding: "10px 16px",
        background: disabled ? "#cbd5e1" : background,
        color: "#ffffff",
        fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

function LoadingOverlay({ step, filename }: { step: Step; filename?: string }) {
  if (step !== "previewing" && step !== "confirming") return null;
  const title = step === "previewing" ? "파일을 분석하는 중입니다" : "데이터를 등록하는 중입니다";
  const detail =
    step === "previewing"
      ? "엑셀 행을 읽고 업데이트 대상과 오류 행을 나누고 있습니다."
      : "미리보기에서 확인한 데이터만 DB에 반영하고 있습니다.";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.48)",
        display: "grid",
        placeItems: "center",
        zIndex: 1000,
        padding: 24,
      }}
    >
      <div
        style={{
          width: "min(440px, 100%)",
          background: "#ffffff",
          borderRadius: 16,
          padding: "30px 28px",
          boxShadow: "0 24px 80px rgba(15,23,42,0.28)",
          textAlign: "center",
        }}
      >
        <style>{`
          @keyframes kyowon-fill {
            0% { width: 0%; }
            55% { width: 74%; }
            100% { width: 100%; }
          }
          @keyframes kyowon-pulse {
            0%, 100% { opacity: .58; transform: translateY(0); }
            50% { opacity: 1; transform: translateY(-1px); }
          }
        `}</style>
        <div style={{ position: "relative", display: "inline-block", marginBottom: 18 }}>
          <div style={{ fontSize: 38, fontWeight: 900, letterSpacing: 1, color: "#dbeafe", lineHeight: 1 }}>
            KYOWON
          </div>
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              overflow: "hidden",
              whiteSpace: "nowrap",
              animation: "kyowon-fill 1.8s ease-in-out infinite",
            }}
          >
            <div style={{ fontSize: 38, fontWeight: 900, letterSpacing: 1, color: "#2563eb", lineHeight: 1 }}>
              KYOWON
            </div>
          </div>
        </div>
        <div style={{ fontSize: 17, fontWeight: 900, color: "#0f172a", marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>{detail}</div>
        {filename && (
          <div
            style={{
              marginTop: 14,
              padding: "8px 10px",
              borderRadius: 8,
              background: "#f8fafc",
              color: "#475569",
              fontSize: 12,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {filename}
          </div>
        )}
        <div
          style={{
            marginTop: 18,
            color: "#2563eb",
            fontSize: 12,
            fontWeight: 800,
            animation: "kyowon-pulse 1.2s ease-in-out infinite",
          }}
        >
          대용량 파일은 시간이 조금 걸릴 수 있습니다. 창을 닫지 말아주세요.
        </div>
      </div>
    </div>
  );
}

function downloadTemplate(mode: Mode) {
  const rows =
    mode === "orders"
      ? [
          ["조직코드", "주문일", "주문구분", "수량", "취소여부", "학년", "신규여부"],
          ["A12345", "2026-04-01", "정규", 1, "", "초3", ""],
          ["A12345", "2026-04-02", "신규/복회", 1, "", "초4", "Y"],
          ["A12345", "2026-04-03", "정규", 1, "취소완료", "초3", ""],
        ]
      : mode === "merchants"
        ? [
            ["조직코드", "교실명", "주소(대분류)", "주소(중분류)", "계약일", "해지일자"],
            ["1", "서초교실", "서울특별시", "서초구", "2025-03-01", ""],
            ["0001", "강남교실", "서울특별시", "강남구", "2025-02-15", ""],
            ["382", "분당교실", "경기도", "성남시", "2025-01-10", ""],
          ]
      : mode === "merchant_patch"
        ? [
            ["조직코드", "가맹점명", "대분류", "중분류"],
            ["A12345", "서초교실", "서울특별시", "서초구"],
            ["B67890", "", "경기도", "성남시"],
            ["C11111", "은평교실", "", ""],
          ]
        : [
            ["지사명", "대분류", "중분류"],
            ["서부지사", "서울특별시", "서대문구"],
          ];

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, "업로드양식");
  XLSX.writeFile(workbook, `${TABS[mode].label}_양식.xlsx`);
}

function NewTable({ rows }: { rows: PreviewRow[] }) {
  if (rows.length === 0) return <div style={{ padding: 18, color: "#94a3b8", fontSize: 13 }}>표시할 행이 없습니다.</div>;
  const keys = Object.keys(rows[0].after ?? {});
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 500 }}>
        <thead>
          <tr>
            <th style={thStyle}>행</th>
            {keys.map((k) => <th key={k} style={thStyle}>{k}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.rowNum}>
              <td style={{ ...tdStyle, color: "#64748b" }}>{row.rowNum}</td>
              {keys.map((k) => <td key={k} style={tdStyle}>{String(row.after?.[k] ?? "")}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UpdateTable({ rows }: { rows: UpdateRow[] }) {
  if (rows.length === 0) return <div style={{ padding: 18, color: "#94a3b8", fontSize: 13 }}>표시할 행이 없습니다.</div>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
        <thead>
          <tr>
            <th style={thStyle}>행</th>
            <th style={thStyle}>조직코드</th>
            <th style={thStyle}>변경 항목</th>
            <th style={thStyle}>변경 전</th>
            <th style={thStyle}>변경 후</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const changeKeys = Object.keys(row.changes ?? {});
            return changeKeys.map((key, i) => (
              <tr key={`${row.rowNum}-${key}`}>
                {i === 0 && (
                  <>
                    <td style={{ ...tdStyle, color: "#64748b" }} rowSpan={changeKeys.length}>{row.rowNum}</td>
                    <td style={{ ...tdStyle, fontWeight: 800 }} rowSpan={changeKeys.length}>{row.key}</td>
                  </>
                )}
                <td style={{ ...tdStyle, color: "#475569" }}>{key}</td>
                <td style={{ ...tdStyle, color: "#94a3b8" }}>{String(row.changes[key]?.from ?? "")}</td>
                <td style={{ ...tdStyle, color: "#1d4ed8", fontWeight: 700 }}>{String(row.changes[key]?.to ?? "")}</td>
              </tr>
            ));
          })}
        </tbody>
      </table>
    </div>
  );
}

function UnmatchedTable({ rows }: { rows: PreviewRow[] }) {
  if (rows.length === 0) return <div style={{ padding: 18, color: "#94a3b8", fontSize: 13 }}>표시할 행이 없습니다.</div>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 400 }}>
        <thead>
          <tr>
            <th style={thStyle}>행</th>
            <th style={thStyle}>조직코드</th>
            <th style={thStyle}>사유</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.rowNum}>
              <td style={{ ...tdStyle, color: "#64748b" }}>{row.rowNum}</td>
              <td style={{ ...tdStyle, fontWeight: 800 }}>{row.key}</td>
              <td style={{ ...tdStyle, color: "#b45309" }}>DB에 없는 조직코드</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ErrorTable({ rows }: { rows: ErrorRow[] }) {
  if (rows.length === 0) return <div style={{ padding: 18, color: "#94a3b8", fontSize: 13 }}>표시할 행이 없습니다.</div>;
  const keys = Object.keys(rows[0].data ?? {});
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 500 }}>
        <thead>
          <tr>
            <th style={thStyle}>행</th>
            <th style={thStyle}>오류 사유</th>
            {keys.map((k) => <th key={k} style={thStyle}>{k}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.rowNum}>
              <td style={{ ...tdStyle, color: "#64748b" }}>{row.rowNum}</td>
              <td style={{ ...tdStyle, color: "#dc2626", fontWeight: 800 }}>{row.reason}</td>
              {keys.map((k) => <td key={k} style={tdStyle}>{String(row.data?.[k] ?? "")}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HistoryTable({ rows }: { rows: HistoryRow[] }) {
  const modeLabel: Record<string, string> = {
    orders: "주문",
    merchants: "가맹점 등록",
    merchant_patch: "가맹점 업데이트",
    branches: "조직",
  };
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["일시", "파일명", "종류", "전체", "성공", "미매칭", "오류", "건너뜀"].map((h) => (
              <th key={h} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} style={{ ...tdStyle, padding: 20, textAlign: "center", color: "#94a3b8" }}>
                업로드 이력이 없습니다.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id}>
                <td style={tdStyle}>{new Date(row.uploaded_at).toLocaleString("ko-KR")}</td>
                <td style={tdStyle}>{row.filename}</td>
                <td style={tdStyle}>{modeLabel[row.mode] ?? row.mode}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{row.total_rows.toLocaleString()}</td>
                <td style={{ ...tdStyle, textAlign: "right", color: "#15803d", fontWeight: 800 }}>
                  {(row.inserted + row.updated).toLocaleString()}
                </td>
                <td style={{ ...tdStyle, textAlign: "right", color: row.unmatched ? "#b45309" : "#94a3b8" }}>
                  {(row.unmatched || 0).toLocaleString()}
                </td>
                <td style={{ ...tdStyle, textAlign: "right", color: row.errors ? "#dc2626" : "#94a3b8" }}>
                  {row.errors.toLocaleString()}
                </td>
                <td style={{ ...tdStyle, textAlign: "right", color: "#94a3b8" }}>{row.skipped.toLocaleString()}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

interface RelinkDiag {
  orgs: { total: number; with_regions: number };
  mappings: { total: number; with_org: number; without_org: number };
  unmatched_majors: { major: string | null; minor: string | null; cnt: number }[];
  org_regions: { name: string; regions: { major: string; minor: string }[] }[];
}

function RelinkSection() {
  const [diag, setDiag] = useState<RelinkDiag | null>(null);
  const [loading, setLoading] = useState(false);
  const [relinking, setRelinking] = useState(false);
  const [relinkResult, setRelinkResult] = useState<{ updated: number; failed: number } | null>(null);

  async function loadDiag() {
    setLoading(true);
    setRelinkResult(null);
    try {
      const res = await fetch("/api/admin/relink");
      if (res.ok) setDiag(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function runRelink() {
    setRelinking(true);
    try {
      const res = await fetch("/api/admin/relink", { method: "POST" });
      if (res.ok) {
        const body = await res.json();
        setRelinkResult(body);
        await loadDiag();
      }
    } finally {
      setRelinking(false);
    }
  }

  return (
    <section style={cardStyle}>
      <div style={{ padding: "12px 18px", background: "#475569", color: "#ffffff", fontWeight: 800, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>지사-가맹점 연결 진단</span>
        <button
          type="button"
          onClick={loadDiag}
          disabled={loading}
          style={{ padding: "6px 14px", borderRadius: 7, border: "none", background: "#94a3b8", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 }}
        >
          {loading ? "조회 중..." : "현황 조회"}
        </button>
      </div>

      {diag && (
        <div style={{ padding: 20, display: "grid", gap: 16 }}>
          {/* 요약 */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ padding: "10px 16px", borderRadius: 10, background: "#f0f9ff" }}>
              <b style={{ color: "#0369a1", fontSize: 20 }}>{diag.orgs.with_regions}</b>
              <span style={{ marginLeft: 6, color: "#475569", fontSize: 13 }}>/ {diag.orgs.total} 지사 지역 설정됨</span>
            </div>
            <div style={{ padding: "10px 16px", borderRadius: 10, background: "#f0fdf4" }}>
              <b style={{ color: "#15803d", fontSize: 20 }}>{diag.mappings.with_org}</b>
              <span style={{ marginLeft: 6, color: "#475569", fontSize: 13 }}>/ {diag.mappings.total} 가맹점 지사 연결됨</span>
            </div>
            {diag.mappings.without_org > 0 && (
              <div style={{ padding: "10px 16px", borderRadius: 10, background: "#fffbeb" }}>
                <b style={{ color: "#b45309", fontSize: 20 }}>{diag.mappings.without_org}</b>
                <span style={{ marginLeft: 6, color: "#475569", fontSize: 13 }}>개 가맹점 미연결</span>
              </div>
            )}
          </div>

          {/* 미연결 가맹점의 지역값 분포 */}
          {diag.unmatched_majors.length > 0 && (
            <div>
              <div style={{ fontWeight: 800, fontSize: 13, color: "#b45309", marginBottom: 8 }}>
                미연결 가맹점 대분류/중분류 분포 (상위 20개)
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 400 }}>
                  <thead>
                    <tr>
                      {["대분류(저장값)", "중분류", "건수"].map((h) => <th key={h} style={thStyle}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {diag.unmatched_majors.map((r, i) => (
                      <tr key={i}>
                        <td style={tdStyle}>{r.major ?? "(없음)"}</td>
                        <td style={tdStyle}>{r.minor ?? "(없음)"}</td>
                        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 800 }}>{r.cnt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 지사별 지역 현황 */}
          {diag.org_regions.length > 0 && (
            <div>
              <div style={{ fontWeight: 800, fontSize: 13, color: "#0369a1", marginBottom: 8 }}>
                지사 지역 설정 현황
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["지사명", "설정된 지역"].map((h) => <th key={h} style={thStyle}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {diag.org_regions.map((org) => (
                      <tr key={org.name}>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{org.name}</td>
                        <td style={{ ...tdStyle, color: org.regions.length === 0 ? "#dc2626" : "#0f172a" }}>
                          {org.regions.length === 0
                            ? "지역 미설정"
                            : org.regions.map((r) => `${r.major} / ${r.minor}`).join(", ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 재연결 실행 */}
          {diag.mappings.without_org > 0 && (
            <div style={{ padding: 16, borderRadius: 10, background: "#fffbeb", border: "1px solid #fde68a" }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#92400e", marginBottom: 8 }}>
                대분류/중분류가 입력된 가맹점 중 지사 미연결 건을 자동으로 재매핑합니다.
                대분류 표기 차이(예: "경기" → "경기도")를 자동 보정합니다.
              </div>
              <button
                type="button"
                onClick={runRelink}
                disabled={relinking}
                style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: relinking ? "#cbd5e1" : "#b45309", color: "#fff", fontWeight: 800, cursor: relinking ? "not-allowed" : "pointer" }}
              >
                {relinking ? "재연결 중..." : "지사-가맹점 재연결 실행"}
              </button>
              {relinkResult && (
                <div style={{ marginTop: 12, color: "#0f172a", fontSize: 13 }}>
                  완료 — 연결 성공 <b style={{ color: "#15803d" }}>{relinkResult.updated}건</b>
                  {relinkResult.failed > 0 && <>, 매칭 실패 <b style={{ color: "#dc2626" }}>{relinkResult.failed}건</b> (지사 지역 미설정)</>}
                </div>
              )}
            </div>
          )}

          {diag.mappings.without_org === 0 && (
            <div style={{ padding: 14, borderRadius: 10, background: "#f0fdf4", color: "#15803d", fontWeight: 700, fontSize: 13 }}>
              모든 가맹점이 지사에 연결되어 있습니다.
            </div>
          )}
        </div>
      )}

      {!diag && !loading && (
        <div style={{ padding: "20px 24px", color: "#94a3b8", fontSize: 13 }}>
          현황 조회를 눌러 지사-가맹점 연결 상태를 확인하세요.
        </div>
      )}
    </section>
  );
}

export default function UploadPage() {
  const { status } = useSession();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>("merchants");
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [result, setResult] = useState<ConfirmResult | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/signin");
  }, [router, status]);

  useEffect(() => {
    fetch("/api/upload/history")
      .then((res) => (res.ok ? res.json() : { history: [] }))
      .then((data) => setHistory(data.history ?? []))
      .catch(() => {});
  }, [result]);

  function reset(nextMode = mode) {
    setMode(nextMode);
    setFile(null);
    setStep("idle");
    setPreview(null);
    setResult(null);
    setMessage(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function analyze() {
    if (!file || step === "previewing" || step === "confirming") return;
    setStep("previewing");
    setMessage(null);

    const formData = new FormData();
    formData.append("mode", mode);
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload/preview", { method: "POST", body: formData });
      const body = await res.json();
      if (!res.ok) {
        setMessage(body.message ?? "파일 분석에 실패했습니다.");
        setStep("idle");
        return;
      }
      setPreview(body);
      setStep("preview");
    } catch {
      setMessage("네트워크 오류가 발생했습니다.");
      setStep("idle");
    }
  }

  async function confirm() {
    if (!file || !preview || step === "confirming") return;
    setStep("confirming");
    setMessage(null);

    const formData = new FormData();
    formData.append("mode", mode);
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload/confirm", { method: "POST", body: formData });
      const body = await res.json();
      if (!res.ok) {
        setMessage(body.message ?? "DB 반영에 실패했습니다.");
        setStep("preview");
        return;
      }
      setResult(body);
      setStep("done");
    } catch {
      setMessage("네트워크 오류가 발생했습니다.");
      setStep("preview");
    }
  }

  if (status === "loading") return <div style={{ padding: 40, color: "#0f172a" }}>Loading...</div>;

  const tab = TABS[mode];
  const busy = step === "previewing" || step === "confirming";
  const canConfirm = Boolean(preview && (preview.stats.new > 0 || preview.stats.update > 0));

  return (
    <div style={{ padding: "24px 28px", background: "#f1f5f9", minHeight: "100vh", color: "#0f172a" }}>
      <LoadingOverlay step={step} filename={file?.name} />
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gap: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, color: "#0f172a" }}>데이터 업로드</h2>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13 }}>
            업로드 유형을 선택하고 엑셀을 분석한 뒤 결과를 확인 후 등록합니다.
          </p>
        </div>

        {/* 업로드 유형 선택 + 파일 업로드 */}
        <section style={cardStyle}>
          <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", flexWrap: "wrap" }}>
            {(Object.keys(TABS) as Mode[]).map((tabKey) => (
              <button
                key={tabKey}
                type="button"
                onClick={() => reset(tabKey)}
                disabled={busy}
                style={{
                  padding: "13px 20px",
                  border: "none",
                  borderBottom: mode === tabKey ? "2px solid #2563eb" : "2px solid transparent",
                  background: "transparent",
                  color: mode === tabKey ? "#2563eb" : "#64748b",
                  fontWeight: mode === tabKey ? 800 : 600,
                  cursor: busy ? "not-allowed" : "pointer",
                  fontSize: 14,
                }}
              >
                {TABS[tabKey].label}
              </button>
            ))}
          </div>

          <div style={{ padding: 20, display: "grid", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 800, marginBottom: 6, fontSize: 15 }}>{tab.label}</div>
                <div style={{ color: "#64748b", fontSize: 13 }}>{tab.desc}</div>
              </div>
              <Button tone="muted" onClick={() => downloadTemplate(mode)} disabled={busy}>
                양식 다운로드
              </Button>
            </div>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {tab.columns.map((col) => {
                const required = tab.required.includes(col);
                return (
                  <span
                    key={col}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 999,
                      border: required ? "1px solid #bfdbfe" : "1px solid #e2e8f0",
                      background: required ? "#eff6ff" : "#f8fafc",
                      color: required ? "#1d4ed8" : "#64748b",
                      fontSize: 12,
                      fontWeight: required ? 800 : 500,
                    }}
                  >
                    {col}
                    {required ? " 필수" : ""}
                  </span>
                );
              })}
            </div>

            <label
              style={{
                display: "block",
                border: "2px dashed #cbd5e1",
                borderRadius: 12,
                background: "#f8fafc",
                padding: "30px 20px",
                textAlign: "center",
                cursor: busy ? "not-allowed" : "pointer",
                opacity: busy ? 0.62 : 1,
              }}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls"
                disabled={busy}
                style={{ display: "none" }}
                onChange={(e) => {
                  const nextFile = e.target.files?.[0] ?? null;
                  if (!nextFile) return;
                  if (!nextFile.name.match(/\.(xlsx|xls)$/i)) {
                    setMessage("엑셀 파일(.xlsx/.xls)만 업로드할 수 있습니다.");
                    return;
                  }
                  setFile(nextFile);
                  setPreview(null);
                  setResult(null);
                  setStep("idle");
                  setMessage(null);
                }}
              />
              <div style={{ fontWeight: 800, color: file ? "#2563eb" : "#475569" }}>
                {file ? file.name : "엑셀 파일 선택"}
              </div>
              <div style={{ marginTop: 4, color: "#94a3b8", fontSize: 12 }}>
                파일은 서버에 보관하지 않고 필요한 컬럼만 추출합니다.
              </div>
            </label>

            {busy && (
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: 10,
                  background: "#eff6ff",
                  color: "#1d4ed8",
                  border: "1px solid #bfdbfe",
                  fontSize: 13,
                  fontWeight: 800,
                }}
              >
                {step === "previewing" ? "파일 분석 중입니다. 잠시만 기다려주세요." : "데이터 등록 중입니다. 완료될 때까지 기다려주세요."}
              </div>
            )}

            {message && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  background: "#fef2f2",
                  color: "#dc2626",
                  border: "1px solid #fecaca",
                  fontSize: 13,
                }}
              >
                {message}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Button tone="dark" onClick={analyze} disabled={!file || busy}>
                {step === "previewing" ? "분석 중..." : "파일 분석"}
              </Button>
              {(step === "preview" || step === "confirming") && (
                <Button onClick={confirm} disabled={!canConfirm || busy}>
                  {step === "confirming" ? "등록 중..." : "확인 후 등록"}
                </Button>
              )}
              {(step === "preview" || step === "done") && (
                <Button tone="muted" onClick={() => reset()} disabled={busy}>
                  초기화
                </Button>
              )}
            </div>
          </div>
        </section>

        {/* 미리보기 — 분석 결과 */}
        {preview && step !== "done" && (
          <div style={{ display: "grid", gap: 16 }}>
            {/* 요약 통계 */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {[
                { label: "전체", value: preview.total_rows, color: "#64748b" },
                { label: preview.stats.new > 0 ? "신규 등록" : "업데이트", value: preview.stats.new > 0 ? preview.stats.new : preview.stats.update, color: "#15803d" },
                { label: "미매칭", value: preview.stats.unmatched ?? 0, color: "#b45309" },
                { label: "오류", value: preview.stats.error, color: "#dc2626" },
                { label: "변경없음", value: preview.stats.skip, color: "#94a3b8" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ padding: "10px 16px", borderRadius: 10, background: `${color}18` }}>
                  <b style={{ color, fontSize: 22 }}>{Number(value).toLocaleString()}</b>
                  <span style={{ marginLeft: 8, color: "#475569", fontSize: 13 }}>{label}</span>
                </div>
              ))}
            </div>

            {/* 업데이트 대상 */}
            {preview.update_rows.length > 0 && (
              <section style={cardStyle}>
                <div style={{ padding: "12px 18px", background: "#2563eb", color: "#ffffff", fontWeight: 800 }}>
                  업데이트 대상 {preview.stats.update.toLocaleString()}건
                </div>
                <UpdateTable rows={preview.update_rows} />
              </section>
            )}

            {/* 신규 등록 대상 (orders/branches 모드) */}
            {preview.new_rows.length > 0 && (
              <section style={cardStyle}>
                <div style={{ padding: "12px 18px", background: "#15803d", color: "#ffffff", fontWeight: 800 }}>
                  신규 등록 대상 {preview.stats.new.toLocaleString()}건
                </div>
                <NewTable rows={preview.new_rows} />
              </section>
            )}

            {/* 미매칭 */}
            {(preview.unmatched_rows?.length ?? 0) > 0 && (
              <section style={cardStyle}>
                <div style={{ padding: "12px 18px", background: "#b45309", color: "#ffffff", fontWeight: 800 }}>
                  조직코드 미매칭 {(preview.stats.unmatched ?? 0).toLocaleString()}건 — DB에 없는 코드, 업로드 시 건너뜁니다
                </div>
                <UnmatchedTable rows={preview.unmatched_rows ?? []} />
              </section>
            )}

            {/* 오류 */}
            {preview.error_rows.length > 0 && (
              <section style={cardStyle}>
                <div style={{ padding: "12px 18px", background: "#dc2626", color: "#ffffff", fontWeight: 800 }}>
                  오류 {preview.stats.error.toLocaleString()}건
                </div>
                <ErrorTable rows={preview.error_rows} />
              </section>
            )}
          </div>
        )}

        {/* 업로드 결과 */}
        {step === "done" && result && (
          <section style={{ ...cardStyle, border: "1px solid #bbf7d0" }}>
            <div style={{ padding: "12px 18px", background: "#15803d", color: "#ffffff", fontWeight: 800 }}>
              업로드 완료
            </div>
            <div style={{ padding: 20, display: "grid", gap: 16 }}>
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                <span style={{ color: "#475569" }}>
                  전체 <b style={{ color: "#0f172a" }}>{result.total_rows.toLocaleString()}건</b>
                </span>
                <span style={{ color: "#475569" }}>
                  성공 <b style={{ color: "#15803d" }}>{(result.inserted + result.updated).toLocaleString()}건</b>
                </span>
                {result.unmatched > 0 && (
                  <span style={{ color: "#475569" }}>
                    미매칭 <b style={{ color: "#b45309" }}>{result.unmatched.toLocaleString()}건</b>
                  </span>
                )}
                <span style={{ color: "#475569" }}>
                  오류 <b style={{ color: result.errors ? "#dc2626" : "#94a3b8" }}>{result.errors.toLocaleString()}건</b>
                </span>
                <span style={{ color: "#475569" }}>
                  건너뜀 <b style={{ color: "#94a3b8" }}>{result.skipped.toLocaleString()}건</b>
                </span>
              </div>

              {/* 오류 사유 상세 (preview error_rows 참조) */}
              {preview && preview.error_rows.length > 0 && (
                <div>
                  <div style={{ fontWeight: 800, marginBottom: 8, fontSize: 13, color: "#dc2626" }}>
                    오류 사유 상세
                  </div>
                  <ErrorTable rows={preview.error_rows} />
                </div>
              )}

              {preview && (preview.unmatched_rows?.length ?? 0) > 0 && (
                <div>
                  <div style={{ fontWeight: 800, marginBottom: 8, fontSize: 13, color: "#b45309" }}>
                    미매칭 조직코드 상세
                  </div>
                  <UnmatchedTable rows={preview.unmatched_rows ?? []} />
                </div>
              )}
            </div>
          </section>
        )}

        {/* 지사-가맹점 연결 진단 */}
        <RelinkSection />

        {/* 업로드 이력 */}
        <section style={cardStyle}>
          <div style={{ padding: "12px 18px", background: "#334155", color: "#ffffff", fontWeight: 800 }}>
            업로드 이력
          </div>
          <HistoryTable rows={history} />
        </section>
      </div>
    </div>
  );
}
