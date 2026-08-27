import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      message:
        "원본 엑셀 전체 저장 방식은 개인정보 보호를 위해 비활성화되었습니다. /admin/upload의 데이터 등록 기능을 사용해주세요.",
    },
    { status: 410 }
  );
}
