"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type MemberRange = { min: number; max: number | null; fixed_price: number };
type MerchantItem = { code: string; name: string };

type Tier = {
  id: number;
  name: string;
  criteria_date: string | null;
  criteria_direction: "before" | "after";
  member_ranges: MemberRange[];
  apply_scope: "all" | "org" | "merchants";
  apply_org_id: number | null;
  apply_merchants: string[];
  org_name: string | null;
  is_active: boolean;
};

type Org = { id: number; name: string };

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 10,
  border: "1px solid #cbd5e1", color: "#0f172a", background: "#ffffff",
  fontSize: 14, boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = {
  display: "block", marginBottom: 6, color: "#0f172a", fontSize: 13, fontWeight: 600,
};

function RangeRow({ range, idx, onChange, onRemove }: {
  range: MemberRange; idx: number;
  onChange: (idx: number, r: MemberRange) => void;
  onRemove: (idx: number) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <input type="number" min={0} value={range.min}
        onChange={(e) => onChange(idx, { ...range, min: Number(e.target.value) })}
        placeholder="최소 회원수" style={{ ...inputStyle, width: 90 }} />
      <span style={{ color: "#64748b", fontSize: 13, whiteSpace: "nowrap" }}>명 ~</span>
      <input type="number" min={0} value={range.max ?? ""}
        onChange={(e) => onChange(idx, { ...range, max: e.target.value === "" ? null : Number(e.target.value) })}
        placeholder="최대 (비우면 ∞)" style={{ ...inputStyle, width: 110 }} />
      <span style={{ color: "#64748b", fontSize: 13, whiteSpace: "nowrap" }}>명 →</span>
      <input type="number" min={0} value={range.fixed_price}
        onChange={(e) => onChange(idx, { ...range, fixed_price: Number(e.target.value) })}
        placeholder="건당 단가" style={{ ...inputStyle, width: 110 }} />
      <span style={{ color: "#64748b", fontSize: 13, whiteSpace: "nowrap" }}>원/건</span>
      <button type="button" onClick={() => onRemove(idx)}
        style={{ padding: "6px 10px", borderRadius: 8, border: "none", background: "#fee2e2", color: "#dc2626", cursor: "pointer", flexShrink: 0 }}>
        삭제
      </button>
    </div>
  );
}

