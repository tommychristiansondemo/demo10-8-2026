/**
 * Deterministic warranty calculator. The LLM never does date/mileage math itself: it calls this tool and quotes
 * the computed status (lesson from earlier demos - models miscount months and mileage).
 * Terms come from Nissan USA Warranty Information Booklets (see data/kb/guides/nissan-new-vehicle-warranty-usa.md).
 */
import { canonicalModel } from './models.js';

interface Term { name: string; months: number | null; miles: number | null; notes?: string }

const PASSENGER: Term[] = [
  { name: 'Basic (bumper-to-bumper)', months: 36, miles: 36_000 },
  { name: 'Powertrain (engine, transmission/CVT, drivetrain, air bags)', months: 60, miles: 60_000 },
  { name: 'Corrosion - perforation (rust-through)', months: 60, miles: null },
  { name: 'Seat belts', months: 120, miles: null },
  { name: 'Federal emission defect', months: 36, miles: 36_000 },
  { name: 'Federal emission long-term defect (catalytic converter, ECM, OBD device)', months: 96, miles: 80_000 },
  { name: 'California emission long-term defect (CARB states only)', months: 84, miles: 70_000 },
  { name: 'Adjustments (alignment, balancing)', months: 12, miles: 12_000 },
  { name: 'A/C refrigerant recharge (not part of a warranty repair)', months: 12, miles: null },
  { name: 'Nissan Roadside Assistance (service, not a warranty)', months: 36, miles: 36_000 },
];
const EV: Term[] = [
  { name: 'Basic (bumper-to-bumper)', months: 36, miles: 36_000 },
  { name: 'Powertrain', months: 60, miles: 60_000 },
  { name: 'EV system (motor, inverter, charger)', months: 60, miles: 60_000 },
  { name: 'Lithium-ion battery - defects', months: 96, miles: 100_000 },
  { name: 'Lithium-ion battery - capacity (below 9 of 12 bars on LEAF gauge)', months: 96, miles: 100_000 },
  { name: 'Corrosion - perforation (rust-through)', months: 60, miles: null },
  { name: 'Seat belts', months: 120, miles: null },
  { name: 'Adjustments (alignment, balancing)', months: 12, miles: 12_000 },
  { name: 'Roadside Assistance (service, not a warranty)', months: 36, miles: 36_000 },
  { name: 'EV towing to nearest certified Nissan EV dealer', months: 60, miles: 60_000 },
];
const TITAN: Term[] = [
  { name: 'Basic (bumper-to-bumper)', months: 60, miles: 100_000 },
  { name: 'Powertrain', months: 60, miles: 100_000 },
  { name: 'Corrosion - perforation (rust-through)', months: 60, miles: null },
  { name: 'Seat belts', months: 120, miles: null },
  { name: 'Federal emission long-term defect', months: 96, miles: 80_000 },
  { name: 'Adjustments (alignment, balancing)', months: 12, miles: 12_000 },
  { name: 'Roadside Assistance towing (per TITAN booklet)', months: 60, miles: 100_000 },
];

/** Settlement-based CVT powertrain extensions to 84 months / 84,000 miles. */
const CVT_EXTENSIONS: { models: string[]; from: number; to: number; program: string }[] = [
  { models: ['sentra'], from: 2013, to: 2017, program: '2013-2017 Sentra CVT settlement' },
  { models: ['versa'], from: 2012, to: 2017, program: '2012-2017 Versa CVT settlement' },
  { models: ['versa note'], from: 2014, to: 2017, program: '2014-2017 Versa Note CVT settlement' },
  { models: ['altima'], from: 2013, to: 2016, program: '2013-2016 Altima CVT settlement' },
  { models: ['rogue'], from: 2014, to: 2018, program: 'Rogue/Pathfinder CVT settlement (final approval 2022-03-23)' },
  { models: ['pathfinder'], from: 2015, to: 2018, program: 'Rogue/Pathfinder CVT settlement (final approval 2022-03-23)' },
  { models: ['altima'], from: 2017, to: 2018, program: 'Martinez CVT settlement' },
  { models: ['sentra', 'versa', 'versa note'], from: 2018, to: 2019, program: 'Martinez CVT settlement' },
];

function addMonths(d: Date, m: number) {
  const r = new Date(d);
  r.setUTCMonth(r.getUTCMonth() + m);
  return r;
}
function monthsBetween(a: Date, b: Date) {
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) - (b.getUTCDate() < a.getUTCDate() ? 1 : 0);
}

