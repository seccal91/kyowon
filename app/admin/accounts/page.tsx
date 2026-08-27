"use client";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const ALL_PERMISSIONS = [
  "전체",
  "통계관리",
  "성과수수료",
  "조직관리",
  "가맹점 매핑",
  "프로모션관리",
  "데이터 업로드",
];

type User = {
  id: number;
  email: string;
  name: string;
  role: string;
  permissions: string[];
  created_at: string;
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 14px",
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  color: "#0f172a",
  background: "#ffffff",
  fontSize: 14,
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 6,
  color: "#0f172a",
  fontSize: 13,
  fontWeight: 600,
};

const primaryBtn: React.CSSProperties = {
  padding: "11px 20px",
  borderRadius: 10,
  border: "none",
  background: "#2563eb",
  color: "#ffffff",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 14,
};

const secondaryBtn: React.CSSProperties = {
  padding: "11px 20px",
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  color: "#0f172a",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 14,
};

function RoleBadge({ role }: { role: string }) {
  return (
    <span
      style={{
        padding: "2px 10px",
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        background: role === "admin" ? "#fef3c7" : "#e2e8f0",
        color: role === "admin" ? "#92400e" : "#475569",
      }}
    >
      {role === "admin" ? "관리자" : "일반"}
    </span>
  );
}

