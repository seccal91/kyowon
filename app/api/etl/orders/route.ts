import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { etlOrders } from '../../../../lib/etl';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token || token.role !== 'admin') return NextResponse.json({ message: '권한 없음' }, { status: 401 });

    const res = await etlOrders();
    return NextResponse.json({ ok: true, res });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: '서버 오류' }, { status: 500 });
  }
}
