"use client";
/**
 * Character creator — guided Savage Worlds character generation.
 *
 * Steps: identity → attributes (5 points, d4 base) → skills
 * (12 points, core skills at d4) → hindrances/edges (simplified
 * point tracking) → summary + save.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { deriveStats } from "@/lib/rules/derived";
import { CORE_SKILLS, stepNotation } from "@/lib/rules/ranks";

const STEPS = [4, 6, 8, 10, 12] as const;

const COMMON_SKILLS = [
  "Fighting", "Shooting", "Athletics", "Notice", "Stealth",
  "Persuasion", "Intimidation", "Performance", "Common Knowledge",
  "Survival", "Healing", "Repair", "Science", "Occult",
  "Spellcasting", "Research", "Driving", "Piloting", "Boating", "Riding",
  "Hacking", "Electronics", "Gambling", "Taunt", "Throws",
];

const EDGES = [
  "Ambidextrous", "Attractive", "Brawny", "Brute", "Combat Reflexes",
  "Connections", "Dodge", "Elan", "Fleet-Footed", "Great Luck",
  "Hard to Kill", "Improvisational Fighter", "Iron Jaw", "Jack-of-All-Trades",
  "Level Headed", "Linguist", "Luck", "Marksman", "Mighty Blow",
  "Quick", "Rapid Recharge", "Rock and Roll", "Steady Hands", "Strong Willed",
  "Trademark Weapon", "Wizard", "Woodsman",
];

const HINDRANCES = [
  "All Thumbs", "Anemic", "Arrogant", "Bad Eyes", "Big Mouth", "Blind",
  "Bloodthirsty", "Cautious", "Clueless", "Code Name", "Curious",
  "Death Wish", "Delusional", "Doubting Thomas", "Elderly", "Enemy",
  "Greedy", "Hard of Hearing", "Hesitant", "Heroic", "Illiterate",
  "Lame", "Mean", "Mild Mannered", "Obese", "One Arm", "One Eye",
  "Outsider", "Overconfident", "Pacifist", "Phantom Pain", "Phobia",
  "Quirk", "Ruthless", "Slow", "Small", "Stubborn", "Ugly", "Vengeful",
  "Vow", "Wanted", "Young", "Yellow",
];

interface Campaign { id: string; name: string; }

export function CharacterCreator({ campaigns }: { campaigns: Campaign[] }) {
  const router = useRouter();
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [step, setStep] = useState(0);

  // Identity
  const [name, setName] = useState("");
  const [concept, setConcept] = useState("");
  const [ancestry, setAncestry] = useState("");
  const [background, setBackground] = useState("");

  // Attributes: cost to raise = steps above d4 (1 point per step).
  const [attrs, setAttrs] = useState<Record<string, number>>({
    agility: 4, smarts: 4, spirit: 4, strength: 4, vigor: 4,
  });
  const attrPoints = useMemo(
    () => Object.values(attrs).reduce((sum, v) => sum + (v - 4), 0),
    [attrs],
  );

  // Skills: 12 points; below-attribute skills cost 1/step, above cost 2/step.
  const [skills, setSkills] = useState<Record<string, number>>({});
  const skillPoints = useMemo(() => {
    return Object.entries(skills).reduce((sum, [skill, step]) => {
      const attrStep = attributeForSkill(skill, attrs);
      // Core skills start at d4 (free); others start at none (d4-2 → first step to d4 = 1pt simplification).
      const base = (CORE_SKILLS as readonly string[]).includes(skill) ? 4 : 0;
      let cost = 0;
      for (let s = base + 2; s <= step; s += 2) {
        cost += s > attrStep ? 2 : 1;
      }
      return sum + cost;
    }, 0);
  }, [skills, attrs]);

  const [edges, setEdges] = useState<string[]>([]);
  const [hindrances, setHindrances] = useState<string[]>([]);

  const derived = useMemo(
    () =>
      deriveStats({
        vigor: attrs.vigor, smarts: attrs.smarts, strength: attrs.strength,
        rank: "Novice", skills,
      }),
    [attrs, skills],
  );

  async function save() {
    await fetch(`/api/campaigns/${campaignId}/characters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name, concept, ancestry, background,
        agility: attrs.agility, smarts: attrs.smarts, spirit: attrs.spirit,
        strength: attrs.strength, vigor: attrs.vigor,
        skills, edges, hindrances,
      }),
    });
    router.refresh();
    // Simple confirmation — real UX would navigate to the sheet.
    alert("Character saved.");
  }

  if (campaigns.length === 0) {
    return (
      <p className="panel p-6 text-center text-sm text-ink-500">
        Create a campaign first — characters attach to campaigns.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Step nav */}
      <div className="flex gap-1">
        {["Identity", "Attributes", "Skills", "Edges & Hindrances", "Review"].map((label, i) => (
          <button key={label} onClick={() => setStep(i)}
            className={`border-b-2 px-3 py-1.5 text-sm ${
              step === i ? "border-accent font-semibold" : "border-transparent text-ink-500"
            }`}>
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          {/* Step 0: identity */}
          {step === 0 && (
            <div className="panel space-y-3 p-4">
              <div className="panel-header">Identity</div>
              <div className="space-y-3 p-1">
                <div>
                  <label className="label">Campaign</label>
                  <select className="input" value={campaignId}
                    onChange={(e) => setCampaignId(e.target.value)}>
                    {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Name</label>
                  <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <label className="label">Concept</label>
                  <input className="input" placeholder="retired space marine medic"
                    value={concept} onChange={(e) => setConcept(e.target.value)} />
                </div>
                <div>
                  <label className="label">Ancestry</label>
                  <input className="input" value={ancestry}
                    onChange={(e) => setAncestry(e.target.value)} />
                </div>
                <div>
                  <label className="label">Background (fed to AI memory)</label>
                  <textarea className="input min-h-24" value={background}
                    onChange={(e) => setBackground(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {/* Step 1: attributes */}
          {step === 1 && (
            <div className="panel">
              <div className="panel-header">
                Attributes · {attrPoints}/5 points spent
              </div>
              <div className="space-y-2 p-4">
                {["agility", "smarts", "spirit", "strength", "vigor"].map((attr) => (
                  <div key={attr} className="flex items-center justify-between">
                    <span className="text-sm capitalize">{attr}</span>
                    <div className="flex items-center gap-2">
                      <span className="mono text-ink-500">{stepNotation(attrs[attr])}</span>
                      {STEPS.map((s) => (
                        <button key={s}
                          className={`h-7 w-9 border text-xs rounded-sm ${
                            attrs[attr] === s
                              ? "border-ink-900 bg-ink-900 text-white"
                              : "border-ink-300 hover:border-ink-500"
                          }`}
                          onClick={() => setAttrs({ ...attrs, [attr]: s })}>
                          d{s}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <p className="text-xs text-ink-500">
                  5 points; each step above d4 costs 1 point.
                </p>
              </div>
            </div>
          )}

          {/* Step 2: skills */}
          {step === 2 && (
            <div className="panel">
              <div className="panel-header">
                Skills · {skillPoints}/12 points spent
              </div>
              <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2">
                {COMMON_SKILLS.map((skill) => (
                  <div key={skill} className="flex items-center justify-between">
                    <span className="text-sm">
                      {skill}
                      {(CORE_SKILLS as readonly string[]).includes(skill) && (
                        <span className="ml-1 text-[10px] text-ink-400">(core)</span>
                      )}
                    </span>
                    <div className="flex gap-1">
                      {[0, 4, 6, 8].map((s) => (
                        <button key={s}
                          className={`h-7 w-9 border text-xs rounded-sm ${
                            (skills[skill] ?? 0) === s
                              ? "border-ink-900 bg-ink-900 text-white"
                              : "border-ink-300 hover:border-ink-500"
                          }`}
                          onClick={() => {
                            const copy = { ...skills };
                            if (s === 0) delete copy[skill];
                            else copy[skill] = s;
                            setSkills(copy);
                          }}>
                          {s === 0 ? "—" : `d${s}`}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="border-t border-ink-200 px-4 py-2 text-xs text-ink-500">
                12 points. Skills at or below their attribute cost 1 point per step;
                above the attribute cost 2. Core skills start at d4.
              </p>
            </div>
          )}

          {/* Step 3: edges & hindrances */}
          {step === 3 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="panel">
                <div className="panel-header">Edges · {edges.length}</div>
                <ul className="max-h-64 space-y-1 overflow-y-auto p-3">
                  {EDGES.map((edge) => (
                    <li key={edge}>
                      <button className="w-full px-2 py-1 text-left text-sm hover:bg-ink-100"
                        onClick={() => toggle(edges, setEdges, edge)}>
                        {edges.includes(edge) ? "☑" : "☐"} {edge}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="panel">
                <div className="panel-header">Hindrances · {hindrances.length}</div>
                <ul className="max-h-64 space-y-1 overflow-y-auto p-3">
                  {HINDRANCES.map((h) => (
                    <li key={h}>
                      <button className="w-full px-2 py-1 text-left text-sm hover:bg-ink-100"
                        onClick={() => toggle(hindrances, setHindrances, h)}>
                        {hindrances.includes(h) ? "☑" : "☐"} {h}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Step 4: review */}
          {step === 4 && (
            <div className="panel">
              <div className="panel-header">Review</div>
              <div className="space-y-2 p-4 text-sm">
                <p><span className="font-semibold">{name || "Unnamed"}</span>
                  {concept && ` — ${concept}`}
                  {ancestry && ` (${ancestry})`}</p>
                <p className="text-ink-500">
                  Attributes: {Object.entries(attrs).map(([k, v]) => `${k} ${stepNotation(v)}`).join(", ")}
                </p>
                <p className="text-ink-500">
                  Skills: {Object.keys(skills).length || "none"}
                </p>
                <p className="text-ink-500">
                  Edges: {edges.join(", ") || "—"} · Hindrances: {hindrances.join(", ") || "—"}
                </p>
                <button className="btn-primary mt-2" onClick={save} disabled={!name || !campaignId}>
                  Save character
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Derived stats sidebar */}
        <div className="panel h-fit">
          <div className="panel-header">Derived</div>
          <dl className="space-y-2 p-4 text-sm">
            <Row label="Pace" value={String(derived.pace)} />
            <Row label="Parry" value={String(derived.parry)} />
            <Row label="Toughness" value={String(derived.toughness)} />
            <Row label="Load limit" value={`${derived.loadLimit} lbs`} />
            <Row label="Bennies" value="3" />
            <Row label="Wounds" value="3" />
          </dl>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-ink-500">{label}</dt>
      <dd className="mono font-semibold">{value}</dd>
    </div>
  );
}

function toggle(list: string[], setList: (v: string[]) => void, value: string) {
  setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
}

/** Attribute governing a skill (simplified mapping for cost calc). */
function attributeForSkill(
  skill: string,
  attrs: Record<string, number>,
): number {
  const map: Record<string, string> = {
    Fighting: "agility", Shooting: "agility", Athletics: "agility",
    Stealth: "agility", Thievery: "agility", Driving: "agility",
    Piloting: "agility", Boating: "agility", Riding: "agility",
    Repair: "smarts", Science: "smarts", Occult: "smarts",
    Spellcasting: "smarts", Research: "smarts", Hacking: "smarts",
    Electronics: "smarts", Gambling: "smarts",
    Notice: "smarts", Survival: "smarts", Healing: "smarts",
    Intimidation: "spirit", Taunt: "spirit", Performance: "spirit",
    Persuasion: "spirit", "Common Knowledge": "smarts",
    Throws: "agility",
  };
  return attrs[map[skill] ?? "smarts"] ?? 4;
}
