import { NextRequest, NextResponse } from "next/server";
import { ensureCustomer, readState, recordPurchase, resetFestivalActivity, updateSettings } from "@/lib/festival-store";
import type { Shop } from "@/lib/festival-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FestivalAction =
  | {
      action: "purchase";
      customerId: string;
      shopId: string;
    }
  | {
      action: "settings";
      festivalName: string;
      exchangeRateJpyPerMnt: number;
      shops: Shop[];
    }
  | {
      action: "reset";
    };

export async function GET(request: NextRequest) {
  const customerId = request.nextUrl.searchParams.get("customerId");

  if (customerId) {
    const state = await ensureCustomer(customerId);
    return NextResponse.json(state);
  }

  return NextResponse.json(await readState());
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as FestivalAction;

  if (body.action === "purchase") {
    const result = await recordPurchase(body.customerId, body.shopId);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  if (body.action === "settings") {
    const state = await updateSettings({
      festivalName: body.festivalName,
      exchangeRateJpyPerMnt: body.exchangeRateJpyPerMnt,
      shops: body.shops,
    });
    return NextResponse.json({ ok: true, state });
  }

  if (body.action === "reset") {
    const state = await resetFestivalActivity();
    return NextResponse.json({ ok: true, state });
  }

  return NextResponse.json({ ok: false, reason: "unknown_action" }, { status: 400 });
}