function PermissionChips({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (p: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {ALL_PERMISSIONS.map((p) => {
        const active = selected.includes(p);
        return (
          <button
            key={p}
            type="button"
            onClick={() => onToggle(p)}
            style={{
              padding: "6px 14px",
              borderRadius: 20,
              border: active ? "1px solid #93c5fd" : "1px solid #e2e8f0",
              background: active ? "#dbeafe" : "#f8fafc",
              color: active ? "#1d4ed8" : "#64748b",
              fontSize: 13,
              fontWeight: active ? 700 : 400,
              cursor: "pointer",
            }}
          >
            {p}
          </button>
        );
      })}
    </div>
  );
}

export default function AccountsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [permissions, setPermissions] = useState<string[]>(["전체"]);

  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editPermissions, setEditPermissions] = useState<string[]>(["전체"]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/signin");
    if (status === "authenticated" && (session?.user as any)?.role !== "admin")
      router.push("/admin");
  }, [status, session, router]);

  useEffect(() => {
    if (status === "authenticated") fetchUsers();
  }, [status]);

  async function fetchUsers() {
    setLoading(true);
    const res = await fetch("/api/accounts");
    const b = await res.json();
    setUsers(b.users || []);
    setLoading(false);
  }

  function togglePermission(
    p: string,
    list: string[],
    setList: (l: string[]) => void
  ) {
    if (p === "전체") {
      setList(["전체"]);
      return;
    }
    const withoutAll = list.filter((x) => x !== "전체");
    if (withoutAll.includes(p)) {
      const next = withoutAll.filter((x) => x !== p);
      setList(next.length ? next : ["전체"]);
    } else {
      setList([...withoutAll, p]);
    }
  }

  async function createUser() {
    setMessage(null);
    if (!email.trim() || !password.trim())
      return setMessage({ text: "이메일과 비밀번호를 입력하세요.", error: true });

    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, password, permissions }),
    });
    const b = await res.json();
    if (!res.ok) return setMessage({ text: b.message || "오류", error: true });

    setEmail("");
    setName("");
    setPassword("");
    setPermissions(["전체"]);
    fetchUsers();
    setMessage({ text: `'${b.user.email}' 계정이 생성되었습니다.` });
  }

  async function updateUser() {
    setMessage(null);
    if (!editId) return;
    const res = await fetch("/api/accounts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editId,
        name: editName,
        password: editPassword || undefined,
        permissions: editPermissions,
      }),
    });
    const b = await res.json();
    if (!res.ok) return setMessage({ text: b.message || "오류", error: true });

    setEditId(null);
    setEditName("");
    setEditPassword("");
    setEditPermissions(["전체"]);
    fetchUsers();
    setMessage({ text: "계정이 수정되었습니다." });
  }

  async function deleteUser(u: User) {
    if (!confirm(`'${u.email}' 계정을 삭제하시겠습니까?`)) return;
    const res = await fetch(`/api/accounts?id=${u.id}`, { method: "DELETE" });
    const b = await res.json();
    if (!res.ok) return setMessage({ text: b.message || "오류", error: true });
    fetchUsers();
    setMessage({ text: "계정이 삭제되었습니다." });
  }

  function startEdit(u: User) {
    setEditId(u.id);
    setEditName(u.name || "");
    setEditPassword("");
    setEditPermissions(u.permissions || ["전체"]);
    setMessage(null);
  }

  if (status === "loading" || loading)
    return <div style={{ padding: 24, color: "#0f172a" }}>Loading...</div>;

  return (
    <div style={{ padding: 24, background: "#f8fafc", minHeight: "100vh" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", display: "grid", gap: 24 }}>
        {/* Header */}
        <section
          style={{
            background: "#ffffff",
            borderRadius: 20,
            padding: 24,
            boxShadow: "0 4px 16px rgba(15,23,42,0.06)",
          }}
        >
          <h2 style={{ margin: 0, color: "#0f172a", fontSize: 24, fontWeight: 800 }}>
            계정 관리
          </h2>
          <p style={{ margin: "8px 0 0", color: "#64748b" }}>
            사용자 계정을 생성하고 페이지별 접근 권한을 관리합니다. 관리자 계정은 수정·삭제할 수
            없습니다.
          </p>
        </section>

        {/* Message */}
        {message && (
          <div
            style={{
              padding: "14px 18px",
              borderRadius: 12,
              background: message.error ? "#fee2e2" : "#f0fdf4",
              border: `1px solid ${message.error ? "#fca5a5" : "#86efac"}`,
              color: message.error ? "#b91c1c" : "#166534",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            {message.text}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 24 }}>
          {/* User List */}
          <section
            style={{
              background: "#ffffff",
              borderRadius: 20,
              padding: 24,
              boxShadow: "0 4px 16px rgba(15,23,42,0.06)",
            }}
          >
            <h3 style={{ marginTop: 0, color: "#0f172a", fontWeight: 700, fontSize: 16 }}>
              사용자 목록
            </h3>

            {users.length === 0 ? (
              <div style={{ color: "#64748b", padding: "20px 0" }}>
                등록된 계정이 없습니다.
              </div>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {users.map((u) => (
                  <li
                    key={u.id}
                    style={{ borderBottom: "1px solid #f1f5f9", padding: "16px 0" }}
                  >
                    {editId === u.id ? (
                      <div style={{ display: "grid", gap: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 15 }}>
                            {u.email}
                          </div>
                          <RoleBadge role={u.role} />
                        </div>

                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="이름"
                          style={inputStyle}
                        />
                        <input
                          type="password"
                          value={editPassword}
                          onChange={(e) => setEditPassword(e.target.value)}
                          placeholder="새 비밀번호 (변경 시에만 입력)"
                          style={inputStyle}
                        />

                        <div>
                          <div
                            style={{
                              marginBottom: 8,
                              fontSize: 13,
                              color: "#475569",
                              fontWeight: 600,
                            }}
                          >
                            접근 권한
                          </div>
                          <PermissionChips
                            selected={editPermissions}
                            onToggle={(p) =>
                              togglePermission(p, editPermissions, setEditPermissions)
                            }
                          />
                        </div>

                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={updateUser} style={primaryBtn}>
                            저장
                          </button>
                          <button
                            onClick={() => {
                              setEditId(null);
                              setMessage(null);
                            }}
                            style={secondaryBtn}
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: 12,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              alignItems: "center",
                              marginBottom: 4,
                            }}
                          >
                            <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 15 }}>
                              {u.email}
                            </div>
                            <RoleBadge role={u.role} />
                          </div>
                          {u.name && (
                            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 6 }}>
                              {u.name}
                            </div>
                          )}
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {(u.permissions || []).map((p) => (
                              <span
                                key={p}
                                style={{
                                  padding: "2px 10px",
                                  borderRadius: 20,
                                  background: "#dbeafe",
                                  color: "#1d4ed8",
                                  fontSize: 12,
                                  fontWeight: 600,
                                }}
                              >
                                {p}
                              </span>
                            ))}
                          </div>
                        </div>

                        {u.role !== "admin" && (
                          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                            <button
                              onClick={() => startEdit(u)}
                              style={{
                                padding: "8px 14px",
                                borderRadius: 8,
                                border: "1px solid #cbd5e1",
                                background: "#f8fafc",
                                color: "#0f172a",
                                cursor: "pointer",
                                fontSize: 13,
                                fontWeight: 600,
                              }}
                            >
                              수정
                            </button>
                            <button
                              onClick={() => deleteUser(u)}
                              style={{
                                padding: "8px 14px",
                                borderRadius: 8,
                                border: "1px solid #fecaca",
                                background: "#fff5f5",
                                color: "#dc2626",
                                cursor: "pointer",
                                fontSize: 13,
                                fontWeight: 600,
                              }}
                            >
                              삭제
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Create Form */}
          <section
            style={{
              background: "#ffffff",
              borderRadius: 20,
              padding: 24,
              boxShadow: "0 4px 16px rgba(15,23,42,0.06)",
              alignSelf: "start",
            }}
          >
            <h3 style={{ marginTop: 0, color: "#0f172a", fontWeight: 700, fontSize: 16 }}>
              계정 생성
            </h3>
            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={labelStyle}>아이디 (이메일)</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@kyowon.co.kr"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>이름</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="홍길동"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>비밀번호</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>접근 권한</label>
                <PermissionChips
                  selected={permissions}
                  onToggle={(p) => togglePermission(p, permissions, setPermissions)}
                />
              </div>
              <button onClick={createUser} style={{ ...primaryBtn, width: "100%" }}>
                계정 생성
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
