/**
 * Dice roller page — global roller available outside campaigns.
 */
import { DiceRoller } from "@/components/rules/DiceRoller";

export default function DicePage() {
  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="font-serif text-3xl">Dice Roller</h1>
      <p className="mt-1 text-sm text-ink-500">
        Savage Worlds trait rolls ace automatically; the wild die is included.
      </p>
      <div className="mt-6">
        <DiceRoller />
      </div>
    </div>
  );
}
