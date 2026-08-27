"use client";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/admin", label: "대시보드", permission: null },
  { href: "/admin/organizations", label: "조직관리", permission: "조직관리" },
  { href: "/admin/merchants", label: "가맹점 관리", permission: "조직관리" },
  { href: "/admin/orders", label: "주문관리", permission: "조직관리" },
  { href: "/admin/mappings", label: "가맹점 매핑", permission: "가맹점 매핑" },
  { href: "/admin/promotions", label: "프로모션관리", permission: "프로모션관리" },
  { href: "/admin/discount-tiers", label: "구간할인 관리", permission: "프로모션관리" },
  { href: "/admin/statistics", label: "통계관리", permission: "통계관리" },
  { href: "/admin/performance", label: "성과관리", permission: "통계관리" },
  { href: "/admin/upload", label: "데이터 업로드", permission: "데이터 업로드" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();

  const role = (session?.user as any)?.role;
  const userPermissions: string[] = (session?.user as any)?.permissions || ["전체"];
  const isAdmin = role === "admin";
  const hasAll = isAdmin || userPermissions.includes("전체");

  function canAccess(permission: string | null) {
    if (permission === null) return true;
    if (hasAll) return true;
    return userPermissions.includes(permission);
  }

  const visibleItems = NAV_ITEMS.filter((item) => canAccess(item.permission));

  function linkStyle(href: string): React.CSSProperties {
    const active = pathname === href || (href !== "/admin" && pathname.startsWith(href));
    return {
      color: active ? "#ffffff" : "#94a3b8",
      textDecoration: "none",
      padding: "10px 12px",
      borderRadius: 8,
      background: active ? "rgba(255,255,255,0.12)" : "transparent",
      fontWeight: active ? 700 : 400,
      fontSize: 14,
      display: "block",
    };
  }

  return (
    <div style={{ height: "100vh", display: "flex", background: "#f1f5f9", overflow: "hidden" }}>
      <aside
        style={{
          width: 220,
          background: "#0f172a",
          color: "#f8fafc",
          padding: "24px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          flexShrink: 0,
          height: "100vh",
          overflowY: "auto",
          position: "sticky",
          top: 0,
        }}
      >
        <Link
          href="/admin"
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: "#ffffff",
            padding: "0 12px",
            marginBottom: 16,
            letterSpacing: "-0.01em",
            textDecoration: "none",
            display: "block",
          }}
        >
          KYOWON ERP
        </Link>

        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {visibleItems.map((item) => (
            <Link key={item.href} href={item.href} style={linkStyle(item.href)}>
              {item.label}
            </Link>
          ))}
        </nav>

        {isAdmin && (
          <div
            style={{
              marginTop: "auto",
              paddingTop: 16,
              borderTop: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <Link href="/admin/accounts" style={linkStyle("/admin/accounts")}>
              계정 관리
            </Link>
          </div>
        )}
      </aside>

      <main style={{ flex: 1, height: "100vh", overflowY: "auto" }}>{children}</main>
    </div>
  );
}
