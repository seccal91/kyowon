"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Mapping = { merchant_code: string; org_id: number };

type Org = { id: number; name: string };

export default function MappingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [merchant, setMerchant] = useState('');
  const [orgId, setOrgId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => { if (status === 'unauthenticated') router.push('/auth/signin'); }, [status, router]);
  useEffect(() => { if (status !== 'loading') fetchData(); }, [status]);

  async function fetchData() {
    setLoading(true);
    const [mapRes, orgRes] = await Promise.all([fetch('/api/mappings'), fetch('/api/organizations')]);
    const mapBody = await mapRes.json();
    const orgBody = await orgRes.json();
    setMappings(mapBody.mappings || []);
    setOrgs(orgBody.organizations || []);
    setLoading(false);
  }

  async function addMapping() {
    setMessage(null);
    if (!merchant || !orgId) return setMessage('모든 항목을 입력하세요.');
    const res = await fetch('/api/mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant_code: merchant, org_id: Number(orgId) }),
    });
    const body = await res.json();
    if (!res.ok) return setMessage(body.message || '오류');
    setMerchant('');
    setOrgId('');
    fetchData();
  }

  async function removeMapping(code: string) {
    if (!confirm(`${code} 매핑을 삭제하시겠습니까?`)) return;
    const res = await fetch(`/api/mappings?merchant_code=${encodeURIComponent(code)}`, { method: 'DELETE' });
    const body = await res.json();
    if (!res.ok) return setMessage(body.message || '오류');
    fetchData();
  }

  async function autoAssign() {
    setMessage(null);
    const res = await fetch('/api/mappings/auto', { method: 'POST' });
    const body = await res.json();
    if (!res.ok) return setMessage(body.message || '오류');
    setMessage(`자동 매핑 완료: ${body.inserted}건 추가`);
    fetchData();
  }

  if (status === 'loading' || loading) return <div style={{ padding: 24 }}>Loading...</div>;

  return (
    <div style={{ padding: 24, background: '#f8fafc', minHeight: '100vh' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', display: 'grid', gap: 24 }}>
        <section style={{ background: '#ffffff', borderRadius: 20, padding: 24, boxShadow: '0 20px 60px rgba(15,23,42,0.08)' }}>
          <h2 style={{ margin: 0, color: '#0f172a' }}>가맹점 매핑</h2>
          <p style={{ marginTop: 8, color: '#0f172a' }}>가맹점과 지사를 직접 연결하거나 자동으로 배치하세요.</p>
        </section>
        <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: 24 }}>
          <section style={{ background: '#ffffff', borderRadius: 20, padding: 24, boxShadow: '0 20px 60px rgba(15,23,42,0.08)' }}>
            <h3 style={{ marginTop: 0, color: '#0f172a' }}>현재 매핑</h3>
            {mappings.length === 0 ? (
              <div style={{ color: '#0f172a' }}>등록된 매핑이 없습니다.</div>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {mappings.map((map) => (
                  <li key={map.merchant_code} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #e2e8f0' }}>
                    <div style={{ color: '#0f172a' }}><strong>{map.merchant_code}</strong> → 지사 {map.org_id}</div>
                    <button onClick={() => removeMapping(map.merchant_code)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#0f172a', cursor: 'pointer' }}>삭제</button>
                  </li>
                ))}
              </ul>
            )}
            <div style={{ marginTop: 16 }}>
              <button onClick={autoAssign} style={{ padding: '12px 18px', borderRadius: 10, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}>자동 매핑 실행</button>
              {message && <div style={{ marginTop: 12, color: '#047857' }}>{message}</div>}
            </div>
          </section>
          <section style={{ background: '#ffffff', borderRadius: 20, padding: 24, boxShadow: '0 20px 60px rgba(15,23,42,0.08)' }}>
            <h3 style={{ marginTop: 0, color: '#0f172a' }}>직접 매핑 추가</h3>
            <div style={{ display: 'grid', gap: 14 }}>
              <label style={{ color: '#0f172a' }}>가맹점 코드</label>
              <input value={merchant} onChange={(e) => setMerchant(e.target.value)} style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #cbd5e1', color: '#0f172a' }} />
              <label style={{ color: '#0f172a' }}>지사 선택</label>
              <select value={orgId} onChange={(e) => setOrgId(e.target.value)} style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #cbd5e1', color: '#0f172a' }}>
                <option value="">선택</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
              <button onClick={addMapping} style={{ padding: '12px 14px', borderRadius: 10, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}>매핑 저장</button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
