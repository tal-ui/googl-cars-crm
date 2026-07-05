/**
 * SubmitExpenseForm — the golden "submit expense = camera-first mobile" flow.
 *
 * Order is deliberate: the receipt CAMERA/UPLOAD comes FIRST. The moment a photo
 * lands, we OCR it (ExtractDataFromUploadedFile) to prefill amount / date /
 * supplier, so the employee only has to CONFIRM two fields — amount (MoneyInput)
 * and category (EXPENSE_CATEGORY) — before submitting. OCR is best-effort: a read
 * failure never blocks manual entry.
 *
 * Writes one Expense row via the @/api/entities repository (never base44.*):
 * { employee_email, employee_name, date, expense_name, amount, currency,
 *   category, receipt_image, status:'pending' }. Feedback is toast-only; on
 * success the form resets for the next receipt. RTL root, logical properties,
 * every LTR datum (amount, date) sits in its own LTR island.
 */
import { useState } from 'react';
import FileUpload from '@/components/ui/FileUpload';
import Field from '@/components/ui/Field';
import MoneyInput from '@/components/ui/MoneyInput';
import DateInputHe from '@/components/ui/DateInputHe';
import { Expenses } from '@/api/entities';
import { ExtractDataFromUploadedFile } from '@/api/integrations';
import { EXPENSE_CATEGORY } from '@/shared/labels';
import { toast } from '@/lib/toast';

const CATEGORY_CODES = Object.keys(EXPENSE_CATEGORY);
const CURRENCIES = ['ILS', 'USD', 'EUR'];

const INPUT_CLASS =
  'min-h-[44px] w-full rounded-lg border border-slate-800 bg-[#0d1117] px-3 py-2 text-start text-sm text-slate-200 placeholder:text-slate-500 outline-none transition focus:border-amber-400 focus:ring-1 focus:ring-amber-400';

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Coerce any OCR-returned date-ish string to yyyy-mm-dd, or '' if unparseable. */
function toIsoDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

/** Schema the extractor fills from the receipt image. */
const OCR_SCHEMA = {
  type: 'object',
  properties: {
    amount: { type: 'number', description: 'total amount charged on the receipt' },
    currency: { type: 'string', description: 'ISO currency code, e.g. ILS, USD, EUR' },
    date: { type: 'string', description: 'date printed on the receipt' },
    supplier_name: { type: 'string', description: 'merchant / supplier name' },
  },
};

