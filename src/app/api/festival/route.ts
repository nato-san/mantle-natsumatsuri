import { NextRequest, NextResponse } from "next/server";
import {
  completeOrder,
  createOnchainOrder,
  ensureCustomer,
  markOrderSubmitted,
  readState,
  recordPurchase,
  rejectOrder,
  resetFestivalActivity,
  normalizeFestivalId,
  updateSettings,
  verifyOnchainOrder,
} from "@/lib/festival-store";
import type { PaymentMode, PaymentRecord, Shop } from "@/lib/festival-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FestivalAction = {
  festivalId?: string;
} & (
  | {
      action: "purchase";
      customerId: string;
      shopId: string;
      mode?: PaymentMode;
      status?: PaymentRecord["status"];
      transactionHash?: string;
      blockNumber?: number;
      gasUsed?: string;
      payerAddress?: string;
    }
  | {
      action: "create_onchain_order";
      customerId: string;
      shopId: string;
      payerAddress: string;
    }
  | {
      action: "submit_onchain_order";
      orderId: string;
      transactionHash: string;
    }
  | {
      action: "verify_onchain_order";
      orderId: string;
      transactionHash: string;
    }
  | {
      action: "reject_onchain_order";
      orderId: string;
      errorMessage?: string;
    }
  | {
      action: "complete_order";
      orderId: string;
    }
  | {
      action: "settings";
      festivalName: string;
      exchangeRateJpyPerMnt: number;
      paymentMode: PaymentMode;
      shops: Shop[];
    }
  | {
      action: "reset";
    }
);

function getFestivalId(request: NextRequest, body?: { festivalId?: string }) {
  return normalizeFestivalId(body?.festivalId || request.nextUrl.searchParams.get("festivalId"));
}

export async function GET(request: NextRequest) {
  const customerId = request.nextUrl.searchParams.get("customerId");
  const festivalId = getFestivalId(request);

  if (customerId) {
    const state = await ensureCustomer(festivalId, customerId);
    return NextResponse.json(state);
  }

  return NextResponse.json({
    ...(await readState(festivalId)),
    festivalId,
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as FestivalAction;
  const festivalId = getFestivalId(request, body);

  if (body.action === "purchase") {
    const result = await recordPurchase(festivalId, body.customerId, body.shopId, {
      mode: body.mode,
      status: body.status,
      transactionHash: body.transactionHash,
      blockNumber: body.blockNumber,
      gasUsed: body.gasUsed,
      payerAddress: body.payerAddress,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  if (body.action === "create_onchain_order") {
    const result = await createOnchainOrder(festivalId, body.customerId, body.shopId, body.payerAddress);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  if (body.action === "submit_onchain_order") {
    const result = await markOrderSubmitted(festivalId, body.orderId, body.transactionHash);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  if (body.action === "verify_onchain_order") {
    try {
      const result = await verifyOnchainOrder(festivalId, body.orderId, body.transactionHash);
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          reason: "tx_verification_error",
          message: error instanceof Error ? error.message : "unknown",
        },
        { status: 400 },
      );
    }
  }

  if (body.action === "reject_onchain_order") {
    const result = await rejectOrder(festivalId, body.orderId, body.errorMessage);
    return NextResponse.json(result);
  }

  if (body.action === "complete_order") {
    const result = await completeOrder(festivalId, body.orderId);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  if (body.action === "settings") {
    const state = await updateSettings(festivalId, {
      festivalName: body.festivalName,
      exchangeRateJpyPerMnt: body.exchangeRateJpyPerMnt,
      paymentMode: body.paymentMode,
      shops: body.shops,
    });
    return NextResponse.json({ ok: true, state });
  }

  if (body.action === "reset") {
    const state = await resetFestivalActivity(festivalId);
    return NextResponse.json({ ok: true, state });
  }

  return NextResponse.json({ ok: false, reason: "unknown_action" }, { status: 400 });
}
