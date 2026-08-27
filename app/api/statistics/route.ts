import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import pool from "../../../lib/db";
import { recomputeStatsForOrg } from "../../../lib/stats";

export const runtime = "nodejs";

const METRIC_LABELS: Record<string, string> = {
  revenue: "매출",
  profit_with_bonus: "지사수익(성과포함)",
  profit_without_bonus: "지사수익(성과제외)",
  orders: "주문수",
  members: "회원수",
  active_merchants: "가동가맹점",
};

async function ensureTables(client: any) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS organizations (
      id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL,
      regions JSONB DEFAULT '[]'::jsonb,
      group_name TEXT DEFAULT '예외',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS merchant_mappings (
      merchant_code TEXT PRIMARY KEY, org_id BIGINT,
      contract_date DATE, member_count INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id BIGSERIAL PRIMARY KEY, source_id BIGINT,
      merchant_code TEXT, merchant_name TEXT,
      year INT, month INT, major TEXT, minor TEXT,
      revenue NUMERIC DEFAULT 0, quantity NUMERIC DEFAULT 0,
      raw JSONB, created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS promotions (
      id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL,
      tiers JSONB DEFAULT '[]'::jsonb, targets JSONB DEFAULT '[]'::jsonb,
      apply_to_sales BOOLEAN DEFAULT false,
      start_date DATE, end_date DATE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS discount_tiers (
      id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL,
      criteria_date DATE, criteria_direction TEXT DEFAULT 'before',
      member_ranges JSONB DEFAULT '[]'::jsonb,
      apply_scope TEXT DEFAULT 'all',
      apply_org_id BIGINT, apply_merchants JSONB DEFAULT '[]'::jsonb,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await client.query(`CREATE TABLE IF NOT EXISTS business_units (id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, created_at TIMESTAMP DEFAULT NOW())`);
  await client.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS business_unit_id BIGINT`);
  await client.query(`ALTER TABLE merchant_mappings ADD COLUMN IF NOT EXISTS contract_date DATE`);
  await client.query(`ALTER TABLE merchant_mappings ADD COLUMN IF NOT EXISTS member_count INT DEFAULT 0`);
  await client.query(`ALTER TABLE promotions ADD COLUMN IF NOT EXISTS apply_to_sales BOOLEAN DEFAULT false`);
  await client.query(`ALTER TABLE promotions ADD COLUMN IF NOT EXISTS start_date DATE`);
  await client.query(`ALTER TABLE promotions ADD COLUMN IF NOT EXISTS end_date DATE`);
  await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS merchant_name TEXT`);
  await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_date DATE`);
  await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type TEXT`);
  await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS grade TEXT`);
  await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled BOOLEAN DEFAULT FALSE`);
  await client.query(`ALTER TABLE discount_tiers ADD COLUMN IF NOT EXISTS member_ranges JSONB DEFAULT '[]'::jsonb`);
  await client.query(`ALTER TABLE discount_tiers ADD COLUMN IF NOT EXISTS criteria_date DATE`);
  await client.query(`ALTER TABLE discount_tiers ADD COLUMN IF NOT EXISTS criteria_direction TEXT DEFAULT 'before'`);
}

function buildMonthKeys(year: number) {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
}

function isPromoActive(promo: any, year: number, month: number) {
  if (!promo.apply_to_sales) return false;
  const d = new Date(year, month - 1, 1);
  if (promo.start_date && new Date(promo.start_date) > d) return false;
  if (promo.end_date && new Date(promo.end_date) < d) return false;
  return true;
}

function getPromoDeduction(promo: any, merchantCode: string, year: number, month: number, quantity: number, adjustedRevenue: number): number {
  if (!promo.targets?.length || !promo.tiers?.length) return 0;
  if (!promo.targets.includes(merchantCode)) return 0;
  if (!isPromoActive(promo, year, month)) return 0;
  let best = 0;
  for (const t of promo.tiers) {
    if (Number(t.threshold) === quantity) {
      const discountType = t.discount_type || "percent";
      const deduction = discountType === "amount"
        ? Number(t.discount) * quantity
        : adjustedRevenue * (Number(t.discount) / 100);
      if (deduction > best) best = deduction;
    }
  }
  return best;
}