export default function SubmitExpenseForm({ user, onCreated }) {
  const [receipt, setReceipt] = useState(null); // { url, name, type }
  const [ocrBusy, setOcrBusy] = useState(false);
  const [money, setMoney] = useState({ amount: null, currency: 'ILS' });
  const [category, setCategory] = useState('');
  const [expenseName, setExpenseName] = useState('');
  const [date, setDate] = useState(todayIso());
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  function resetForm() {
    setReceipt(null);
    setOcrBusy(false);
    setMoney({ amount: null, currency: 'ILS' });
    setCategory('');
    setExpenseName('');
    setDate(todayIso());
    setErrors({});
    setSaving(false);
  }

  async function handleUploaded({ url, name, type }) {
    setReceipt({ url, name, type });
    setErrors((e) => ({ ...e, receipt: undefined }));
    await runOcr(url);
  }

  async function runOcr(url) {
    setOcrBusy(true);
    try {
      const res = await ExtractDataFromUploadedFile({ file_url: url, json_schema: OCR_SCHEMA });
      const data = res && res.status === 'success' ? res.output : (res && res.output) || null;
      if (data && typeof data === 'object') {
        const nextCurrency = CURRENCIES.includes(data.currency) ? data.currency : 'ILS';
        const amountNum = data.amount != null ? Number(data.amount) : null;
        if (amountNum != null && !Number.isNaN(amountNum)) {
          setMoney({ amount: amountNum, currency: nextCurrency });
        } else if (data.currency) {
          setMoney((m) => ({ ...m, currency: nextCurrency }));
        }
        const iso = toIsoDate(data.date);
        if (iso) setDate(iso);
        if (data.supplier_name && typeof data.supplier_name === 'string') {
          setExpenseName(data.supplier_name.trim());
        }
        toast.info('הפרטים מולאו מהקבלה — נא לאשר את הסכום והקטגוריה');
      }
    } catch (err) {
      console.error('[SubmitExpenseForm.ocr]', err);
      toast.info('לא הצלחנו לקרוא את הקבלה — נא למלא את הפרטים ידנית');
    } finally {
      setOcrBusy(false);
    }
  }

  async function handleSubmit() {
    const next = {};
    if (!receipt?.url) next.receipt = 'יש לצלם או להעלות קבלה';
    if (money.amount == null || Number(money.amount) <= 0) next.amount = 'יש להזין סכום חיובי';
    if (!category) next.category = 'יש לבחור קטגוריה';
    if (!expenseName.trim()) next.expenseName = 'יש להזין שם הוצאה';
    if (!date) next.date = 'יש להזין תאריך';
    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }

    setSaving(true);
    try {
      const saved = await Expenses.create({
        employee_email: user?.email,
        employee_name: user?.full_name || user?.email || '',
        date,
        expense_name: expenseName.trim(),
        amount: Number(money.amount),
        currency: money.currency,
        category,
        receipt_image: receipt.url,
        status: 'pending',
      });
      toast.success('ההוצאה נשלחה לאישור');
      onCreated?.(saved);
      resetForm();
    } catch (err) {
      console.error('[SubmitExpenseForm.submit]', err);
      toast.error('שליחת ההוצאה נכשלה');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div dir="rtl" className="rounded-2xl border border-slate-800 bg-[#0d1117] p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-100">דיווח הוצאה</h2>
        <p className="mt-1 text-sm text-slate-400">צלמו את הקבלה — הסכום, התאריך והספק ימולאו אוטומטית.</p>
      </div>

      {/* Step 1 — camera-first receipt capture */}
      <Field label="קבלה" required error={errors.receipt}>
        <FileUpload
          accept="image/*"
          label={receipt ? 'צילום קבלה נוסף' : 'צלם / העלה קבלה'}
          onUploaded={handleUploaded}
          disabled={saving}
        />
      </Field>

      {receipt ? (
        <div className="mt-3 overflow-hidden rounded-lg border border-slate-800 bg-black/20">
          <img
            src={receipt.url}
            alt="תצוגת קבלה"
            className="max-h-48 w-full object-contain"
          />
        </div>
      ) : null}

      {ocrBusy ? (
        <p className="mt-3 text-sm text-amber-300">קורא את הקבלה…</p>
      ) : null}

      {/* Step 2 — confirm the prefilled fields (only after a receipt exists) */}
      {receipt ? (
        <div className="mt-5 space-y-4">
          <Field label="סכום" required htmlFor="expense-amount" error={errors.amount}>
            <MoneyInput
              id="expense-amount"
              value={money}
              onChange={(nextMoney) => {
                setMoney(nextMoney);
                setErrors((e) => ({ ...e, amount: undefined }));
              }}
            />
          </Field>

          <Field label="קטגוריה" required htmlFor="expense-category" error={errors.category}>
            <select
              id="expense-category"
              dir="rtl"
              className={INPUT_CLASS}
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setErrors((el) => ({ ...el, category: undefined }));
              }}
            >
              <option value="" disabled>
                בחר קטגוריה
              </option>
              {CATEGORY_CODES.map((code) => (
                <option key={code} value={code}>
                  {EXPENSE_CATEGORY[code]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="שם ההוצאה" required htmlFor="expense-name" error={errors.expenseName}>
            <input
              id="expense-name"
              type="text"
              className={INPUT_CLASS}
              value={expenseName}
              onChange={(e) => {
                setExpenseName(e.target.value);
                setErrors((el) => ({ ...el, expenseName: undefined }));
              }}
              placeholder="לדוגמה: תדלוק, חניון, ארוחת עסקים"
            />
          </Field>

          <Field label="תאריך" required htmlFor="expense-date" error={errors.date}>
            <DateInputHe
              id="expense-date"
              value={date}
              onChange={(iso) => {
                setDate(iso);
                setErrors((el) => ({ ...el, date: undefined }));
              }}
            />
          </Field>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || ocrBusy}
            className="min-h-[44px] w-full rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-[#0d1117] transition hover:bg-amber-300 disabled:opacity-60"
          >
            {saving ? 'שולח…' : 'שליחה לאישור'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
