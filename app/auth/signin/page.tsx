"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await signIn("credentials", {
      redirect: false,
      email,
      password,
    } as any);

    if (res?.error) {
      setError(res.error as string);
      alert("로그인 실패: 이메일 또는 비밀번호를 확인하세요.");
      return;
    }

    router.push("/admin");
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      background: "radial-gradient(circle at top, #0b1b2f, #05080f)",
    }}>
      <div style={{
        width: "100%",
        maxWidth: 420,
        background: "#ffffff",
        color: "#111111",
        borderRadius: 16,
        boxShadow: "0 24px 80px rgba(0,0,0,0.24)",
        padding: 28,
      }}>
        <h1 style={{ marginBottom: 24, fontSize: 28, textAlign: "center" }}>관리자 로그인</h1>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>아이디</label>
            <input
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(e as any); }}
              required
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 8,
                border: "1px solid #cbd5e1",
                background: "#f9fafb",
                color: "#111111",
              }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(e as any); }}
              required
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 8,
                border: "1px solid #cbd5e1",
                background: "#f9fafb",
                color: "#111111",
              }}
            />
          </div>
          {error && (
            <div style={{
              marginBottom: 16,
              color: "#b91c1c",
              background: "#fee2e2",
              padding: "12px 14px",
              borderRadius: 8,
            }}>
              {error}
            </div>
          )}
          <button
            type="submit"
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 8,
              border: "none",
              background: "#1d4ed8",
              color: "white",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            로그인
          </button>
        </form>
      </div>
    </div>
  );
}
