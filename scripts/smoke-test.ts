/** Smoke test for the rules + oracle engines (dev only). */
import { rollTrait } from "../src/lib/rules/dice";
import { askFateChart } from "../src/lib/oracle/fate-chart";
import { setupScene } from "../src/lib/oracle/random-events";

let yes = 0;
const n = 1000;
for (let i = 0; i < n; i++) {
  if (rollTrait(8, 4).success) yes++;
}
console.log(`d8 vs 4 success rate: ${((yes / n) * 100).toFixed(1)}% (expected ~81%)`);

const f = askFateChart("Is the guard watching?", "50/50", 5);
console.log(`Fate chart: ${f.answer} (rolled ${f.roll} vs ${f.threshold}) event=${f.randomEvent}`);

console.log(`Scene type: ${setupScene(5).type}`);
