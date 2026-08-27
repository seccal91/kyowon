"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type DiscountType = "percent" | "amount";
type Tier = { threshold: number; discount: number; discount_type: DiscountType };
type MerchantItem = { code: string; name: string };
type Promo = {
  id: number;
  name: string;
  tiers: Tier[];
  targets: string[];
  apply_to_sales: boolean;
  start_date: string | null;
  end_date: string | null;
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  color: "#0f172a",
  background: "#ffffff",
  fontSize: 14,
  boxSizing: "border-box",
};

function TierRow({
  tier, idx, onChange, onRemove,
}: {
  tier: Tier; idx: number;
  onChange: (idx: number, t: Tier) => void;
  onRemove: (idx: number) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <input type="number" value={tier.threshold} placeholder="주문수"
        onChange={(e) => onChange(idx, { ...tier, threshold: Number(e.target.value) })}
        style={{ ...inputStyle, width: 90 }} />
      <span style={{ color: "#64748b", fontSize: 13, whiteSpace: "nowrap" }}>건 →</span>
      <input type="number" value={tier.discount} placeholder="할인값"
        onChange={(e) => onChange(idx, { ...tier, discount: Number(e.target.value) })}
        style={{ ...inputStyle, width: 90 }} />
      <select value={tier.discount_type}
        onChange={(e) => onChange(idx, { ...tier, discount_type: e.target.value as DiscountType })}
        style={{ ...inputStyle, width: 70, padding: "10px 6px" }}>
        <option value="percent">%</option>
        <option value="amount">원</option>
      </select>
      <button type="button" onClick={() => onRemove(idx)}
        style={{ padding: "6px 8px", borderRadius: 8, border: "none", background: "#fee2e2", color: "#dc2626", cursor: "pointer", fontSize: 12, whiteSpace: "nowrap" }}>삭제</button>
    </div>
  );
}

const EMPTY_TIER = (): Tier => ({ threshold: 0, discount: 0, discount_type: "percent" });

