import { HomeView } from "./home-view";

type PlanOffer = {
  code: string;
  priceMinor: number;
  currency: string;
  liveMinutesIncluded: number;
  campaignLimit: number | null;
  platformFeeBps: number;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/v1";

async function paidPlan(): Promise<PlanOffer | null> {
  try {
    const response = await fetch(`${apiUrl}/plans`, { cache: "no-store" });
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
