/**
 * CostsDocumentsPanel — the "עלויות ומסמכים" stage. Two independent satellites:
 *
 *  - CarExpenseInvoices: lists the car's expense invoices (name + amount, with a
 *    running total), and adds a new one via FileUpload → create(car_id, name,
 *    file_url, amount, currency).
 *  - CarDocuments: adds a document via FileUpload with a category chosen from
 *    CAR_DOCUMENT_CATEGORY → create(car_id, category, file_url, name).
 *
 * All feedback goes through toast; amounts are formatted with formatCurrency.
 *
 * Props: { car, onSaved }
 */
import { useEffect, useState } from 'react';
import { CarExpenseInvoices, CarDocuments } from '@/api/entities';
import { CAR_DOCUMENT_CATEGORY } from '@/shared/labels';
import { formatCurrency } from '@/lib/format';
import { toast } from '@/lib/toast';
import Field from '@/components/ui/Field';
import MoneyInput from '@/components/ui/MoneyInput';
import FileUpload from '@/components/ui/FileUpload';

export default function CostsDocumentsPanel({ car, onSaved }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  const [invoiceName, setInvoiceName] = useState('');
  const [invoiceMoney, setInvoiceMoney] = useState({ amount: null, currency: 'ILS' });

  const [docCategory, setDocCategory] = useState(
    () => Object.keys(CAR_DOCUMENT_CATEGORY || {})[0] || '',
  );

  async function loadInvoices() {
    if (!car?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await CarExpenseInvoices.filter({ car_id: car.id }, { limit: 100 });
      setInvoices(Array.isArray(rows) ? rows : []);
    } catch (err) {
      console.error('[CostsDocumentsPanel.loadInvoices]', err);
      toast.error('טעינת חשבוניות ההוצאה נכשלה');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [car?.id]);

  const total = invoices.reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0);

  async function handleInvoiceUploaded({ url, name }) {
    if (!car?.id) return;
    try {
      await CarExpenseInvoices.create({
        car_id: car.id,
        name: invoiceName || name,
        file_url: url,
        amount: invoiceMoney.amount,
        currency: invoiceMoney.currency,
      });
      toast.success('חשבונית ההוצאה נוספה');
      setInvoiceName('');
      setInvoiceMoney({ amount: null, currency: 'ILS' });
      await loadInvoices();
      onSaved?.();
    } catch (err) {
      toast.error('הוספת חשבונית ההוצאה נכשלה');
      console.error('[CostsDocumentsPanel.addInvoice]', err);
    }
  }

  async function handleDocumentUploaded({ url, name }) {
    if (!car?.id) return;
    try {
      await CarDocuments.create({
        car_id: car.id,
        category: docCategory,
        file_url: url,
        name,
      });
      toast.success('המסמך נוסף');
      onSaved?.();
    } catch (err) {
      toast.error('הוספת המסמך נכשלה');
      console.error('[CostsDocumentsPanel.addDocument]', err);
    }
  }

  return (
    <div dir="rtl" className="space-y-6">
      {/* Expense invoices */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">חשבוניות הוצאה</h3>
          <div className="text-sm text-slate-400">
            סה"כ:{' '}
            <span className="font-semibold text-amber-300" dir="ltr">
              {formatCurrency(total, 'ILS')}
            </span>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400">טוען…</p>
        ) : invoices.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-800 p-4 text-sm text-slate-500">
            אין חשבוניות הוצאה עדיין.
          </p>
        ) : (
          <ul className="divide-y divide-slate-800 rounded-lg border border-slate-800 bg-[#0d1117]">
            {invoices.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="min-w-0 truncate text-sm text-slate-200">
                  {inv.name || 'ללא שם'}
                </span>
                <span className="shrink-0 text-sm text-slate-300" dir="ltr">
                  {formatCurrency(inv.amount, inv.currency || 'ILS')}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-3 rounded-lg border border-slate-800 bg-[#0d1117] p-3">
          <Field label="שם החשבונית" htmlFor="invoice_name">
            <input
              id="invoice_name"
              type="text"
              value={invoiceName}
              onChange={(e) => setInvoiceName(e.target.value)}
              placeholder="למשל: שילוח, מכס, ביטוח"
              className="min-h-[44px] w-full rounded-lg border border-slate-800 bg-[#0d1117] px-3 py-2 text-start text-sm text-slate-200 placeholder:text-slate-500 outline-none transition focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
            />
          </Field>

          <MoneyInput
            id="invoice_amount"
            label="סכום"
            value={invoiceMoney}
            onChange={setInvoiceMoney}
          />

          <FileUpload label="העלה חשבונית והוסף" accept="image/*,application/pdf" onUploaded={handleInvoiceUploaded} />
        </div>
      </section>

      {/* Documents */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-200">מסמכי רכב</h3>

        <div className="space-y-3 rounded-lg border border-slate-800 bg-[#0d1117] p-3">
          <Field label="קטגוריית מסמך" htmlFor="doc_category">
            <select
              id="doc_category"
              value={docCategory}
              onChange={(e) => setDocCategory(e.target.value)}
              className="min-h-[44px] w-full rounded-lg border border-slate-800 bg-[#0d1117] px-3 py-2 text-start text-sm text-slate-200 outline-none transition focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
            >
              {Object.entries(CAR_DOCUMENT_CATEGORY || {}).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </Field>

          <FileUpload label="העלה מסמך" accept="image/*,application/pdf" onUploaded={handleDocumentUploaded} />
        </div>
      </section>
    </div>
  );
}