export default function PromotionsPage() {
  const { status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  // Create form
  const [name, setName] = useState("");
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [targets, setTargets] = useState<MerchantItem[]>([]);
  const [merchantQuery, setMerchantQuery] = useState("");
  const [merchantResults, setMerchantResults] = useState<MerchantItem[]>([]);
  const [searchType, setSearchType] = useState<"code" | "name">("code");
  const [showResults, setShowResults] = useState(false);
  const [applyToSales, setApplyToSales] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Edit state
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editTiers, setEditTiers] = useState<Tier[]>([]);
  const [editTargetCodes, setEditTargetCodes] = useState<string[]>([]);
  const [editApplyToSales, setEditApplyToSales] = useState(false);
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editMerchantQuery, setEditMerchantQuery] = useState("");
  const [editMerchantResults, setEditMerchantResults] = useState<MerchantItem[]>([]);
  const [editSearchType, setEditSearchType] = useState<"code" | "name">("code");
  const [editShowResults, setEditShowResults] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/signin");
  }, [status, router]);

  useEffect(() => { fetchPromos(); }, []);

  async function fetchPromos() {
    setLoading(true);
    const res = await fetch("/api/promotions");
    const b = await res.json();
    // Normalize: ensure every tier has discount_type
    const normalized = (b.promotions || []).map((p: Promo) => ({
      ...p,
      tiers: (p.tiers || []).map((t) => ({ ...t, discount_type: (t.discount_type ?? "percent") as DiscountType })),
    }));
    setPromos(normalized);
    setLoading(false);
  }

  async function createPromo() {
    setMessage(null);
    if (!name.trim()) return setMessage({ text: "프로모션 이름을 입력하세요.", error: true });
    if (!tiers.length) return setMessage({ text: "조건을 하나 이상 추가하세요.", error: true });
    const res = await fetch("/api/promotions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, tiers, targets: targets.map((t) => t.code), apply_to_sales: applyToSales, start_date: startDate || null, end_date: endDate || null }),
    });
    const b = await res.json();
    if (!res.ok) return setMessage({ text: b.message || "오류", error: true });
    setName(""); setTiers([]); setTargets([]); setMerchantQuery(""); setMerchantResults([]);
    setShowResults(false); setApplyToSales(false); setStartDate(""); setEndDate("");
    fetchPromos();
    setMessage({ text: "프로모션이 생성되었습니다." });
  }

  async function updatePromo() {
    if (!editId) return;
    setMessage(null);
    const res = await fetch("/api/promotions", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editId, name: editName, tiers: editTiers, targets: editTargetCodes, apply_to_sales: editApplyToSales, start_date: editStartDate || null, end_date: editEndDate || null }),
    });
    const b = await res.json();
    if (!res.ok) return setMessage({ text: b.message || "오류", error: true });
    setEditId(null); fetchPromos(); setMessage({ text: "프로모션이 수정되었습니다." });
  }

  async function deletePromo(id: number, name: string) {
    if (!confirm(`'${name}' 프로모션을 삭제하시겠습니까?`)) return;
    const res = await fetch(`/api/promotions?id=${id}`, { method: "DELETE" });
    const b = await res.json();
    if (!res.ok) return setMessage({ text: b.message || "오류", error: true });
    fetchPromos(); setMessage({ text: "프로모션이 삭제되었습니다." });
  }

  async function toggleApplyToSales(promo: Promo) {
    const res = await fetch("/api/promotions", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...promo, apply_to_sales: !promo.apply_to_sales }),
    });
    if (res.ok) fetchPromos();
  }

  async function searchMerchants(q: string, type: string, isEdit: boolean) {
    if (!q) {
      if (isEdit) { setEditMerchantResults([]); setEditShowResults(false); }
      else { setMerchantResults([]); setShowResults(false); }
      return;
    }
    const res = await fetch(`/api/merchants?q=${encodeURIComponent(q)}&type=${type}`);
    const b = await res.json();
    if (isEdit) { setEditMerchantResults(b.merchants || []); setEditShowResults(true); }
    else { setMerchantResults(b.merchants || []); setShowResults(true); }
  }

  function selectMerchant(item: MerchantItem) {
    if (!item.code || targets.some((t) => t.code === item.code)) return;
    setTargets([...targets, item]);
    setMerchantQuery(""); setMerchantResults([]); setShowResults(false);
  }

  function selectEditMerchant(item: MerchantItem) {
    if (!item.code || editTargetCodes.includes(item.code)) return;
    setEditTargetCodes([...editTargetCodes, item.code]);
    setEditMerchantQuery(""); setEditMerchantResults([]); setEditShowResults(false);
  }

  function startEdit(p: Promo) {
    setEditId(p.id);
    setEditName(p.name);
    setEditTiers((p.tiers || []).map((t) => ({ ...t, discount_type: (t.discount_type ?? "percent") as DiscountType })));
    setEditTargetCodes(p.targets || []);
    setEditApplyToSales(p.apply_to_sales);
    setEditStartDate(p.start_date ? p.start_date.split("T")[0] : "");
    setEditEndDate(p.end_date ? p.end_date.split("T")[0] : "");
    setEditMerchantQuery(""); setEditMerchantResults([]); setEditShowResults(false);
    setMessage(null);
  }

  function updateCreateTier(idx: number, t: Tier) { const c = [...tiers]; c[idx] = t; setTiers(c); }
  function updateEditTier(idx: number, t: Tier) { const c = [...editTiers]; c[idx] = t; setEditTiers(c); }

  function tierLabel(t: Tier) {
    return `${t.threshold}건→${t.discount}${t.discount_type === "percent" ? "%" : "원"}`;
  }

  if (status === "loading" || loading)
    return <div style={{ padding: 24, color: "#0f172a" }}>Loading...</div>;

  return (
    <div style={{ padding: 24, background: "#f8fafc", minHeight: "100vh" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", display: "grid", gap: 24 }}>
        <section style={{ background: "#ffffff", borderRadius: 20, padding: 24, boxShadow: "0 4px 16px rgba(15,23,42,0.06)" }}>
          <h2 style={{ margin: 0, color: "#0f172a", fontSize: 24, fontWeight: 800 }}>프로모션관리</h2>
          <p style={{ margin: "8px 0 0", color: "#64748b" }}>
            프로모션을 생성하고 매출 반영 여부와 적용 기간을 관리하세요. 할인은 % 또는 원 단위로 설정 가능합니다.
          </p>
        </section>

        {message && (
          <div style={{ padding: "14px 18px", borderRadius: 12, background: message.error ? "#fee2e2" : "#f0fdf4", border: `1px solid ${message.error ? "#fca5a5" : "#86efac"}`, color: message.error ? "#b91c1c" : "#166534", fontWeight: 600, fontSize: 14 }}>
            {message.text}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr", gap: 24 }}>
          {/* Promo List */}
          <section style={{ background: "#ffffff", borderRadius: 20, padding: 24, boxShadow: "0 4px 16px rgba(15,23,42,0.06)" }}>
            <h3 style={{ marginTop: 0, color: "#0f172a", fontWeight: 700 }}>프로모션 목록</h3>
            {promos.length === 0 ? (
              <div style={{ color: "#64748b" }}>등록된 프로모션이 없습니다.</div>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {promos.map((p) => (
                  <li key={p.id} style={{ borderBottom: "1px solid #f1f5f9", padding: "16px 0" }}>
                    {editId === p.id ? (
                      <div style={{ display: "grid", gap: 12 }}>
                        <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="프로모션 이름" style={inputStyle} />

                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 8 }}>조건 (주문수 → 할인값 [% / 원])</div>
                          <div style={{ display: "grid", gap: 8 }}>
                            {editTiers.map((t, i) => (
                              <TierRow key={i} tier={t} idx={i} onChange={updateEditTier} onRemove={(idx) => setEditTiers(editTiers.filter((_, j) => j !== idx))} />
                            ))}
                          </div>
                          <button type="button" onClick={() => setEditTiers([...editTiers, EMPTY_TIER()])}
                            style={{ marginTop: 8, padding: "6px 12px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#f8fafc", color: "#0f172a", cursor: "pointer", fontSize: 13 }}>+ 조건 추가</button>
                          <div style={{ marginTop: 6, fontSize: 12, color: "#94a3b8" }}>
                            %: 구간할인 적용 후 매출에서 % 차감 / 원: 주문수 × 원 차감
                          </div>
                        </div>

                        {/* Edit merchant search */}
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 8 }}>대상 가맹점</div>
                          {editTargetCodes.length > 0 && (
                            <div style={{ marginBottom: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                              {editTargetCodes.map((code) => (
                                <span key={code} style={{ padding: "4px 10px", borderRadius: 20, background: "#dbeafe", color: "#1d4ed8", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                                  {code}
                                  <button type="button" onClick={() => setEditTargetCodes(editTargetCodes.filter((c) => c !== code))}
                                    style={{ background: "none", border: "none", color: "#1d4ed8", cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>
                                </span>
                              ))}
                            </div>
                          )}
                          <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                            <select value={editSearchType} onChange={(e) => { setEditSearchType(e.target.value as "code" | "name"); setEditMerchantResults([]); setEditShowResults(false); }}
                              style={{ ...inputStyle, width: 130 }}>
                              <option value="code">코드 뒤 4자리</option>
                              <option value="name">가맹점명</option>
                            </select>
                            <input value={editMerchantQuery}
                              onChange={(e) => { setEditMerchantQuery(e.target.value); searchMerchants(e.target.value, editSearchType, true); }}
                              placeholder={editSearchType === "code" ? "코드 뒤 4자리" : "가맹점명"}
                              style={{ ...inputStyle, flex: 1 }} />
                          </div>
                          {editShowResults && (
                            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, maxHeight: 150, overflowY: "auto" }}>
                              {editMerchantResults.length === 0
                                ? <div style={{ padding: 12, color: "#64748b", fontSize: 13 }}>검색 결과 없음</div>
                                : editMerchantResults.map((m) => (
                                  <div key={m.code} onClick={() => selectEditMerchant(m)}
                                    style={{ padding: "8px 14px", cursor: "pointer", borderBottom: "1px solid #f1f5f9", opacity: editTargetCodes.includes(m.code) ? 0.4 : 1 }}>
                                    <div style={{ color: "#0f172a", fontWeight: 700, fontSize: 13 }}>{m.code}</div>
                                    <div style={{ color: "#64748b", fontSize: 12 }}>{m.name}</div>
                                  </div>
                                ))
                              }
                            </div>
                          )}
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                          <div>
                            <label style={{ display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, color: "#475569" }}>적용 시작일</label>
                            <input type="date" value={editStartDate} onChange={(e) => setEditStartDate(e.target.value)} style={inputStyle} />
                          </div>
                          <div>
                            <label style={{ display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, color: "#475569" }}>적용 종료일</label>
                            <input type="date" value={editEndDate} onChange={(e) => setEditEndDate(e.target.value)} style={inputStyle} />
                          </div>
                        </div>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                          <input type="checkbox" checked={editApplyToSales} onChange={(e) => setEditApplyToSales(e.target.checked)} style={{ width: 16, height: 16, cursor: "pointer" }} />
                          <span style={{ fontSize: 14, color: "#0f172a", fontWeight: 600 }}>매출에 반영</span>
                        </label>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={updatePromo} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "#2563eb", color: "#ffffff", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>저장</button>
                          <button onClick={() => { setEditId(null); setMessage(null); }} style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid #cbd5e1", background: "#ffffff", color: "#0f172a", fontWeight: 600, cursor: "pointer", fontSize: 14 }}>취소</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                            <strong style={{ color: "#0f172a", fontSize: 15 }}>{p.name}</strong>
                            <button onClick={() => toggleApplyToSales(p)} style={{ padding: "3px 12px", borderRadius: 20, border: "none", background: p.apply_to_sales ? "#dcfce7" : "#f1f5f9", color: p.apply_to_sales ? "#166534" : "#64748b", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                              {p.apply_to_sales ? "✓ 매출반영" : "매출미반영"}
                            </button>
                          </div>
                          {(p.start_date || p.end_date) && (
                            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>
                              기간: {p.start_date ? p.start_date.split("T")[0] : "∞"} ~ {p.end_date ? p.end_date.split("T")[0] : "∞"}
                            </div>
                          )}
                          <div style={{ color: "#64748b", fontSize: 13, marginBottom: 4 }}>
                            대상: {(p.targets || []).length > 0
                              ? p.targets.slice(0, 5).join(", ") + (p.targets.length > 5 ? ` 외 ${p.targets.length - 5}개` : "")
                              : "전체"}
                          </div>
                          <div style={{ color: "#64748b", fontSize: 13 }}>
                            조건: {(p.tiers || []).map((t) => tierLabel(t)).join(", ")}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                          <button onClick={() => startEdit(p)} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#f8fafc", color: "#0f172a", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>수정</button>
                          <button onClick={() => deletePromo(p.id, p.name)} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #fecaca", background: "#fff5f5", color: "#dc2626", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>삭제</button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Create Form */}
          <section style={{ background: "#ffffff", borderRadius: 20, padding: 24, boxShadow: "0 4px 16px rgba(15,23,42,0.06)", alignSelf: "start" }}>
            <h3 style={{ marginTop: 0, color: "#0f172a", fontWeight: 700 }}>프로모션 생성</h3>
            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={{ display: "block", marginBottom: 6, color: "#0f172a", fontSize: 13, fontWeight: 600 }}>이름</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="프로모션 이름" style={inputStyle} />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 8, color: "#0f172a", fontSize: 13, fontWeight: 600 }}>조건 (주문수 → 할인값 [% / 원])</label>
                <div style={{ display: "grid", gap: 8 }}>
                  {tiers.map((t, i) => (
                    <TierRow key={i} tier={t} idx={i} onChange={updateCreateTier} onRemove={(idx) => setTiers(tiers.filter((_, j) => j !== idx))} />
                  ))}
                </div>
                <button type="button" onClick={() => setTiers([...tiers, EMPTY_TIER()])}
                  style={{ marginTop: 8, padding: "6px 12px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#f8fafc", color: "#0f172a", cursor: "pointer", fontSize: 13 }}>+ 조건 추가</button>
                <div style={{ marginTop: 6, fontSize: 12, color: "#94a3b8" }}>
                  %: 구간할인 적용 후 매출에서 % 차감 / 원: 주문수 × 원 차감
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, color: "#0f172a" }}>시작일</label>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, color: "#0f172a" }}>종료일</label>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 6, color: "#0f172a", fontSize: 13, fontWeight: 600 }}>검색구분</label>
                <select value={searchType} onChange={(e) => setSearchType(e.target.value as "code" | "name")} style={inputStyle}>
                  <option value="code">코드 뒤 4자리</option>
                  <option value="name">가맹점명</option>
                </select>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 6, color: "#0f172a", fontSize: 13, fontWeight: 600 }}>대상 가맹점 검색</label>
                <input value={merchantQuery}
                  onChange={(e) => { setMerchantQuery(e.target.value); searchMerchants(e.target.value, searchType, false); }}
                  placeholder={searchType === "code" ? "코드 뒤 4자리" : "가맹점명"}
                  style={inputStyle} />
                {showResults && (
                  <div style={{ marginTop: 6, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, maxHeight: 200, overflowY: "auto" }}>
                    {merchantResults.length === 0
                      ? <div style={{ padding: 12, color: "#64748b", fontSize: 13 }}>검색 결과 없음</div>
                      : merchantResults.map((m) => (
                        <div key={m.code} onClick={() => selectMerchant(m)}
                          style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid #f1f5f9" }}>
                          <div style={{ color: "#0f172a", fontWeight: 700, fontSize: 13 }}>{m.code}</div>
                          <div style={{ color: "#64748b", fontSize: 12 }}>{m.name}</div>
                        </div>
                      ))
                    }
                  </div>
                )}
                {targets.length > 0 && (
                  <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {targets.map((t) => (
                      <span key={t.code} style={{ padding: "4px 10px", borderRadius: 20, background: "#dbeafe", color: "#1d4ed8", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                        {t.code}
                        <button type="button" onClick={() => setTargets(targets.filter((x) => x.code !== t.code))}
                          style={{ background: "none", border: "none", color: "#1d4ed8", cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={applyToSales} onChange={(e) => setApplyToSales(e.target.checked)} style={{ width: 16, height: 16, cursor: "pointer" }} />
                <span style={{ fontSize: 14, color: "#0f172a", fontWeight: 600 }}>매출에 반영</span>
              </label>
              <button onClick={createPromo} style={{ padding: "12px 18px", borderRadius: 10, border: "none", background: "#2563eb", color: "#ffffff", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
                프로모션 생성
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
