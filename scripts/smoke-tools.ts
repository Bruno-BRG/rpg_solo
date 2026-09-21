/** Smoke test for the GM tool layer (stateless tools only). */
import { executeTool, toolDefinitions } from "../src/lib/ai/tools";

async function main() {
  const ctx = { campaignId: "test", chaosRank: 5, askedBy: "ai" as const };

  const chaos = await executeTool(
    "set_chaos_rank",
    JSON.stringify({ rank: 7, reason: "ambush sprung" }),
    ctx,
  );
  console.log("set_chaos_rank:", JSON.stringify(chaos));

  const scene = await executeTool(
    "open_scene",
    JSON.stringify({ title: "The Bazaar at Dusk", goal: "Find the informant" }),
    ctx,
  );
  console.log("open_scene:", JSON.stringify(scene));

  const char = await executeTool(
    "update_character",
    JSON.stringify({ name: "Kael", wounds: 1, bennies: 2 }),
    ctx,
  );
  console.log("update_character:", JSON.stringify(char));

  // Invalid input must be rejected by the schema layer.
  try {
    await executeTool("set_chaos_rank", JSON.stringify({ rank: 99 }), ctx);
    console.log("ERROR: invalid rank accepted");
  } catch {
    console.log("invalid rank correctly rejected");
  }

  console.log(`tool definitions exported: ${toolDefinitions().length}`);
}

main();