function evaluate(t: Term, start: Date, miles: number, today: Date) {
  const endDate = t.months != null ? addMonths(start, t.months) : null;
  const timeLeft = endDate ? endDate.getTime() > today.getTime() : true;
  const milesLeft = t.miles != null ? miles < t.miles : true;
  const active = timeLeft && milesLeft;
  let limitingFactor: string | null = null;
  if (!active) limitingFactor = !timeLeft && !milesLeft ? 'time and mileage' : !timeLeft ? 'time' : 'mileage';
  return {
    coverage: t.name,
    term: `${t.months ?? 'unlimited'} months / ${t.miles != null ? t.miles.toLocaleString('en-US') + ' miles' : 'unlimited miles'}`,
    status: active ? 'ACTIVE' : 'EXPIRED',
    expired_by: limitingFactor,
    expires_on: endDate ? endDate.toISOString().slice(0, 10) : null,
    expires_at_miles: t.miles,
    months_remaining: active && endDate ? Math.max(0, monthsBetween(today, endDate)) : active ? null : 0,
    miles_remaining: active && t.miles != null ? t.miles - miles : active ? null : 0,
  };
}

export interface WarrantyInput {
  model: string;
  year: number;
  current_mileage?: number;
  in_service_date?: string;
  certified_pre_owned?: boolean;
}

export function checkWarranty(input: WarrantyInput, today = new Date()) {
  const model = canonicalModel(input.model);
  const year = Number(input.year);
  const assumptions: string[] = [];
  if (input.current_mileage == null) assumptions.push('Mileage not provided: statuses reflect time limits only. Ask for the odometer reading for an exact answer.');
  const miles = Math.max(0, Math.round(Number(input.current_mileage) || 0));
  let start: Date;
  if (input.in_service_date && !Number.isNaN(Date.parse(input.in_service_date))) {
    start = new Date(input.in_service_date + (input.in_service_date.length === 10 ? 'T00:00:00Z' : ''));
  } else {
    // New model years typically go on sale the autumn before; assume Oct 1 of the prior year (most generous).
    start = new Date(Date.UTC(year - 1, 9, 1));
    assumptions.push(`In-service date not provided; assumed ${start.toISOString().slice(0, 10)} (earliest typical sale date for a ${year} model). Ask the owner for the actual date for an exact answer.`);
  }
  const isEv = ['leaf', 'ariya'].includes(model);
  const isTitan = model.startsWith('titan');
  let terms = isEv ? EV : isTitan ? TITAN : PASSENGER;
  if (isTitan && year < 2016) {
    terms = PASSENGER;
    assumptions.push('Pre-2016 TITAN used the standard 36/36 basic and 60/60 powertrain terms.');
  }

  const coverages = terms.map((t) => evaluate(t, start, miles, today));

  const special = CVT_EXTENSIONS.filter((x) => x.models.includes(model) && year >= x.from && year <= x.to).map((x) => {
    const r = evaluate({ name: `CVT extended powertrain coverage - ${x.program}`, months: 84, miles: 84_000 }, start, miles, today);
    return { ...r, note: 'Covers the CVT assembly, belt/pulley, valve body, TCM reprogramming, cooler kit, torque converter. Disputes: BBB AUTO LINE 1-800-246-2808.' };
  });

  const safetyAlerts: string[] = [];
  if ((model === 'sentra' && year >= 2002 && year <= 2006) || (model === 'pathfinder' && year >= 2002 && year <= 2004)) {
    safetyAlerts.push('DO NOT DRIVE advisory (May 2024): this model year is subject to the Takata air bag Do Not Drive warning if recall 20V-008/20V-747 is unrepaired. Free repair, free tow - call 1-800-867-7669.');
  }

  let cpo: unknown = null;
  if (input.certified_pre_owned) {
    cpo = { ...evaluate({ name: 'Nissan Certified Pre-Owned limited warranty', months: 84, miles: 100_000 }, start, miles, today), deductible: '$50 per covered repair visit', includes: '24/7 roadside assistance during the CPO term' };
  }

  return {
    vehicle: `${year} Nissan ${model.replace(/\b\w/g, (c) => c.toUpperCase())}`,
    as_of: today.toISOString().slice(0, 10),
    in_service_date_used: start.toISOString().slice(0, 10),
    current_mileage: miles,
    vehicle_age_months: monthsBetween(start, today),
    warranty_family: isEv ? 'New Electric Vehicle Limited Warranty' : isTitan && year >= 2016 ? 'TITAN Limited Warranty (5 yr/100k)' : 'New Vehicle Limited Warranty',
    coverages,
    special_coverage_programs: special,
    certified_pre_owned: cpo,
    safety_alerts: safetyAlerts,
    assumptions,
    reminders: [
      'Coverage is whichever comes first (time or mileage) from the original in-service date and transfers to later owners.',
      'Recall repairs are free regardless of warranty status - check recalls separately.',
      'Normal wear items (brake pads, wipers, filters, tires) and damage from accidents, misuse or lack of maintenance are not covered.',
      'Final determination is made by an authorized Nissan dealer; the Warranty Information Booklet controls.',
    ],
    source: 'Nissan USA Warranty Information Booklets 2023-2025; CVT settlement terms per BBB National Programs',
  };
}
