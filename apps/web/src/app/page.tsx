import { serverApiFetch } from "@/lib/server-api";
import { HomeView } from "./home-view";

type PlanOffer = {
  code: string;
  priceMinor: number;
  currency: string;
  liveMinutesIncluded: number;
  campaignLimit: number | null;
  platformFeeBps: number;
};

async function paidPlan(): Promise<PlanOffer | null> {
  try {
    const response = await serverApiFetch("/plans");
    if (!response.ok) return null;
    const plans = (await response.json()) as PlanOffer[];
    return plans.find((plan) => plan.code === "campana") ?? null;
  } catch {
    return null;
  }
}

export default async function Home() {
  const plan = await paidPlan();
  return (
    <HomeView
      price={plan ? `${(plan.priceMinor / 100).toFixed(2)} ${plan.currency}` : null}
      feeBps={plan?.platformFeeBps ?? null}
      campaignLimit={plan?.campaignLimit ?? null}
      liveMinutes={plan?.liveMinutesIncluded ?? null}
    />
  );
}
