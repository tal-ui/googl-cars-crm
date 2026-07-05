/**
 * ClockInScreen — the golden "clock in = 1 tap" flow.
 *
 * Mobile-first (designed at 360px, min 44px targets). Reads the signed-in user
 * from useAuth(), looks up today's OPEN AttendanceRecord for that user, and shows
 * exactly ONE giant button:
 *   - no open record  -> "כניסה"  (check-in)  -> creates a new record
 *   - open record      -> "יציאה"  (check-out) -> completes that record
 *
 * On tap we grab a SINGLE geolocation fix and then write using the CANONICAL v2
 * schema only — check_in_time / check_out_time, check_in_lat/lng, check_out_lat/lng,
 * status active/completed, user_email, user_name, date, source:'manual'. We never
 * write the frozen legacy twins (timestamp/type/location) — those are read-only
 * during migration and belong to the drift-patch layer, not new writes.
 *
 * GPS is best-effort: attendance must never be blocked by a denied permission, so
 * a denial/timeout still records the punch (with null coords) and surfaces a
 * graceful toast. A small inline indicator communicates the location state.
 *
 * RTL root. Any LTR datum (coordinates) sits in its own dir="ltr" island. No
 * polling / setInterval — the screen reflects state at tap time.
 */
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { AttendanceRecords } from '@/api/entities';
import { toast } from '@/lib/toast';

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Wrap the callback geolocation API in a single-shot promise. Never rejects. */
function getPositionOnce() {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({ ok: false, reason: 'unsupported' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          ok: true,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }),
      (err) =>
        resolve({
          ok: false,
          reason: err && err.code === 1 ? 'denied' : 'error',
        }),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  });
}

const GPS_LABEL = {
  idle: '',
  locating: 'מאתר מיקום…',
  ok: 'מיקום נקלט',
  denied: 'הרשאת מיקום נדחתה — נרשם ללא מיקום',
  error: 'לא ניתן לאתר מיקום — נרשם ללא מיקום',
  unsupported: 'מיקום לא נתמך במכשיר — נרשם ללא מיקום',
};

const GPS_DOT = {
  idle: 'bg-slate-600',
  locating: 'bg-amber-400 animate-pulse',
  ok: 'bg-emerald-400',
  denied: 'bg-rose-400',
  error: 'bg-rose-400',
  unsupported: 'bg-rose-400',
};

