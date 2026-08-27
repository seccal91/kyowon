"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import * as XLSX from "xlsx";

type Merchant = {
  merchant_code: string;
  name: string;
  major?: string;
  minor?: string;
  status: string;
  contract_date: string | null;
  termination_date: string | null;
};

export default function MerchantsPage() {
  const { status } = useSession();
  const router = useRouter();
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/signin");
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") fetchMerchants();
  }, [status]);

  async function fetchMerchants() {
    setLoading(true);
    try {
      const res = await fetch("/api/merchants/upload");
      const data = await res.json();
      const sorted = (data.merchants || []).sort((a: Merchant, b: Merchant) => {
        const aTerminated = a.status === "terminated";
        const bTerminated = b.status === "terminated";
        if (aTerminated !== bTerminated) return aTerminated ? 1 : -1;
        return a.name.localeCompare(b.name, "ko");
      });
      setMerchants(sorted);
    } catch (error) {
      console.error(error);
      setMessage("가맹점 목록 로드 실패");
    } finally {
      setLoading(false);
    }
  }

  async function handleFileUpload(file: File) {
    setUploading(true);
    setMessage(null);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = e.target?.result as ArrayBuffer;
          const workbook = XLSX.read(data, { type: "array" });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(sheet);

          const res = await fetch("/api/merchants/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ merchants: rows }),
          });

          const result = await res.json();
          if (res.ok) {
            setMessage(
              `✓ ${result.inserted}개 저장됨${result.failed > 0 ? ` / ${result.failed}개 실패` : ""}`
            );
            if (result.failedDetails?.length > 0) {
              console.log("실패한 항목:", result.failedDetails);
            }
            fetchMerchants();
          } else {
            setMessage(result.message || "업로드 실패");
          }
        } catch (err) {
          setMessage("파일 처리 중 오류: " + String(err));
        } finally {
          setUploading(false);
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (error) {
      setMessage("파일 읽기 실패");
      setUploading(false);
    }
  }

  if (status === "loading" || loading)
    return <div style={{ padding: 24, color: "#0f172a" }}>Loading...</div>;

  return (
    <div style={{ padding: 24, background: "#f8fafc", minHeight: "100vh", color: "#0f172a" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", display: "grid", gap: 24 }}>
        <section
          style={{
            background: "#ffffff",
            borderRadius: 20,
            padding: 24,
            boxShadow: "0 20px 60px rgba(15,23,42,0.08)",
          }}
        >
          <h2 style={{ margin: 0, color: "#0f172a" }}>가맹점 관리</h2>
          <p style={{ marginTop: 8, color: "#64748b" }}>가맹점 데이터를 업로드하고 상태를 관리합니다.</p>
        </section>

        <section
          style={{
            background: "#ffffff",
            borderRadius: 20,
            padding: 24,
            boxShadow: "0 20px 60px rgba(15,23,42,0.08)",
          }}
        >
          <h3 style={{ marginTop: 0, color: "#0f172a" }}>파일 업로드</h3>
          
          <div style={{ padding: 18, background: "#eff6ff", borderRadius: 12, marginBottom: 16 }}>
            <div style={{ fontWeight: 600, color: "#1d4ed8", marginBottom: 8 }}>업로드 형식</div>
            <div style={{ color: "#1e40af", fontSize: 13, lineHeight: 1.6 }}>
              • 파일: Excel (.xlsx)
              <br />
              • 컬럼: 조직코드, 교실명, 주소, 계약일, 운영형태(선택), 해지일자(선택)
              <br />
              • 날짜 형식: YYYY-MM-DD 또는 YYYY/MM/DD
              <br />
              • 주소에서 시/도, 시/구만 자동 추출 (상세주소는 저장되지 않음)
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
            <label
              style={{
                padding: "12px 20px",
                borderRadius: 10,
                border: "2px dashed #cbd5e1",
                background: "#f8fafc",
                color: "#0f172a",
                cursor: "pointer",
                fontWeight: 600,
                display: "inline-block",
              }}
            >
              파일 선택
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
                style={{ display: "none" }}
                disabled={uploading}
              />
            </label>
            {uploading && <span style={{ color: "#64748b" }}>업로드 중...</span>}
          </div>

          {message && (
            <div
              style={{
                padding: 12,
                borderRadius: 10,
                background: message.includes("✓") ? "#ecfdf5" : "#fef2f2",
                color: message.includes("✓") ? "#047857" : "#dc2626",
                marginBottom: 16,
              }}
            >
              {message}
            </div>
          )}
        </section>

        <section
          style={{
            background: "#ffffff",
            borderRadius: 20,
            padding: 24,
            boxShadow: "0 20px 60px rgba(15,23,42,0.08)",
          }}
        >
          <h3 style={{ marginTop: 0, color: "#0f172a" }}>가맹점 목록</h3>

          {merchants.length === 0 ? (
            <div style={{ color: "#64748b", padding: 24, textAlign: "center" }}>
              등록된 가맹점이 없습니다.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1000 }}>
                <thead>
                  <tr style={{ background: "#f1f5f9", color: "#0f172a", fontWeight: 700 }}>
                    <th style={{ padding: 12, borderBottom: "1px solid #e2e8f0", textAlign: "left" }}>
                      조직코드
                    </th>
                    <th style={{ padding: 12, borderBottom: "1px solid #e2e8f0", textAlign: "left" }}>
                      가맹점명
                    </th>
                    <th style={{ padding: 12, borderBottom: "1px solid #e2e8f0", textAlign: "left" }}>
                      지역
                    </th>
                    <th style={{ padding: 12, borderBottom: "1px solid #e2e8f0", textAlign: "left" }}>
                      상태
                    </th>
                    <th style={{ padding: 12, borderBottom: "1px solid #e2e8f0", textAlign: "center" }}>
                      계약일
                    </th>
                    <th style={{ padding: 12, borderBottom: "1px solid #e2e8f0", textAlign: "center" }}>
                      해지일
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {merchants.map((m) => (
                    <tr key={m.merchant_code} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: 12 }}>
                        <strong style={{ color: "#0f172a" }}>{m.merchant_code}</strong>
                      </td>
                      <td style={{ padding: 12, color: "#0f172a" }}>{m.name}</td>
                      <td style={{ padding: 12, color: "#64748b", fontSize: 13 }}>
                        {m.major && m.minor ? `${m.major} ${m.minor}` : "-"}
                      </td>
                      <td style={{ padding: 12 }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "4px 10px",
                            borderRadius: 6,
                            background:
                              m.status === "active" ? "#ecfdf5" : "#fef2f2",
                            color:
                              m.status === "active" ? "#047857" : "#dc2626",
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          {m.status === "active" ? "활성" : "해지"}
                        </span>
                      </td>
                      <td style={{ padding: 12, textAlign: "center", color: "#64748b", fontSize: 13 }}>
                        {m.contract_date || "-"}
                      </td>
                      <td style={{ padding: 12, textAlign: "center", color: "#64748b", fontSize: 13 }}>
                        {m.termination_date || "-"}
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
