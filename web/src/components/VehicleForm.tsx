import { useEffect, useState } from 'react';
import { api, type Vehicle } from '../api';
import { Spinner } from './icons';

const FALLBACK_MODELS = ['Altima', 'Ariya', 'Armada', 'Frontier', 'GT-R', 'Kicks', 'Kicks Play', 'LEAF', 'Maxima', 'Murano', 'Pathfinder', 'Rogue', 'Rogue Sport', 'Sentra', 'Titan', 'Titan XD', 'Versa', 'Versa Note', 'Z', '370Z'];
const YEARS = Array.from({ length: new Date().getFullYear() + 2 - 2005 }, (_, i) => new Date().getFullYear() + 1 - i);

interface Props { vehicle?: Vehicle; onClose: () => void; onSaved: () => void; onError: (e: unknown) => void }

export function VehicleForm({ vehicle, onClose, onSaved, onError }: Props) {
  const [models, setModels] = useState(FALLBACK_MODELS);
  const [v, setV] = useState<Partial<Vehicle>>(vehicle ?? { year: new Date().getFullYear() - 2, model: 'Rogue' });
  const [busy, setBusy] = useState(false);
  const [vinMsg, setVinMsg] = useState<string | null>(null);
  const set = (k: keyof Vehicle, val: unknown) => setV((o) => ({ ...o, [k]: val }));

  useEffect(() => { api.models().then(setModels).catch(() => {}); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const decode = async () => {
    if (!v.vin || v.vin.length !== 17) { setVinMsg('Enter all 17 characters of the VIN.'); return; }
    setBusy(true); setVinMsg(null);
    try {
      const r = await api.decodeVin(v.vin);
      if (!r.supported) setVinMsg(r.make ? `That VIN decodes to a ${r.year ?? ''} ${r.make} ${r.model ?? ''} - not a supported Nissan model.` : 'VIN could not be decoded.');
      else { setV((o) => ({ ...o, model: r.model, year: r.year, trim: o.trim || r.trim })); setVinMsg(`Decoded by NHTSA: ${r.year} Nissan ${r.model}${r.trim ? ` ${r.trim}` : ''}`); }
    } catch (e) { onError(e); } finally { setBusy(false); }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { ...v, mileage: v.mileage === undefined || (v.mileage as unknown) === '' ? undefined : Number(v.mileage) };
      if (vehicle) await api.updateVehicle(vehicle.vehicleId, body); else await api.addVehicle(body);
      onSaved();
    } catch (err) { onError(err); } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!vehicle) return;
    setBusy(true);
    try { await api.deleteVehicle(vehicle.vehicleId); onSaved(); } catch (err) { onError(err); } finally { setBusy(false); }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={save} aria-label={vehicle ? 'Edit vehicle' : 'Add vehicle'}>
        <h2>{vehicle ? 'Edit vehicle' : 'Add a vehicle to My Garage'}</h2>
        <label>VIN <span className="muted">(optional - fills in model and year)</span>
          <div className="row">
            <input value={v.vin ?? ''} maxLength={17} placeholder="17 characters, e.g. 5N1AT2MV..." onChange={(e) => set('vin', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
            <button type="button" className="btn secondary" onClick={decode} disabled={busy}>Decode</button>
          </div>
        </label>
        {vinMsg && <p className="hint">{vinMsg}</p>}
        <div className="grid2">
          <label>Model
            <select value={v.model} onChange={(e) => set('model', e.target.value)} required>
              {models.map((m) => <option key={m}>{m}</option>)}
            </select>
          </label>
          <label>Model year
            <select value={v.year} onChange={(e) => set('year', Number(e.target.value))} required>
              {YEARS.map((y) => <option key={y}>{y}</option>)}
            </select>
          </label>
          <label>Trim <input value={v.trim ?? ''} maxLength={40} placeholder="e.g. SV AWD" onChange={(e) => set('trim', e.target.value)} /></label>
          <label>Current mileage <input type="number" min={0} max={1000000} value={v.mileage ?? ''} placeholder="e.g. 42000" onChange={(e) => set('mileage', e.target.value === '' ? undefined : Number(e.target.value))} /></label>
          <label>In-service date <input type="date" value={v.inServiceDate ?? ''} onChange={(e) => set('inServiceDate', e.target.value || undefined)} />
            <span className="muted small">Date first sold/delivered - starts the warranty clock</span></label>
          <label>Nickname <input value={v.nickname ?? ''} maxLength={40} placeholder="e.g. Family SUV" onChange={(e) => set('nickname', e.target.value)} /></label>
        </div>
        <label className="check"><input type="checkbox" checked={!!v.certifiedPreOwned} onChange={(e) => set('certifiedPreOwned', e.target.checked)} /> Bought as Nissan Certified Pre-Owned</label>
        <div className="modal-actions">
          {vehicle && <button type="button" className="btn danger" onClick={remove} disabled={busy}>Remove</button>}
          <div className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>{busy ? <Spinner /> : 'Save vehicle'}</button>
        </div>
      </form>
    </div>
  );
}