export default function ClockInScreen() {
  const { user, loading: authLoading } = useAuth();

  const [record, setRecord] = useState(null); // today's open (active) record, or null
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [gps, setGps] = useState('idle');
  const [coords, setCoords] = useState(null);

  const userEmail = user?.email || '';
  const userName = user?.full_name || user?.name || userEmail;

  // Find today's OPEN record for this user. One bounded query, no polling.
  const loadOpen = useCallback(async () => {
    if (!userEmail) {
      setRecord(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await AttendanceRecords.filter(
        { user_email: userEmail, status: 'active' },
        { limit: 1 },
      );
      setRecord(Array.isArray(rows) && rows.length ? rows[0] : null);
    } catch (err) {
      console.error('[ClockInScreen.loadOpen]', err);
      toast.error('טעינת נתוני הנוכחות נכשלה');
      setRecord(null);
    } finally {
      setLoading(false);
    }
  }, [userEmail]);

  useEffect(() => {
    loadOpen();
  }, [loadOpen]);

  const isCheckedIn = Boolean(record);

  async function handlePunch() {
    if (busy || !userEmail) return;
    setBusy(true);
    setGps('locating');
    setCoords(null);

    const pos = await getPositionOnce();
    const hasPos = pos.ok === true;
    setGps(hasPos ? 'ok' : pos.reason || 'error');
    setCoords(hasPos ? { lat: pos.lat, lng: pos.lng } : null);

    const nowIso = new Date().toISOString();

    try {
      if (isCheckedIn) {
        // Close the open record — canonical completion fields only.
        const updated = await AttendanceRecords.update(record.id, {
          status: 'completed',
          check_out_time: nowIso,
          check_out_lat: hasPos ? pos.lat : null,
          check_out_lng: hasPos ? pos.lng : null,
        });
        setRecord(null);
        toast.success('יצאת בהצלחה');
        if (!hasPos) toast.info(GPS_LABEL[pos.reason || 'error']);
        return updated;
      }

      // Open a new record — canonical v2 schema only, no legacy twins.
      const created = await AttendanceRecords.create({
        user_email: userEmail,
        user_name: userName,
        date: todayIso(),
        status: 'active',
        source: 'manual',
        check_in_time: nowIso,
        check_in_lat: hasPos ? pos.lat : null,
        check_in_lng: hasPos ? pos.lng : null,
      });
      setRecord(created && created.id ? created : { id: created?.id });
      toast.success('נכנסת בהצלחה');
      if (!hasPos) toast.info(GPS_LABEL[pos.reason || 'error']);
      return created;
    } catch (err) {
      console.error('[ClockInScreen.handlePunch]', err);
      toast.error(isCheckedIn ? 'רישום היציאה נכשל' : 'רישום הכניסה נכשל');
      // Re-sync with the source of truth after a failed write.
      loadOpen();
      return null;
    } finally {
      setBusy(false);
    }
  }

  const showLoading = authLoading || loading;

  return (
    <div dir="rtl" className="flex w-full flex-col items-center gap-6 text-slate-200">
      <header className="text-center">
        <h1 className="font-display text-2xl font-semibold text-slate-100">
          שעון נוכחות
        </h1>
        {userName ? (
          <p className="mt-1 text-sm text-slate-400">{userName}</p>
        ) : null}
      </header>

      {showLoading ? (
        <div className="flex min-h-[16rem] w-full items-center justify-center">
          <span className="text-sm text-slate-500">טוען…</span>
        </div>
      ) : !userEmail ? (
        <div className="flex min-h-[16rem] w-full items-center justify-center rounded-2xl border border-slate-800 bg-[#0d1117] px-6 text-center">
          <p className="text-sm text-slate-400">
            יש להתחבר כדי לרשום נוכחות
          </p>
        </div>
      ) : (
        <>
          <p
            className={`text-sm ${
              isCheckedIn ? 'text-emerald-400' : 'text-slate-400'
            }`}
          >
            {isCheckedIn ? 'סטטוס: בעבודה' : 'סטטוס: לא בעבודה'}
          </p>

          <button
            type="button"
            onClick={handlePunch}
            disabled={busy}
            aria-busy={busy}
            className={[
              'flex aspect-square w-56 max-w-[80vw] flex-col items-center justify-center gap-2',
              'rounded-full text-2xl font-bold shadow-lg outline-none transition',
              'focus-visible:ring-4 focus-visible:ring-amber-400/40 active:scale-[0.97]',
              'disabled:cursor-not-allowed disabled:opacity-60',
              isCheckedIn
                ? 'bg-rose-500 text-white hover:bg-rose-400'
                : 'bg-emerald-500 text-white hover:bg-emerald-400',
            ].join(' ')}
          >
            <span>{busy ? '…' : isCheckedIn ? 'יציאה' : 'כניסה'}</span>
            <span className="text-sm font-medium opacity-80">
              {busy ? 'רושם…' : 'הקש/י פעם אחת'}
            </span>
          </button>

          {/* GPS status indicator */}
          <div className="flex min-h-[44px] flex-col items-center justify-center gap-1 text-center">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${GPS_DOT[gps]}`}
                aria-hidden="true"
              />
              <span className="text-xs text-slate-400">
                {gps === 'idle' ? 'מיקום ייקלט בעת הרישום' : GPS_LABEL[gps]}
              </span>
            </div>
            {gps === 'ok' && coords ? (
              <span dir="ltr" className="font-mono text-[11px] text-slate-500">
                {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
              </span>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
