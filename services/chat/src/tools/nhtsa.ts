/**
 * Live integrations with public U.S. government data (no API key): NHTSA recalls & complaints, vPIC VIN decoder.
 * Small in-memory TTL cache per Lambda execution environment; 8 s timeouts so a slow upstream can't stall a chat.
 */
import { nhtsaModel, titleModel } from './models.js';

const cache = new Map<string, { at: number; value: unknown }>();
const TTL_MS = 60 * 60 * 1000;

async function getJson(url: string): Promise<any> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'owner-assist-class-demo' } });
  if (!res.ok) {
    if (res.status === 400 || res.status === 404) return {};
    throw new Error(`Upstream ${new URL(url).host} returned ${res.status}`);
  }
  const value = await res.json();
  cache.set(url, { at: Date.now(), value });
  return value;
}

const trim = (s: string | undefined, n: number) => {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
};
const iso = (d: string | undefined) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(d || '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : d || null;
};

export async function getRecalls(input: { model: string; year: number }) {
  const q = new URLSearchParams({ make: 'NISSAN', model: nhtsaModel(input.model), modelYear: String(input.year) });
  const data = await getJson(`https://api.nhtsa.gov/recalls/recallsByVehicle?${q}`);
  const results: any[] = data.results || [];
  results.sort((a, b) => String(iso(b.ReportReceivedDate)).localeCompare(String(iso(a.ReportReceivedDate))));
  return {
    vehicle: `${input.year} Nissan ${titleModel(input.model)}`,
    recall_count: results.length,
    retrieved_from: 'NHTSA recalls API (live)',
    recalls: results.map((r) => ({
      campaign: r.NHTSACampaignNumber,
      reported: iso(r.ReportReceivedDate),
      component: r.Component,
      park_it_do_not_drive: !!r.parkIt,
      park_outside_fire_risk: !!r.parkOutSide,
      summary: trim(r.Summary, 500),
      risk: trim(r.Consequence, 300),
      remedy: trim(r.Remedy, 300),
      nhtsa_url: `https://www.nhtsa.gov/recalls?nhtsaId=${r.NHTSACampaignNumber}`,
    })),
    important: 'A model-year recall may cover only part of production. Check the specific VIN at nhtsa.gov/recalls or nissanusa.com/recalls-vin. Recall repairs are free.',
  };
}

export async function getComplaintSummary(input: { model: string; year: number; component_filter?: string }) {
  const q = new URLSearchParams({ make: 'NISSAN', model: nhtsaModel(input.model), modelYear: String(input.year) });
  const data = await getJson(`https://api.nhtsa.gov/complaints/complaintsByVehicle?${q}`);
  let results: any[] = data.results || [];
  const filter = (input.component_filter || '').toUpperCase();
  const counts = new Map<string, number>();
  for (const c of results) for (const comp of String(c.components || '').split(',')) {
    const k = comp.trim();
    if (k) counts.set(k, (counts.get(k) || 0) + 1);
  }
  if (filter) results = results.filter((c) => String(c.components || '').toUpperCase().includes(filter) || String(c.summary || '').toUpperCase().includes(filter));
  const examples = results
    .filter((c) => c.summary)
    .sort((a, b) => String(b.dateComplaintFiled).localeCompare(String(a.dateComplaintFiled)))
    .slice(0, 5)
    .map((c) => ({ filed: c.dateComplaintFiled, components: c.components, crash: c.crash, fire: c.fire, summary: trim(c.summary, 350) }));
  return {
    vehicle: `${input.year} Nissan ${titleModel(input.model)}`,
    total_complaints: (data.results || []).length,
    matching_filter: filter ? results.length : undefined,
    crashes_alleged: (data.results || []).filter((c: any) => c.crash).length,
    fires_alleged: (data.results || []).filter((c: any) => c.fire).length,
    top_components: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([component, count]) => ({ component, count })),
    recent_examples: examples,
    caveat: 'Complaints are unverified owner reports submitted to NHTSA and do not by themselves establish a defect.',
    retrieved_from: 'NHTSA complaints API (live)',
  };
}

export async function decodeVin(input: { vin: string }) {
  const vin = String(input.vin || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
    return { valid: false, message: 'A VIN has exactly 17 characters (letters I, O and Q are never used). It is on the driver-side dashboard plate and the driver door-jamb label.' };
  }
  const data = await getJson(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`);
  const r = (data.Results || [])[0] || {};
  const pick = (k: string) => (r[k] && r[k] !== 'Not Applicable' ? r[k] : undefined);
  return {
    valid: true,
    vin,
    make: pick('Make'),
    model: pick('Model'),
    model_year: pick('ModelYear') ? Number(pick('ModelYear')) : undefined,
    trim: pick('Trim') || pick('Series'),
    body_class: pick('BodyClass'),
    drive_type: pick('DriveType'),
    engine: [pick('DisplacementL') && `${Number(pick('DisplacementL')).toFixed(1)}L`, pick('EngineConfiguration'), pick('EngineCylinders') && `${pick('EngineCylinders')}-cyl`, pick('EngineModel')].filter(Boolean).join(' ') || undefined,
    fuel_type: pick('FuelTypePrimary'),
    electrification: pick('ElectrificationLevel'),
    transmission: pick('TransmissionStyle'),
    plant: [pick('PlantCity'), pick('PlantState'), pick('PlantCountry')].filter(Boolean).join(', ') || undefined,
    decoder_notes: pick('ErrorText') && !String(pick('ErrorText')).startsWith('0 ') ? trim(pick('ErrorText'), 200) : undefined,
    is_nissan: String(pick('Make') || '').toUpperCase() === 'NISSAN',
    source: 'NHTSA vPIC VIN decoder (live)',
  };
}
