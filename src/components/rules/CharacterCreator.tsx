"use client";
/**
 * Character creator — guided Savage Worlds character generation.
 *
 * Steps: identity → attributes → skills → edges & hindrances → review.
 * Every option is priced by the shared creation rules and blocked with a
 * written reason when it would break a budget, so the sheet cannot drift
 * out of the rules while you build it. The same rules validate the save.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { deriveStats } from "@/lib/rules/derived";
import { ATTRIBUTES, ATTRIBUTE_LABELS, stepNotation } from "@/lib/rules/ranks";
import {
  CREATION,
  EDGES,
  HINDRANCES,
  HINDRANCE_SPEND,
  SKILLS,
  explainAttributeStep,
  explainEdge,
  explainSkillStep,
  hindranceLabel,
  hindrancePoints,
  hindrancePointsRaw,
  parseHindrance,
  skillCost,
  validateCreation,
  type CreationState,
  type Severity,
} from "@/lib/rules/creation";

const STEP_LABELS = ["Identity", "Attributes", "Skills", "Edges & Hindrances", "Review"];
const ATTRIBUTE_STEPS = [4, 6, 8, 10, 12];
const SKILL_STEPS = [0, 4, 6, 8, 10, 12];

interface Campaign { id: string; name: string; }

export function CharacterCreator({ campaigns }: { campaigns: Campaign[] }) {
  const router = useRouter();
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [step, setStep] = useState(0);

  const [name, setName] = useState("");
  const [concept, setConcept] = useState("");
  const [ancestry, setAncestry] = useState("");
  const [background, setBackground] = useState("");

  const [attributes, setAttributes] = useState<Record<string, number>>({
    agility: CREATION.baseAttribute,
    smarts: CREATION.baseAttribute,
    spirit: CREATION.baseAttribute,
    strength: CREATION.baseAttribute,
    vigor: CREATION.baseAttribute,
  });
  const [skills, setSkills] = useState<Record<string, number>>({});
  const [edges, setEdges] = useState<string[]>([]);
  const [hindrances, setHindrances] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const state: CreationState = useMemo(
    () => ({ attributes, skills, edges, hindrances }),
    [attributes, skills, edges, hindrances],
  );
  const report = useMemo(() => validateCreation(state), [state]);
  const earned = hindrancePoints(hindrances);
  const earnedRaw = hindrancePointsRaw(hindrances);

  const derived = useMemo(
    () =>
      deriveStats({
        vigor: attributes.vigor,
        smarts: attributes.smarts,
        strength: attributes.strength,
        rank: "Novice",
        skills,
      }),
    [attributes, skills],
  );

  async function save() {
    setSaving(true);
    setSaveError(null);
    const res = await fetch("/api/campaigns/" + campaignId + "/characters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name, concept, ancestry, background,
        agility: attributes.agility,
        smarts: attributes.smarts,
        spirit: attributes.spirit,
        strength: attributes.strength,
        vigor: attributes.vigor,
        skills, edges, hindrances,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setSaveError(
        Array.isArray(data.details) && data.details.length
          ? data.details.join(" ")
          : "The sheet was rejected. Check the guide for what is missing.",
      );
      return;
    }
    router.refresh();
    router.push("/campaigns/" + campaignId);
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
      <div className="flex flex-wrap gap-1">
        {STEP_LABELS.map((label, i) => (
          <button
            key={label}
            onClick={() => setStep(i)}
            className={"border-b-2 px-3 py-1.5 text-sm " + (step === i ? "border-accent font-semibold" : "border-transparent text-ink-500")}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {step === 0 && (
            <div className="panel space-y-3 p-4">
              <div className="panel-header">Identity</div>
              <div className="space-y-3 p-1">
                <div>
                  <label className="label">Campaign</label>
                  <select className="input" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
                    {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Name</label>
                  <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <label className="label">Concept</label>
                  <input className="input" placeholder="retired space marine medic" value={concept} onChange={(e) => setConcept(e.target.value)} />
                </div>
                <div>
                  <label className="label">Ancestry</label>
                  <input className="input" value={ancestry} onChange={(e) => setAncestry(e.target.value)} />
                </div>
                <div>
                  <label className="label">Background (fed to AI memory)</label>
                  <textarea className="input min-h-24" value={background} onChange={(e) => setBackground(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="panel">
              <div className="panel-header">
                Attributes · {report.attributePointsSpent} of {CREATION.attributePoints} free points
                {report.attributePointsSpent > CREATION.attributePoints && (
                  <> · {report.attributePointsSpent - CREATION.attributePoints} paid by Hindrances</>
                )}
              </div>
              <div className="space-y-3 p-4">
                {ATTRIBUTES.map((attribute) => (
                  <div key={attribute} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm">{ATTRIBUTE_LABELS[attribute]}</span>
                    <div className="flex items-center gap-1">
                      <span className="mono mr-1 text-xs text-ink-500">
                        {stepNotation(attributes[attribute])}
                      </span>
                      {ATTRIBUTE_STEPS.map((s) => {
                        const option = explainAttributeStep(attribute, s, state);
                        const active = attributes[attribute] === s;
                        return (
                          <button
                            key={s}
                            title={option.reason ?? "Costs " + option.cost + " attribute point(s)."}
                            disabled={!option.allowed && !active}
                            onClick={() => setAttributes({ ...attributes, [attribute]: s })}
                            className={"h-7 min-w-9 border px-1 text-xs rounded-sm " + (
                              active
                                ? "border-ink-900 bg-ink-900 text-white"
                                : option.allowed
                                  ? "border-ink-300 hover:border-ink-500"
                                  : "cursor-not-allowed border-ink-200 text-ink-300"
                            )}
                          >
                            d{s}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <p className="border-t border-ink-200 pt-3 text-xs text-ink-500">
                  Everything starts at d4. You have {CREATION.attributePoints} points, one per step,
                  and d12 is the ceiling. Extra steps can be paid with Hindrance points at
                  {" "}{HINDRANCE_SPEND.attributeStep} per step.
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="panel">
              <div className="panel-header">
                Skills · {report.skillPointsSpent} of {CREATION.skillPoints} free points
                {report.skillPointsSpent > CREATION.skillPoints && (
                  <> · {report.skillPointsSpent - CREATION.skillPoints} paid by Hindrances</>
                )}
              </div>
              <ul className="divide-y divide-ink-100">
                {SKILLS.map((skill) => {
                  const attribute = attributes[skill.attribute] ?? CREATION.baseAttribute;
                  return (
                    <li key={skill.name} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                      <span className="text-sm" title={skill.hint}>
                        {skill.name}
                        <span className="ml-1 text-[10px] text-ink-400">
                          {ATTRIBUTE_LABELS[skill.attribute]} d{attribute}
                        </span>
                        {skill.core && <span className="ml-1 text-[10px] text-ink-400">(core · free d4)</span>}
                      </span>
                      <span className="flex items-center gap-1">
                        {SKILL_STEPS.map((s) => {
                          const option = explainSkillStep(skill.name, s, state);
                          const active = (skills[skill.name] ?? 0) === s;
                          const total = skillCost(skill.name, s, attributes);
                          return (
                            <button
                              key={s}
                              title={option.reason ?? "Sets " + skill.name + " to d" + s + " for " + total + " skill point(s) in total."}
                              disabled={!option.allowed && !active}
                              onClick={() => {
                                const copy = { ...skills };
                                if (s === 0) delete copy[skill.name];
                                else copy[skill.name] = s;
                                setSkills(copy);
                              }}
                              className={"h-7 min-w-9 border px-1 text-[11px] rounded-sm " + (
                                active
                                  ? "border-ink-900 bg-ink-900 text-white"
                                  : option.allowed
                                    ? "border-ink-300 hover:border-ink-500"
                                    : "cursor-not-allowed border-ink-200 text-ink-300"
                              )}
                            >
                              {s === 0 ? "—" : "d" + s}
                              {s !== 0 && <span className="ml-0.5 text-[9px] opacity-70">{total}</span>}
                            </button>
                          );
                        })}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="border-t border-ink-200 px-4 py-2 text-xs text-ink-500">
                {CREATION.skillPoints} points. A step at or below the linked attribute costs 1;
                above it costs 2. Core skills already start at d4. The small number on each
                button is that skill&apos;s running cost.
              </p>
            </div>
          )}

          {step === 3 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="panel">
                <div className="panel-header">
                  Edges · {edges.length} taken ({CREATION.freeEdges} free, {HINDRANCE_SPEND.edge} points each after that)
                </div>
                <ul className="max-h-80 space-y-1 overflow-y-auto p-3">
                  {EDGES.map((edge) => {
                    const option = explainEdge(edge.name, state);
                    const taken = edges.includes(edge.name);
                    return (
                      <li key={edge.name}>
                        <button
                          className={"w-full px-2 py-1 text-left text-sm hover:bg-ink-100 " + (!taken && !option.allowed ? "cursor-not-allowed text-ink-300" : "")}
                          title={option.reason ?? edge.hint}
                          disabled={!taken && !option.allowed}
                          onClick={() => toggle(edges, setEdges, edge.name)}
                        >
                          <span>{taken ? "☑" : "☐"} {edge.name}</span>
                          {!taken && option.cost > 0 && <span className="tag ml-2">{option.cost} pt</span>}
                          {edge.prereqs?.note && (
                            <span className="ml-2 text-[10px] text-ink-400">needs {edge.prereqs.note}</span>
                          )}
                          <span className="mt-0.5 block text-[11px] text-ink-500">{edge.hint}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="panel">
                <div className="panel-header">
                  Hindrances · {earned} of {CREATION.hindrancePointsMax} points
                  {earnedRaw > CREATION.hindrancePointsMax && " (capped)"}
                </div>
                <ul className="max-h-80 space-y-1 overflow-y-auto p-3">
                  {HINDRANCES.map((hindrance) => {
                    const label = hindrances.find((h) => parseHindrance(h).name === hindrance.name);
                    const taken = !!label;
                    const severity = label ? parseHindrance(label).severity : null;
                    return (
                      <li key={hindrance.name} className="px-2 py-1">
                        <div className="flex items-center justify-between gap-2">
                          <button
                            className="flex-1 text-left text-sm hover:text-ink-900"
                            title={hindrance.hint}
                            onClick={() => {
                              if (taken) setHindrances(hindrances.filter((h) => h !== label));
                              else {
                                const initial: Severity = hindrance.severity === "Major" ? "Major" : "Minor";
                                setHindrances([...hindrances, hindranceLabel(hindrance.name, initial)]);
                              }
                            }}
                          >
                            {taken ? "☑" : "☐"} {hindrance.name}
                            {severity && <span className="tag ml-2">{severity === "Major" ? 2 : 1} pt</span>}
                          </button>
                          {hindrance.severity === "either" && (
                            <span className="flex gap-1">
                              {(["Minor", "Major"] as Severity[]).map((s) => (
                                <button
                                  key={s}
                                  className={"h-6 border px-1 text-[10px] rounded-sm " + (taken && severity === s ? "border-ink-900 bg-ink-900 text-white" : "border-ink-300 hover:border-ink-500")}
                                  onClick={() => {
                                    const others = hindrances.filter((h) => h !== label);
                                    setHindrances([...others, hindranceLabel(hindrance.name, s)]);
                                  }}
                                >
                                  {s}
                                </button>
                              ))}
                            </span>
                          )}
                        </div>
                        <span className="block text-[11px] text-ink-500">{hindrance.hint}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="panel">
              <div className="panel-header">Review</div>
              <div className="space-y-2 p-4 text-sm">
                <p>
                  <span className="font-semibold">{name || "Unnamed"}</span>
                  {concept && " — " + concept}
                  {ancestry && " (" + ancestry + ")"}
                </p>
                <p className="text-ink-500">
                  Attributes: {ATTRIBUTES.map((a) => ATTRIBUTE_LABELS[a] + " " + stepNotation(attributes[a])).join(", ")}
                </p>
                <p className="text-ink-500">
                  Skills: {Object.keys(skills).length
                    ? Object.entries(skills).map(([s, v]) => s + " d" + v).join(", ")
                    : "none"}
                </p>
                <p className="text-ink-500">Edges: {edges.join(", ") || "—"}</p>
                <p className="text-ink-500">Hindrances: {hindrances.join(", ") || "—"}</p>

                {report.errors.length > 0 && (
                  <ul className="mt-3 space-y-1 border-l-2 border-accent pl-3 text-sm text-accent">
                    {report.errors.map((error) => <li key={error}>{error}</li>)}
                  </ul>
                )}
                {report.warnings.map((warning) => (
                  <p key={warning} className="text-xs text-ink-500">{warning}</p>
                ))}
                {saveError && <p className="text-sm text-accent">{saveError}</p>}

                <button
                  className="btn-primary mt-2"
                  onClick={save}
                  disabled={!name || !campaignId || !report.valid || saving}
                  title={report.valid ? "Save the sheet" : "Fix the issues listed above first."}
                >
                  {saving ? "Saving…" : "Save character"}
                </button>
                {!report.valid && (
                  <p className="text-xs text-ink-500">
                    The sheet is not legal yet — the list above says what to change.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Guide + derived stats */}
        <div className="panel h-fit lg:sticky lg:top-4">
          <div className="panel-header">Guide</div>
          <div className="space-y-3 p-4 text-sm">
            <Budget label="Attributes" spent={report.attributePointsSpent} budget={CREATION.attributePoints} />
            <Budget label="Skills" spent={report.skillPointsSpent} budget={CREATION.skillPoints} />
            <Budget label="Hindrance points" spent={report.hindrancePointsSpent} budget={earned} />
            <div className="flex justify-between">
              <dt className="text-ink-500">Edges</dt>
              <dd className="mono">{edges.length} / {CREATION.freeEdges} free</dd>
            </div>

            {report.errors.length > 0 && (
              <div className="border-t border-ink-200 pt-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-accent">Needs fixing</p>
                <ul className="mt-1 space-y-1 text-xs text-ink-600">
                  {report.errors.map((error) => <li key={error}>{error}</li>)}
                </ul>
              </div>
            )}

            <div className="border-t border-ink-200 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Derived</p>
              <dl className="mt-2 space-y-1">
                <Row label="Pace" value={String(derived.pace)} />
                <Row label="Parry" value={String(derived.parry)} />
                <Row label="Toughness" value={String(derived.toughness)} />
                <Row label="Load limit" value={derived.loadLimit + " lbs"} />
                <Row label="Bennies" value="3" />
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Budget({ label, spent, budget }: { label: string; spent: number; budget: number }) {
  const over = spent > budget;
  const ratio = budget === 0 ? (spent > 0 ? 100 : 0) : (spent / budget) * 100;
  return (
    <div>
      <div className="flex justify-between">
        <dt className="text-ink-500">{label}</dt>
        <dd className={"mono " + (over ? "text-accent" : "")}>{spent} / {budget}</dd>
      </div>
      <div className="mt-1 h-1 w-full bg-ink-100">
        <div
          className={"h-1 " + (over ? "bg-accent" : "bg-ink-900")}
          style={{ width: Math.min(100, ratio) + "%" }}
        />
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

