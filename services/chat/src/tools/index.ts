import type { Tool, ToolInputSchema } from '@aws-sdk/client-bedrock-runtime';
import { addVehicle, listVehicles } from './garage.js';
import { CitationRegistry, searchKnowledge } from './knowledge.js';
import { getMaintenance } from './maintenance.js';
import { decodeVin, getComplaintSummary, getRecalls } from './nhtsa.js';
import { checkWarranty } from './warranty.js';

const obj = (properties: Record<string, unknown>, required: string[] = []): ToolInputSchema => ({ json: { type: 'object', properties, required } as any });
const model = { type: 'string', description: 'Nissan model name, e.g. "Rogue", "Altima", "LEAF", "Frontier"' };
const year = { type: 'integer', description: 'Model year, e.g. 2021' };

export const TOOL_SPECS: Tool[] = [
  { toolSpec: {
    name: 'search_owner_knowledge',
    description: 'Semantic search over Nissan Owner\'s Manuals (2023-2025, 12 models), Warranty Information Booklets, NHTSA recall/complaint digests (2015-2026) and curated owner guides (warranty, CVT programs, CPO, EV battery, roadside, recalls). Use for how-to, warning lights, features, specifications, warranty terms and policy questions. Returns passages with cite_id values to cite.',
    inputSchema: obj({
      query: { type: 'string', description: 'Focused search query, e.g. "how to reset tire pressure warning light"' },
      model, year,
      doc_type: { type: 'string', enum: ['owner_manual', 'warranty_booklet', 'nhtsa_digest', 'guide', 'maintenance_schedule'], description: 'Optional: restrict to one document type' },
    }, ['query']),
  } },
  { toolSpec: {
    name: 'get_maintenance_schedule',
    description: 'Factory maintenance schedule and fluid specifications (oil grade/capacity, CVT fluid, coolant) for a model/year, with next scheduled milestones computed from the current mileage. Data covers 2023-2025 Altima, Armada, Frontier, Kicks, Kicks Play, LEAF, Murano, Pathfinder, Rogue, Sentra, TITAN, Z (nearest year used otherwise).',
    inputSchema: obj({
      model, year,
      current_mileage: { type: 'integer' },
      severe_use: { type: 'boolean', description: 'true if the driver mainly drives under severe conditions (short trips, towing, dusty/rough roads, stop-and-go heat, extensive idling)' },
      engine: { type: 'string', description: 'Optional engine code if known, e.g. KR15DDT, PR25DD' },
    }, ['model', 'year']),
  } },
  { toolSpec: {
    name: 'check_warranty_coverage',
    description: 'Computes which Nissan factory warranty coverages are ACTIVE or EXPIRED for a vehicle (basic, powertrain, corrosion, emissions, EV battery, roadside), remaining months/miles, applicable CVT extended-warranty settlement programs, Certified Pre-Owned coverage, and Takata Do-Not-Drive alerts. Always use this for ANY question about warranty terms, lengths or status (including EV battery coverage), even when mileage is unknown - never state coverage terms or compute dates yourself.',
    inputSchema: obj({
      model, year,
      current_mileage: { type: 'integer' },
      in_service_date: { type: 'string', description: 'YYYY-MM-DD date first delivered to a retail buyer / put in service, if known' },
      certified_pre_owned: { type: 'boolean' },
    }, ['model', 'year']),
  } },
  { toolSpec: {
    name: 'get_recalls',
    description: 'LIVE lookup of NHTSA safety recalls for a Nissan model/year (campaign number, component, risk, remedy, do-not-drive / park-outside flags).',
    inputSchema: obj({ model, year }, ['model', 'year']),
  } },
  { toolSpec: {
    name: 'get_owner_complaints',
    description: 'LIVE summary of owner complaints filed with NHTSA for a model/year: totals, top components, recent examples. Optional component_filter (e.g. "TRANSMISSION", "AIR BAGS", "ENGINE").',
    inputSchema: obj({ model, year, component_filter: { type: 'string' } }, ['model', 'year']),
  } },
  { toolSpec: {
    name: 'decode_vin',
    description: 'LIVE decode of a 17-character VIN with the NHTSA vPIC decoder: model, year, trim, engine, drive type, plant.',
    inputSchema: obj({ vin: { type: 'string' } }, ['vin']),
  } },
  { toolSpec: {
    name: 'get_my_garage',
    description: 'List the signed-in driver\'s saved vehicles (My Garage) with mileage, in-service date and VIN.',
    inputSchema: obj({}),
  } },
  { toolSpec: {
    name: 'add_vehicle_to_garage',
    description: 'Save a vehicle to the driver\'s My Garage. Only call when the driver explicitly asks to save/add their vehicle.',
    inputSchema: obj({
      model, year,
      nickname: { type: 'string' }, trim: { type: 'string' }, vin: { type: 'string' },
      current_mileage: { type: 'integer' }, in_service_date: { type: 'string', description: 'YYYY-MM-DD' },
      certified_pre_owned: { type: 'boolean' },
    }, ['model', 'year']),
  } },
];

/** Short human-readable status line streamed to the UI while a tool runs. */
export function toolStatus(name: string, input: any): string {
  const v = input?.year && input?.model ? `${input.year} ${input.model}` : input?.model || '';
  switch (name) {
    case 'search_owner_knowledge': return `Searching owner's manuals and guides${input?.model ? ` for ${v}` : ''}…`;
    case 'get_maintenance_schedule': return `Looking up the factory maintenance schedule for ${v}…`;
    case 'check_warranty_coverage': return `Calculating warranty coverage for ${v}…`;
    case 'get_recalls': return `Checking NHTSA for recalls on the ${v}…`;
    case 'get_owner_complaints': return `Reviewing NHTSA owner complaints for the ${v}…`;
    case 'decode_vin': return 'Decoding VIN with NHTSA vPIC…';
    case 'get_my_garage': return 'Opening My Garage…';
    case 'add_vehicle_to_garage': return `Saving ${v} to My Garage…`;
    default: return `Running ${name}…`;
  }
}

export async function runTool(name: string, input: any, ctx: { userId: string; citations: CitationRegistry }): Promise<unknown> {
  switch (name) {
    case 'search_owner_knowledge': return searchKnowledge(input, ctx.citations);
    case 'get_maintenance_schedule': return getMaintenance(input);
    case 'check_warranty_coverage': return checkWarranty(input);
    case 'get_recalls': return getRecalls(input);
    case 'get_owner_complaints': return getComplaintSummary(input);
    case 'decode_vin': return decodeVin(input);
    case 'get_my_garage': return { vehicles: await listVehicles(ctx.userId) };
    case 'add_vehicle_to_garage': return addVehicle(ctx.userId, input);
    default: throw new Error(`Unknown tool ${name}`);
  }
}