interface MemberRange { min: number; max: number | null; fixed_price?: number; discount?: number; }
interface DiscountTier {
  id: number;
  criteria_date: string | null;
  criteria_direction: string;
  member_ranges: MemberRange[];
  apply_scope: string;
  apply_org_id: number | null;
  apply_merchants: string[];
  is_active: boolean;
}

// Returns the fixed unit price to use (null = no matching tier, use base revenue as-is)
function getFixedUnitPrice(
  tiers: DiscountTier[],
  merchantCode: string,
  orgId: number,
  contractDate: string | null,
  memberCount: number
): number | null {
  let best: number | null = null;
  for (const t of tiers) {
    if (!t.is_active) continue;
    if (t.apply_scope === "merchants" && !t.apply_merchants?.includes(merchantCode)) continue;
    if (t.apply_scope === "org" && t.apply_org_id !== orgId) continue;
    if (t.criteria_date) {
      if (!contractDate) continue;
      const cd = new Date(contractDate);
      const cutoff = new Date(t.criteria_date);
      const matches = t.criteria_direction === "before" ? cd <= cutoff : cd > cutoff;
      if (!matches) continue;
    }
    if (t.member_ranges && t.member_ranges.length > 0) {
      for (const range of t.member_ranges) {
        if (memberCount >= range.min && (range.max === null || memberCount <= range.max)) {
          // fixed_price = absolute unit price; lower = bigger discount
          const fp = Number(range.fixed_price ?? range.discount ?? 0);
          if (best === null || fp < best) best = fp;
        }
      }
    }
  }
  return best;
}

function computeMetricValue(
  metric: string,
  baseRevenue: number,
  quantity: number,
  memberCount: number,
  promotions: any[],
  discountTiers: DiscountTier[],
  merchantCode: string,
  orgId: number,
  contractDate: string | null,
  year: number,
  month: number
): number {
  if (metric === "orders") return quantity;
  if (metric === "members") return memberCount;
  if (metric === "active_merchants") return quantity > 0 ? 1 : 0;

  const sign = quantity < 0 ? -1 : 1;
  const absQuantity = Math.abs(quantity);
  const fixedPrice = getFixedUnitPrice(discountTiers, merchantCode, orgId, contractDate, memberCount);
  let adjustedRevenue = fixedPrice !== null ? fixedPrice * absQuantity : Math.abs(baseRevenue);

  const bestPromoDeduction = promotions.reduce((max, p) => {
    const d = getPromoDeduction(p, merchantCode, year, month, absQuantity, adjustedRevenue);
    return d > max ? d : max;
  }, 0);
  if (bestPromoDeduction > 0) {
    adjustedRevenue = Math.max(0, adjustedRevenue - bestPromoDeduction);
  }

  adjustedRevenue = adjustedRevenue * sign;

  if (metric === "revenue") return adjustedRevenue;
  if (metric === "profit_with_bonus") return adjustedRevenue * 0.2;
  if (metric === "profit_without_bonus") return adjustedRevenue * 0.2;
  return 0;
}

