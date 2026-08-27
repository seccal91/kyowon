"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

const MENU_ITEMS = [
  { href: "/admin/organizations", label: "조직관리", description: "사업단, 지사, 담당 지역 관리" },
  { href: "/admin/merchants", label: "가맹점 관리", description: "가맹점 목록과 상태 확인" },
  { href: "/admin/orders", label: "주문관리", description: "주문 데이터 확인" },
  { href: "/admin/mappings", label: "가맹점 매핑", description: "가맹점과 지사 연결 관리" },
  { href: "/admin/promotions", label: "프로모션관리", description: "프로모션 조건과 매출 반영 여부 관리" },
  { href: "/admin/discount-tiers", label: "구간할인 관리", description: "계약일과 회원수별 단가 관리" },
  { href: "/admin/statistics", label: "통계관리", description: "월별 지사/사업단/가맹점 통계" },
  { href: "/admin/performance", label: "성과관리", description: "그룹별 순위와 목표 달성률 관리" },
  { href: "/admin/upload", label: "데이터 업로드", description: "엑셀에서 필요한 항목만 추출 등록" },
];

export default function AdminIndex() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/signin");
  }, [status, router]);

  if (status === "loading") return <div style={{ padding: 24, color: "#0f172a" }}>Loading...</div>;
  if (!session) return <div style={{ padding: 24, color: "#0f172a" }}>Redirecting...</div>;

  return (
    <div style={{ padding: 24, background: "#f8fafc", minHeight: "100vh", color: "#0f172a" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto", display: "grid", gap: 20 }}>
        <section style={{ background: "#ffffff", borderRadius: 20, padding: 28, boxShadow: "0 20px 60px rgba(15,23,42,0.08)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 30, color: "#0f172a", fontWeight: 800 }}>관리자 대시보드</h1>
              <p style={{ margin: "8px 0 0", color: "#64748b" }}>
                환영합니다, {(session.user as any)?.email}. 아래 메뉴에서 관리 기능을 선택하세요.
              </p>
            </div>
            <button
              type="button"
              onClick={() => signOut()}
              style={{
                background: "#2563eb",
                color: "#ffffff",
                border: "none",
                borderRadius: 10,
                padding: "12px 18px",
                cursor: "pointer",
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              로그아웃
            </button>
          </div>
        </section>

        <section style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))" }}>
          {MENU_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "block",
                padding: "18px 20px",
                borderRadius: 14,
                textDecoration: "none",
                background: "#ffffff",
                color: "#0f172a",
                border: "1px solid #e2e8f0",
                boxShadow: "0 8px 24px rgba(15,23,42,0.05)",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 6 }}>{item.label}</div>
              <div style={{ color: "#64748b", fontSize: 13, lineHeight: 1.5 }}>{item.description}</div>
            </Link>
          ))}
        </section>
      </div>
    </div>
  );
}
