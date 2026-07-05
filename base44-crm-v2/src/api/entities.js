/**
 * Entity repositories — the single import surface for data access.
 *
 * Fixes the legacy `api/entities.js` that exported only `Query`/`User` and
 * forced every page to reach into `base44.entities.*` (audit P3). Here every
 * model is a bounded repository (see repository.js). Pages import from here:
 *   import { Cars, Customers } from '@/api/entities';
 */
import { base44 } from './base44Client';
import { makeRepo } from './repository';

// Core
export const Cars = makeRepo('Car');
export const Customers = makeRepo('Customer');
export const Contacts = makeRepo('Contact');
export const Suppliers = makeRepo('Supplier');
export const Orders = makeRepo('Order');
export const Payments = makeRepo('Payment');
export const Invoices = makeRepo('Invoice');
export const CashFlows = makeRepo('CashFlow');
export const Expenses = makeRepo('Expense');
export const Tasks = makeRepo('Task');
export const Notifications = makeRepo('Notification');
export const Employees = makeRepo('Employee');
export const CustomerInteractions = makeRepo('CustomerInteraction');
export const VehicleCatalogs = makeRepo('VehicleCatalog');
export const ContractArchives = makeRepo('ContractArchive');

// Car satellites (v2 decomposition)
export const CarPurchases = makeRepo('CarPurchase');
export const CarShipments = makeRepo('CarShipment');
export const CarExpenseInvoices = makeRepo('CarExpenseInvoice');
export const CarDocuments = makeRepo('CarDocument');
export const CarHistoryEvents = makeRepo('CarHistoryEvent');
export const CarCertificates = makeRepo('CarCertificate');
export const CarMaintenances = makeRepo('CarMaintenance');
export const DeliveryPreps = makeRepo('DeliveryPrep');
export const CustomerHistoryEvents = makeRepo('CustomerHistoryEvent');

// People / ops
export const AttendanceRecords = makeRepo('AttendanceRecord');
export const LocationTrackings = makeRepo('LocationTracking');
export const ExpenseBudgets = makeRepo('ExpenseBudget');
export const ExpenseAlertSettings = makeRepo('ExpenseAlertSettings');
export const ReminderSettings = makeRepo('ReminderSetting');

// Messaging (mostly service-written; read via manager screens)
export const WhatsAppMessages = makeRepo('WhatsAppMessage');
export const WhatsAppSessions = makeRepo('WhatsAppSession');
export const VisitorLogs = makeRepo('VisitorLog');

// Auth passthrough
export const Auth = base44.auth;