// Computes per-merchant 주문수/회원수 from individual order rows with order_date.
// 주문수: calendar month (order_type NOT IN 초도/영업교재, net of cancellations)
// 회원수: prev-month-21 to current-month-20 window (same exclusions)
async function computeOrdersAndMembers(
  client: any,
  merchantCodes: string[],
  year: number
): Promise<Record<string, { orders: Record<string, number>; members: Record<string, number> }>> {
  const result: Record<string, { orders: Record<string, number>; members: Record<string, number> }> = {};
  if (merchantCodes.length === 0) return result;
  for (const code of merchantCodes) result[code] = { orders: {}, members: {} };

  const startDate = `${year - 1}-12-21`;
  const endDate = `${year}-12-31`;

  const res = await client.query(
    `SELECT merchant_code, order_date, order_type, quantity, cancelled
     FROM orders
     WHERE order_date IS NOT NULL
       AND order_date >= $1 AND order_date <= $2
       AND order_type NOT IN ('초도', '영업교재')
       AND merchant_code = ANY($3)`,
    [startDate, endDate, merchantCodes]
  );

  for (const row of res.rows) {
    const code = row.merchant_code;
    if (!result[code]) continue;
    const qty = Number(row.quantity) * (row.cancelled ? -1 : 1);
    const d = new Date(String(row.order_date).split("T")[0]);
    const orderYear = d.getFullYear();
    const orderMonth = d.getMonth() + 1;
    const orderDay = d.getDate();

    if (orderYear === year) {
      const k = `${year}-${String(orderMonth).padStart(2, "0")}`;
      result[code].orders[k] = (result[code].orders[k] || 0) + qty;
    }

    // day ≤ 20 → counts toward its own month; day ≥ 21 → counts toward next month
    let memYear = orderYear;
    let memMonth = orderMonth;
    if (orderDay >= 21) {
      memMonth++;
      if (memMonth > 12) { memMonth = 1; memYear++; }
    }
    if (memYear === year && memMonth >= 1 && memMonth <= 12) {
      const k = `${memYear}-${String(memMonth).padStart(2, "0")}`;
      result[code].members[k] = (result[code].members[k] || 0) + qty;
    }
  }

  return result;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year")) || new Date().getFullYear();
  const orgId = Number(url.searchParams.get("org_id")) || 0;
  const businessUnitId = Number(url.searchParams.get("business_unit_id")) || 0;
  const metric = url.searchParams.get("metric") || "revenue";

  if (!Object.keys(METRIC_LABELS).includes(metric))
    return NextResponse.json({ message: "올바른 metric 필요" }, { status: 400 });

  let client;
  try {
    client = await pool.connect();
    await ensureTables(client);

    const monthKeys = buildMonthKeys(year);
    const cutoffDate = `${year}-12-31`;

    const promosRes = await client.query(
      `SELECT id, name, tiers, targets, apply_to_sales, start_date, end_date FROM promotions WHERE apply_to_sales = true`
    );
    const promotions = promosRes.rows;

    const tiersRes = await client.query(`SELECT * FROM discount_tiers WHERE is_active = true`);
    const discountTiers: DiscountTier[] = tiersRes.rows.map((r: any) => ({
      ...r,
      apply_merchants: r.apply_merchants || [],
      member_ranges: r.member_ranges || [],
      discount_amount: r.discount_amount != null ? Number(r.discount_amount) : undefined,
    }));

    // ─── BUSINESS UNIT VIEW ────────────────────────────────────────────────
    if (businessUnitId) {
      const buRes = await client.query(`SELECT id, name FROM business_units WHERE id = $1`, [businessUnitId]);
      if (!buRes.rows.length) return NextResponse.json({ message: "사업단 없음" }, { status: 404 });
      const bu = buRes.rows[0];

      const orgsRes = await client.query(
        `SELECT id, name FROM organizations WHERE business_unit_id = $1 ORDER BY name`,
        [businessUnitId]
      );
      const buOrgs = orgsRes.rows;

      if (buOrgs.length === 0) {
        return NextResponse.json({
          mode: "business_unit", year, metric, metricLabel: METRIC_LABELS[metric],
          business_unit: bu, months: monthKeys, orgs: [],
          monthTotals: monthKeys.reduce((a: any, k) => ({ ...a, [k]: 0 }), {}),
        });
      }

      const buOrgIds = buOrgs.map((o: any) => Number(o.id));
      const mappingsRes = await client.query(
        `SELECT merchant_code, org_id, contract_date, member_count FROM merchant_mappings
         WHERE org_id = ANY($1) AND (contract_date <= $2 OR contract_date IS NULL)`,
        [buOrgIds, cutoffDate]
      );
      const merchantInfo: Record<string, { org_id: number; contract_date: string | null; member_count: number }> = {};
      for (const r of mappingsRes.rows) {
        merchantInfo[r.merchant_code] = {
          org_id: Number(r.org_id),
          contract_date: r.contract_date ? String(r.contract_date).split("T")[0] : null,
          member_count: Number(r.member_count || 0),
        };
      }

      const ordersRes = await client.query(
        `SELECT merchant_code, year, month, revenue, quantity, order_type, cancelled FROM orders WHERE year = $1 AND merchant_code = ANY($2)`,
        [year, Object.keys(merchantInfo)]
      );

      const orgData: Record<number, { id: number; name: string; months: Record<string, number> }> = {};
      for (const o of buOrgs) {
        orgData[Number(o.id)] = { id: Number(o.id), name: o.name, months: monthKeys.reduce((a: any, k) => ({ ...a, [k]: 0 }), {}) };
      }
      const overallMonthTotals: Record<string, number> = monthKeys.reduce((a: any, k) => ({ ...a, [k]: 0 }), {});

      if (metric === "orders" || metric === "members") {
        const perMerchant = await computeOrdersAndMembers(client, Object.keys(merchantInfo), year);
        for (const [code, data] of Object.entries(perMerchant)) {
          const info = merchantInfo[code];
          if (!info || !orgData[info.org_id]) continue;
          const monthData = metric === "orders" ? data.orders : data.members;
          for (const [k, v] of Object.entries(monthData)) {
            if (!monthKeys.includes(k)) continue;
            orgData[info.org_id].months[k] = (orgData[info.org_id].months[k] || 0) + v;
            overallMonthTotals[k] = (overallMonthTotals[k] || 0) + v;
          }
        }
      } else {
        for (const row of ordersRes.rows) {
          const info = merchantInfo[row.merchant_code];
          if (!info || !orgData[info.org_id]) continue;
          if (row.order_type === "초도" || row.order_type === "영업교재") continue;
          const monthKey = `${row.year}-${String(row.month).padStart(2, "0")}`;
          if (!monthKeys.includes(monthKey)) continue;
          const signedQuantity = Number(row.quantity || 0) * (row.cancelled ? -1 : 1);
          const signedRevenue = Number(row.revenue || 0) * (row.cancelled ? -1 : 1);
          const value = computeMetricValue(metric, signedRevenue, signedQuantity, info.member_count, promotions, discountTiers, row.merchant_code, info.org_id, info.contract_date, Number(row.year), Number(row.month));
          orgData[info.org_id].months[monthKey] += value;
          overallMonthTotals[monthKey] += value;
        }
      }

      const orgsResult = Object.values(orgData).map((o) => ({ ...o, total: Object.values(o.months).reduce((a, b) => a + b, 0) }))
        .sort((a, b) => { const az = a.total === 0, bz = b.total === 0; if (az !== bz) return az ? 1 : -1; return a.name.localeCompare(b.name, "ko"); });

      return NextResponse.json({
        mode: "business_unit", year, metric, metricLabel: METRIC_LABELS[metric],
        business_unit: bu, months: monthKeys, orgs: orgsResult, monthTotals: overallMonthTotals,
      });
    }

    // ─── ALL ORGS VIEW (no org_id, no business_unit_id) ───────────────────
    if (!orgId) {
      const orgsRes = await client.query(
        `SELECT o.id, o.name, o.group_name, o.business_unit_id, bu.name as business_unit_name
         FROM organizations o LEFT JOIN business_units bu ON bu.id = o.business_unit_id ORDER BY o.name`
      );
      const orgs = orgsRes.rows;

      if (orgs.length === 0) {
        return NextResponse.json({
          mode: "all_orgs", year, metric, metricLabel: METRIC_LABELS[metric],
          months: monthKeys, orgs: [], monthTotals: monthKeys.reduce((a: any, k) => ({ ...a, [k]: 0 }), {}),
        });
      }

      const mappingsRes = await client.query(
        `SELECT merchant_code, org_id, contract_date, member_count FROM merchant_mappings
         WHERE contract_date <= $1 OR contract_date IS NULL`,
        [cutoffDate]
      );
      const merchantInfo: Record<string, { org_id: number; contract_date: string | null; member_count: number }> = {};
      for (const r of mappingsRes.rows) {
        merchantInfo[r.merchant_code] = {
          org_id: Number(r.org_id),
          contract_date: r.contract_date ? String(r.contract_date).split("T")[0] : null,
          member_count: Number(r.member_count || 0),
        };
      }

      const ordersRes = await client.query(
        `SELECT merchant_code, year, month, revenue, quantity, order_type, cancelled FROM orders WHERE year = $1`, [year]
      );

      const orgData: Record<number, { id: number; name: string; group_name: string; business_unit_id: number | null; business_unit_name: string | null; months: Record<string, number> }> = {};
      for (const o of orgs) {
        orgData[Number(o.id)] = {
          id: Number(o.id), name: o.name, group_name: o.group_name,
          business_unit_id: o.business_unit_id ? Number(o.business_unit_id) : null,
          business_unit_name: o.business_unit_name || null,
          months: monthKeys.reduce((a: any, k) => ({ ...a, [k]: 0 }), {}),
        };
      }
      const overallMonthTotals: Record<string, number> = monthKeys.reduce((a: any, k) => ({ ...a, [k]: 0 }), {});

      if (metric === "orders" || metric === "members") {
        const perMerchant = await computeOrdersAndMembers(client, Object.keys(merchantInfo), year);
        for (const [code, data] of Object.entries(perMerchant)) {
          const info = merchantInfo[code];
          if (!info || !orgData[info.org_id]) continue;
          const monthData = metric === "orders" ? data.orders : data.members;
          for (const [k, v] of Object.entries(monthData)) {
            if (!monthKeys.includes(k)) continue;
            orgData[info.org_id].months[k] = (orgData[info.org_id].months[k] || 0) + v;
            overallMonthTotals[k] = (overallMonthTotals[k] || 0) + v;
          }
        }
      } else {
        for (const row of ordersRes.rows) {
          const info = merchantInfo[row.merchant_code];
          if (!info || !orgData[info.org_id]) continue;
          if (row.order_type === "초도" || row.order_type === "영업교재") continue;
          const monthKey = `${row.year}-${String(row.month).padStart(2, "0")}`;
          if (!monthKeys.includes(monthKey)) continue;
          const signedQuantity = Number(row.quantity || 0) * (row.cancelled ? -1 : 1);
          const signedRevenue = Number(row.revenue || 0) * (row.cancelled ? -1 : 1);
          const value = computeMetricValue(metric, signedRevenue, signedQuantity, info.member_count, promotions, discountTiers, row.merchant_code, info.org_id, info.contract_date, Number(row.year), Number(row.month));
          orgData[info.org_id].months[monthKey] += value;
          overallMonthTotals[monthKey] += value;
        }
      }

      const orgsResult = Object.values(orgData).map((o) => ({ ...o, total: Object.values(o.months).reduce((a, b) => a + b, 0) }))
        .sort((a, b) => { const az = a.total === 0, bz = b.total === 0; if (az !== bz) return az ? 1 : -1; return a.name.localeCompare(b.name, "ko"); });

      return NextResponse.json({
        mode: "all_orgs", year, metric, metricLabel: METRIC_LABELS[metric],
        months: monthKeys, orgs: orgsResult, monthTotals: overallMonthTotals,
      });
    }

    // ─── SINGLE ORG VIEW ───────────────────────────────────────────────────
    const orgRes = await client.query(`SELECT id, name FROM organizations WHERE id = $1`, [orgId]);
    if (!orgRes.rows.length) return NextResponse.json({ message: "지사 없음" }, { status: 404 });
    const org = orgRes.rows[0];

    const mappingRes = await client.query(
      `SELECT merchant_code, org_id, contract_date, member_count FROM merchant_mappings
       WHERE org_id = $1 AND (contract_date <= $2 OR contract_date IS NULL) ORDER BY merchant_code`,
      [orgId, cutoffDate]
    );
    const merchants = mappingRes.rows;
    const merchantCodes = merchants.map((m: any) => m.merchant_code).filter(Boolean);

    const merchantData = merchants.map((m: any) => ({
      merchant_code: m.merchant_code,
      merchant_name: m.merchant_code,
      contract_date: m.contract_date ? String(m.contract_date).split("T")[0] : null,
      member_count: Number(m.member_count || 0),
      months: monthKeys.reduce((acc: any, k) => ({ ...acc, [k]: 0 }), {}),
      total: 0,
    }));
    const merchantByCode: Record<string, any> = {};
    for (const row of merchantData) merchantByCode[row.merchant_code] = row;

    if (merchantCodes.length > 0) {
      const namesRes = await client.query(
        `SELECT DISTINCT merchant_code, merchant_name FROM orders WHERE merchant_code = ANY($1) AND merchant_name IS NOT NULL`,
        [merchantCodes]
      );
      for (const r of namesRes.rows) {
        if (merchantByCode[r.merchant_code] && r.merchant_name)
          merchantByCode[r.merchant_code].merchant_name = r.merchant_name;
      }

      const rowsRes = await client.query(
        `SELECT merchant_code, merchant_name, year, month, revenue, quantity, order_type, cancelled
         FROM orders WHERE year = $1 AND merchant_code = ANY($2)`,
        [year, merchantCodes]
      );

      if (metric === "orders" || metric === "members") {
        const perMerchant = await computeOrdersAndMembers(client, merchantCodes, year);
        for (const [code, data] of Object.entries(perMerchant)) {
          if (!merchantByCode[code]) continue;
          const monthData = metric === "orders" ? data.orders : data.members;
          for (const [k, v] of Object.entries(monthData)) {
            merchantByCode[code].months[k] = (merchantByCode[code].months[k] || 0) + v;
            merchantByCode[code].total += v;
          }
        }
      } else {
        for (const row of rowsRes.rows) {
          const code = row.merchant_code;
          if (!merchantByCode[code]) continue;
          if (row.order_type === "초도" || row.order_type === "영업교재") continue;
          const monthKey = `${row.year}-${String(row.month).padStart(2, "0")}`;
          const info = merchantByCode[code];
          if (row.merchant_name && row.merchant_name !== code) info.merchant_name = row.merchant_name;
          const signedQuantity = Number(row.quantity || 0) * (row.cancelled ? -1 : 1);
          const signedRevenue = Number(row.revenue || 0) * (row.cancelled ? -1 : 1);
          const value = computeMetricValue(metric, signedRevenue, signedQuantity, info.member_count, promotions, discountTiers, code, Number(orgId), info.contract_date, Number(row.year), Number(row.month));
          info.months[monthKey] += value;
          info.total += value;
        }
      }
    }

    const sortedMerchants = merchantData.sort((a: any, b: any) => {
      const az = a.total === 0, bz = b.total === 0;
      if (az !== bz) return az ? 1 : -1;
      return String(a.merchant_name || a.merchant_code).localeCompare(String(b.merchant_name || b.merchant_code), "ko");
    });

    const monthTotals = monthKeys.reduce((totals: Record<string, number>, k) => {
      totals[k] = sortedMerchants.reduce((s: number, m: any) => s + (m.months[k] || 0), 0);
      return totals;
    }, {});

    return NextResponse.json({
      mode: "org_detail", year, org, metric, metricLabel: METRIC_LABELS[metric],
      months: monthKeys, merchants: sortedMerchants, monthTotals,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  } finally {
    if (client) client.release();
  }
}

export async function POST(req: NextRequest) {
  let client;
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token || token.role !== "admin")
      return NextResponse.json({ message: "권한 없음" }, { status: 401 });

    const body = await req.json();
    client = await pool.connect();
    await ensureTables(client);

    if (body.full) {
      const orgsRes = await client.query(`SELECT id FROM organizations`);
      for (const row of orgsRes.rows) await recomputeStatsForOrg(Number(row.id));
      return NextResponse.json({ ok: true, message: "전체 통계 재계산이 완료되었습니다." });
    }
    if (body.org_id) {
      await recomputeStatsForOrg(Number(body.org_id));
      return NextResponse.json({ ok: true, message: "지사 통계 재계산이 완료되었습니다." });
    }
    return NextResponse.json({ message: "org_id 또는 full 필요" }, { status: 400 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: "서버 오류" }, { status: 500 });
  } finally {
    if (client) client.release();
  }
}
