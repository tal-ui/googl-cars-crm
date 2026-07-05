/**
 * Single Hebrew-label source for all non-status enum codes.
 *
 * v2 stores stable English codes on records (filtering/i18n-safe) and renders
 * Hebrew via these maps — the one place these translations live. Fixes the
 * mixed Hebrew/English enum values across entities (audit I-016).
 *
 * Vehicle STATUS labels live separately in ./vehicleStatus.js (with tones +
 * transitions). Keep both files the only home for their respective labels.
 */

export const CUSTOMER_TYPE = { private: 'פרטי', business: 'עסקי' };

export const CUSTOMER_STATUS = {
  lead: 'ליד', prospect: 'פוטנציאלי', active: 'פעיל', inactive: 'לא פעיל', vip: 'VIP',
};

export const VEHICLE_SOURCE = {
  import: 'יבוא', trade_in: 'טרייד אין', brokerage: 'תיווך', local_purchase: 'קניה בארץ',
};

export const IMPORT_TYPE = { minor: 'יבוא זעיר', indirect: 'יבוא עקיף' };

export const PAYMENT_METHOD = {
  cash: 'מזומן', bank_transfer: 'העברה בנקאית', credit: 'אשראי', check: "צ'ק", other: 'אחר',
};

export const INVOICE_TYPE = {
  purchase: 'רכישה', sale: 'מכירה', expense: 'הוצאה', income: 'הכנסה',
};

export const CASHFLOW_CATEGORY = {
  purchase: 'רכישה', tax: 'מיסים', shipping: 'שילוח', maintenance: 'אחזקה',
  insurance: 'ביטוח', registration: 'רישום', sale_receipt: 'תקבול מכירה', other: 'אחר',
};

export const EXPENSE_CATEGORY = {
  fuel: 'דלק', parking: 'חניה', tools: 'כלי עבודה', vehicle_maintenance: 'אחזקת רכב',
  client_hosting: 'אירוח לקוחות', deliveries: 'משלוחים', other: 'אחר',
};

export const EXPENSE_STATUS = {
  pending: 'ממתין לאישור', approved: 'אושר', rejected: 'נדחה', paid: 'שולם',
};

export const ORDER_STATUS = {
  new: 'חדשה', in_progress: 'בתהליך', paid: 'שולמה', delivered: 'נמסרה', cancelled: 'בוטלה',
};

export const CONTRACT_TYPE = {
  import_agreement: 'הסכם יבוא', used_car_sale: 'הסכם מכר רכב משומש',
  standard_sale: 'חוזה מכר רגיל', service: 'הסכם שירות', mou: 'זיכרון דברים',
};

export const CERT_TYPE = { license: 'רישיון', inspection: 'בדיקה', insurance: 'ביטוח' };

export const CAR_DOCUMENT_CATEGORY = {
  image: 'תמונה', document: 'מסמך', supplier: 'מסמך ספק',
  sale: 'מסמך מכירה', invoice_receipt: 'חשבונית/קבלה', inspection: 'טופס בדיקה',
};

export const CUSTOM_ROLE = {
  admin: 'מנהל מערכת', sales_manager: 'מנהל מכירות', employee: 'עובד',
  logistics_employee: 'עובד לוגיסטיקה', attendance_only: 'נוכחות בלבד',
};

/** Reverse-lookup a Hebrew legacy value back to a code, for migration backfill. */
export const invert = (map) =>
  Object.fromEntries(Object.entries(map).map(([code, he]) => [he, code]));

/** Generic label getter with fallback to the raw code. */
export const labelOf = (map, code) => map[code] ?? code;
