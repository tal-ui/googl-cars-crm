/**
 * Attendance — the attendance_only home.
 *
 * Users with the `attendance_only` role land here (see homePathFor in
 * @/lib/navigation) with no CRM chrome. The page's whole job is to center the
 * one-tap clock screen on any viewport, mobile-first at 360px. All behavior lives
 * in ClockInScreen; this is purely layout.
 */
import ClockInScreen from '@/components/attendance/ClockInScreen';

export default function Attendance() {
  return (
    <div
      dir="rtl"
      className="flex min-h-screen w-full items-center justify-center bg-[#080b12] px-4 py-10"
    >
      <div className="w-full max-w-sm">
        <ClockInScreen />
      </div>
    </div>
  );
}