// Merchant search component used inside scope section
function MerchantSearch({
  selected, onAdd, onRemove,
}: {
  selected: string[];
  onAdd: (code: string) => void;
  onRemove: (code: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MerchantItem[]>([]);
  const [searchType, setSearchType] = useState<"code" | "name">("code");
  const [showResults, setShowResults] = useState(false);

  async function search(q: string) {
    setQuery(q);
    if (!q) { setResults([]); setShowResults(false); return; }
    const res = await fetch(`/api/merchants?q=${encodeURIComponent(q)}&type=${searchType}`);
    const b = await res.json();
    setResults(b.merchants || []);
    setShowResults(true);
  }

  return (
    <div>
      {selected.length > 0 && (
        <div style={{ marginBottom: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {selected.map((code) => (
            <span key={code} style={{ padding: "4px 10px", borderRadius: 20, background: "#dbeafe", color: "#1d4ed8", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              {code}
              <button type="button" onClick={() => onRemove(code)}
                style={{ background: "none", border: "none", color: "#1d4ed8", cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
        <select value={searchType} onChange={(e) => { setSearchType(e.target.value as "code" | "name"); setResults([]); setShowResults(false); }}
          style={{ ...inputStyle, width: 130 }}>
          <option value="code">코드 뒤 4자리</option>
          <option value="name">가맹점명</option>
        </select>
        <input value={query} onChange={(e) => search(e.target.value)}
          placeholder={searchType === "code" ? "코드 뒤 4자리" : "가맹점명 검색"}
          style={{ ...inputStyle, flex: 1 }} />
      </div>
      {showResults && (
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, maxHeight: 160, overflowY: "auto" }}>
          {results.length === 0 ? (
            <div style={{ padding: 12, color: "#64748b", fontSize: 13 }}>검색 결과 없음</div>
          ) : (
            results.map((m) => (
              <div key={m.code} onClick={() => { if (!selected.includes(m.code)) onAdd(m.code); setQuery(""); setResults([]); setShowResults(false); }}
                style={{ padding: "8px 14px", cursor: "pointer", borderBottom: "1px solid #f1f5f9", opacity: selected.includes(m.code) ? 0.4 : 1 }}>
                <div style={{ color: "#0f172a", fontWeight: 700, fontSize: 13 }}>{m.code}</div>
                <div style={{ color: "#64748b", fontSize: 12 }}>{m.name}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

type FormState = {
  name: string;
  useCriteriaDate: boolean;
  criteriaDate: string;
  criteriaDirection: "before" | "after";
  memberRanges: MemberRange[];
  applyScope: "all" | "org" | "merchants";
  applyOrgId: string;
  applyMerchants: string[];
};

const EMPTY_FORM = (): FormState => ({
  name: "",
  useCriteriaDate: false,
  criteriaDate: "",
  criteriaDirection: "before",
  memberRanges: [],
  applyScope: "all",
  applyOrgId: "",
  applyMerchants: [],
});

export default function DiscountTiersPage() {
  const { status } = useSession();
  const router = useRouter();
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM());
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM());

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/signin");
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchTiers();
      fetch("/api/organizations").then((r) => r.json()).then((b) => setOrgs(b.organizations || []));
    }
  }, [status]);

  async function fetchTiers() {
    setLoading(true);
    const res = await fetch("/api/discount-tiers");
    const b = await res.json();
    setTiers(b.tiers || []);
    setLoading(false);
  }

  function tierToForm(t: Tier): FormState {
    return {
      name: t.name,
      useCriteriaDate: !!t.criteria_date,
      criteriaDate: t.criteria_date ? t.criteria_date.split("T")[0] : "",
      criteriaDirection: t.criteria_direction,
      memberRanges: t.member_ranges || [],
      applyScope: t.apply_scope,
      applyOrgId: t.apply_org_id ? String(t.apply_org_id) : "",
      applyMerchants: t.apply_merchants || [],
    };
  }

  function buildPayload(f: FormState) {
    return {
      name: f.name,
      criteria_date: f.useCriteriaDate ? f.criteriaDate || null : null,
      criteria_direction: f.criteriaDirection,
      member_ranges: f.memberRanges,
      apply_scope: f.applyScope,
      apply_org_id: f.applyScope === "org" ? Number(f.applyOrgId) || null : null,
      apply_merchants: f.applyScope === "merchants" ? f.applyMerchants : [],
    };
  }

  async function createTier() {
    setMessage(null);
    if (!form.name.trim()) return setMessage({ text: "이름을 입력하세요.", error: true });
    if (form.memberRanges.length === 0) return setMessage({ text: "회원수 구간을 하나 이상 추가하세요.", error: true });
    if (form.useCriteriaDate && !form.criteriaDate) return setMessage({ text: "기준 날짜를 입력하세요.", error: true });
    const res = await fetch("/api/discount-tiers", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(form)),
    });
    const b = await res.json();
    if (!res.ok) return setMessage({ text: b.message || "오류", error: true });
    setForm(EMPTY_FORM());
    fetchTiers();
    setMessage({ text: "구간할인 조건이 추가되었습니다." });
  }

  async function saveTier() {
    if (!editId) return;
    setMessage(null);
    if (!editForm.name.trim()) return setMessage({ text: "이름을 입력하세요.", error: true });
    if (editForm.memberRanges.length === 0) return setMessage({ text: "회원수 구간을 하나 이상 추가하세요.", error: true });
    if (editForm.useCriteriaDate && !editForm.criteriaDate) return setMessage({ text: "기준 날짜를 입력하세요.", error: true });
    const tier = tiers.find((t) => t.id === editId);
    const res = await fetch("/api/discount-tiers", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editId, ...buildPayload(editForm), is_active: tier?.is_active }),
    });
    const b = await res.json();
    if (!res.ok) return setMessage({ text: b.message || "오류", error: true });
    setEditId(null);
    fetchTiers();
    setMessage({ text: "수정되었습니다." });
  }

  async function toggleActive(t: Tier) {
    await fetch("/api/discount-tiers", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: t.id, name: t.name, criteria_date: t.criteria_date, criteria_direction: t.criteria_direction, member_ranges: t.member_ranges, apply_scope: t.apply_scope, apply_org_id: t.apply_org_id, apply_merchants: t.apply_merchants, is_active: !t.is_active }),
    });
    fetchTiers();
  }

  async function deleteTier(id: number, name: string) {
    if (!confirm(`'${name}' 조건을 삭제하시겠습니까?`)) return;
    const res = await fetch(`/api/discount-tiers?id=${id}`, { method: "DELETE" });
    if (!res.ok) return setMessage({ text: "삭제 오류", error: true });
    fetchTiers(); setMessage({ text: "삭제되었습니다." });
  }

  function updateRange(idx: number, r: MemberRange, isEdit: boolean) {
    if (isEdit) setEditForm((f) => { const c = [...f.memberRanges]; c[idx] = r; return { ...f, memberRanges: c }; });
    else setForm((f) => { const c = [...f.memberRanges]; c[idx] = r; return { ...f, memberRanges: c }; });
  }
  function removeRange(idx: number, isEdit: boolean) {
    if (isEdit) setEditForm((f) => ({ ...f, memberRanges: f.memberRanges.filter((_, i) => i !== idx) }));
    else setForm((f) => ({ ...f, memberRanges: f.memberRanges.filter((_, i) => i !== idx) }));
  }
  function addRange(isEdit: boolean) {
    const nr: MemberRange = { min: 0, max: null, fixed_price: 0 };
    if (isEdit) setEditForm((f) => ({ ...f, memberRanges: [...f.memberRanges, nr] }));
    else setForm((f) => ({ ...f, memberRanges: [...f.memberRanges, nr] }));
  }

  function renderFormBody(f: FormState, setF: React.Dispatch<React.SetStateAction<FormState>>, isEdit: boolean) {
    return (
      <div style={{ display: "grid", gap: 14 }}>
        <div>
          <label style={labelStyle}>조건명</label>
          <input value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))}
            placeholder="예: 2018년 이전 계약 회원수별 할인" style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>계약 연도 조건</label>
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: f.useCriteriaDate ? 10 : 0 }}>
              <input type="checkbox" checked={f.useCriteriaDate} onChange={(e) => setF((p) => ({ ...p, useCriteriaDate: e.target.checked }))} style={{ width: 16, height: 16 }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>계약 연도 조건 적용</span>
            </label>
            {f.useCriteriaDate && (
              <div style={{ display: "flex", gap: 8 }}>
                <input type="date" value={f.criteriaDate} onChange={(e) => setF((p) => ({ ...p, criteriaDate: e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
                <select value={f.criteriaDirection} onChange={(e) => setF((p) => ({ ...p, criteriaDirection: e.target.value as "before" | "after" }))} style={{ ...inputStyle, width: 80 }}>
                  <option value="before">이전</option>
                  <option value="after">이후</option>
                </select>
              </div>
            )}
          </div>
        </div>

        <div>
          <label style={labelStyle}>회원수별 할인 구간</label>
          <div style={{ display: "grid", gap: 8 }}>
            {f.memberRanges.map((r, i) => (
              <RangeRow key={i} range={r} idx={i} onChange={(idx, nr) => updateRange(idx, nr, isEdit)} onRemove={(idx) => removeRange(idx, isEdit)} />
            ))}
            {f.memberRanges.length === 0 && <div style={{ color: "#94a3b8", fontSize: 13 }}>구간을 추가하세요.</div>}
          </div>
          <button type="button" onClick={() => addRange(isEdit)} style={{ marginTop: 8, padding: "6px 14px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#f8fafc", color: "#0f172a", cursor: "pointer", fontSize: 13 }}>+ 구간 추가</button>
          <div style={{ marginTop: 4, fontSize: 12, color: "#94a3b8" }}>건당 단가: 해당 회원수 구간에 적용할 실제 단가(원)를 입력하세요. 최대(명) 비우면 상한 없음(∞).</div>
        </div>

        <div>
          <label style={labelStyle}>적용 대상</label>
          <select value={f.applyScope} onChange={(e) => setF((p) => ({ ...p, applyScope: e.target.value as "all" | "org" | "merchants", applyMerchants: [] }))} style={inputStyle}>
            <option value="all">전체 가맹점</option>
            <option value="org">특정 지사</option>
            <option value="merchants">특정 가맹점</option>
          </select>
        </div>

        {f.applyScope === "org" && (
          <div>
            <label style={labelStyle}>지사 선택</label>
            <select value={f.applyOrgId} onChange={(e) => setF((p) => ({ ...p, applyOrgId: e.target.value }))} style={inputStyle}>
              <option value="">지사 선택</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
        )}

        {f.applyScope === "merchants" && (
          <div>
            <label style={labelStyle}>가맹점 검색 및 선택</label>
            <MerchantSearch
              selected={f.applyMerchants}
              onAdd={(code) => setF((p) => ({ ...p, applyMerchants: [...p.applyMerchants, code] }))}
              onRemove={(code) => setF((p) => ({ ...p, applyMerchants: p.applyMerchants.filter((c) => c !== code) }))}
            />
          </div>
        )}
      </div>
    );
  }

  if (status === "loading" || loading) return <div style={{ padding: 24, color: "#0f172a" }}>Loading...</div>;

  return (
    <div style={{ padding: 24, background: "#f8fafc", minHeight: "100vh" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gap: 24 }}>
        <section style={{ background: "#ffffff", borderRadius: 20, padding: 24, boxShadow: "0 4px 16px rgba(15,23,42,0.06)" }}>
          <h2 style={{ margin: 0, color: "#0f172a", fontSize: 24, fontWeight: 800 }}>구간할인 관리</h2>
          <p style={{ margin: "8px 0 0", color: "#64748b" }}>
            계약 연도 조건과 회원수별 구간 할인금액을 복합 설정합니다. 여러 조건이 맞으면 가장 높은 할인금액이 적용됩니다.
          </p>
        </section>

        {message && (
          <div style={{ padding: "14px 18px", borderRadius: 12, background: message.error ? "#fee2e2" : "#f0fdf4", border: `1px solid ${message.error ? "#fca5a5" : "#86efac"}`, color: message.error ? "#b91c1c" : "#166534", fontWeight: 600, fontSize: 14 }}>
            {message.text}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 24, alignItems: "start" }}>
          {/* List */}
          <section style={{ background: "#ffffff", borderRadius: 20, padding: 24, boxShadow: "0 4px 16px rgba(15,23,42,0.06)" }}>
            <h3 style={{ marginTop: 0, color: "#0f172a", fontWeight: 700, fontSize: 16 }}>등록된 구간할인 조건</h3>
            {tiers.length === 0 ? (
              <div style={{ color: "#64748b", padding: "20px 0" }}>등록된 조건이 없습니다.</div>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {tiers.map((t) => (
                  <li key={t.id} style={{ borderBottom: "1px solid #f1f5f9", padding: "16px 0" }}>
                    {editId === t.id ? (
                      <div style={{ display: "grid", gap: 14 }}>
                        {renderFormBody(editForm, setEditForm, true)}
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={saveTier} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>저장</button>
                          <button onClick={() => { setEditId(null); setMessage(null); }} style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid #cbd5e1", background: "#fff", color: "#0f172a", fontWeight: 600, cursor: "pointer", fontSize: 14 }}>취소</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <strong style={{ color: "#0f172a", fontSize: 15 }}>{t.name}</strong>
                            <span style={{ padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: t.is_active ? "#dcfce7" : "#f1f5f9", color: t.is_active ? "#166534" : "#94a3b8" }}>
                              {t.is_active ? "적용중" : "비활성"}
                            </span>
                          </div>
                          <div style={{ fontSize: 13, color: "#475569", display: "grid", gap: 3 }}>
                            {t.criteria_date ? (
                              <div>계약 연도: <strong>{t.criteria_date.split("T")[0]}</strong> {t.criteria_direction === "before" ? "이전" : "이후"}</div>
                            ) : (
                              <div style={{ color: "#94a3b8" }}>계약 연도 조건 없음</div>
                            )}
                            <div>
                              회원수 구간:{" "}
                              {(t.member_ranges || []).length === 0 ? "—" :
                                (t.member_ranges || []).map((r, i) => (
                                  <span key={i} style={{ marginRight: 8 }}>
                                    {r.min}~{r.max ?? "∞"}명 → <strong style={{ color: "#0f172a" }}>₩{Number(r.fixed_price ?? (r as any).discount ?? 0).toLocaleString()}/건</strong>
                                  </span>
                                ))}
                            </div>
                            <div>
                              적용 대상: {t.apply_scope === "all" ? "전체" : t.apply_scope === "org" ? (t.org_name || `지사ID:${t.apply_org_id}`) : `가맹점 ${(t.apply_merchants || []).length}개`}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                          <button onClick={() => { setEditId(t.id); setEditForm(tierToForm(t)); setMessage(null); }}
                            style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#f8fafc", color: "#0f172a", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>수정</button>
                          <button onClick={() => toggleActive(t)}
                            style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#f8fafc", color: "#0f172a", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                            {t.is_active ? "비활성화" : "활성화"}
                          </button>
                          <button onClick={() => deleteTier(t.id, t.name)}
                            style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #fecaca", background: "#fff5f5", color: "#dc2626", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>삭제</button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Create Form */}
          <section style={{ background: "#ffffff", borderRadius: 20, padding: 24, boxShadow: "0 4px 16px rgba(15,23,42,0.06)" }}>
            <h3 style={{ marginTop: 0, color: "#0f172a", fontWeight: 700, fontSize: 16 }}>조건 추가</h3>
            {renderFormBody(form, setForm, false)}
            <button onClick={createTier} style={{ marginTop: 16, padding: "12px 18px", borderRadius: 10, border: "none", background: "#2563eb", color: "#ffffff", fontWeight: 700, cursor: "pointer", fontSize: 14, width: "100%" }}>
              조건 추가
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
