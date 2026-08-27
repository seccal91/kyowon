import Link from "next/link";

export default function UploadPage() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 40, fontFamily: "sans-serif", color: "#0f172a" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 16 }}>데이터 업로드 안내</h1>
      <p style={{ lineHeight: 1.7, color: "#475569" }}>
        원본 엑셀 전체를 저장하는 기존 업로드 방식은 개인정보 보호를 위해 비활성화했습니다.
        데이터 등록은 필요한 컬럼만 추출해서 저장하는 관리자 업로드 화면에서 진행해주세요.
      </p>
      <Link
        href="/admin/upload"
        style={{
          display: "inline-block",
          marginTop: 20,
          padding: "12px 18px",
          borderRadius: 10,
          background: "#2563eb",
          color: "#ffffff",
          fontWeight: 700,
          textDecoration: "none",
        }}
      >
        관리자 업로드로 이동
      </Link>
    </main>
  );
}
