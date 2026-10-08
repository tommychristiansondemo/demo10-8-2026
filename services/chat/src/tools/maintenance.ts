/**
 * Factory maintenance schedule lookup over the curated spec dataset (extracted from public Nissan USA Owner's
 * Manuals 2023-2025 by an LLM and independently re-verified by a second model; see scripts/curate).
 * Computes the next scheduled milestone for each item from the current odometer reading.
 */
import specs from '../data/specs.json' with { type: 'json' };
import { canonicalModel, titleModel } from './models.js';

interface Item {
  item: string; action: string; schedule: string;
  interval_miles: number | null; interval_months: number | null;
  first_at_miles?: number | null; first_at_months?: number | null;
  applies_to: string; notes?: string;
}
interface Spec {
  model: string; year: number; powertrains: { engine_code: string; description: string; transmission?: string }[];
  oil_life_monitor?: string; severe_conditions?: string[]; maintenance_items: Item[];
  fluids: { fluid: string; specification: string; capacity?: string; applies_to?: string }[];
  source_url: string; source_document: string; extraction_caveats?: string;
}
const SPECS = specs as unknown as Spec[];

export function availableSpecs() {
  const by: Record<string, number[]> = {};
  for (const s of SPECS) (by[canonicalModel(s.model)] ??= []).push(s.year);
  return by;
}

function nextDue(it: Item, miles: number) {
  const first = it.first_at_miles || it.interval_miles;
  if (!first) return null;
  if (miles < first) return first;
  if (!it.interval_miles) return null; // one-off milestone already passed
  const n = Math.floor((miles - first) / it.interval_miles) + 1;
  return first + n * it.interval_miles;
}

export interface MaintenanceInput {
  model: string; year: number; current_mileage?: number; severe_use?: boolean; engine?: string;
}

export function getMaintenance(input: MaintenanceInput) {
  const model = canonicalModel(input.model);
  const year = Number(input.year);
  const candidates = SPECS.filter((s) => canonicalModel(s.model) === model);
  if (!candidates.length) {
    return {
      found: false,
      message: `No structured factory schedule for the Nissan ${titleModel(model)} in this dataset (covers 2023-2025: ${Object.keys(availableSpecs()).join(', ')}). Use search_owner_knowledge for general guidance and tell the owner to check their Owner's Manual "Maintenance and schedules" chapter.`,
    };
  }
  candidates.sort((a, b) => Math.abs(a.year - year) - Math.abs(b.year - year) || b.year - a.year);
  const spec = candidates[0];
  const notes: string[] = [];
  if (spec.year !== year) {
    notes.push(`No ${year} manual in the dataset; using the ${spec.year} ${titleModel(model)} schedule (closest available). Powertrains or intervals may differ for ${year} - say so to the owner and recommend confirming in their manual.`);
  }
  const miles = input.current_mileage != null ? Math.max(0, Math.round(Number(input.current_mileage))) : null;
  const wantSevere = !!input.severe_use;
  const eng = (input.engine || '').toLowerCase();
  const items = spec.maintenance_items
    .filter((i) => i.schedule === 'both' || i.schedule === (wantSevere ? 'severe' : 'standard') || (wantSevere && i.schedule === 'standard'))
    .filter((i) => !eng || i.applies_to === 'all' || i.applies_to.toLowerCase().includes(eng) || !/[A-Z]{2}\d/.test(i.applies_to))
    .map((i) => ({
      item: i.item, action: i.action, schedule: i.schedule,
      interval: [i.interval_miles ? `${i.interval_miles.toLocaleString('en-US')} miles` : null, i.interval_months ? `${i.interval_months} months` : null].filter(Boolean).join(' / ') || 'see notes',
      first_service: i.first_at_miles ? `${i.first_at_miles.toLocaleString('en-US')} miles${i.first_at_months ? ` / ${i.first_at_months} months` : ''}` : undefined,
      applies_to: i.applies_to,
      next_due_at_miles: miles != null ? nextDue(i, miles) : undefined,
      notes: i.notes,
    }));
  let upcoming: unknown;
  if (miles != null) {
    upcoming = items
      .filter((i) => i.next_due_at_miles != null && i.next_due_at_miles - miles <= 10_000 && ['replace', 'rotate'].includes(i.action))
      .sort((a, b) => (a.next_due_at_miles as number) - (b.next_due_at_miles as number))
      .map((i) => `${i.item} (${i.action}) at ${(i.next_due_at_miles as number).toLocaleString('en-US')} miles${i.schedule === 'severe' ? ' [severe use]' : ''}${i.applies_to !== 'all' ? ` [${i.applies_to}]` : ''}`);
  }
  return {
    found: true,
    vehicle: `${spec.year} Nissan ${titleModel(model)}`,
    requested_year: year,
    powertrains: spec.powertrains,
    schedule_used: wantSevere ? 'standard + severe-use items' : 'standard',
    current_mileage: miles,
    upcoming_replacements_next_10k_miles: upcoming,
    note_on_next_due: 'next_due_at_miles = next factory schedule milestone at or after the current odometer. We do not know when the owner last did each service.',
    oil_life_monitor: spec.oil_life_monitor,
    severe_conditions: spec.severe_conditions,
    items,
    fluids: spec.fluids,
    notes,
    data_quality: 'Machine-extracted from the Owner\'s Manual and independently re-verified; confirm critical intervals in the manual or with a Nissan dealer.',
    source: spec.source_document,
    source_url: spec.source_url,
  };
}
