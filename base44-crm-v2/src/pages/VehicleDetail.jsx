/**
 * VehicleDetail — the vehicle workspace route at "/vehicles/:id".
 *
 * Loads the Car by id and hands it to the existing <CarWorkspace/> (the tabbed,
 * per-stage workspace that replaced the legacy VehicleForm). This page owns only
 * three things: fetching the car, the status-advance write-back, and the
 * loading/error/not-found shells. All rendering + tab wiring lives in
 * CarWorkspace; data access goes through @/api/entities repositories.
 *
 * onStatusAdvance(nextCode):
 *   NOTE — in real v2 this is a SERVER function. The server re-validates the
 *   transition (canTransition), recomputes cost_summary, and fires the customer
 *   WhatsApp message + auto-generated tasks. Until that endpoint exists we do the
 *   interim client-side write here: patch the Car status + timestamp and append a
 *   CarHistoryEvent audit row. Keep this as the fallback; do not treat the client
 *   write as the source of truth once the server function lands.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Cars, CarHistoryEvents } from '@/api/entities';
import CarWorkspace from '@/components/vehicles/CarWorkspace';
import { toast } from '@/lib/toast';

export default function VehicleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [car, setCar] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadCar = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const record = await Cars.get(id);
      setCar(record || null);
    } catch (err) {
      console.error('[VehicleDetail.loadCar]', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadCar();
  }, [loadCar]);

  const handleStatusAdvance = useCallback(
    async (nextCode) => {
      if (!car) return;
      const prev = car.status_code;
      const changedAt = new Date().toISOString();

      // INTERIM CLIENT WRITE — see file header. The real v2 path is a server
      // function that re-validates the transition, recomputes cost_summary, and
      // fires WhatsApp + tasks. Here we patch the Car and append the audit event.
      const updated = await Cars.update(id, {
        status_code: nextCode,
        status_changed_at: changedAt,
      });

      // Audit trail — best-effort; a failed history write must not roll back the
      // status change the user just made, so it's logged, not thrown.
      try {
        await CarHistoryEvents.create({
          car_id: id,
          action: 'status_change',
          from_status: prev,
          to_status: nextCode,
        });
      } catch (histErr) {
        console.error('[VehicleDetail.handleStatusAdvance] history write failed', histErr);
      }

      setCar(updated || { ...car, status_code: nextCode, status_changed_at: changedAt });
    },
    [car, id],
  );

  if (loading) {
    return (
      <div dir="rtl" className="p-6 text-sm text-slate-400">
        טוען רכב…
      </div>
    );
  }

  if (error) {
    return (
      <div dir="rtl" className="mx-auto max-w-md space-y-3 p-6 text-sm">
        <p className="text-rose-300">טעינת הרכב נכשלה.</p>
        <button
          type="button"
          onClick={loadCar}
          className="rounded-lg border border-slate-700 px-4 py-2 text-slate-200 transition hover:border-slate-600 hover:bg-slate-800"
        >
          נסה שוב
        </button>
      </div>
    );
  }

  if (!car) {
    return (
      <div dir="rtl" className="p-6 text-sm text-slate-400">
        הרכב לא נמצא.
      </div>
    );
  }

  return (
    <div dir="rtl" className="h-full">
      <CarWorkspace
        car={car}
        onStatusAdvance={handleStatusAdvance}
        onClose={() => navigate('/vehicles')}
      />
    </div>
  );
}
