"use client";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { REGION_MAJORS, REGION_MAP } from "../../lib/regions";

type Region = { major: string; minor: string };
type BusinessUnit = { id: number; name: string };
type Org = {
  id: number; name: string; regions: Region[]; group_name: string;
  business_unit_id: number | null; business_unit_name: string | null;
};

const GROUP_OPTIONS = ['블루팀', '그린팀', '예외'];

const inputStyle: CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: '1px solid #cbd5e1', color: '#0f172a', background: '#ffffff',
  fontSize: 14, boxSizing: 'border-box',
};

export default function OrganizationsPage() {
  const { status } = useSession();
  const router = useRouter();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const formRef = useRef<HTMLDivElement | null>(null);
  const [groupName, setGroupName] = useState('예외');
  const [businessUnitId, setBusinessUnitId] = useState<string>("");
  const [regions, setRegions] = useState<Region[]>([]);
  const [editId, setEditId] = useState<number | null>(null);

  // Business unit management
  const [newBuName, setNewBuName] = useState("");
  const [buMessage, setBuMessage] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/signin");
  }, [status, router]);

  useEffect(() => { fetchAll(); }, []);

  useEffect(() => {
    if (editId !== null) {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [editId]);

  function normalizeRegions(value: any): Region[] {
    if (!value) return [];
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch { return []; }
    }
    if (!Array.isArray(value)) return [];
    return value.map((r) => ({ major: String(r?.major || ''), minor: String(r?.minor || '') }));
  }

  async function fetchAll() {
    setLoading(true);
    const [orgRes, buRes] = await Promise.all([
      fetch('/api/organizations').then((r) => r.json()),
      fetch('/api/business-units').then((r) => r.json()),
    ]);
    const list = ((orgRes.organizations || []) as any[])
      .map((org) => ({ ...org, regions: normalizeRegions(org.regions) }))
      .slice()
      .sort((a: Org, b: Org) => a.name.localeCompare(b.name, 'ko'));
    setOrgs(list);
    setBusinessUnits(buRes.business_units || []);
    setLoading(false);
  }

  function addRegion() { setRegions([...regions, { major: '', minor: '' }]); }

  function updateRegion(idx: number, key: 'major' | 'minor', value: string) {
    const copy = [...regions];
    copy[idx] = { ...copy[idx], [key]: value };
    if (key === 'major') copy[idx].minor = '';
    setRegions(copy);
  }

  async function submit() {
    // 대분류만 선택 + 중분류 미선택 → 해당 대분류의 모든 중분류 자동 확장
    const expandedRegions: Region[] = [];
    for (const r of regions) {
      if (r.major && !r.minor) {
        const minors = REGION_MAP[r.major] || [];
        for (const minor of minors) expandedRegions.push({ major: r.major, minor });
      } else if (r.major && r.minor) {
        expandedRegions.push(r);
      }
    }
    setRegions(expandedRegions);

    const payload: any = { name, group_name: groupName, regions: expandedRegions, business_unit_id: businessUnitId ? Number(businessUnitId) : null };

    const seen = new Set<string>();
    for (const r of payload.regions) {
      const key = `${r.major}||${r.minor}`;
      if (seen.has(key)) {
        alert(`'${r.major} ${r.minor}' 지역이 중복 선택되었습니다. 같은 지역은 하나만 등록할 수 있습니다.`);
        return;
      }
      seen.add(key);
    }

    for (const r of payload.regions) {
      const exists = orgs.some((o) => o.id !== editId && (o.regions || []).some((rr) => rr.major === r.major && rr.minor === r.minor));
      if (exists) { alert(`${r.major} ${r.minor} 은(는) 이미 다른 지사에 할당되어 있습니다.`); return; }
    }
    if (editId) Object.assign(payload, { id: editId });
    const method = editId ? 'PUT' : 'POST';
    const res = await fetch('/api/organizations', { method, body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } });
    if (res.ok) {
      setName(''); setRegions([]); setEditId(null); setGroupName('예외'); setBusinessUnitId(''); fetchAll();
    } else {
      const b = await res.json();
      alert(b.message || '오류가 발생했습니다.');
    }
  }

  async function removeOrg(id: number) {
    if (!confirm('지사를 삭제하시겠습니까?')) return;
    const res = await fetch(`/api/organizations?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      if (editId === id) { setEditId(null); setName(''); setGroupName('예외'); setBusinessUnitId(''); setRegions([]); }
      fetchAll();
    } else { const b = await res.json(); alert(b.message || '오류'); }
  }

  function startEdit(org: Org) {
    setEditId(org.id);
    setName(org.name);
    setGroupName(org.group_name || '예외');
    setBusinessUnitId(org.business_unit_id ? String(org.business_unit_id) : '');
    setRegions(normalizeRegions(org.regions));
  }

  async function createBusinessUnit() {
    setBuMessage(null);
    if (!newBuName.trim()) return;
    const res = await fetch('/api/business-units', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newBuName.trim() }),
    });
    const b = await res.json();
    if (!res.ok) { setBuMessage(b.message || '오류'); return; }
    setNewBuName('');
    fetchAll();
  }

  async function deleteBusinessUnit(id: number, name: string) {
    if (!confirm(`'${name}' 사업단을 삭제하시겠습니까? 소속 지사들의 사업단 연결이 해제됩니다.`)) return;
    await fetch(`/api/business-units?id=${id}`, { method: 'DELETE' });
    fetchAll();
  }

  const regionRows = useMemo(() => regions.map((r) => ({ ...r, minorOptions: REGION_MAP[r.major] || [] })), [regions]);

  function isRegionAssigned(major: string, minor: string) {
    if (!major || !minor) return false;
    return orgs.some((o) => o.id !== editId && (o.regions || []).some((rr) => rr.major === major && rr.minor === minor));
  }

  if (status === 'loading' || loading) return <div style={{ padding: 24, color: '#0f172a' }}>Loading...</div>;

  return (
    <div style={{ padding: 24, color: '#0f172a' }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, color: '#0f172a' }}>조직관리</h2>
        <p style={{ margin: '8px 0 0', color: '#64748b' }}>지사를 추가/수정하고 담당 지역 및 사업단을 관리합니다.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 24 }}>
        {/* Org List */}
        <section style={{ background: '#ffffff', borderRadius: 20, padding: 24, boxShadow: '0 10px 24px rgba(15,23,42,0.08)' }}>
          <h3 style={{ color: '#0f172a', marginTop: 0 }}>지사 목록</h3>
          {orgs.length === 0 ? (
            <div style={{ color: '#64748b' }}>등록된 지사가 없습니다.</div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {orgs.map((org) => (
                <li key={org.id} style={{ borderBottom: '1px solid #e2e8f0', padding: '16px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16, color: '#0f172a' }}>{org.name}</div>
                      <div style={{ marginTop: 4, color: '#475569', fontSize: 13 }}>
                        {org.business_unit_name && <span style={{ marginRight: 8, padding: '2px 8px', borderRadius: 6, background: '#eff6ff', color: '#1d4ed8', fontSize: 12, fontWeight: 600 }}>{org.business_unit_name}</span>}
                        {org.group_name}
                        {org.regions.length > 0 && ` · ${org.regions.map((r) => `${r.major} / ${r.minor}`).join(', ')}`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button onClick={() => startEdit(org)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#e2e8f0', color: '#0f172a', cursor: 'pointer' }}>수정</button>
                      <button onClick={() => removeOrg(org.id)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff5f5', color: '#dc2626', cursor: 'pointer' }}>삭제</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Right column */}
        <div ref={formRef} style={{ display: 'grid', gap: 20, alignContent: 'start', position: 'sticky', top: 24, alignSelf: 'start' }}>
          {/* Create/Edit Org Form */}
          <section style={{ background: '#ffffff', borderRadius: 20, padding: 24, boxShadow: '0 10px 24px rgba(15,23,42,0.08)' }}>
            <h3 style={{ color: '#0f172a', marginTop: 0 }}>{editId ? '지사 수정' : '지사 추가'}</h3>
            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 8, color: '#0f172a', fontSize: 13, fontWeight: 600 }}>지사명</label>
                <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 8, color: '#0f172a', fontSize: 13, fontWeight: 600 }}>사업단</label>
                <select value={businessUnitId} onChange={(e) => setBusinessUnitId(e.target.value)} style={inputStyle}>
                  <option value="">사업단 없음</option>
                  {businessUnits.map((bu) => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 8, color: '#0f172a', fontSize: 13, fontWeight: 600 }}>그룹</label>
                <select value={groupName} onChange={(e) => setGroupName(e.target.value)} style={inputStyle}>
                  {GROUP_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <label style={{ color: '#0f172a', fontSize: 13, fontWeight: 600 }}>담당 지역</label>
                  <button type="button" onClick={addRegion} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#e2e8f0', color: '#0f172a', cursor: 'pointer', fontSize: 13 }}>지역 추가</button>
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {regionRows.map((region, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'center' }}>
                      <select value={region.major} onChange={(e) => updateRegion(idx, 'major', e.target.value)} style={inputStyle}>
                        <option value="">대분류 선택</option>
                        {REGION_MAJORS.map((major: string) => <option key={major} value={major}>{major}</option>)}
                      </select>
                      <select value={region.minor} onChange={(e) => updateRegion(idx, 'minor', e.target.value)} disabled={!region.major}
                        style={{ ...inputStyle, color: !region.minor && region.major ? '#2563eb' : '#0f172a', fontWeight: !region.minor && region.major ? 600 : 400 }}>
                        <option value="">{region.major ? `전체 (${(REGION_MAP[region.major]||[]).length}개 자동선택)` : '중분류 선택'}</option>
                        {(REGION_MAP[region.major] || []).map((minor: string) => (
                          <option key={minor} value={minor} disabled={isRegionAssigned(region.major, minor)}>
                            {minor}{isRegionAssigned(region.major, minor) ? ' (할당됨)' : ''}
                          </option>
                        ))}
                        {region.minor && !((REGION_MAP[region.major] || []).includes(region.minor)) && <option value={region.minor}>{region.minor}</option>}
                      </select>
                      <button type="button" onClick={() => setRegions(regions.filter((_, i) => i !== idx))} style={{ padding: '10px 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff5f5', color: '#dc2626', cursor: 'pointer', fontSize: 13 }}>×</button>
                    </div>
                  ))}
                  {regionRows.length === 0 && <div style={{ color: '#94a3b8', fontSize: 13 }}>지역을 추가하려면 버튼을 눌러주세요.</div>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={submit} style={{ flex: 1, padding: '12px 18px', borderRadius: 10, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
                  {editId ? '업데이트' : '생성'}
                </button>
                {editId && (
                  <button onClick={() => { setEditId(null); setName(''); setGroupName('예외'); setBusinessUnitId(''); setRegions([]); }}
                    style={{ padding: '12px 18px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>취소</button>
                )}
              </div>
            </div>
          </section>

          {/* Business Unit Management */}
          <section style={{ background: '#ffffff', borderRadius: 20, padding: 24, boxShadow: '0 10px 24px rgba(15,23,42,0.08)' }}>
            <h3 style={{ color: '#0f172a', marginTop: 0, fontSize: 15 }}>사업단 관리</h3>
            {businessUnits.length > 0 && (
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 14px' }}>
                {businessUnits.map((bu) => (
                  <li key={bu.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ fontWeight: 600, color: '#0f172a', fontSize: 14 }}>{bu.name}</span>
                    <button onClick={() => deleteBusinessUnit(bu.id, bu.name)}
                      style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff5f5', color: '#dc2626', cursor: 'pointer', fontSize: 12 }}>삭제</button>
                  </li>
                ))}
              </ul>
            )}
            {buMessage && <div style={{ marginBottom: 10, color: '#dc2626', fontSize: 13 }}>{buMessage}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={newBuName} onChange={(e) => setNewBuName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createBusinessUnit()}
                placeholder="새 사업단명" style={{ ...inputStyle, flex: 1 }} />
              <button onClick={createBusinessUnit}
                style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: '#0f172a', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' }}>추가</button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
