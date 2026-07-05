/**
 * Expenses page — role-split expense management.
 *
 * Managers (can 'expenses.manage') get every submission, grouped by status
 * (Hebrew labels via EXPENSE_STATUS/labelOf) with approve/reject actions that
 * write through Expenses.update, plus a read-only "my expenses" section of their
 * own reports. Everyone else gets the camera-first <SubmitExpenseForm/> and a
 * list of ONLY their own expenses (server-filtered by employee_email).
 *
 * Data access is via the @/api/entities repository (bounded lists, explicit
 * limit). Money/dates are formatted through @/lib/format; feedback is toast-only.
 * RTL root, logical properties, LTR islands for amounts/dates.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { can } from '@/lib/permissions';
import { Expenses } from '@/api/entities';
import { EXPENSE_CATEGORY, EXPENSE_STATUS, labelOf } from '@/shared/labels';
import { formatCurrency, formatDate } from '@/lib/format';
import { toast } from '@/lib/toast';
import SubmitExpenseForm from '@/components/expenses/SubmitExpenseForm';

const STATUS_ORDER = ['pending', 'approved', 'rejected', 'paid'];

const STATUS_TONE = {
  pending: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  approved: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  rejected: 'border-rose-400/30 bg-rose-400/10 text-rose-300',
  paid: 'border-sky-400/30 bg-sky-400/10 text-sky-300',
};

function ExpenseStatusPill({ status }) {
  const tone = STATUS_TONE[status] || 'border-slate-700 bg-slate-800 text-slate-300';
  return (
    <span
      dir="rtl"
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tone}`}
    >
      {labelOf(EXPENSE_STATUS, status)}
    </span>
  );
}

function ExpenseCard({ expense, showEmployee, showStatus, onApprove, onReject, busy }) {
  const canDecide = Boolean(onApprove || onReject);
  return (
    <div dir="rtl" className="rounded-xl border border-slate-800 bg-[#0d1117] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-100">
            {expense.expense_name || labelOf(EXPENSE_CATEGORY, expense.category)}
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            {labelOf(EXPENSE_CATEGORY, expense.category)}
          </p>
        </div>
        {showStatus ? <ExpenseStatusPill status={expense.status || 'pending'} /> : null}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-xs text-slate-500">סכום</dt>
          <dd dir="ltr" className="text-start font-medium text-slate-100">
            {formatCurrency(expense.amount, expense.currency || 'ILS')}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">תאריך</dt>
          <dd dir="ltr" className="text-start text-slate-200">{formatDate(expense.date)}</dd>
        </div>
        {showEmployee ? (
          <div className="col-span-2">
            <dt className="text-xs text-slate-500">עובד</dt>
            <dd className="truncate text-slate-200">
              {expense.employee_name || (
                <span dir="ltr">{expense.employee_email || '—'}</span>
              )}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {expense.receipt_image ? (
          <a
            href={expense.receipt_image}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-amber-300 underline-offset-2 hover:underline"
          >
            צפייה בקבלה
          </a>
        ) : null}

        {canDecide ? (
          <div className="ms-auto flex gap-2">
            <button
              type="button"
              onClick={() => onReject?.(expense)}
              disabled={busy}
              className="min-h-[44px] rounded-lg border border-rose-400/40 px-4 py-2 text-sm font-medium text-rose-300 transition hover:bg-rose-400/10 disabled:opacity-60"
            >
              דחייה
            </button>
            <button
              type="button"
              onClick={() => onApprove?.(expense)}
              disabled={busy}
              className="min-h-[44px] rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-[#0d1117] transition hover:bg-emerald-400 disabled:opacity-60"
            >
              אישור
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function ExpensesPage() {
  const { user, loading } = useAuth();
  const isManager = can(user, 'expenses.manage');

  const [rows, setRows] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [actingId, setActingId] = useState('');

  const reload = useCallback(async () => {
    if (!user?.email) return;
    setLoadingData(true);
    try {
      const data = isManager
        ? await Expenses.list({ limit: 100 })
        : await Expenses.filter({ employee_email: user.email }, { limit: 100 });
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('[ExpensesPage.reload]', err);
      toast.error('טעינת ההוצאות נכשלה');
    } finally {
      setLoadingData(false);
    }
  }, [user, isManager]);

  useEffect(() => {
    if (user?.email) reload();
  }, [user, reload]);

  async function decide(expense, status) {
    setActingId(expense.id);
    try {
      await Expenses.update(expense.id, {
        status,
        approved_by: user?.email,
        approved_date: new Date().toISOString(),
      });
      toast.success(status === 'approved' ? 'ההוצאה אושרה' : 'ההוצאה נדחתה');
      await reload();
    } catch (err) {
      console.error('[ExpensesPage.decide]', err);
      toast.error('עדכון ההוצאה נכשל');
    } finally {
      setActingId('');
    }
  }

  const myRows = useMemo(
    () => rows.filter((r) => r.employee_email === user?.email),
    [rows, user],
  );

  if (loading) {
    return (
      <div dir="rtl" className="p-6 text-sm text-slate-400">
        טוען…
      </div>
    );
  }

  return (
    <div dir="rtl" className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-100">הוצאות</h1>
        <p className="mt-1 text-sm text-slate-400">
          {isManager ? 'אישור וניהול דיווחי הוצאות של הצוות' : 'דיווח ומעקב אחר ההוצאות שלך'}
        </p>
      </header>

      {isManager ? (
        <>
          {/* Manager — all submissions grouped by status */}
          <section className="space-y-5">
            {loadingData ? (
              <p className="text-sm text-slate-400">טוען הוצאות…</p>
            ) : rows.length === 0 ? (
              <p className="rounded-xl border border-slate-800 bg-[#0d1117] p-6 text-center text-sm text-slate-400">
                אין הוצאות להצגה.
              </p>
            ) : (
              STATUS_ORDER.map((status) => {
                const group = rows.filter((r) => (r.status || 'pending') === status);
                if (group.length === 0) return null;
                return (
                  <div key={status} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <ExpenseStatusPill status={status} />
                      <span className="text-xs text-slate-500">{group.length}</span>
                    </div>
                    <div className="grid gap-3">
                      {group.map((expense) => (
                        <ExpenseCard
                          key={expense.id}
                          expense={expense}
                          showEmployee
                          onApprove={status === 'pending' ? (e) => decide(e, 'approved') : undefined}
                          onReject={status === 'pending' ? (e) => decide(e, 'rejected') : undefined}
                          busy={actingId === expense.id}
                        />
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </section>

          {/* Manager — their own reports, read-only */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-100">ההוצאות שלי</h2>
            {myRows.length === 0 ? (
              <p className="rounded-xl border border-slate-800 bg-[#0d1117] p-4 text-sm text-slate-400">
                לא דיווחת עדיין על הוצאות.
              </p>
            ) : (
              <div className="grid gap-3">
                {myRows.map((expense) => (
                  <ExpenseCard key={expense.id} expense={expense} showStatus />
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <>
          {/* Employee — camera-first submission */}
          <SubmitExpenseForm user={user} onCreated={reload} />

          {/* Employee — own history only */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-100">ההוצאות שלי</h2>
            {loadingData ? (
              <p className="text-sm text-slate-400">טוען הוצאות…</p>
            ) : rows.length === 0 ? (
              <p className="rounded-xl border border-slate-800 bg-[#0d1117] p-4 text-sm text-slate-400">
                לא דיווחת עדיין על הוצאות.
              </p>
            ) : (
              <div className="grid gap-3">
                {rows.map((expense) => (
                  <ExpenseCard key={expense.id} expense={expense} showStatus />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
