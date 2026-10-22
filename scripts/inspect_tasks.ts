import { getCashDashboardData } from "../src/app/cash/actions";

async function main() {
  const data = await getCashDashboardData();
  console.log("Sessions count:", data.sessions.length);
  console.log("Closed sessions count:", data.sessions.filter(s => s.status === "closed").length);
  for (const s of data.sessions) {
    console.log(`- Session ${s.id} (${s.reference}): status=${s.status}, closedAt=${s.closedAt}, theoretical=${s.theoreticalAmount}, closing=${s.closingAmount}, diff=${s.difference}`);
  }
}

main().catch(console.error);
