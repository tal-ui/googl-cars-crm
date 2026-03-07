/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef, useCallback, useEffect, createContext, useContext } from 'react';

// ═══════════════════════════════════════════════════
// SUPABASE CONFIG  (project: gspyasinnuxqtnmjzkch)
// ═══════════════════════════════════════════════════
const SUPABASE_URL = 'https://bhkcvqftbbcsgpqtnpsb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoa2N2cWZ0YmJjc2dwcXRucHNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MTM0NjIsImV4cCI6MjA4ODI4OTQ2Mn0.xahUUSScfVb5OB-LO5cuthisXoSmyOiurcGSVcCx04seyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzcHlhc2lubnV4cXRubWp6a2NoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NTE1ODAsImV4cCI6MjA4ODMyNzU4MH0.ie9AOOa_6o4XMAF1ZMQUGLlIEPOBjkYBWZHRqkYXGF0';
const EDGE_FN_URL = `${SUPABASE_URL}/functions/v1/upload-file`;
const REST = `${SUPABASE_URL}/rest/v1`;
const STORAGE = `${SUPABASE_URL}/storage/v1/object`;
const BUCKET = 'crm-files';

const sbHeaders = (extra: Record<string, string> = {}) => ({
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
  ...extra,
});

// ── Upload a file to Supabase Storage, return public URL + path ──────────
async function storageUpload(file: File, folder: string): Promise<{ url: string; path: string } | null> {
  try {
    const path = `${folder}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
    const res = await fetch(`${STORAGE}/${BUCKET}/${path}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': file.type },
      body: file,
    });
    if (!res.ok) throw new Error(await res.text());
    const url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
    return { url, path };
  } catch (e) {
    console.error('Storage upload error:', e);
    return null;
  }
}

// ── vehicle_media → backed by crm_file_metadata (record_type = vehicle_image) ──
async function vmFetch(vehicleId: string): Promise<VehicleImage[]> {
  try {
    const res = await fetch(
      `${REST}/crm_file_metadata?record_type=eq.vehicle_image&record_id=eq.${vehicleId}&order=created_at.asc`,
      { headers: sbHeaders() }
    );
    const rows: any[] = await res.json();
    if (!Array.isArray(rows)) return [];
    return rows.map(r => ({
      id: r.id,
      url: r.public_url || `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${r.storage_path}`,
      name: r.original_name || 'Photo',
      isPrimary: r.is_primary ?? false,
      uploadDate: r.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
    }));
  } catch (e) {
    console.error('vmFetch error:', e);
    return [];
  }
}

async function vmInsert(
  vehicleId: string,
  url: string,
  storagePath: string,
  fileName: string,
  isPrimary: boolean,
  _sortOrder: number,
  uploadedBy = 'Admin'
): Promise<string | null> {
  try {
    const ext = fileName.split('.').pop()?.toUpperCase() || 'IMG';
    const res = await fetch(`${REST}/crm_file_metadata`, {
      method: 'POST',
      headers: sbHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify({
        storage_path: storagePath,
        original_name: fileName,
        file_type: ext,
        mime_type: 'image/' + (ext === 'JPG' ? 'jpeg' : ext.toLowerCase()),
        record_type: 'vehicle_image',
        record_id: vehicleId,
        category: 'image',
        uploaded_by: uploadedBy,
        notes: '',
        is_primary: isPrimary,
        public_url: url,
      }),
    });
    const [row] = await res.json();
    return row?.id || null;
  } catch (e) {
    console.error('vmInsert error:', e);
    return null;
  }
}

async function vmSoftDelete(id: string): Promise<void> {
  try {
    await fetch(`${REST}/crm_file_metadata?id=eq.${id}`, {
      method: 'DELETE',
      headers: sbHeaders(),
    });
  } catch (e) {
    console.error('vmSoftDelete error:', e);
  }
}

async function vmSetPrimary(vehicleId: string, primaryId: string): Promise<void> {
  try {
    // Clear all primaries for this vehicle's images
    await fetch(`${REST}/crm_file_metadata?record_type=eq.vehicle_image&record_id=eq.${vehicleId}`, {
      method: 'PATCH',
      headers: sbHeaders(),
      body: JSON.stringify({ is_primary: false }),
    });
    // Set the chosen one
    await fetch(`${REST}/crm_file_metadata?id=eq.${primaryId}`, {
      method: 'PATCH',
      headers: sbHeaders(),
      body: JSON.stringify({ is_primary: true }),
    });
  } catch (e) {
    console.error('vmSetPrimary error:', e);
  }
}

// ── vehicle_documents → backed by crm_file_metadata (record_type = vehicle_attachment) ──
async function vdFetch(vehicleId: string): Promise<VehicleAttachment[]> {
  try {
    const res = await fetch(
      `${REST}/crm_file_metadata?record_type=eq.vehicle_attachment&record_id=eq.${vehicleId}&order=created_at.asc`,
      { headers: sbHeaders() }
    );
    const rows: any[] = await res.json();
    if (!Array.isArray(rows)) return [];
    return rows.map(r => ({
      id: r.id,
      name: r.original_name || 'Document',
      fileType: r.file_type || r.original_name?.split('.').pop()?.toUpperCase() || 'FILE',
      size: r.file_size ? (r.file_size > 1048576 ? `${(r.file_size / 1048576).toFixed(1)} MB` : `${Math.round(r.file_size / 1024)} KB`) : '—',
      category: (r.category || 'document') as VehicleAttachment['category'],
      uploadDate: r.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
      uploadedBy: r.uploaded_by || 'Admin',
      notes: r.notes || '',
    }));
  } catch (e) {
    console.error('vdFetch error:', e);
    return [];
  }
}

async function vdInsert(
  vehicleId: string,
  url: string,
  storagePath: string,
  fileName: string,
  category: string,
  fileSize: string,
  uploadedBy = 'Admin',
  notes = ''
): Promise<string | null> {
  try {
    const ext = fileName.split('.').pop()?.toUpperCase() || 'FILE';
    const sizeBytes = fileSize.includes('MB')
      ? Math.round(parseFloat(fileSize) * 1048576)
      : Math.round(parseFloat(fileSize) * 1024);
    const res = await fetch(`${REST}/crm_file_metadata`, {
      method: 'POST',
      headers: sbHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify({
        storage_path: storagePath,
        original_name: fileName,
        file_type: ext,
        file_size: sizeBytes,
        mime_type: 'application/octet-stream',
        record_type: 'vehicle_attachment',
        record_id: vehicleId,
        category,
        uploaded_by: uploadedBy,
        notes,
        is_primary: false,
        public_url: url,
      }),
    });
    const [row] = await res.json();
    return row?.id || null;
  } catch (e) {
    console.error('vdInsert error:', e);
    return null;
  }
}

async function vdSoftDelete(id: string): Promise<void> {
  try {
    await fetch(`${REST}/crm_file_metadata?id=eq.${id}`, {
      method: 'DELETE',
      headers: sbHeaders(),
    });
  } catch (e) {
    console.error('vdSoftDelete error:', e);
  }
}

// ── Edge function helper for customer_document uploads ────────────────────
async function supabaseUploadFile(
  file: File,
  recordType: 'customer_document' | 'import_document',
  recordId: string,
  opts: { category?: string; uploadedBy?: string; notes?: string; isPrimary?: boolean } = {}
): Promise<{ success: boolean; file?: any; error?: string }> {
  try {
    const form = new FormData();
    form.append('file', file);
    form.append('record_type', recordType);
    form.append('record_id', recordId);
    form.append('category', opts.category || 'document');
    form.append('uploaded_by', opts.uploadedBy || 'Admin');
    form.append('notes', opts.notes || '');
    form.append('is_primary', String(opts.isPrimary || false));
    const res = await fetch(EDGE_FN_URL, { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data;
  } catch (e: any) {
    console.error('Supabase upload error:', e);
    return { success: false, error: e.message };
  }
}

import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

// ═══════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════
type UserRole = 'super_admin' | 'standard' | 'customer';
type VehicleCategory = 'imported' | 'trade_in' | 'local';
type ImportStage = 'sourced' | 'purchased' | 'shipping' | 'customs' | 'tax_payment' | 'registration' | 'inspection' | 'delivered';
type LeadStatus = 'new' | 'contacted' | 'qualified' | 'negotiation' | 'won' | 'lost';
type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'overdue';
type Page = 'dashboard' | 'vehicles' | 'imports' | 'leads' | 'customers' | 'vendors' | 'tasks' | 'settings' | 'wishlist';
type ObjectType = 'vehicle' | 'lead' | 'customer' | 'vendor' | 'task';

// ★ Custom Fields system
interface CustomFieldDef {
  id: string;
  objectType: ObjectType;
  label: string;
  fieldKey: string;
  fieldType: 'text' | 'number' | 'select' | 'date';
  options?: string[]; // for select type
  required: boolean;
  order: number;
  visible: boolean;
}

interface User { id: string; name: string; email: string; role: UserRole; }

interface VehicleImage {
  id: string; url: string; name: string; isPrimary: boolean; uploadDate: string;
}

interface VehicleAttachment {
  id: string; name: string; fileType: string; size: string; category: 'document' | 'image' | 'invoice' | 'registration' | 'inspection' | 'insurance' | 'other';
  uploadDate: string; uploadedBy: string; notes: string;
}

interface Vehicle {
  id: string; make: string; model: string; year: number; vin: string;
  category: VehicleCategory; color: string; mileage: number;
  purchasePrice: number; sellingPrice: number; currency: string;
  status: 'available' | 'reserved' | 'sold' | 'in_transit';
  images: VehicleImage[]; specs: Record<string, string>;
  attachments: VehicleAttachment[];
  importProcessId?: string; customerId?: string;
  vinDecoded?: boolean;
  customData?: Record<string, any>;
}

interface ImportProcess { id: string; vehicleId: string; stage: ImportStage; originCountry: string; estimatedArrival: string; totalCost: number; taxAmount: number; shippingCost: number; milestones: { stage: ImportStage; date: string; completed: boolean; notes: string }[]; documents: { name: string; type: string; uploadDate: string }[]; }
interface Lead { id: string; name: string; email: string; phone: string; status: LeadStatus; source: string; interestedIn: string; budget: number; notes: string; createdAt: string; lastContact: string; customData?: Record<string, any>; }
interface Customer { id: string; name: string; email: string; phone: string; vehicleIds: string[]; totalSpent: number; joinDate: string; communications: { id: string; date: string; type: 'WhatsApp' | 'Email' | 'SMS' | 'Call' | 'Meeting'; channel: 'outbound' | 'inbound'; summary: string; status: 'sent' | 'delivered' | 'read' | 'logged'; automated?: boolean }[]; customData?: Record<string, any>; }

interface Notification { id: string; type: 'import_update' | 'whatsapp' | 'email' | 'sms' | 'system'; title: string; message: string; recipientId?: string; vehicleId?: string; time: string; read: boolean; channel?: string; }
interface Vendor { id: string; name: string; service: string; country: string; contactName: string; email: string; phone: string; rating: number; notes: string; vehicleIds: string[]; customData?: Record<string, any>; }
interface Task { id: string; title: string; description: string; assignedTo: string; priority: TaskPriority; status: TaskStatus; dueDate: string; relatedTo: string; category: string; customData?: Record<string, any>; }

interface WishlistItem {
  id: string; clientName: string; clientEmail: string; clientPhone: string;
  makes: string[]; bodyType: string; yearMin: number; yearMax: number;
  budgetMin: number; budgetMax: number; colorPrefs: string;
  features: string; notes: string; priority: 'low' | 'medium' | 'high';
  status: 'active' | 'matched' | 'fulfilled' | 'cancelled';
  matchedVehicleIds: string[]; createdAt: string;
}

// ═══════════════════════════════════════════════════
// CONTEXT
// ═══════════════════════════════════════════════════
interface AppCtx {
  user: User | null; setUser: (u: User | null) => void;
  page: Page; setPage: (p: Page) => void;
  vehicles: Vehicle[]; setVehicles: React.Dispatch<React.SetStateAction<Vehicle[]>>;
  imports: ImportProcess[]; setImports: React.Dispatch<React.SetStateAction<ImportProcess[]>>;
  leads: Lead[]; setLeads: React.Dispatch<React.SetStateAction<Lead[]>>;
  customers: Customer[]; setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  vendors: Vendor[];
  tasks: Task[]; setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  wishlist: WishlistItem[]; setWishlist: React.Dispatch<React.SetStateAction<WishlistItem[]>>;
  compareIds: string[]; setCompareIds: React.Dispatch<React.SetStateAction<string[]>>;
  customFields: CustomFieldDef[]; setCustomFields: React.Dispatch<React.SetStateAction<CustomFieldDef[]>>;
  notifications: Notification[]; setNotifications: React.Dispatch<React.SetStateAction<Notification[]>>;
}
const Ctx = createContext<AppCtx>({} as AppCtx);
const useApp = () => useContext(Ctx);

// ═══════════════════════════════════════════════════
// SEED DATA
// ═══════════════════════════════════════════════════
const STAGES: { key: ImportStage; label: string; icon: string }[] = [
  { key: 'sourced', label: 'Sourced', icon: '🔍' }, { key: 'purchased', label: 'Purchased', icon: '💰' },
  { key: 'shipping', label: 'Shipping', icon: '🚢' }, { key: 'customs', label: 'Customs', icon: '📋' },
  { key: 'tax_payment', label: 'Tax & Fees', icon: '🏦' }, { key: 'registration', label: 'Registration', icon: '📄' },
  { key: 'inspection', label: 'Inspection', icon: '🔧' }, { key: 'delivered', label: 'Delivered', icon: '🎉' },
];

// Placeholder car images using gradients
const carColors: Record<string,string> = {
  'Obsidian Black':'from-zinc-900 to-zinc-800', 'Tanzanite Blue':'from-blue-900 to-indigo-800',
  'Arctic Grey':'from-slate-400 to-slate-300', 'Daytona Grey':'from-gray-600 to-gray-500',
  'Santorini Black':'from-stone-900 to-stone-800', 'Verde Mantis':'from-green-600 to-emerald-500',
  'Ultra White':'from-gray-100 to-white',
};

const makeImage = (_color: string, id: string, n: number): VehicleImage[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `${id}-img-${i}`, url: '', name: i === 0 ? 'Front 3/4' : i === 1 ? 'Rear 3/4' : i === 2 ? 'Interior' : `Angle ${i + 1}`,
    isPrimary: i === 0, uploadDate: '2026-02-15'
  }));

const seedAttachments: Record<string, VehicleAttachment[]> = {
  v1: [
    { id:'a1', name:'Purchase Invoice - Mercedes AMG GT.pdf', fileType:'PDF', size:'2.4 MB', category:'invoice', uploadDate:'2026-01-20', uploadedBy:'Admin', notes:'Original dealer invoice from Germany' },
    { id:'a2', name:'Vehicle Inspection Report.pdf', fileType:'PDF', size:'1.1 MB', category:'inspection', uploadDate:'2026-02-10', uploadedBy:'Admin', notes:'Pre-purchase inspection by TÜV' },
    { id:'a3', name:'Insurance Certificate.pdf', fileType:'PDF', size:'540 KB', category:'insurance', uploadDate:'2026-02-15', uploadedBy:'Admin', notes:'Transit insurance coverage' },
  ],
  v2: [
    { id:'a4', name:'BMW M5 Bill of Sale.pdf', fileType:'PDF', size:'1.8 MB', category:'invoice', uploadDate:'2026-01-18', uploadedBy:'Admin', notes:'' },
    { id:'a5', name:'Shipping Manifest.pdf', fileType:'PDF', size:'890 KB', category:'document', uploadDate:'2026-02-25', uploadedBy:'Dana', notes:'MV Atlantic Star vessel docs' },
  ],
  v3: [
    { id:'a6', name:'Porsche Certificate of Origin.pdf', fileType:'PDF', size:'3.2 MB', category:'registration', uploadDate:'2025-11-15', uploadedBy:'Admin', notes:'Factory CoO from Stuttgart' },
    { id:'a7', name:'Israeli Customs Declaration.pdf', fileType:'PDF', size:'1.5 MB', category:'document', uploadDate:'2026-01-08', uploadedBy:'Dana', notes:'Customs Form 42' },
    { id:'a8', name:'Tax Assessment Notice.pdf', fileType:'PDF', size:'720 KB', category:'document', uploadDate:'2026-02-20', uploadedBy:'Yossi', notes:'Awaiting payment' },
    { id:'a9', name:'Interior Photos.zip', fileType:'ZIP', size:'15.4 MB', category:'image', uploadDate:'2025-11-20', uploadedBy:'Admin', notes:'High-res interior photos' },
  ],
  v5: [
    { id:'a10', name:'Trade-In Evaluation Report.docx', fileType:'DOCX', size:'890 KB', category:'document', uploadDate:'2026-01-05', uploadedBy:'Yossi', notes:'Condition assessment' },
  ],
  v6: [
    { id:'a11', name:'Lamborghini Purchase Agreement.pdf', fileType:'PDF', size:'4.1 MB', category:'invoice', uploadDate:'2026-02-28', uploadedBy:'Admin', notes:"Direct from Sant'Agata factory" },
  ],
};

const seedVehicles: Vehicle[] = [
  { id:'v1', make:'Mercedes-Benz', model:'AMG GT 63', year:2024, vin:'WDD2906121A123456', category:'imported', color:'Obsidian Black', mileage:1200, purchasePrice:142000, sellingPrice:198000, currency:'USD', status:'available', images:makeImage('Obsidian Black','v1',4), specs:{ engine:'4.0L V8 Biturbo', horsepower:'630 hp', torque:'664 lb-ft', transmission:'9-Speed AMG SPEEDSHIFT', drivetrain:'AWD', acceleration:'0-100 km/h: 3.2s', topSpeed:'315 km/h', fuelType:'Gasoline', bodyType:'Sedan' }, attachments: seedAttachments.v1 || [], vinDecoded:true },
  { id:'v2', make:'BMW', model:'M5 Competition', year:2024, vin:'WBSJF0C55NCB12345', category:'imported', color:'Tanzanite Blue', mileage:850, purchasePrice:118000, sellingPrice:165000, currency:'USD', status:'in_transit', images:makeImage('Tanzanite Blue','v2',3), specs:{ engine:'4.4L V8 Twin-Turbo', horsepower:'617 hp', torque:'553 lb-ft', transmission:'8-Speed M Steptronic', drivetrain:'M xDrive', acceleration:'0-100 km/h: 3.3s', topSpeed:'305 km/h', fuelType:'Gasoline', bodyType:'Sedan' }, attachments: seedAttachments.v2 || [], importProcessId:'imp1', vinDecoded:true },
  { id:'v3', make:'Porsche', model:'911 Turbo S', year:2025, vin:'WP0AD2A99RS234567', category:'imported', color:'Arctic Grey', mileage:320, purchasePrice:235000, sellingPrice:320000, currency:'USD', status:'reserved', images:makeImage('Arctic Grey','v3',5), specs:{ engine:'3.7L Flat-6 Twin-Turbo', horsepower:'640 hp', torque:'590 lb-ft', transmission:'8-Speed PDK', drivetrain:'AWD', acceleration:'0-100 km/h: 2.7s', topSpeed:'330 km/h', fuelType:'Gasoline', bodyType:'Coupe' }, attachments: seedAttachments.v3 || [], importProcessId:'imp2', customerId:'c1', vinDecoded:true },
  { id:'v4', make:'Audi', model:'RS e-tron GT', year:2024, vin:'WAUEAAGF5MN012345', category:'imported', color:'Daytona Grey', mileage:2100, purchasePrice:145000, sellingPrice:195000, currency:'USD', status:'available', images:makeImage('Daytona Grey','v4',3), specs:{ engine:'Dual Electric Motors', horsepower:'637 hp', torque:'612 lb-ft', transmission:'2-Speed Automatic', drivetrain:'quattro AWD', acceleration:'0-100 km/h: 3.3s', topSpeed:'250 km/h', fuelType:'Electric', bodyType:'Sedan' }, attachments:[], vinDecoded:true },
  { id:'v5', make:'Range Rover', model:'Sport SVR', year:2023, vin:'SALWA2EK3NA456789', category:'trade_in', color:'Santorini Black', mileage:18000, purchasePrice:85000, sellingPrice:115000, currency:'USD', status:'available', images:makeImage('Santorini Black','v5',2), specs:{ engine:'5.0L Supercharged V8', horsepower:'575 hp', torque:'516 lb-ft', transmission:'8-Speed Automatic', drivetrain:'AWD', acceleration:'0-100 km/h: 4.3s', topSpeed:'283 km/h', fuelType:'Gasoline', bodyType:'SUV' }, attachments: seedAttachments.v5 || [], vinDecoded:true },
  { id:'v6', make:'Lamborghini', model:'Huracán Tecnica', year:2024, vin:'ZHWUF5ZF8PLA12345', category:'imported', color:'Verde Mantis', mileage:500, purchasePrice:280000, sellingPrice:385000, currency:'USD', status:'in_transit', images:makeImage('Verde Mantis','v6',4), specs:{ engine:'5.2L V10', horsepower:'631 hp', torque:'417 lb-ft', transmission:'7-Speed LDF', drivetrain:'RWD', acceleration:'0-100 km/h: 3.2s', topSpeed:'325 km/h', fuelType:'Gasoline', bodyType:'Coupe' }, attachments: seedAttachments.v6 || [], importProcessId:'imp3', vinDecoded:true },
  { id:'v7', make:'Tesla', model:'Model S Plaid', year:2024, vin:'5YJSA1E25PF123456', category:'local', color:'Ultra White', mileage:5200, purchasePrice:92000, sellingPrice:108000, currency:'USD', status:'sold', images:makeImage('Ultra White','v7',3), specs:{ engine:'Tri-Motor Electric', horsepower:'1020 hp', torque:'1050 lb-ft', transmission:'1-Speed Automatic', drivetrain:'AWD', acceleration:'0-100 km/h: 2.1s', topSpeed:'322 km/h', fuelType:'Electric', bodyType:'Sedan' }, attachments:[], customerId:'c2', vinDecoded:true },
];

const seedImports: ImportProcess[] = [
  { id:'imp1', vehicleId:'v2', stage:'shipping', originCountry:'Germany', estimatedArrival:'2026-04-15', totalCost:28500, taxAmount:18200, shippingCost:4800, milestones:[
    { stage:'sourced', date:'2026-01-10', completed:true, notes:'BMW Welt Munich' },{ stage:'purchased', date:'2026-01-18', completed:true, notes:'Bank transfer' },
    { stage:'shipping', date:'2026-02-25', completed:false, notes:'MV Atlantic Star' },
    { stage:'customs', date:'', completed:false, notes:'' },{ stage:'tax_payment', date:'', completed:false, notes:'' },
    { stage:'registration', date:'', completed:false, notes:'' },{ stage:'inspection', date:'', completed:false, notes:'' },{ stage:'delivered', date:'', completed:false, notes:'' },
  ], documents:[{ name:'Purchase Invoice', type:'PDF', uploadDate:'2026-01-18' },{ name:'Bill of Lading', type:'PDF', uploadDate:'2026-02-25' }] },
  { id:'imp2', vehicleId:'v3', stage:'tax_payment', originCountry:'Germany', estimatedArrival:'2026-03-20', totalCost:42000, taxAmount:31500, shippingCost:5200, milestones:[
    { stage:'sourced', date:'2025-11-05', completed:true, notes:'Porsche Stuttgart' },{ stage:'purchased', date:'2025-11-15', completed:true, notes:'Direct from Porsche' },
    { stage:'shipping', date:'2025-12-10', completed:true, notes:'Arrived Ashdod Port' },{ stage:'customs', date:'2026-01-08', completed:true, notes:'Clearance complete' },
    { stage:'tax_payment', date:'2026-02-20', completed:false, notes:'Awaiting assessment' },
    { stage:'registration', date:'', completed:false, notes:'' },{ stage:'inspection', date:'', completed:false, notes:'' },{ stage:'delivered', date:'', completed:false, notes:'' },
  ], documents:[{ name:'Purchase Invoice', type:'PDF', uploadDate:'2025-11-15' },{ name:'Shipping Manifest', type:'PDF', uploadDate:'2025-12-10' },{ name:'Customs Form', type:'PDF', uploadDate:'2026-01-08' }] },
  { id:'imp3', vehicleId:'v6', stage:'purchased', originCountry:'Italy', estimatedArrival:'2026-05-30', totalCost:52000, taxAmount:38000, shippingCost:6500, milestones:[
    { stage:'sourced', date:'2026-02-01', completed:true, notes:"Lamborghini Sant'Agata" },{ stage:'purchased', date:'2026-02-28', completed:true, notes:'Factory direct' },
    { stage:'shipping', date:'', completed:false, notes:'' },{ stage:'customs', date:'', completed:false, notes:'' },
    { stage:'tax_payment', date:'', completed:false, notes:'' },{ stage:'registration', date:'', completed:false, notes:'' },
    { stage:'inspection', date:'', completed:false, notes:'' },{ stage:'delivered', date:'', completed:false, notes:'' },
  ], documents:[{ name:'Purchase Agreement', type:'PDF', uploadDate:'2026-02-28' }] },
];

const seedLeads: Lead[] = [
  { id:'l1', name:'Avi Goldstein', email:'avi@techcorp.il', phone:'+972-50-123-4567', status:'qualified', source:'Website', interestedIn:'Mercedes AMG GT', budget:200000, notes:'Tech CEO, wants sporty', createdAt:'2026-02-01', lastContact:'2026-03-01' },
  { id:'l2', name:'Sarah Cohen', email:'sarah.c@startup.io', phone:'+972-52-234-5678', status:'negotiation', source:'Referral', interestedIn:'Porsche 911', budget:350000, notes:'Referred by customer', createdAt:'2026-01-15', lastContact:'2026-03-03' },
  { id:'l3', name:'David Levy', email:'david@invest.co.il', phone:'+972-54-345-6789', status:'new', source:'Instagram', interestedIn:'Lamborghini', budget:400000, notes:'Via DM', createdAt:'2026-03-02', lastContact:'2026-03-02' },
  { id:'l4', name:'Yael Mizrachi', email:'yael@law.co.il', phone:'+972-53-456-7890', status:'contacted', source:'Website', interestedIn:'BMW M5', budget:180000, notes:'Attorney', createdAt:'2026-02-20', lastContact:'2026-02-28' },
  { id:'l5', name:'Michael Ben-Ari', email:'michael@fund.il', phone:'+972-58-567-8901', status:'won', source:'Event', interestedIn:'Tesla Model S Plaid', budget:120000, notes:'Converted', createdAt:'2025-12-10', lastContact:'2026-01-20' },
];

const seedCustomers: Customer[] = [
  { id:'c1', name:'Noam Shapiro', email:'noam@enterprise.il', phone:'+972-50-987-6543', vehicleIds:['v3'], totalSpent:320000, joinDate:'2025-08-15', communications:[
    { id:'cm1', date:'2025-08-15', type:'Meeting', channel:'inbound', summary:'Initial consultation - Porsche 911 Turbo S', status:'logged' },
    { id:'cm2', date:'2025-11-10', type:'Email', channel:'outbound', summary:'Vehicle sourced, sent specs and pricing', status:'delivered' },
    { id:'cm3', date:'2026-02-01', type:'WhatsApp', channel:'outbound', summary:'Import update: Your Porsche has cleared customs!', status:'read', automated:true },
    { id:'cm4', date:'2026-02-20', type:'Call', channel:'outbound', summary:'Tax payment update, estimated delivery March', status:'logged' },
    { id:'cm5', date:'2026-03-01', type:'WhatsApp', channel:'outbound', summary:'Tax assessment scheduled for next week', status:'delivered', automated:true },
  ]},
  { id:'c2', name:'Michael Ben-Ari', email:'michael@fund.il', phone:'+972-58-567-8901', vehicleIds:['v7'], totalSpent:108000, joinDate:'2026-01-20', communications:[
    { id:'cm6', date:'2026-01-20', type:'Meeting', channel:'inbound', summary:'Purchased Tesla Model S Plaid from local stock', status:'logged' },
    { id:'cm7', date:'2026-01-25', type:'Email', channel:'outbound', summary:'Delivery confirmation and documentation', status:'read' },
    { id:'cm8', date:'2026-01-26', type:'WhatsApp', channel:'outbound', summary:'Welcome to Googl-Cars! Your Tesla is ready for pickup 🚗', status:'read' },
  ]},
];

const seedVendors: Vendor[] = [
  { id:'vn1', name:'AutoTrans Europe GmbH', service:'Vehicle Shipping', country:'Germany', contactName:'Hans Mueller', email:'hans@autotrans.de', phone:'+49-30-1234567', rating:5, notes:'Premium RoRo and container', vehicleIds:['v2','v3','v6'] },
  { id:'vn2', name:'MedSea Logistics', service:'Customs Brokerage', country:'Israel', contactName:'Roni Katz', email:'roni@medsea.co.il', phone:'+972-3-765-4321', rating:4, notes:'Luxury vehicle customs', vehicleIds:['v2','v3'] },
  { id:'vn3', name:'Italia Motors SRL', service:'Vehicle Sourcing', country:'Italy', contactName:'Marco Rossi', email:'marco@italiamotors.it', phone:'+39-02-9876543', rating:5, notes:'Lamborghini and Ferrari', vehicleIds:['v6'] },
  { id:'vn4', name:'RegPro Israel', service:'Registration', country:'Israel', contactName:'Tal Avraham', email:'tal@regpro.co.il', phone:'+972-4-321-0987', rating:4, notes:'Fast-track registration', vehicleIds:['v1','v7'] },
];

const seedTasks: Task[] = [
  { id:'t1', title:'Complete customs for BMW M5', description:'Submit docs for customs release', assignedTo:'Yossi', priority:'high', status:'in_progress', dueDate:'2026-03-10', relatedTo:'imp1', category:'Import' },
  { id:'t2', title:'Schedule Porsche tax assessment', description:'Book tax authority appointment', assignedTo:'Dana', priority:'urgent', status:'pending', dueDate:'2026-03-07', relatedTo:'imp2', category:'Tax' },
  { id:'t3', title:'Follow up Avi Goldstein', description:'Send Mercedes specs and pricing', assignedTo:'Yossi', priority:'medium', status:'pending', dueDate:'2026-03-08', relatedTo:'l1', category:'Sales' },
  { id:'t4', title:'Arrange Lamborghini shipping', description:'Coordinate with AutoTrans', assignedTo:'Dana', priority:'high', status:'pending', dueDate:'2026-03-15', relatedTo:'imp3', category:'Logistics' },
  { id:'t5', title:'Update website photos', description:'Professional photos for inventory', assignedTo:'Maya', priority:'low', status:'completed', dueDate:'2026-03-01', relatedTo:'', category:'Marketing' },
];

const seedWishlist: WishlistItem[] = [
  { id:'w1', clientName:'Avi Goldstein', clientEmail:'avi@techcorp.il', clientPhone:'+972-50-123-4567', makes:['Mercedes-Benz','BMW','Audi'], bodyType:'Sedan', yearMin:2023, yearMax:2025, budgetMin:150000, budgetMax:220000, colorPrefs:'Black, Dark Blue, Grey', features:'V8 or higher, sport seats, premium sound', notes:'Prefers German brands, wants high performance daily driver', priority:'high', status:'active', matchedVehicleIds:['v1','v2'], createdAt:'2026-02-05' },
  { id:'w2', clientName:'Yael Mizrachi', clientEmail:'yael@law.co.il', clientPhone:'+972-53-456-7890', makes:['BMW','Porsche'], bodyType:'Sedan', yearMin:2023, yearMax:2025, budgetMin:150000, budgetMax:200000, colorPrefs:'Any dark color', features:'Comfortable ride, executive look', notes:'Wants luxury feel with sporty capability', priority:'medium', status:'active', matchedVehicleIds:['v2'], createdAt:'2026-02-22' },
  { id:'w3', clientName:'Daniel Ashkenazi', clientEmail:'daniel@vc.co.il', clientPhone:'+972-52-999-8888', makes:['Lamborghini','Ferrari','McLaren'], bodyType:'Coupe', yearMin:2023, yearMax:2026, budgetMin:300000, budgetMax:500000, colorPrefs:'Bright colors - green, yellow, orange', features:'Naturally aspirated preferred, manual or DCT', notes:'Collector, wants something for weekends', priority:'low', status:'active', matchedVehicleIds:['v6'], createdAt:'2026-01-30' },
];

// ═══════════════════════════════════════════════════
// VIN DECODER (simulated)
// ═══════════════════════════════════════════════════
const VIN_DATABASE: Record<string, { make:string; model:string; year:number; engine:string; horsepower:string; torque:string; transmission:string; drivetrain:string; bodyType:string; fuelType:string; manufacturingPlant:string; country:string }> = {
  'WDD': { make:'Mercedes-Benz', model:'AMG GT', year:2024, engine:'4.0L V8 Biturbo', horsepower:'630 hp', torque:'664 lb-ft', transmission:'9-Speed AMG SPEEDSHIFT', drivetrain:'AWD', bodyType:'Sedan', fuelType:'Gasoline', manufacturingPlant:'Sindelfingen', country:'Germany' },
  'WBS': { make:'BMW', model:'M5', year:2024, engine:'4.4L V8 Twin-Turbo', horsepower:'617 hp', torque:'553 lb-ft', transmission:'8-Speed M Steptronic', drivetrain:'M xDrive', bodyType:'Sedan', fuelType:'Gasoline', manufacturingPlant:'Dingolfing', country:'Germany' },
  'WP0': { make:'Porsche', model:'911', year:2025, engine:'3.7L Flat-6 Twin-Turbo', horsepower:'640 hp', torque:'590 lb-ft', transmission:'8-Speed PDK', drivetrain:'AWD', bodyType:'Coupe', fuelType:'Gasoline', manufacturingPlant:'Stuttgart-Zuffenhausen', country:'Germany' },
  'WAU': { make:'Audi', model:'RS e-tron GT', year:2024, engine:'Dual Electric Motors', horsepower:'637 hp', torque:'612 lb-ft', transmission:'2-Speed Automatic', drivetrain:'quattro AWD', bodyType:'Sedan', fuelType:'Electric', manufacturingPlant:'Neckarsulm', country:'Germany' },
  'SAL': { make:'Range Rover', model:'Sport SVR', year:2023, engine:'5.0L Supercharged V8', horsepower:'575 hp', torque:'516 lb-ft', transmission:'8-Speed Automatic', drivetrain:'AWD', bodyType:'SUV', fuelType:'Gasoline', manufacturingPlant:'Solihull', country:'United Kingdom' },
  'ZHW': { make:'Lamborghini', model:'Huracán', year:2024, engine:'5.2L V10', horsepower:'631 hp', torque:'417 lb-ft', transmission:'7-Speed LDF', drivetrain:'RWD', bodyType:'Coupe', fuelType:'Gasoline', manufacturingPlant:"Sant'Agata Bolognese", country:'Italy' },
  '5YJ': { make:'Tesla', model:'Model S', year:2024, engine:'Tri-Motor Electric', horsepower:'1020 hp', torque:'1050 lb-ft', transmission:'1-Speed Automatic', drivetrain:'AWD', bodyType:'Sedan', fuelType:'Electric', manufacturingPlant:'Fremont', country:'United States' },
};

function decodeVin(vin: string): { success:boolean; data?: typeof VIN_DATABASE[string]; error?: string } {
  if (vin.length < 3) return { success: false, error: 'VIN must be at least 17 characters' };
  const prefix = vin.substring(0, 3);
  const match = VIN_DATABASE[prefix];
  if (match) return { success: true, data: match };
  return { success: false, error: 'VIN not recognized. Enter specs manually.' };
}

// ═══════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════
const fmt = (n: number) => new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:0 }).format(n);
const stageIdx = (s: ImportStage) => STAGES.findIndex(st => st.key === s);
const stageProgress = (s: ImportStage) => ((stageIdx(s) + 1) / STAGES.length) * 100;

const sc: Record<string, string> = {
  available:'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', reserved:'bg-amber-500/15 text-amber-400 border-amber-500/30',
  sold:'bg-sky-500/15 text-sky-400 border-sky-500/30', in_transit:'bg-violet-500/15 text-violet-400 border-violet-500/30',
  new:'bg-sky-500/15 text-sky-400 border-sky-500/30', contacted:'bg-amber-500/15 text-amber-400 border-amber-500/30',
  qualified:'bg-violet-500/15 text-violet-400 border-violet-500/30', negotiation:'bg-orange-500/15 text-orange-400 border-orange-500/30',
  won:'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', lost:'bg-red-500/15 text-red-400 border-red-500/30',
  pending:'bg-slate-500/15 text-slate-400 border-slate-500/30', in_progress:'bg-sky-500/15 text-sky-400 border-sky-500/30',
  completed:'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', overdue:'bg-red-500/15 text-red-400 border-red-500/30',
  low:'bg-slate-500/15 text-slate-300', medium:'bg-sky-500/15 text-sky-300',
  high:'bg-orange-500/15 text-orange-300', urgent:'bg-red-500/15 text-red-300',
  active:'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', matched:'bg-sky-500/15 text-sky-400 border-sky-500/30',
  fulfilled:'bg-violet-500/15 text-violet-400 border-violet-500/30', cancelled:'bg-red-500/15 text-red-400 border-red-500/30',
};

// ═══════════════════════════════════════════════════
// SVG ICONS
// ═══════════════════════════════════════════════════
const I = ({ d, size=20, className='' }: { d:string; size?:number; className?:string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}><path d={d}/></svg>
);
const Ic = {
  home: (p:any) => <I {...p} d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10"/>,
  car: (p:any) => <I {...p} d="M5 17h14M5 17a2 2 0 01-2-2V9a2 2 0 012-2h1l2-3h8l2 3h1a2 2 0 012 2v6a2 2 0 01-2 2M7 17v2m10-2v2"/>,
  ship: (p:any) => <I {...p} d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2c1.3 0 1.9.5 2.5 1M19.38 20A11.6 11.6 0 0021 14l-9-4-9 4c0 2.2.5 4.3 1.38 6M12 10V4l4 2"/>,
  users: (p:any) => <I {...p} d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M23 21v-2a4 4 0 00-3-3.87M9 7a4 4 0 100-8 4 4 0 000 8M16 3.13a4 4 0 010 7.75"/>,
  user: (p:any) => <I {...p} d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 3a4 4 0 100 8 4 4 0 000-8"/>,
  box: (p:any) => <I {...p} d="M2 7l10-5 10 5M2 7l10 5M2 7v10l10 5M12 12l10-5M12 12v10M22 7v10l-10 5"/>,
  check: (p:any) => <I {...p} d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>,
  gear: (p:any) => <I {...p} d="M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>,
  bell: (p:any) => <I {...p} d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/>,
  search: (p:any) => <I {...p} d="M11 17.25a6.25 6.25 0 110-12.5 6.25 6.25 0 010 12.5zM16 16l4.5 4.5"/>,
  plus: (p:any) => <I {...p} d="M12 5v14M5 12h14"/>,
  trash: (p:any) => <I {...p} d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>,
  dl: (p:any) => <I {...p} d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>,
  phone: (p:any) => <I {...p} d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.11 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>,
  mail: (p:any) => <I {...p} d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L2 6"/>,
  globe: (p:any) => <I {...p} d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM2 12h20"/>,
  menu: (p:any) => <I {...p} d="M3 12h18M3 6h18M3 18h18"/>,
  x: (p:any) => <I {...p} d="M18 6L6 18M6 6l12 12"/>,
  dollar: (p:any) => <I {...p} d="M12 1v22M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 010 7H6"/>,
  trend: (p:any) => <I {...p} d="M23 6l-9.5 9.5-5-5L1 18"/>,
  file: (p:any) => <I {...p} d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6"/>,
  out: (p:any) => <I {...p} d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>,
  image: (p:any) => <I {...p} d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zM8.5 10a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM21 15l-5-5L5 21"/>,
  upload: (p:any) => <I {...p} d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>,
  scan: (p:any) => <I {...p} d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2M7 12h10"/>,
  compare: (p:any) => <I {...p} d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>,
  heart: (p:any) => <I {...p} d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>,
  star: (p:any) => <I {...p} d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>,
  grid: (p:any) => <I {...p} d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/>,
  layers: (p:any) => <I {...p} d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>,
  zap: (p:any) => <I {...p} d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>,
  chevL: (p:any) => <I {...p} d="M15 18l-6-6 6-6"/>,
  chevR: (p:any) => <I {...p} d="M9 18l6-6-6-6"/>,
  edit: (p:any) => <I {...p} d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>,
  save: (p:any) => <I {...p} d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2zM17 21v-8H7v8M7 3v5h8"/>,
  undo: (p:any) => <I {...p} d="M3 7v6h6M3 13C5.5 8.5 10 6 15 8c3 1.2 5 4 5.5 7"/>,
  specPlus: (p:any) => <I {...p} d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M12 18v-6M9 15h6"/>,
  clip: (p:any) => <I {...p} d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>,
  link: (p:any) => <I {...p} d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>,
  fileText: (p:any) => <I {...p} d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8"/>,
  alarm: (p:any) => <I {...p} d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 6v6l4 2"/>,
  barChart: (p:any) => <I {...p} d="M12 20V10M18 20V4M6 20v-4"/>,
  arrowRight: (p:any) => <I {...p} d="M5 12h14M12 5l7 7-7 7"/>,
  alertTri: (p:any) => <I {...p} d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01"/>,
  whatsapp: (p:any) => <I {...p} d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/>,
  send: (p:any) => <I {...p} d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>,
  msgSquare: (p:any) => <I {...p} d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>,
  inbox: (p:any) => <I {...p} d="M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/>,
  uploadCloud: (p:any) => <I {...p} d="M16 16l-4-4-4 4M12 12v9M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/>,
};

const FontsLink = () => <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=Playfair+Display:wght@400;500;600;700&display=swap" rel="stylesheet"/>;
const pf = "'Playfair Display', serif";
const sf = "'DM Sans', sans-serif";

// ═══════════════════════════════════════════════════
// REUSABLE COMPONENTS
// ═══════════════════════════════════════════════════
function IB({ label, value, highlight }: { label:string; value:string; highlight?:boolean }) {
  return <div className="p-3 rounded-lg bg-[#080b12] border border-[#1a2030]"><p className="text-[10px] text-[#5a6577] uppercase">{label}</p><p className={`text-sm ${highlight?'font-semibold text-[#c9a962]':'text-[#e0dbd0]'} mt-0.5`}>{value}</p></div>;
}

function Stat({ title, value, sub, icon:Ico, trend, color='#c9a962' }: { title:string; value:string|number; sub?:string; icon:any; trend?:string; color?:string }) {
  return <Card className="bg-[#0d1117] border-[#1a2030] hover:border-[#2a3544] transition-all"><CardContent className="p-5"><div className="flex items-start justify-between"><div className="space-y-1.5"><p className="text-xs font-medium text-[#5a6577] uppercase tracking-wider">{title}</p><p className="text-2xl font-bold text-[#f0ece2]" style={{fontFamily:pf}}>{value}</p>{sub&&<p className="text-xs text-[#6a7589]">{sub}</p>}{trend&&<p className="text-xs text-emerald-400 flex items-center gap-1"><Ic.trend size={12}/>{trend}</p>}</div><div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{background:`${color}12`}}><Ico size={20} style={{color}}/></div></div></CardContent></Card>;
}

function ImportTimeline({ imp }: { imp:ImportProcess }) {
  const ci = stageIdx(imp.stage);
  return <div className="relative"><div className="flex items-center justify-between relative">
    <div className="absolute top-4 left-4 right-4 h-0.5 bg-[#1a2030]"/>
    <div className="absolute top-4 left-4 h-0.5 bg-gradient-to-r from-[#c9a962] to-[#c9a962]/50" style={{width:`${(ci/(STAGES.length-1))*100}%`}}/>
    {STAGES.map((s,i) => <div key={s.key} className="relative z-10 flex flex-col items-center" style={{width:`${100/STAGES.length}%`}}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${i===ci?'bg-[#c9a962] text-[#0d1117] shadow-lg shadow-[#c9a962]/30 scale-110':i<=ci?'bg-[#c9a962]/20 text-[#c9a962]':'bg-[#121824] text-[#3a4556] border border-[#1a2030]'}`}>{s.icon}</div>
      <p className={`text-[9px] mt-1.5 text-center ${i===ci?'text-[#c9a962] font-medium':i<=ci?'text-[#6a7589]':'text-[#3a4556]'}`}>{s.label}</p>
    </div>)}
  </div></div>;
}

// ═══════════════════════════════════════════════════
// ★ NEW: IMAGE GALLERY COMPONENT
// ═══════════════════════════════════════════════════
function ImageGallery({ vehicle, onUpdate, editable=false }: { vehicle:Vehicle; onUpdate?:(imgs:VehicleImage[])=>void; editable?:boolean }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imgs, setImgs] = useState<VehicleImage[]>(vehicle.images);
  const [syncing, setSyncing] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const grad = carColors[vehicle.color] || 'from-zinc-700 to-zinc-600';

  // Load images from vehicle_media on mount
  useEffect(() => {
    let cancelled = false;
    vmFetch(vehicle.id).then(rows => {
      if (cancelled) return;
      if (rows.length > 0) {
        setImgs(rows);
        onUpdate?.(rows);
      } else {
        setImgs(vehicle.images);
      }
      setSyncing(false);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicle.id]);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || !onUpdate) return;
    setUploading(true);
    const newImgs: VehicleImage[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const isPrimary = imgs.length === 0 && i === 0;
      const stored = await storageUpload(f, `vehicle_image/${vehicle.id}`);
      if (stored) {
        const insertedId = await vmInsert(
          vehicle.id, stored.url, stored.path,
          f.name.replace(/\.[^.]+$/, ''), isPrimary, imgs.length + i
        );
        newImgs.push({
          id: insertedId || `img-${Date.now()}-${i}`,
          url: stored.url,
          name: f.name.replace(/\.[^.]+$/, ''),
          isPrimary,
          uploadDate: new Date().toISOString().split('T')[0],
        });
      } else {
        // Fallback: local blob
        newImgs.push({
          id: `img-${Date.now()}-${i}`, url: URL.createObjectURL(f),
          name: f.name.replace(/\.[^.]+$/, ''), isPrimary,
          uploadDate: new Date().toISOString().split('T')[0],
        });
      }
    }
    const updated = [...imgs, ...newImgs];
    setImgs(updated);
    onUpdate(updated);
    setUploading(false);
  }, [imgs, onUpdate, vehicle.id]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const removeImage = async (id: string) => {
    if (!onUpdate) return;
    await vmSoftDelete(id);
    const updated = imgs.filter(i => i.id !== id);
    if (updated.length > 0 && !updated.some(i => i.isPrimary)) {
      await vmSetPrimary(vehicle.id, updated[0].id);
      updated[0] = { ...updated[0], isPrimary: true };
    }
    setImgs(updated);
    onUpdate(updated);
    if (activeIdx >= updated.length) setActiveIdx(Math.max(0, updated.length - 1));
  };

  const setPrimary = async (id: string) => {
    if (!onUpdate) return;
    await vmSetPrimary(vehicle.id, id);
    const updated = imgs.map(i => ({ ...i, isPrimary: i.id === id }));
    setImgs(updated);
    onUpdate(updated);
  };

  return (
    <div className="space-y-3">
      {/* Main display */}
      <div className={`relative h-56 rounded-xl bg-gradient-to-br ${grad} overflow-hidden flex items-center justify-center`}>
        {syncing && <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10"><div className="w-5 h-5 border-2 border-[#c9a962] border-t-transparent rounded-full animate-spin"/></div>}
        {imgs[activeIdx]?.url ? (
          <img src={imgs[activeIdx].url} alt="" className="w-full h-full object-cover"/>
        ) : (
          <div className="text-center">
            <p className="text-4xl font-bold text-white/10" style={{fontFamily:pf}}>{vehicle.make}</p>
            <p className="text-sm text-white/20 mt-1">{vehicle.model}</p>
            {imgs.length > 0 && <p className="text-xs text-white/30 mt-2">{imgs[activeIdx]?.name || 'Photo'}</p>}
          </div>
        )}
        {imgs.length > 1 && <>
          <button onClick={()=>setActiveIdx(i=>i>0?i-1:imgs.length-1)} className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white/80 hover:bg-black/60"><Ic.chevL size={16}/></button>
          <button onClick={()=>setActiveIdx(i=>i<imgs.length-1?i+1:0)} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white/80 hover:bg-black/60"><Ic.chevR size={16}/></button>
        </>}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
          {imgs.map((_, i) => <button key={i} onClick={()=>setActiveIdx(i)} className={`w-2 h-2 rounded-full transition-all ${i===activeIdx?'bg-[#c9a962] scale-125':'bg-white/30 hover:bg-white/50'}`}/>)}
        </div>
        {imgs[activeIdx]?.isPrimary && <Badge className="absolute top-3 left-3 bg-[#c9a962]/90 text-[#0d1117] text-[9px]">★ Primary</Badge>}
        <Badge className="absolute top-3 right-3 bg-black/50 text-white/80 text-[9px] backdrop-blur-sm">{imgs.length > 0 ? `${activeIdx+1}/${imgs.length}` : 'No photos'}</Badge>
      </div>

      {/* Thumbnails */}
      {imgs.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {imgs.map((img, i) => (
            <button key={img.id} onClick={()=>setActiveIdx(i)}
              className={`relative flex-shrink-0 w-16 h-12 rounded-lg overflow-hidden border-2 transition-all ${i===activeIdx?'border-[#c9a962]':'border-[#1a2030] hover:border-[#2a3544]'}`}>
              <div className={`w-full h-full bg-gradient-to-br ${grad} flex items-center justify-center`}>
                {img.url ? <img src={img.url} alt="" className="w-full h-full object-cover"/> : <span className="text-[8px] text-white/40">{img.name}</span>}
              </div>
              {img.isPrimary && <div className="absolute top-0.5 right-0.5 w-3 h-3 rounded-full bg-[#c9a962] flex items-center justify-center"><span className="text-[6px] text-[#0d1117]">★</span></div>}
            </button>
          ))}
        </div>
      )}

      {/* Editable controls */}
      {editable && (
        <div className={`border-2 border-dashed rounded-xl p-4 text-center transition-all cursor-pointer ${dragOver ? 'border-[#c9a962] bg-[#c9a962]/5' : 'border-[#1a2030] hover:border-[#2a3544]'}`}
          onDragOver={e=>{e.preventDefault();setDragOver(true)}} onDragLeave={()=>setDragOver(false)} onDrop={handleDrop}
          onClick={()=>fileRef.current?.click()}>
          <input ref={fileRef} type="file" multiple accept="image/*" className="hidden" onChange={e=>handleFiles(e.target.files)}/>
          {uploading ? <><div className="w-5 h-5 border-2 border-[#c9a962] border-t-transparent rounded-full animate-spin mx-auto mb-2"/><p className="text-xs text-[#c9a962]">Uploading to Supabase Storage...</p></> : <><Ic.upload size={20} className="mx-auto text-[#5a6577] mb-2"/>
          <p className="text-xs text-[#6a7589]">Drag & drop images or click to upload</p>
          <p className="text-[10px] text-[#3a4556] mt-1">Files stored securely in Supabase Storage</p></>}
        </div>
      )}

      {/* Image list with actions */}
      {editable && imgs.length > 0 && (
        <div className="space-y-1.5">
          {imgs.map(img => (
            <div key={img.id} className="flex items-center justify-between p-2 rounded-lg bg-[#080b12] border border-[#1a2030]">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded bg-gradient-to-br ${grad} flex-shrink-0 overflow-hidden`}>
                  {img.url && <img src={img.url} alt="" className="w-full h-full object-cover"/>}
                </div>
                <div><p className="text-xs text-[#e0dbd0]">{img.name}</p><p className="text-[9px] text-[#4a5568]">{img.uploadDate}</p></div>
              </div>
              <div className="flex items-center gap-1">
                {!img.isPrimary && <Button variant="ghost" size="sm" className="h-6 text-[9px] text-[#5a6577] hover:text-[#c9a962]" onClick={()=>setPrimary(img.id)}>Set Primary</Button>}
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-[#5a6577] hover:text-red-400" onClick={()=>removeImage(img.id)}><Ic.x size={12}/></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// ★ NEW: VIN DECODER COMPONENT
// ═══════════════════════════════════════════════════
function VinDecoderPanel({ vin, onDecode }: { vin:string; onDecode:(specs:Record<string,string>, info:{ make:string; model:string; year:number })=>void }) {
  const [result, setResult] = useState<ReturnType<typeof decodeVin> | null>(null);
  const [loading, setLoading] = useState(false);

  const handleDecode = () => {
    setLoading(true);
    setTimeout(() => {
      const res = decodeVin(vin);
      setResult(res);
      if (res.success && res.data) {
        const { make, model, year, manufacturingPlant, country, ...specs } = res.data;
        onDecode({ ...specs, manufacturingPlant, originCountry: country }, { make, model, year });
      }
      setLoading(false);
    }, 800);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button onClick={handleDecode} disabled={vin.length < 3 || loading} size="sm"
          className="bg-gradient-to-r from-[#1a3a5c] to-[#2d1b4e] text-[#e0dbd0] hover:from-[#1f4570] hover:to-[#3a2365] h-8 text-xs gap-1.5 border border-[#2a3544]">
          <Ic.scan size={13}/>
          {loading ? 'Decoding...' : 'Decode VIN'}
        </Button>
        {result?.success && <Badge className="bg-emerald-500/15 text-emerald-400 text-[9px]">✓ Decoded</Badge>}
      </div>
      {result && !result.success && (
        <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20">
          <p className="text-xs text-red-400">{result.error}</p>
        </div>
      )}
      {result?.success && result.data && (
        <div className="p-3 rounded-xl bg-[#080b12] border border-emerald-500/20 space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <Ic.zap size={14} className="text-emerald-400"/>
            <p className="text-xs font-medium text-emerald-400">VIN Decoded Successfully</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(result.data).map(([k,v]) => (
              <div key={k} className="text-xs">
                <span className="text-[#5a6577] capitalize">{k.replace(/([A-Z])/g,' $1')}: </span>
                <span className="text-[#e0dbd0]">{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// ★ NEW: VEHICLE COMPARISON COMPONENT
// ═══════════════════════════════════════════════════
function ComparePanel() {
  const { vehicles, compareIds, setCompareIds } = useApp();
  const compared = vehicles.filter(v => compareIds.includes(v.id));
  if (compared.length < 2) return null;

  const allKeys = [...new Set(compared.flatMap(v => Object.keys(v.specs)))];

  return (
    <Dialog open={compared.length >= 2} onOpenChange={()=>setCompareIds([])}>
      <DialogContent className="bg-[#0d1117] border-[#1e2733] max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#f0ece2] flex items-center gap-2" style={{fontFamily:pf}}>
            <Ic.compare size={18} className="text-[#c9a962]"/> Vehicle Comparison
          </DialogTitle>
          <DialogDescription className="text-[#5a6577]">Side-by-side comparison of {compared.length} vehicles</DialogDescription>
        </DialogHeader>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-left p-2 text-[10px] text-[#5a6577] uppercase w-32 sticky left-0 bg-[#0d1117]">Spec</th>
                {compared.map(v => (
                  <th key={v.id} className="p-2 text-center min-w-[180px]">
                    <div className={`h-24 rounded-lg bg-gradient-to-br ${carColors[v.color]||'from-zinc-700 to-zinc-600'} flex items-center justify-center mb-2`}>
                      <span className="text-lg font-bold text-white/15" style={{fontFamily:pf}}>{v.make}</span>
                    </div>
                    <p className="text-xs font-semibold text-[#f0ece2]">{v.year} {v.make}</p>
                    <p className="text-xs text-[#c9a962]">{v.model}</p>
                    <p className="text-sm font-bold text-[#c9a962] mt-1">{fmt(v.sellingPrice)}</p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { key: '_color', label: 'Color' },
                { key: '_mileage', label: 'Mileage' },
                { key: '_status', label: 'Status' },
                ...allKeys.map(k => ({ key: k, label: k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()) }))
              ].map(({ key, label }) => (
                <tr key={key} className="border-t border-[#1a2030]">
                  <td className="p-2 text-[10px] text-[#5a6577] uppercase sticky left-0 bg-[#0d1117]">{label}</td>
                  {compared.map(v => {
                    let val = '';
                    if (key === '_color') val = v.color;
                    else if (key === '_mileage') val = `${v.mileage.toLocaleString()} km`;
                    else if (key === '_status') val = v.status.replace('_',' ');
                    else val = v.specs[key] || '—';

                    // Highlight best values
                    let isBest = false;
                    if (key === 'horsepower') {
                      const nums = compared.map(c => parseInt(c.specs[key]) || 0);
                      isBest = (parseInt(v.specs[key]) || 0) === Math.max(...nums);
                    }
                    if (key === 'acceleration') {
                      const nums = compared.map(c => parseFloat(c.specs[key]?.match(/[\d.]+/)?.[0] || '99') || 99);
                      isBest = (parseFloat(v.specs[key]?.match(/[\d.]+/)?.[0] || '99') || 99) === Math.min(...nums);
                    }

                    return <td key={v.id} className={`p-2 text-xs text-center ${isBest ? 'text-[#c9a962] font-semibold' : 'text-[#a0aab8]'}`}>{val}{isBest && ' ★'}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end"><Button size="sm" onClick={()=>setCompareIds([])} className="bg-[#1a2030] text-[#a0aab8] hover:bg-[#2a3544] h-8 text-xs">Close Comparison</Button></div>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════
function LoginScreen({ onLogin }: { onLogin:(u:User)=>void }) {
  const [role, setRole] = useState<UserRole>('super_admin');
  const roles: { r:UserRole; name:string; email:string; desc:string }[] = [
    { r:'super_admin', name:'Admin User', email:'admin@googl-cars.co.il', desc:'Full access including costs & vendors' },
    { r:'standard', name:'Standard User', email:'user@googl-cars.co.il', desc:'Full interface without cost/vendor data' },
    { r:'customer', name:'Noam Shapiro', email:'noam@enterprise.il', desc:'Customer portal – vehicle status & docs' },
  ];
  return (
    <div className="min-h-screen bg-[#080b12] flex items-center justify-center p-4" style={{fontFamily:sf}}>
      <FontsLink/>
      <div className="absolute inset-0 overflow-hidden"><div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-[#1a3a5c]/20 blur-[120px]"/><div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-[#2d1b4e]/20 blur-[120px]"/></div>
      <Card className="relative w-full max-w-md bg-[#0d1117]/90 border-[#1e2733] backdrop-blur-xl shadow-2xl">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 w-16 h-16 rounded-2xl bg-gradient-to-br from-[#c9a962] to-[#8b6f3a] flex items-center justify-center shadow-lg shadow-[#c9a962]/20"><span className="text-2xl font-bold text-[#0d1117]" style={{fontFamily:pf}}>G</span></div>
          <CardTitle className="text-2xl text-[#f0ece2]" style={{fontFamily:pf}}>Googl-Cars</CardTitle>
          <CardDescription className="text-[#7a8599] text-xs tracking-[0.2em] uppercase mt-1">Luxury Vehicle Import CRM</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 px-6">
          {roles.map(r => <button key={r.r} onClick={()=>setRole(r.r)} className={`w-full p-3 rounded-lg border text-left transition-all ${role===r.r?'border-[#c9a962]/60 bg-[#c9a962]/8':'border-[#1e2733] bg-[#0d1117]/50 hover:border-[#2a3544]'}`}>
            <div className="flex items-center gap-3"><div className={`w-3 h-3 rounded-full border-2 ${role===r.r?'border-[#c9a962] bg-[#c9a962]':'border-[#3a4556]'}`}/><div><p className="text-sm font-medium text-[#e0dbd0]">{r.name}</p><p className="text-xs text-[#5a6577]">{r.desc}</p></div></div>
          </button>)}
        </CardContent>
        <CardFooter className="px-6 pb-6"><Button onClick={()=>{const r=roles.find(x=>x.r===role)!;onLogin({id:role,name:r.name,email:r.email,role});}} className="w-full bg-gradient-to-r from-[#c9a962] to-[#a8893e] text-[#0d1117] font-semibold hover:from-[#d4b46e] hover:to-[#b89548] shadow-lg shadow-[#c9a962]/15 h-11">Sign In</Button></CardFooter>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// SIDEBAR & TOPBAR
// ═══════════════════════════════════════════════════
function Sidebar({ collapsed, toggle }: { collapsed:boolean; toggle:()=>void }) {
  const { user, page, setPage } = useApp();
  if(!user||user.role==='customer') return null;
  const nav: { p:Page; label:string; icon:any; admin?:boolean }[] = [
    { p:'dashboard', label:'Dashboard', icon:Ic.home }, { p:'vehicles', label:'Vehicles', icon:Ic.car },
    { p:'imports', label:'Imports', icon:Ic.ship }, { p:'leads', label:'Leads', icon:Ic.user },
    { p:'customers', label:'Customers', icon:Ic.users }, { p:'wishlist', label:'Wish List', icon:Ic.heart },
    { p:'vendors', label:'Vendors', icon:Ic.box, admin:true }, { p:'tasks', label:'Tasks', icon:Ic.check },
    { p:'settings', label:'Settings', icon:Ic.gear },
  ];
  const items = nav.filter(n=>!n.admin||user.role==='super_admin');
  return (
    <div className={`fixed left-0 top-0 h-full bg-[#0a0e16] border-r border-[#1a2030] z-40 transition-all duration-300 flex flex-col ${collapsed?'w-[68px]':'w-[220px]'}`}>
      <div className="flex items-center gap-3 px-4 h-16 border-b border-[#1a2030]">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#c9a962] to-[#8b6f3a] flex items-center justify-center flex-shrink-0"><span className="text-sm font-bold text-[#0d1117]" style={{fontFamily:pf}}>G</span></div>
        {!collapsed&&<span className="text-[#f0ece2] font-semibold text-sm" style={{fontFamily:pf}}>Googl-Cars</span>}
      </div>
      <nav className="flex-1 py-3 px-2 space-y-0.5">
        {items.map(item=>{const Ico=item.icon;const active=page===item.p;return(
          <TooltipProvider key={item.p} delayDuration={0}><Tooltip><TooltipTrigger asChild>
            <button onClick={()=>setPage(item.p)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm ${active?'bg-[#c9a962]/10 text-[#c9a962]':'text-[#6a7589] hover:text-[#a0aab8] hover:bg-[#12182440]'}`}>
              <Ico size={18} className="flex-shrink-0"/>{!collapsed&&<span className="truncate">{item.label}</span>}
              {item.p==='wishlist'&&!collapsed&&<Badge className="ml-auto text-[8px] bg-[#c9a962]/15 text-[#c9a962] px-1.5">New</Badge>}
            </button>
          </TooltipTrigger>{collapsed&&<TooltipContent side="right" className="bg-[#1a2030] border-[#2a3544] text-[#e0dbd0]">{item.label}</TooltipContent>}</Tooltip></TooltipProvider>
        );})}
      </nav>
      <div className="p-2 border-t border-[#1a2030]"><button onClick={toggle} className="w-full flex items-center justify-center p-2 rounded-lg text-[#5a6577] hover:text-[#a0aab8] hover:bg-[#121824] transition-all"><Ic.menu size={18}/></button></div>
    </div>
  );
}

function TopBar() {
  const { user, setUser, page, notifications, setNotifications } = useApp();
  if(!user) return null;
  const titles: Record<Page,string> = { dashboard:'Dashboard', vehicles:'Vehicle Inventory', imports:'Import Management', leads:'Lead Pipeline', customers:'Customer Management', vendors:'Vendor Directory', tasks:'Task Manager', settings:'Settings', wishlist:'Vehicle Wish List' };
  const unread = notifications.filter(n => !n.read).length;
  const markAllRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })));

  const notifIcons: Record<string, any> = { whatsapp: Ic.whatsapp, email: Ic.mail, sms: Ic.phone, import_update: Ic.ship, system: Ic.bell };
  const notifColors: Record<string, string> = { whatsapp: 'text-green-400', email: 'text-sky-400', sms: 'text-violet-400', import_update: 'text-[#c9a962]', system: 'text-[#6a7589]' };

  return (
    <header className="h-16 border-b border-[#1a2030] bg-[#080b12]/80 backdrop-blur-xl flex items-center justify-between px-6">
      <div><h1 className="text-lg font-semibold text-[#f0ece2]" style={{fontFamily:pf}}>{titles[page]}</h1><p className="text-xs text-[#4a5568]">{new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</p></div>
      <div className="flex items-center gap-3">
        {/* Notification Bell Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="text-[#6a7589] hover:text-[#c9a962] hover:bg-[#c9a962]/5 relative">
              <Ic.bell size={18}/>
              {unread > 0 && <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-[10px] text-white flex items-center justify-center font-bold">{unread > 9 ? '9+' : unread}</span>}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-[#0d1117] border-[#1e2733] w-[340px] p-0">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#1a2030]">
              <p className="text-xs font-medium text-[#e0dbd0]">Notifications</p>
              {unread > 0 && <button onClick={markAllRead} className="text-[10px] text-[#c9a962] hover:text-[#d4b46e]">Mark all read</button>}
            </div>
            <ScrollArea className="max-h-[320px]">
              {notifications.length === 0 ? (
                <div className="p-6 text-center"><p className="text-xs text-[#4a5568]">No notifications</p></div>
              ) : (
                <div className="py-1">
                  {notifications.slice(0, 15).map(n => {
                    const NIcon = notifIcons[n.type] || Ic.bell;
                    return (
                      <div key={n.id} className={`flex gap-2.5 px-3 py-2.5 hover:bg-[#121824] transition-all cursor-pointer ${!n.read ? 'bg-[#c9a962]/3' : ''}`}
                        onClick={() => setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))}>
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${!n.read ? 'bg-[#c9a962]/10' : 'bg-[#121824]'}`}>
                          <NIcon size={13} className={notifColors[n.type] || 'text-[#5a6577]'}/>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-[11px] ${!n.read ? 'text-[#e0dbd0] font-medium' : 'text-[#a0aab8]'} truncate`}>{n.title}</p>
                          <p className="text-[10px] text-[#4a5568] truncate">{n.message}</p>
                          <p className="text-[9px] text-[#3a4556] mt-0.5">{n.time}{n.channel ? ` · via ${n.channel}` : ''}</p>
                        </div>
                        {!n.read && <div className="w-2 h-2 rounded-full bg-[#c9a962] mt-2 flex-shrink-0"/>}
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className="h-8 bg-[#1a2030]"/>
        <DropdownMenu><DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2.5 hover:bg-[#121824] rounded-lg px-2 py-1.5 transition-all">
            <Avatar className="h-8 w-8 border border-[#2a3544]"><AvatarFallback className="bg-gradient-to-br from-[#c9a962] to-[#8b6f3a] text-[#0d1117] text-xs font-bold">{user.name.split(' ').map(n=>n[0]).join('')}</AvatarFallback></Avatar>
            <div className="text-left hidden sm:block"><p className="text-xs font-medium text-[#e0dbd0]">{user.name}</p><p className="text-[10px] text-[#5a6577] capitalize">{user.role.replace('_',' ')}</p></div>
          </button>
        </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-[#0d1117] border-[#1e2733] min-w-[180px]"><DropdownMenuItem className="text-[#a0aab8] hover:text-[#f0ece2] hover:bg-[#121824] cursor-pointer" onClick={()=>setUser(null)}><Ic.out size={14} className="mr-2"/> Sign Out</DropdownMenuItem></DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

// ═══════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════
function DashboardPage() {
  const { vehicles, imports, leads, tasks, user, wishlist } = useApp();
  const sa = user?.role==='super_admin';
  const rev = vehicles.filter(v=>v.status==='sold').reduce((s,v)=>s+v.sellingPrice,0);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat title="Total Vehicles" value={vehicles.length} sub={`${vehicles.filter(v=>v.status==='available').length} available`} icon={Ic.car} color="#c9a962"/>
        <Stat title="Active Imports" value={imports.filter(i=>i.stage!=='delivered').length} sub={`${imports.length} total`} icon={Ic.ship} color="#60a5fa"/>
        <Stat title="Hot Leads" value={leads.filter(l=>['qualified','negotiation'].includes(l.status)).length} sub={`${leads.length} total`} icon={Ic.user} trend="+3 this week" color="#a78bfa"/>
        {sa ? <Stat title="Revenue" value={fmt(rev)} sub="Completed sales" icon={Ic.dollar} trend="+12%" color="#34d399"/> : <Stat title="Wish List" value={wishlist.filter(w=>w.status==='active').length} sub="active requests" icon={Ic.heart} color="#f472b6"/>}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 bg-[#0d1117] border-[#1a2030]"><CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-[#e0dbd0]">Active Import Processes</CardTitle></CardHeader><CardContent className="space-y-4">
          {imports.filter(i=>i.stage!=='delivered').map(imp=>{const v=vehicles.find(x=>x.id===imp.vehicleId);return(
            <div key={imp.id} className="p-4 rounded-xl bg-[#080b12] border border-[#1a2030]">
              <div className="flex items-center justify-between mb-3"><div><p className="text-sm font-medium text-[#e0dbd0]">{v?.year} {v?.make} {v?.model}</p><p className="text-xs text-[#5a6577]">From {imp.originCountry} · ETA {imp.estimatedArrival}</p></div><Badge className={`text-[10px] ${sc[imp.stage]||sc.pending} border`}>{STAGES.find(s=>s.key===imp.stage)?.label}</Badge></div>
              <Progress value={stageProgress(imp.stage)} className="h-1.5 bg-[#1a2030]"/>
              <div className="flex justify-between mt-2">{STAGES.map((s,i)=><span key={s.key} className={`text-[10px] ${stageIdx(imp.stage)>=i?'text-[#c9a962]':'text-[#3a4556]'}`}>{s.icon}</span>)}</div>
            </div>
          );})}
        </CardContent></Card>
        <Card className="bg-[#0d1117] border-[#1a2030]"><CardHeader className="pb-3"><CardTitle className="text-sm font-medium text-[#e0dbd0]">Upcoming Tasks</CardTitle></CardHeader><CardContent><ScrollArea className="h-[300px]"><div className="space-y-3">
          {tasks.filter(t=>t.status!=='completed').sort((a,b)=>a.dueDate.localeCompare(b.dueDate)).map(t=>(
            <div key={t.id} className="p-3 rounded-lg bg-[#080b12] border border-[#1a2030] space-y-1.5"><div className="flex items-center justify-between"><Badge className={`text-[10px] ${sc[t.priority]}`}>{t.priority}</Badge><span className="text-[10px] text-[#5a6577]">{t.dueDate}</span></div><p className="text-xs font-medium text-[#e0dbd0]">{t.title}</p><p className="text-[10px] text-[#5a6577]">→ {t.assignedTo}</p></div>
          ))}
        </div></ScrollArea></CardContent></Card>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// ★ ENHANCED VEHICLES PAGE (with gallery, VIN, compare)
// ═══════════════════════════════════════════════════
function VehiclesPage() {
  const { vehicles, setVehicles, user, compareIds, setCompareIds } = useApp();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [sel, setSel] = useState<Vehicle|null>(null);
  const [viewMode, setViewMode] = useState<'grid'|'gallery'>('grid');
  const sa = user?.role==='super_admin';

  const filtered = vehicles.filter(v => {
    const mf = filter==='all'||v.category===filter||v.status===filter;
    const ms = `${v.make} ${v.model} ${v.year} ${v.vin} ${v.color}`.toLowerCase().includes(search.toLowerCase());
    return mf && ms;
  });

  const toggleCompare = (id: string) => {
    setCompareIds(prev => prev.includes(id) ? prev.filter(x=>x!==id) : prev.length < 3 ? [...prev, id] : prev);
  };

  const updateVehicleImages = (vehicleId: string, imgs: VehicleImage[]) => {
    setVehicles(prev => prev.map(v => v.id === vehicleId ? { ...v, images: imgs } : v));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-1.5 flex-wrap">
          {[{v:'all',l:'All'},{v:'imported',l:'Imported'},{v:'trade_in',l:'Trade-In'},{v:'local',l:'Local'},{v:'available',l:'Available'},{v:'in_transit',l:'In Transit'}].map(f=>
            <Button key={f.v} variant="ghost" size="sm" onClick={()=>setFilter(f.v)} className={`text-xs h-8 ${filter===f.v?'bg-[#c9a962]/10 text-[#c9a962]':'text-[#6a7589] hover:text-[#a0aab8]'}`}>{f.l}</Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative"><Ic.search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4a5568]"/><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..." className="pl-9 h-9 bg-[#080b12] border-[#1a2030] text-[#e0dbd0] text-xs w-40 focus:border-[#c9a962]/50"/></div>
          {/* Compare button */}
          {compareIds.length >= 2 && (
            <Button size="sm" className="bg-gradient-to-r from-[#1a3a5c] to-[#2d1b4e] text-[#e0dbd0] h-9 text-xs gap-1 border border-[#2a3544]">
              <Ic.compare size={14}/> Compare ({compareIds.length})
            </Button>
          )}
          {/* View toggle */}
          <div className="flex rounded-lg border border-[#1a2030] overflow-hidden">
            <button onClick={()=>setViewMode('grid')} className={`px-2.5 py-1.5 ${viewMode==='grid'?'bg-[#c9a962]/10 text-[#c9a962]':'text-[#5a6577]'}`}><Ic.grid size={14}/></button>
            <button onClick={()=>setViewMode('gallery')} className={`px-2.5 py-1.5 ${viewMode==='gallery'?'bg-[#c9a962]/10 text-[#c9a962]':'text-[#5a6577]'}`}><Ic.image size={14}/></button>
          </div>
          <Button size="sm" onClick={()=>setShowAdd(true)} className="bg-[#c9a962] text-[#0d1117] hover:bg-[#d4b46e] h-9 text-xs gap-1"><Ic.plus size={14}/> Add</Button>
        </div>
      </div>

      {/* Compare bar */}
      {compareIds.length > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-[#1a3a5c]/10 border border-[#1a3a5c]/30">
          <Ic.compare size={16} className="text-sky-400 flex-shrink-0"/>
          <p className="text-xs text-sky-300">Select up to 3 vehicles to compare. <span className="text-sky-400 font-medium">{compareIds.length}/3 selected</span></p>
          <Button size="sm" variant="ghost" onClick={()=>setCompareIds([])} className="ml-auto text-xs text-[#5a6577] h-7">Clear</Button>
        </div>
      )}

      {/* Vehicle cards */}
      <div className={viewMode==='grid' ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4' : 'grid grid-cols-1 md:grid-cols-2 gap-4'}>
        {filtered.map(v => {
          const grad = carColors[v.color] || 'from-zinc-700 to-zinc-600';
          const isComparing = compareIds.includes(v.id);
          return (
            <Card key={v.id} className={`bg-[#0d1117] border-[#1a2030] hover:border-[#2a3544] transition-all ${isComparing?'ring-1 ring-sky-500/40':''}`}>
              <CardContent className="p-0">
                <div className={`${viewMode==='gallery'?'h-52':'h-36'} bg-gradient-to-br ${grad} rounded-t-lg flex items-center justify-center relative overflow-hidden cursor-pointer`} onClick={()=>setSel(v)}>
                  <div className="absolute inset-0 opacity-5" style={{backgroundImage:'repeating-linear-gradient(45deg,transparent,transparent 10px,rgba(201,169,98,0.1) 10px,rgba(201,169,98,0.1) 11px)'}}/>
                  <div className="text-center z-10"><p className="text-3xl font-bold text-white/10" style={{fontFamily:pf}}>{v.make}</p><p className="text-sm text-white/15 mt-1">{v.model}</p></div>
                  <div className="absolute top-3 right-3 flex gap-1.5"><Badge className={`text-[9px] ${sc[v.status]} border`}>{v.status.replace('_',' ')}</Badge></div>
                  <div className="absolute bottom-3 right-3 flex items-center gap-1"><Ic.image size={11} className="text-white/40"/><span className="text-[9px] text-white/40">{v.images.length}</span></div>
                </div>
                <div className="p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="cursor-pointer" onClick={()=>setSel(v)}>
                      <h3 className="text-sm font-semibold text-[#f0ece2]">{v.year} {v.make} {v.model}</h3>
                      <p className="text-xs text-[#5a6577]">{v.color} · {v.mileage.toLocaleString()} km</p>
                    </div>
                    {/* Compare checkbox */}
                    <button onClick={()=>toggleCompare(v.id)} className={`w-6 h-6 rounded border flex items-center justify-center flex-shrink-0 transition-all ${isComparing?'bg-sky-500/20 border-sky-500/50 text-sky-400':'border-[#2a3544] text-transparent hover:border-[#4a5568]'}`}>
                      {isComparing && <span className="text-[10px]">✓</span>}
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    {sa && <p className="text-[10px] text-[#5a6577]">Cost: {fmt(v.purchasePrice)}</p>}
                    <p className="text-sm font-bold text-[#c9a962] ml-auto">{fmt(v.sellingPrice)}</p>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {Object.entries(v.specs).slice(0,2).map(([k,val])=><span key={k} className="text-[10px] px-2 py-0.5 rounded-full bg-[#121824] text-[#6a7589] border border-[#1a2030]">{val}</span>)}
                    {v.vinDecoded && <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">VIN ✓</span>}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Vehicle Detail with Edit Mode */}
      <Dialog open={!!sel} onOpenChange={()=>{setSel(null);}}>
        <DialogContent className="bg-[#0d1117] border-[#1e2733] max-w-2xl max-h-[90vh] overflow-y-auto">
          {sel && <VehicleDetailEditor
            vehicle={sel}
            isSuperAdmin={!!sa}
            canEdit={!!sa || user?.role==='standard'}
            onSave={(updated) => {
              setVehicles(prev => prev.map(v => v.id === updated.id ? updated : v));
              setSel(updated);
            }}
            onUpdateImages={(imgs) => {
              updateVehicleImages(sel.id, imgs);
              setSel({...sel, images: imgs});
            }}
            onClose={() => setSel(null)}
          />}
        </DialogContent>
      </Dialog>

      {/* Add Vehicle with VIN Decoder */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="bg-[#0d1117] border-[#1e2733] max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-[#f0ece2]">Add New Vehicle</DialogTitle><DialogDescription className="text-[#5a6577]">Enter VIN to auto-populate specs, or fill manually</DialogDescription></DialogHeader>
          <EnhancedVehicleForm onAdd={v=>{setVehicles(p=>[...p,v]);setShowAdd(false);}}/>
        </DialogContent>
      </Dialog>

      {/* Compare Panel */}
      <ComparePanel/>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// ★ VEHICLE DETAIL EDITOR (tabbed: Details / Attachments / Relationships)
// ═══════════════════════════════════════════════════
function VehicleDetailEditor({ vehicle, isSuperAdmin, canEdit, onSave, onUpdateImages }: {
  vehicle: Vehicle; isSuperAdmin: boolean; canEdit: boolean;
  onSave: (v: Vehicle) => void; onUpdateImages: (imgs: VehicleImage[]) => void; onClose?: () => void;
}) {
  const { imports, customers, vendors } = useApp();
  const [tab, setTab] = useState<'details'|'attachments'|'relationships'>('details');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(vehicle);
  const [newSpecKey, setNewSpecKey] = useState('');
  const [newSpecVal, setNewSpecVal] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [attSyncing, setAttSyncing] = useState(true);

  // Load attachments from vehicle_documents on mount
  useEffect(() => {
    let cancelled = false;
    vdFetch(vehicle.id).then(rows => {
      if (cancelled) return;
      if (rows.length > 0) setDraft(p => ({ ...p, attachments: rows }));
      setAttSyncing(false);
    });
    return () => { cancelled = true; };
  }, [vehicle.id]);

  const set = (k: keyof Vehicle, v: any) => { setDraft(p => ({ ...p, [k]: v })); setHasChanges(true); };
  const setSpec = (key: string, val: string) => { setDraft(p => ({ ...p, specs: { ...p.specs, [key]: val } })); setHasChanges(true); };
  const removeSpec = (key: string) => { setDraft(p => { const s = { ...p.specs }; delete s[key]; return { ...p, specs: s }; }); setHasChanges(true); };
  const addSpec = () => { if (newSpecKey.trim() && newSpecVal.trim()) { setSpec(newSpecKey.trim(), newSpecVal.trim()); setNewSpecKey(''); setNewSpecVal(''); } };
  const handleSave = () => { onSave(draft); setEditing(false); setHasChanges(false); };
  const handleCancel = () => { setDraft(vehicle); setEditing(false); setHasChanges(false); };

  // Attachment handlers
  const fileRef = useRef<HTMLInputElement>(null);
  const [attachCat, setAttachCat] = useState<VehicleAttachment['category']>('document');
  const [attachNotes, setAttachNotes] = useState('');
  const [attachUploading, setAttachUploading] = useState(false);

  const addAttachment = async (files: FileList | null) => {
    if (!files) return;
    setAttachUploading(true);
    const newAtts: VehicleAttachment[] = [];
    for (const f of Array.from(files)) {
      const ext = f.name.split('.').pop()?.toUpperCase() || 'FILE';
      const fileSize = f.size > 1048576 ? `${(f.size/1048576).toFixed(1)} MB` : `${(f.size/1024).toFixed(0)} KB`;
      const stored = await storageUpload(f, `vehicle_attachment/${draft.id}`);
      if (stored) {
        const insertedId = await vdInsert(
          draft.id, stored.url, stored.path, f.name, attachCat, fileSize, 'Admin', attachNotes
        );
        newAtts.push({
          id: insertedId || `att-${Date.now()}`,
          name: f.name, fileType: ext, size: fileSize,
          category: attachCat, uploadDate: new Date().toISOString().split('T')[0],
          uploadedBy: 'Admin', notes: attachNotes,
        });
      } else {
        newAtts.push({
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
          name: f.name, fileType: ext, size: fileSize,
          category: attachCat, uploadDate: new Date().toISOString().split('T')[0],
          uploadedBy: 'Admin', notes: attachNotes + ' (local only)',
        });
      }
    }
    const updated = { ...draft, attachments: [...draft.attachments, ...newAtts] };
    setDraft(updated); onSave(updated); setAttachNotes('');
    setAttachUploading(false);
  };

  const removeAttachment = async (id: string) => {
    await vdSoftDelete(id);
    const updated = { ...draft, attachments: draft.attachments.filter(a=>a.id!==id) };
    setDraft(updated); onSave(updated);
  };

  // Relationship lookups
  const relImport = imports.find(i => i.id === draft.importProcessId);
  const relCustomer = customers.find(c => c.id === draft.customerId);
  const relVendors = vendors.filter(vn => vn.vehicleIds.includes(draft.id));

  const inp = "bg-[#080b12] border-[#1a2030] text-[#e0dbd0] text-sm h-9 focus:border-[#c9a962]/50";
  const catIcons: Record<string, string> = { document:'📄', image:'🖼️', invoice:'🧾', registration:'📋', inspection:'🔧', insurance:'🛡️', other:'📎' };
  const catColors: Record<string, string> = { document:'bg-sky-500/10 text-sky-400 border-sky-500/20', image:'bg-violet-500/10 text-violet-400 border-violet-500/20', invoice:'bg-amber-500/10 text-amber-400 border-amber-500/20', registration:'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', inspection:'bg-orange-500/10 text-orange-400 border-orange-500/20', insurance:'bg-teal-500/10 text-teal-400 border-teal-500/20', other:'bg-slate-500/10 text-slate-400 border-slate-500/20' };

  return (
    <div className="space-y-4">
      <DialogHeader>
        <div className="flex items-center justify-between">
          <div>
            <DialogTitle className="text-[#f0ece2]" style={{fontFamily:pf}}>
              {editing ? 'Edit Vehicle' : `${draft.year} ${draft.make} ${draft.model}`}
            </DialogTitle>
            <DialogDescription className="text-[#5a6577]">VIN: {draft.vin}</DialogDescription>
          </div>
          {canEdit && tab === 'details' && (
            <div className="flex items-center gap-2">
              {editing ? (
                <><Button size="sm" variant="ghost" onClick={handleCancel} className="h-8 text-xs text-[#6a7589] hover:text-[#a0aab8] gap-1"><Ic.undo size={13}/> Cancel</Button>
                <Button size="sm" onClick={handleSave} disabled={!hasChanges} className="h-8 text-xs bg-[#c9a962] text-[#0d1117] hover:bg-[#d4b46e] gap-1 disabled:opacity-40"><Ic.save size={13}/> Save</Button></>
              ) : (
                <Button size="sm" variant="ghost" onClick={()=>setEditing(true)} className="h-8 text-xs text-[#6a7589] hover:text-[#c9a962] gap-1"><Ic.edit size={13}/> Edit</Button>
              )}
            </div>
          )}
        </div>
      </DialogHeader>

      {/* ── Tab Navigation ── */}
      <div className="flex gap-1 p-1 rounded-lg bg-[#080b12] border border-[#1a2030]">
        {([
          { key: 'details' as const, label: 'Details', icon: Ic.car },
          { key: 'attachments' as const, label: attSyncing ? 'Attachments…' : `Attachments (${draft.attachments.length})`, icon: Ic.clip },
          { key: 'relationships' as const, label: 'Relationships', icon: Ic.link },
        ]).map(t => (
          <button key={t.key} onClick={()=>setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-medium transition-all ${tab===t.key ? 'bg-[#c9a962]/10 text-[#c9a962]' : 'text-[#5a6577] hover:text-[#a0aab8]'}`}>
            <t.icon size={13}/> {t.label}
          </button>
        ))}
      </div>

      {/* ═══ TAB: DETAILS ═══ */}
      {tab === 'details' && <>
        <ImageGallery vehicle={draft} editable={canEdit && editing} onUpdate={(imgs)=>{ onUpdateImages(imgs); setDraft(p=>({...p, images:imgs})); }}/>
        {editing ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-[#080b12] border border-[#c9a962]/20 space-y-3">
              <p className="text-xs font-medium text-[#c9a962] flex items-center gap-1.5"><Ic.edit size={12}/> Editing Vehicle Details</p>
              <div className="grid grid-cols-3 gap-3">
                <div><Label className="text-[10px] text-[#5a6577] uppercase">Make</Label><Input value={draft.make} onChange={e=>set('make',e.target.value)} className={inp}/></div>
                <div><Label className="text-[10px] text-[#5a6577] uppercase">Model</Label><Input value={draft.model} onChange={e=>set('model',e.target.value)} className={inp}/></div>
                <div><Label className="text-[10px] text-[#5a6577] uppercase">Year</Label><Input type="number" value={draft.year} onChange={e=>set('year',+e.target.value)} className={inp}/></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-[10px] text-[#5a6577] uppercase">VIN</Label><Input value={draft.vin} onChange={e=>set('vin',e.target.value.toUpperCase())} className={`${inp} font-mono tracking-wider`} maxLength={17}/></div>
                <div><Label className="text-[10px] text-[#5a6577] uppercase">Color</Label><Input value={draft.color} onChange={e=>set('color',e.target.value)} className={inp}/></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-[10px] text-[#5a6577] uppercase">Mileage (km)</Label><Input type="number" value={draft.mileage} onChange={e=>set('mileage',+e.target.value)} className={inp}/></div>
                <div><Label className="text-[10px] text-[#5a6577] uppercase">Category</Label><Select value={draft.category} onValueChange={v=>set('category',v)}><SelectTrigger className={inp}><SelectValue/></SelectTrigger><SelectContent className="bg-[#0d1117] border-[#1e2733]"><SelectItem value="imported">Imported</SelectItem><SelectItem value="trade_in">Trade-In</SelectItem><SelectItem value="local">Local</SelectItem></SelectContent></Select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-[10px] text-[#5a6577] uppercase">Status</Label><Select value={draft.status} onValueChange={v=>set('status',v)}><SelectTrigger className={inp}><SelectValue/></SelectTrigger><SelectContent className="bg-[#0d1117] border-[#1e2733]"><SelectItem value="available">Available</SelectItem><SelectItem value="reserved">Reserved</SelectItem><SelectItem value="sold">Sold</SelectItem><SelectItem value="in_transit">In Transit</SelectItem></SelectContent></Select></div>
                <div><Label className="text-[10px] text-[#5a6577] uppercase">Currency</Label><Select value={draft.currency} onValueChange={v=>set('currency',v)}><SelectTrigger className={inp}><SelectValue/></SelectTrigger><SelectContent className="bg-[#0d1117] border-[#1e2733]"><SelectItem value="USD">USD</SelectItem><SelectItem value="EUR">EUR</SelectItem><SelectItem value="NIS">NIS</SelectItem><SelectItem value="CAD">CAD</SelectItem></SelectContent></Select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-[10px] text-[#5a6577] uppercase">Selling Price</Label><Input type="number" value={draft.sellingPrice} onChange={e=>set('sellingPrice',+e.target.value)} className={inp}/></div>
                {isSuperAdmin && <div><Label className="text-[10px] text-[#5a6577] uppercase">Purchase Price</Label><Input type="number" value={draft.purchasePrice} onChange={e=>set('purchasePrice',+e.target.value)} className={inp}/></div>}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-[#080b12] border border-[#1a2030] space-y-3">
              <p className="text-xs font-medium text-[#a0aab8] flex items-center gap-1.5"><Ic.specPlus size={12} className="text-[#c9a962]"/> Specifications</p>
              <div className="space-y-2">{Object.entries(draft.specs).map(([key, val]) => (
                <div key={key} className="flex items-center gap-2 group">
                  <div className="flex-1 grid grid-cols-2 gap-2"><div className="p-2 rounded bg-[#0d1117] border border-[#1a2030]"><p className="text-[10px] text-[#5a6577] uppercase">{key.replace(/([A-Z])/g,' $1')}</p></div><Input value={val} onChange={e=>setSpec(key,e.target.value)} className="bg-[#0d1117] border-[#1a2030] text-[#e0dbd0] text-xs h-8"/></div>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-[#3a4556] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity" onClick={()=>removeSpec(key)}><Ic.x size={12}/></Button>
                </div>))}</div>
              <Separator className="bg-[#1a2030]"/>
              <div className="flex items-end gap-2">
                <div className="flex-1"><Label className="text-[10px] text-[#5a6577]">Spec Name</Label><Input value={newSpecKey} onChange={e=>setNewSpecKey(e.target.value)} placeholder="e.g. fuelType" className="bg-[#0d1117] border-[#1a2030] text-[#e0dbd0] text-xs h-8"/></div>
                <div className="flex-1"><Label className="text-[10px] text-[#5a6577]">Value</Label><Input value={newSpecVal} onChange={e=>setNewSpecVal(e.target.value)} placeholder="e.g. Gasoline" className="bg-[#0d1117] border-[#1a2030] text-[#e0dbd0] text-xs h-8" onKeyDown={e=>e.key==='Enter'&&addSpec()}/></div>
                <Button size="sm" variant="ghost" onClick={addSpec} disabled={!newSpecKey.trim()||!newSpecVal.trim()} className="h-8 text-xs text-[#c9a962] hover:bg-[#c9a962]/10 disabled:opacity-30"><Ic.plus size={14}/></Button>
              </div>
            </div>
            <CustomFieldsEditor objectType="vehicle" data={draft.customData || {}} onChange={(d) => { set('customData', d); }}/>
            {hasChanges && <div className="flex items-center gap-3 p-3 rounded-xl bg-[#c9a962]/5 border border-[#c9a962]/20"><div className="w-2 h-2 rounded-full bg-[#c9a962] animate-pulse"/><p className="text-xs text-[#c9a962] flex-1">Unsaved changes</p><Button size="sm" variant="ghost" onClick={handleCancel} className="h-7 text-xs text-[#6a7589]">Discard</Button><Button size="sm" onClick={handleSave} className="h-7 text-xs bg-[#c9a962] text-[#0d1117] hover:bg-[#d4b46e]">Save</Button></div>}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <IB label="Color" value={draft.color}/><IB label="Mileage" value={`${draft.mileage.toLocaleString()} km`}/>
              {isSuperAdmin && <IB label="Purchase Price" value={fmt(draft.purchasePrice)}/>}
              <IB label="Selling Price" value={fmt(draft.sellingPrice)} highlight/>
              <IB label="Category" value={draft.category.replace('_',' ')}/>
              <IB label="Status" value={draft.status.replace('_',' ')}/>
            </div>
            <div><p className="text-xs font-medium text-[#a0aab8] mb-2">Specifications</p>
              <div className="grid grid-cols-2 gap-2">{Object.entries(draft.specs).map(([k,v])=><div key={k} className="p-2 rounded bg-[#080b12] border border-[#1a2030]"><p className="text-[10px] text-[#5a6577] uppercase">{k.replace(/([A-Z])/g,' $1')}</p><p className="text-xs text-[#e0dbd0]">{v}</p></div>)}</div>
            </div>
            <CustomFieldsView objectType="vehicle" data={draft.customData}/>
          </div>
        )}
      </>}

      {/* ═══ TAB: ATTACHMENTS ═══ */}
      {tab === 'attachments' && (
        <div className="space-y-4">
          {/* Upload area */}
          {canEdit && (
            <div className="p-4 rounded-xl bg-[#080b12] border border-[#1a2030] space-y-3">
              <p className="text-xs font-medium text-[#a0aab8] flex items-center gap-1.5"><Ic.clip size={12} className="text-[#c9a962]"/> Upload Attachment</p>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-[10px] text-[#5a6577] uppercase">Category</Label>
                  <Select value={attachCat} onValueChange={(v: any)=>setAttachCat(v)}><SelectTrigger className={inp}><SelectValue/></SelectTrigger>
                    <SelectContent className="bg-[#0d1117] border-[#1e2733]">{['document','image','invoice','registration','inspection','insurance','other'].map(c=><SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label className="text-[10px] text-[#5a6577] uppercase">Notes (optional)</Label><Input value={attachNotes} onChange={e=>setAttachNotes(e.target.value)} placeholder="Description..." className={inp}/></div>
              </div>
              <div className={`border-2 border-dashed rounded-xl p-4 text-center transition-all ${attachUploading ? 'border-[#c9a962]/40 bg-[#c9a962]/5' : 'border-[#1a2030] cursor-pointer hover:border-[#2a3544]'}`} onClick={()=>!attachUploading && fileRef.current?.click()}>
                <input ref={fileRef} type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.zip" className="hidden" onChange={e=>addAttachment(e.target.files)}/>
                {attachUploading ? <><div className="w-5 h-5 border-2 border-[#c9a962] border-t-transparent rounded-full animate-spin mx-auto mb-2"/><p className="text-xs text-[#c9a962]">Uploading to Supabase Storage...</p></> : <>
                <Ic.uploadCloud size={20} className="mx-auto text-[#5a6577] mb-1.5"/>
                <p className="text-xs text-[#6a7589]">Click to upload files</p>
                <p className="text-[10px] text-[#3a4556] mt-0.5">Stored in Supabase · PDF, Word, Excel, Images, ZIP</p></>}
              </div>
            </div>
          )}

          {/* Attachment list grouped by category */}
          {attSyncing ? (
            <div className="p-8 text-center flex flex-col items-center gap-2"><div className="w-5 h-5 border-2 border-[#c9a962] border-t-transparent rounded-full animate-spin"/><p className="text-xs text-[#5a6577]">Loading from Supabase…</p></div>
          ) : draft.attachments.length === 0 ? (
            <div className="p-8 text-center"><Ic.clip size={24} className="mx-auto text-[#2a3544] mb-2"/><p className="text-xs text-[#4a5568]">No attachments yet</p></div>
          ) : (
            <div className="space-y-3">
              {Object.entries(
                draft.attachments.reduce<Record<string, VehicleAttachment[]>>((acc, att) => {
                  (acc[att.category] = acc[att.category] || []).push(att); return acc;
                }, {})
              ).map(([cat, atts]) => (
                <div key={cat}>
                  <p className="text-[10px] text-[#5a6577] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <span>{catIcons[cat] || '📎'}</span> {cat} ({atts.length})
                  </p>
                  <div className="space-y-1.5">
                    {atts.map(att => (
                      <div key={att.id} className="flex items-center gap-3 p-3 rounded-lg bg-[#080b12] border border-[#1a2030] group hover:border-[#2a3544] transition-all">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 border ${catColors[att.category] || catColors.other}`}>
                          {att.fileType}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-[#e0dbd0] truncate">{att.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-[#4a5568]">{att.size}</span>
                            <span className="text-[10px] text-[#3a4556]">·</span>
                            <span className="text-[10px] text-[#4a5568]">{att.uploadDate}</span>
                            <span className="text-[10px] text-[#3a4556]">·</span>
                            <span className="text-[10px] text-[#4a5568]">{att.uploadedBy}</span>
                          </div>
                          {att.notes && <p className="text-[10px] text-[#5a6577] mt-0.5 italic">{att.notes}</p>}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-[#5a6577] hover:text-[#c9a962]"><Ic.dl size={12}/></Button>
                          {canEdit && <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-[#5a6577] hover:text-red-400" onClick={()=>removeAttachment(att.id)}><Ic.x size={12}/></Button>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB: RELATIONSHIPS ═══ */}
      {tab === 'relationships' && (
        <div className="space-y-4">
          {/* Customer */}
          <div className="p-4 rounded-xl bg-[#080b12] border border-[#1a2030] space-y-2">
            <p className="text-xs font-medium text-[#a0aab8] flex items-center gap-1.5"><Ic.user size={12} className="text-sky-400"/> Customer</p>
            {relCustomer ? (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-[#0d1117] border border-sky-500/20">
                <Avatar className="h-10 w-10 border border-sky-500/30"><AvatarFallback className="bg-sky-500/10 text-sky-400 text-xs font-bold">{relCustomer.name.split(' ').map(n=>n[0]).join('')}</AvatarFallback></Avatar>
                <div className="flex-1">
                  <p className="text-sm font-medium text-[#e0dbd0]">{relCustomer.name}</p>
                  <p className="text-[10px] text-[#5a6577]">{relCustomer.email} · {relCustomer.phone}</p>
                  <p className="text-[10px] text-[#5a6577]">Customer since {relCustomer.joinDate} · Total spent: <span className="text-[#c9a962]">{fmt(relCustomer.totalSpent)}</span></p>
                </div>
                <Badge className="bg-sky-500/15 text-sky-400 border-sky-500/30 text-[9px] border">Linked</Badge>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-[#0d1117] border border-[#1a2030] flex items-center gap-2"><span className="text-[10px] text-[#4a5568]">No customer linked to this vehicle</span></div>
            )}
          </div>

          {/* Import Process */}
          <div className="p-4 rounded-xl bg-[#080b12] border border-[#1a2030] space-y-2">
            <p className="text-xs font-medium text-[#a0aab8] flex items-center gap-1.5"><Ic.ship size={12} className="text-violet-400"/> Import Process</p>
            {relImport ? (
              <div className="p-3 rounded-lg bg-[#0d1117] border border-violet-500/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[#e0dbd0]">Import #{relImport.id}</p>
                    <p className="text-[10px] text-[#5a6577]">Origin: {relImport.originCountry} · ETA: {relImport.estimatedArrival}</p>
                  </div>
                  <Badge className={`text-[9px] ${sc[relImport.stage]||sc.pending} border`}>{STAGES.find(s=>s.key===relImport.stage)?.label}</Badge>
                </div>
                <Progress value={stageProgress(relImport.stage)} className="h-1.5 bg-[#1a2030]"/>
                {isSuperAdmin && (
                  <div className="flex gap-3 text-xs">
                    <span className="text-[#5a6577]">Cost: <span className="text-[#e0dbd0]">{fmt(relImport.totalCost)}</span></span>
                    <span className="text-[#5a6577]">Tax: <span className="text-[#e0dbd0]">{fmt(relImport.taxAmount)}</span></span>
                    <span className="text-[#5a6577]">Shipping: <span className="text-[#e0dbd0]">{fmt(relImport.shippingCost)}</span></span>
                  </div>
                )}
                <p className="text-[10px] text-[#5a6577]">{relImport.documents.length} documents · {relImport.milestones.filter(m=>m.completed).length}/{relImport.milestones.length} milestones completed</p>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-[#0d1117] border border-[#1a2030] flex items-center gap-2"><span className="text-[10px] text-[#4a5568]">No import process linked — vehicle may be locally sourced or trade-in</span></div>
            )}
          </div>

          {/* Vendors */}
          <div className="p-4 rounded-xl bg-[#080b12] border border-[#1a2030] space-y-2">
            <p className="text-xs font-medium text-[#a0aab8] flex items-center gap-1.5"><Ic.box size={12} className="text-amber-400"/> Vendors ({relVendors.length})</p>
            {relVendors.length > 0 ? (
              <div className="space-y-2">
                {relVendors.map(vn => (
                  <div key={vn.id} className="flex items-center gap-3 p-3 rounded-lg bg-[#0d1117] border border-amber-500/20">
                    <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                      <Ic.box size={16} className="text-amber-400"/>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[#e0dbd0]">{vn.name}</p>
                      <p className="text-[10px] text-[#5a6577]">{vn.service} · {vn.country}</p>
                      {isSuperAdmin && <p className="text-[10px] text-[#5a6577]">{vn.contactName} · {vn.email}</p>}
                    </div>
                    <div className="flex gap-0.5">{Array.from({length:5}).map((_,i)=><span key={i} className={`text-[10px] ${i<vn.rating?'text-[#c9a962]':'text-[#2a3544]'}`}>★</span>)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-[#0d1117] border border-[#1a2030]"><span className="text-[10px] text-[#4a5568]">No vendors linked to this vehicle</span></div>
            )}
          </div>

          {/* Summary */}
          <div className="p-3 rounded-xl bg-[#121824] border border-[#1a2030]">
            <p className="text-[10px] text-[#5a6577] uppercase tracking-wider mb-2">Relationship Summary</p>
            <div className="flex gap-4">
              <div className="flex items-center gap-1.5"><div className={`w-2 h-2 rounded-full ${relCustomer?'bg-sky-400':'bg-[#2a3544]'}`}/><span className="text-[10px] text-[#6a7589]">Customer {relCustomer?'✓':'—'}</span></div>
              <div className="flex items-center gap-1.5"><div className={`w-2 h-2 rounded-full ${relImport?'bg-violet-400':'bg-[#2a3544]'}`}/><span className="text-[10px] text-[#6a7589]">Import {relImport?'✓':'—'}</span></div>
              <div className="flex items-center gap-1.5"><div className={`w-2 h-2 rounded-full ${relVendors.length>0?'bg-amber-400':'bg-[#2a3544]'}`}/><span className="text-[10px] text-[#6a7589]">Vendors ({relVendors.length})</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// ★ ENHANCED ADD VEHICLE FORM (with VIN Decoder)
// ═══════════════════════════════════════════════════
function EnhancedVehicleForm({ onAdd }: { onAdd:(v:Vehicle)=>void }) {
  const [f, setF] = useState({ make:'', model:'', year:'2025', vin:'', category:'imported' as VehicleCategory, color:'', mileage:'0', purchasePrice:'0', sellingPrice:'0' });
  const [specs, setSpecs] = useState<Record<string,string>>({});
  const [decoded, setDecoded] = useState(false);
  const s = (k:string,v:string) => setF(p=>({...p,[k]:v}));

  const handleDecode = (decodedSpecs: Record<string,string>, info: { make:string; model:string; year:number }) => {
    setF(p => ({ ...p, make: info.make, model: info.model, year: String(info.year) }));
    setSpecs(decodedSpecs);
    setDecoded(true);
  };

  return (
    <div className="space-y-4">
      {/* VIN Input + Decoder */}
      <div className="p-4 rounded-xl bg-[#080b12] border border-[#1a2030] space-y-3">
        <div className="flex items-center gap-2 mb-1"><Ic.scan size={14} className="text-[#c9a962]"/><p className="text-xs font-medium text-[#e0dbd0]">VIN Decoder</p></div>
        <div><Label className="text-[10px] text-[#5a6577] uppercase">Vehicle Identification Number</Label><Input value={f.vin} onChange={e=>s('vin',e.target.value.toUpperCase())} placeholder="e.g. WDD2906121A123456" className="bg-[#0d1117] border-[#1a2030] text-[#e0dbd0] text-sm h-9 font-mono tracking-wider" maxLength={17}/></div>
        <VinDecoderPanel vin={f.vin} onDecode={handleDecode}/>
      </div>

      {/* Vehicle Details */}
      <div className="grid grid-cols-2 gap-3">
        <div><Label className="text-[10px] text-[#5a6577] uppercase">Make</Label><Input value={f.make} onChange={e=>s('make',e.target.value)} className="bg-[#080b12] border-[#1a2030] text-[#e0dbd0] text-sm h-9"/></div>
        <div><Label className="text-[10px] text-[#5a6577] uppercase">Model</Label><Input value={f.model} onChange={e=>s('model',e.target.value)} className="bg-[#080b12] border-[#1a2030] text-[#e0dbd0] text-sm h-9"/></div>
        <div><Label className="text-[10px] text-[#5a6577] uppercase">Year</Label><Input type="number" value={f.year} onChange={e=>s('year',e.target.value)} className="bg-[#080b12] border-[#1a2030] text-[#e0dbd0] text-sm h-9"/></div>
        <div><Label className="text-[10px] text-[#5a6577] uppercase">Color</Label><Input value={f.color} onChange={e=>s('color',e.target.value)} className="bg-[#080b12] border-[#1a2030] text-[#e0dbd0] text-sm h-9"/></div>
        <div><Label className="text-[10px] text-[#5a6577] uppercase">Mileage (km)</Label><Input type="number" value={f.mileage} onChange={e=>s('mileage',e.target.value)} className="bg-[#080b12] border-[#1a2030] text-[#e0dbd0] text-sm h-9"/></div>
        <div><Label className="text-[10px] text-[#5a6577] uppercase">Category</Label>
          <Select value={f.category} onValueChange={v=>s('category',v)}><SelectTrigger className="bg-[#080b12] border-[#1a2030] text-[#e0dbd0] text-sm h-9"><SelectValue/></SelectTrigger>
            <SelectContent className="bg-[#0d1117] border-[#1e2733]"><SelectItem value="imported">Imported</SelectItem><SelectItem value="trade_in">Trade-In</SelectItem><SelectItem value="local">Local</SelectItem></SelectContent></Select>
        </div>
        <div><Label className="text-[10px] text-[#5a6577] uppercase">Selling Price ($)</Label><Input type="number" value={f.sellingPrice} onChange={e=>s('sellingPrice',e.target.value)} className="bg-[#080b12] border-[#1a2030] text-[#e0dbd0] text-sm h-9"/></div>
        <div><Label className="text-[10px] text-[#5a6577] uppercase">Purchase Price ($)</Label><Input type="number" value={f.purchasePrice} onChange={e=>s('purchasePrice',e.target.value)} className="bg-[#080b12] border-[#1a2030] text-[#e0dbd0] text-sm h-9"/></div>
      </div>

      {/* Decoded specs preview */}
      {Object.keys(specs).length > 0 && (
        <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
          <p className="text-[10px] text-emerald-400 font-medium mb-2">Auto-populated specs from VIN</p>
          <div className="grid grid-cols-2 gap-1">{Object.entries(specs).map(([k,v])=><p key={k} className="text-[10px] text-[#a0aab8]"><span className="text-[#5a6577]">{k}: </span>{v}</p>)}</div>
        </div>
      )}

      <Button onClick={()=>onAdd({id:`v${Date.now()}`,make:f.make,model:f.model,year:+f.year,vin:f.vin,category:f.category,color:f.color,mileage:+f.mileage,purchasePrice:+f.purchasePrice,sellingPrice:+f.sellingPrice,currency:'USD',status:'available',images:[],attachments:[],specs,vinDecoded:decoded})}
        className="w-full bg-[#c9a962] text-[#0d1117] hover:bg-[#d4b46e] h-10 text-sm font-medium">Add Vehicle</Button>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// ★ NEW: WISH LIST PAGE
// ═══════════════════════════════════════════════════
function WishlistPage() {
  const { wishlist, setWishlist, vehicles } = useApp();
  const [showAdd, setShowAdd] = useState(false);
  const [sel, setSel] = useState<WishlistItem|null>(null);

  const findMatches = (w: WishlistItem) => {
    return vehicles.filter(v => {
      const makeMatch = w.makes.length === 0 || w.makes.some(m => v.make.toLowerCase().includes(m.toLowerCase()));
      const yearMatch = v.year >= w.yearMin && v.year <= w.yearMax;
      const budgetMatch = v.sellingPrice >= w.budgetMin && v.sellingPrice <= w.budgetMax;
      const bodyMatch = !w.bodyType || v.specs.bodyType?.toLowerCase() === w.bodyType.toLowerCase();
      return makeMatch && yearMatch && budgetMatch && bodyMatch && v.status !== 'sold';
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><p className="text-xs text-[#5a6577]">{wishlist.length} wish list entries</p><p className="text-[10px] text-[#4a5568]">Clients describe their dream car — you match them when inventory arrives</p></div>
        <Button size="sm" onClick={()=>setShowAdd(true)} className="bg-[#c9a962] text-[#0d1117] hover:bg-[#d4b46e] h-9 text-xs gap-1"><Ic.plus size={14}/> Add Wish</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {wishlist.map(w => {
          const matches = findMatches(w);
          return (
            <Card key={w.id} className="bg-[#0d1117] border-[#1a2030] hover:border-[#2a3544] transition-all cursor-pointer" onClick={()=>setSel(w)}>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-[#f0ece2]">{w.clientName}</h3>
                      <Badge className={`text-[9px] ${sc[w.priority]}`}>{w.priority}</Badge>
                      <Badge className={`text-[9px] ${sc[w.status]} border`}>{w.status}</Badge>
                    </div>
                    <p className="text-xs text-[#5a6577] mt-0.5">{w.clientEmail}</p>
                  </div>
                  {matches.length > 0 && <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[9px] border">{matches.length} match{matches.length>1?'es':''}</Badge>}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-2 rounded bg-[#080b12] border border-[#1a2030]"><p className="text-[9px] text-[#5a6577] uppercase">Makes</p><p className="text-[10px] text-[#e0dbd0]">{w.makes.join(', ')||'Any'}</p></div>
                  <div className="p-2 rounded bg-[#080b12] border border-[#1a2030]"><p className="text-[9px] text-[#5a6577] uppercase">Budget</p><p className="text-[10px] text-[#c9a962]">{fmt(w.budgetMin)}–{fmt(w.budgetMax)}</p></div>
                  <div className="p-2 rounded bg-[#080b12] border border-[#1a2030]"><p className="text-[9px] text-[#5a6577] uppercase">Body</p><p className="text-[10px] text-[#e0dbd0]">{w.bodyType||'Any'}</p></div>
                </div>
                {w.notes && <p className="text-[10px] text-[#5a6577] italic line-clamp-2">"{w.notes}"</p>}
                {matches.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap">
                    {matches.slice(0,3).map(m=><span key={m.id} className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">{m.year} {m.make} {m.model}</span>)}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Detail Modal */}
      <Dialog open={!!sel} onOpenChange={()=>setSel(null)}>
        <DialogContent className="bg-[#0d1117] border-[#1e2733] max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-[#f0ece2]" style={{fontFamily:pf}}>{sel?.clientName}'s Wish List</DialogTitle><DialogDescription className="text-[#5a6577]">Created {sel?.createdAt}</DialogDescription></DialogHeader>
          {sel && <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <IB label="Email" value={sel.clientEmail}/><IB label="Phone" value={sel.clientPhone}/>
              <IB label="Preferred Makes" value={sel.makes.join(', ')||'Any'}/><IB label="Body Type" value={sel.bodyType||'Any'}/>
              <IB label="Year Range" value={`${sel.yearMin}–${sel.yearMax}`}/><IB label="Budget" value={`${fmt(sel.budgetMin)} – ${fmt(sel.budgetMax)}`} highlight/>
              <IB label="Color Prefs" value={sel.colorPrefs||'None'}/><IB label="Features" value={sel.features||'None'}/>
            </div>
            {sel.notes && <div className="p-3 rounded-lg bg-[#080b12] border border-[#1a2030]"><p className="text-[10px] text-[#5a6577] uppercase mb-1">Client Notes</p><p className="text-xs text-[#a0aab8]">{sel.notes}</p></div>}
            <div>
              <p className="text-xs font-medium text-[#a0aab8] mb-2">Matching Vehicles ({findMatches(sel).length})</p>
              {findMatches(sel).length === 0 ? <p className="text-xs text-[#4a5568]">No current matches. We'll notify when matching inventory arrives.</p> :
                <div className="space-y-2">{findMatches(sel).map(v=>(
                  <div key={v.id} className="flex items-center justify-between p-3 rounded-lg bg-[#080b12] border border-emerald-500/20">
                    <div><p className="text-xs font-medium text-[#e0dbd0]">{v.year} {v.make} {v.model}</p><p className="text-[10px] text-[#5a6577]">{v.color} · {v.specs.horsepower}</p></div>
                    <p className="text-sm font-bold text-[#c9a962]">{fmt(v.sellingPrice)}</p>
                  </div>
                ))}</div>
              }
            </div>
            <Select value={sel.status} onValueChange={v=>{setWishlist(p=>p.map(w=>w.id===sel.id?{...w,status:v as WishlistItem['status']}:w));setSel({...sel,status:v as WishlistItem['status']});}}>
              <SelectTrigger className="bg-[#080b12] border-[#1a2030] text-[#e0dbd0] text-sm h-9"><SelectValue/></SelectTrigger>
              <SelectContent className="bg-[#0d1117] border-[#1e2733]">{['active','matched','fulfilled','cancelled'].map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>}
        </DialogContent>
      </Dialog>

      {/* Add Wish */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="bg-[#0d1117] border-[#1e2733] max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-[#f0ece2]">Add Wish List Entry</DialogTitle><DialogDescription className="text-[#5a6577]">What's the client looking for?</DialogDescription></DialogHeader>
          <WishlistForm onAdd={w=>{setWishlist(p=>[...p,w]);setShowAdd(false);}}/>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WishlistForm({ onAdd }: { onAdd:(w:WishlistItem)=>void }) {
  const [f, setF] = useState({ clientName:'', clientEmail:'', clientPhone:'', makes:'', bodyType:'', yearMin:'2023', yearMax:'2026', budgetMin:'100000', budgetMax:'300000', colorPrefs:'', features:'', notes:'', priority:'medium' as WishlistItem['priority'] });
  const s = (k:string,v:string) => setF(p=>({...p,[k]:v}));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><Label className="text-[10px] text-[#5a6577] uppercase">Client Name</Label><Input value={f.clientName} onChange={e=>s('clientName',e.target.value)} className="bg-[#080b12] border-[#1a2030] text-[#e0dbd0] text-sm h-9"/></div>
        <div><Label className="text-[10px] text-[#5a6577] uppercase">Email</Label><Input value={f.clientEmail} onChange={e=>s('clientEmail',e.target.value)} className="bg-[#080b12] border-[#1a2030] text-[#e0dbd0] text-sm h-9"/></div>
        <div><Label className="text-[10px] text-[#5a6577] uppercase">Phone</Label><Input value={f.clientPhone} onChange={e=>s('clientPhone',e.target.value)} className="bg-[#080b12] border-[#1a2030] text-[#e0dbd0] text-sm h-9"/></div>
        <div><Label className="text-[10px] text-[#5a6577] uppercase">Priority</Label><Select value={f.priority} onValueChange={v=>s('priority',v)}><SelectTrigger className="bg-[#080b12] border-[#1a2030] text-[#e0dbd0] text-sm h-9"><SelectValue/></SelectTrigger><SelectContent className="bg-[#0d1117] border-[#1e2733]">{['low','medium','high'].map(p=><SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
      </div>
      <div><Label className="text-[10px] text-[#5a6577] uppercase">Preferred Makes (comma separated)</Label><Input value={f.makes} onChange={e=>s('makes',e.target.value)} placeholder="e.g. Mercedes-Benz, BMW, Porsche" className="bg-[#080b12] border-[#1a2030] text-[#e0dbd0] text-sm h-9"/></div>
      <div className="grid grid-cols-3 gap-3">
        <div><Label className="text-[10px] text-[#5a6577] uppercase">Body Type</Label><Select value={f.bodyType} onValueChange={v=>s('bodyType',v)}><SelectTrigger className="bg-[#080b12] border-[#1a2030] text-[#e0dbd0] text-sm h-9"><SelectValue placeholder="Any"/></SelectTrigger><SelectContent className="bg-[#0d1117] border-[#1e2733]">{['Sedan','Coupe','SUV','Convertible','Wagon'].map(b=><SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent></Select></div>
        <div><Label className="text-[10px] text-[#5a6577] uppercase">Year Min</Label><Input type="number" value={f.yearMin} onChange={e=>s('yearMin',e.target.value)} className="bg-[#080b12] border-[#1a2030] text-[#e0dbd0] text-sm h-9"/></div>
        <div><Label className="text-[10px] text-[#5a6577] uppercase">Year Max</Label><Input type="number" value={f.yearMax} onChange={e=>s('yearMax',e.target.value)} className="bg-[#080b12] border-[#1a2030] text-[#e0dbd0] text-sm h-9"/></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label className="text-[10px] text-[#5a6577] uppercase">Budget Min ($)</Label><Input type="number" value={f.budgetMin} onChange={e=>s('budgetMin',e.target.value)} className="bg-[#080b12] border-[#1a2030] text-[#e0dbd0] text-sm h-9"/></div>
        <div><Label className="text-[10px] text-[#5a6577] uppercase">Budget Max ($)</Label><Input type="number" value={f.budgetMax} onChange={e=>s('budgetMax',e.target.value)} className="bg-[#080b12] border-[#1a2030] text-[#e0dbd0] text-sm h-9"/></div>
      </div>
      <div><Label className="text-[10px] text-[#5a6577] uppercase">Color Preferences</Label><Input value={f.colorPrefs} onChange={e=>s('colorPrefs',e.target.value)} placeholder="e.g. Black, Dark Blue" className="bg-[#080b12] border-[#1a2030] text-[#e0dbd0] text-sm h-9"/></div>
      <div><Label className="text-[10px] text-[#5a6577] uppercase">Desired Features</Label><Input value={f.features} onChange={e=>s('features',e.target.value)} placeholder="e.g. V8, panoramic roof, sport seats" className="bg-[#080b12] border-[#1a2030] text-[#e0dbd0] text-sm h-9"/></div>
      <div><Label className="text-[10px] text-[#5a6577] uppercase">Notes</Label><Textarea value={f.notes} onChange={e=>s('notes',e.target.value)} className="bg-[#080b12] border-[#1a2030] text-[#e0dbd0] text-sm min-h-[60px]"/></div>
      <Button onClick={()=>onAdd({id:`w${Date.now()}`,clientName:f.clientName,clientEmail:f.clientEmail,clientPhone:f.clientPhone,makes:f.makes.split(',').map(m=>m.trim()).filter(Boolean),bodyType:f.bodyType,yearMin:+f.yearMin,yearMax:+f.yearMax,budgetMin:+f.budgetMin,budgetMax:+f.budgetMax,colorPrefs:f.colorPrefs,features:f.features,notes:f.notes,priority:f.priority,status:'active',matchedVehicleIds:[],createdAt:new Date().toISOString().split('T')[0]})}
        className="w-full bg-[#c9a962] text-[#0d1117] hover:bg-[#d4b46e] h-10 text-sm font-medium">Add to Wish List</Button>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// REMAINING PAGES (Imports, Leads, Customers, Vendors, Tasks, Settings)
// ═══════════════════════════════════════════════════
// ═══════════════════════════════════════════════════
// AUTO-TASK GENERATOR - stage transition rules
// ═══════════════════════════════════════════════════
const STAGE_TASKS: Record<ImportStage, { title: string; description: string; priority: TaskPriority; category: string; daysOffset: number }[]> = {
  sourced: [{ title: 'Verify vehicle condition report', description: 'Review pre-purchase inspection docs', priority: 'medium', category: 'Import', daysOffset: 3 }],
  purchased: [
    { title: 'Arrange shipping logistics', description: 'Contact shipping vendor for pickup coordination', priority: 'high', category: 'Logistics', daysOffset: 5 },
    { title: 'Obtain export documentation', description: 'Collect CoO, invoice, and export permit from origin', priority: 'high', category: 'Documents', daysOffset: 7 },
  ],
  shipping: [
    { title: 'Track vessel progress', description: 'Monitor shipping status and update ETA', priority: 'medium', category: 'Logistics', daysOffset: 14 },
    { title: 'Prepare customs documentation', description: 'Ready Form 42, import license, and classification docs', priority: 'high', category: 'Documents', daysOffset: 10 },
  ],
  customs: [
    { title: 'Submit customs declaration', description: 'File all required documents with customs authority', priority: 'urgent', category: 'Customs', daysOffset: 3 },
    { title: 'Coordinate with customs broker', description: 'Ensure broker has all paperwork for clearance', priority: 'high', category: 'Customs', daysOffset: 2 },
    { title: 'Schedule tax assessment appointment', description: 'Book appointment with Israeli tax authority', priority: 'high', category: 'Tax', daysOffset: 5 },
  ],
  tax_payment: [
    { title: 'Calculate total tax liability', description: 'Compute purchase tax + customs duty + VAT + green tax', priority: 'urgent', category: 'Tax', daysOffset: 3 },
    { title: 'Process tax payment', description: 'Submit payment to tax authority', priority: 'urgent', category: 'Tax', daysOffset: 5 },
  ],
  registration: [
    { title: 'Submit registration application', description: 'File with Ministry of Transport', priority: 'high', category: 'Registration', daysOffset: 5 },
    { title: 'Obtain Israeli license plates', description: 'Collect plates after registration approval', priority: 'medium', category: 'Registration', daysOffset: 10 },
  ],
  inspection: [
    { title: 'Schedule vehicle inspection', description: 'Book roadworthiness test at licensed facility', priority: 'high', category: 'Inspection', daysOffset: 3 },
    { title: 'Prepare vehicle for inspection', description: 'Ensure all safety and emissions requirements met', priority: 'medium', category: 'Inspection', daysOffset: 2 },
  ],
  delivered: [
    { title: 'Notify customer of delivery', description: 'Schedule handover appointment', priority: 'medium', category: 'Sales', daysOffset: 1 },
    { title: 'Complete final documentation', description: 'Prepare ownership transfer and warranty docs', priority: 'low', category: 'Documents', daysOffset: 3 },
  ],
};

function generateTasksForStage(importId: string, stage: ImportStage, vehicleName: string): Task[] {
  const templates = STAGE_TASKS[stage] || [];
  const today = new Date();
  return templates.map((t, i) => {
    const due = new Date(today); due.setDate(due.getDate() + t.daysOffset);
    return {
      id: `auto-${Date.now()}-${i}-${Math.random().toString(36).slice(2,5)}`,
      title: `${t.title} — ${vehicleName}`,
      description: t.description,
      assignedTo: ['Yossi', 'Dana', 'Maya'][i % 3],
      priority: t.priority,
      status: 'pending' as TaskStatus,
      dueDate: due.toISOString().split('T')[0],
      relatedTo: importId,
      category: t.category,
    };
  });
}

// ═══════════════════════════════════════════════════
// DEADLINE ALERT HELPERS
// ═══════════════════════════════════════════════════
function getDeadlineAlerts(tasks: Task[]): { overdue: Task[]; dueSoon: Task[]; upcoming: Task[] } {
  const today = new Date(); today.setHours(0,0,0,0);
  const in48h = new Date(today); in48h.setDate(in48h.getDate() + 2);
  const in7d = new Date(today); in7d.setDate(in7d.getDate() + 7);

  const active = tasks.filter(t => t.status !== 'completed');
  return {
    overdue: active.filter(t => new Date(t.dueDate) < today),
    dueSoon: active.filter(t => { const d = new Date(t.dueDate); return d >= today && d <= in48h; }),
    upcoming: active.filter(t => { const d = new Date(t.dueDate); return d > in48h && d <= in7d; }),
  };
}

// ═══════════════════════════════════════════════════
// ★ ENHANCED IMPORTS PAGE (stage transitions + Gantt)
// ═══════════════════════════════════════════════════
function ImportsPage() {
  const { imports, setImports, vehicles, tasks, setTasks, user, customers, setCustomers, setNotifications } = useApp();
  const sa = user?.role === 'super_admin';
  const [view, setView] = useState<'list' | 'gantt'>('list');
  const [transitionLog, setTransitionLog] = useState<{ id: string; impId: string; from: string; to: string; tasksCreated: number; time: string }[]>([]);

  const advanceStage = (impId: string) => {
    const imp = imports.find(i => i.id === impId);
    if (!imp) return;
    const ci = stageIdx(imp.stage);
    if (ci >= STAGES.length - 1) return;
    const nextStage = STAGES[ci + 1].key;
    const vehicle = vehicles.find(v => v.id === imp.vehicleId);
    const vName = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'Vehicle';
    const customer = vehicle?.customerId ? customers.find(c => c.id === vehicle.customerId) : null;

    // Generate tasks
    const newTasks = generateTasksForStage(impId, nextStage, vName);
    setTasks(prev => [...prev, ...newTasks]);

    // Update import
    setImports(prev => prev.map(i => {
      if (i.id !== impId) return i;
      const milestones = i.milestones.map((m, idx) =>
        idx === ci ? { ...m, completed: true, date: new Date().toISOString().split('T')[0] } : m
      );
      return { ...i, stage: nextStage, milestones };
    }));

    // ★ Auto-send WhatsApp + notifications to customer
    const stageMessages: Record<ImportStage, string> = {
      sourced: `Great news! We've located your ${vName}. The sourcing process is complete.`,
      purchased: `Your ${vName} has been purchased! We're now arranging shipping to Israel.`,
      shipping: `Your ${vName} is on its way! The vehicle has been loaded for shipping to Israel. 🚢`,
      customs: `Your ${vName} has arrived in Israel and is now going through customs clearance. 📋`,
      tax_payment: `Customs cleared! We're now processing the tax payment for your ${vName}. 🏦`,
      registration: `Tax paid! Your ${vName} is being registered with the Ministry of Transport. 📄`,
      inspection: `Almost there! Your ${vName} is scheduled for its roadworthiness inspection. 🔧`,
      delivered: `🎉 Congratulations! Your ${vName} is ready for delivery! Let's schedule your handover.`,
    };

    const msg = stageMessages[nextStage] || `Your ${vName} import status has been updated to: ${STAGES[ci+1]?.label}`;
    const now = new Date().toISOString().split('T')[0];
    const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    if (customer) {
      // Add WhatsApp message to customer communications
      setCustomers(prev => prev.map(c => {
        if (c.id !== customer.id) return c;
        return { ...c, communications: [...c.communications,
          { id: `cm-${Date.now()}`, date: now, type: 'WhatsApp' as const, channel: 'outbound' as const, summary: msg, status: 'sent' as const, automated: true },
        ]};
      }));

      // Add Email notification
      setCustomers(prev => prev.map(c => {
        if (c.id !== customer.id) return c;
        return { ...c, communications: [...c.communications,
          { id: `cm-${Date.now()}-e`, date: now, type: 'Email' as const, channel: 'outbound' as const, summary: `Import Update: ${STAGES[ci+1]?.label} — ${vName}`, status: 'sent' as const, automated: true },
        ]};
      }));

      // Push notification
      setNotifications(prev => [
        { id: `n-${Date.now()}`, type: 'whatsapp', title: `WhatsApp sent to ${customer.name}`, message: msg, recipientId: customer.id, vehicleId: vehicle?.id, time: timeStr, read: false, channel: 'WhatsApp' },
        { id: `n-${Date.now()}-e`, type: 'email', title: `Email sent to ${customer.name}`, message: `Import update notification for ${vName}`, recipientId: customer.id, vehicleId: vehicle?.id, time: timeStr, read: false, channel: 'Email' },
        ...prev,
      ]);
    }

    // System notification regardless
    setNotifications(prev => [
      { id: `n-${Date.now()}-s`, type: 'import_update', title: `${vName} → ${STAGES[ci+1]?.label}`, message: `Import advanced from ${imp.stage} to ${nextStage}. ${newTasks.length} tasks created.`, vehicleId: vehicle?.id, time: timeStr, read: false },
      ...prev,
    ]);

    // Log transition
    setTransitionLog(prev => [{
      id: `tl-${Date.now()}`, impId, from: imp.stage, to: nextStage, tasksCreated: newTasks.length,
      time: new Date().toLocaleTimeString()
    }, ...prev].slice(0, 20));
  };

  // Gantt chart helpers
  const ganttStart = new Date('2025-10-01');
  const ganttEnd = new Date('2026-07-01');
  const ganttDays = Math.ceil((ganttEnd.getTime() - ganttStart.getTime()) / 86400000);
  const monthLabels: { label: string; offset: number; width: number }[] = [];
  for (let d = new Date(ganttStart); d < ganttEnd; ) {
    const m = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const end = m < ganttEnd ? m : ganttEnd;
    const offset = Math.ceil((d.getTime() - ganttStart.getTime()) / 86400000);
    const days = Math.ceil((end.getTime() - d.getTime()) / 86400000);
    monthLabels.push({ label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), offset, width: days });
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  }

  const stageColors = ['#60a5fa','#818cf8','#a78bfa','#c084fc','#e879f9','#f472b6','#fb923c','#34d399'];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#5a6577]">{imports.length} import processes</p>
        <div className="flex rounded-lg border border-[#1a2030] overflow-hidden">
          <button onClick={() => setView('list')} className={`px-3 py-1.5 text-xs ${view === 'list' ? 'bg-[#c9a962]/10 text-[#c9a962]' : 'text-[#5a6577]'}`}>List View</button>
          <button onClick={() => setView('gantt')} className={`px-3 py-1.5 text-xs flex items-center gap-1 ${view === 'gantt' ? 'bg-[#c9a962]/10 text-[#c9a962]' : 'text-[#5a6577]'}`}><Ic.barChart size={12}/> Gantt</button>
        </div>
      </div>

      {/* Transition Log Toast */}
      {transitionLog.length > 0 && transitionLog[0] && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 animate-in">
          <Ic.zap size={14} className="text-emerald-400 flex-shrink-0"/>
          <div className="flex-1">
            <p className="text-xs text-emerald-400 font-medium">Stage advanced: {STAGES.find(s=>s.key===transitionLog[0].from)?.label} → {STAGES.find(s=>s.key===transitionLog[0].to)?.label}</p>
            <p className="text-[10px] text-emerald-400/60">{transitionLog[0].tasksCreated} tasks auto-generated at {transitionLog[0].time}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setTransitionLog([])} className="h-6 text-emerald-400/50 hover:text-emerald-400"><Ic.x size={12}/></Button>
        </div>
      )}

      {/* ═══ LIST VIEW ═══ */}
      {view === 'list' && (
        <div className="space-y-4">
          {imports.map(imp => {
            const v = vehicles.find(x => x.id === imp.vehicleId);
            const ci = stageIdx(imp.stage);
            const canAdvance = ci < STAGES.length - 1;
            const relTasks = tasks.filter(t => t.relatedTo === imp.id && t.status !== 'completed');
            return (
              <Card key={imp.id} className="bg-[#0d1117] border-[#1a2030]"><CardContent className="p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-[#f0ece2]" style={{ fontFamily: pf }}>{v?.year} {v?.make} {v?.model}</h3>
                    <p className="text-xs text-[#5a6577]">Origin: {imp.originCountry} · ETA: {imp.estimatedArrival}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {sa && <div className="flex gap-3 text-xs mr-3">
                      <span className="text-[#5a6577]">Cost: <span className="text-[#e0dbd0] font-medium">{fmt(imp.totalCost)}</span></span>
                      <span className="text-[#5a6577]">Tax: <span className="text-[#e0dbd0] font-medium">{fmt(imp.taxAmount)}</span></span>
                    </div>}
                    {canAdvance && (
                      <Button size="sm" onClick={() => advanceStage(imp.id)}
                        className="bg-gradient-to-r from-emerald-600 to-emerald-500 text-white hover:from-emerald-500 hover:to-emerald-400 h-8 text-xs gap-1 shadow-lg shadow-emerald-500/20">
                        <Ic.arrowRight size={13}/> Advance to {STAGES[ci + 1].label}
                      </Button>
                    )}
                  </div>
                </div>
                <ImportTimeline imp={imp}/>
                {relTasks.length > 0 && (
                  <div>
                    <p className="text-[10px] text-[#5a6577] uppercase tracking-wider mb-1.5">Active Tasks ({relTasks.length})</p>
                    <div className="flex gap-2 flex-wrap">
                      {relTasks.slice(0, 4).map(t => (
                        <div key={t.id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#080b12] border border-[#1a2030] text-[10px]">
                          <Badge className={`text-[8px] px-1 ${sc[t.priority]}`}>{t.priority[0].toUpperCase()}</Badge>
                          <span className="text-[#a0aab8] max-w-[150px] truncate">{t.title.split('—')[0]}</span>
                          <span className="text-[#3a4556]">·</span>
                          <span className="text-[#5a6577]">{t.dueDate}</span>
                        </div>
                      ))}
                      {relTasks.length > 4 && <span className="text-[10px] text-[#4a5568] self-center">+{relTasks.length - 4} more</span>}
                    </div>
                  </div>
                )}
                <div className="flex gap-2 flex-wrap">
                  {imp.documents.map((d, i) => <div key={i} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#080b12] border border-[#1a2030] text-xs text-[#a0aab8]"><Ic.file size={12} className="text-[#c9a962]"/>{d.name}</div>)}
                </div>
              </CardContent></Card>
            );
          })}
        </div>
      )}

      {/* ═══ GANTT VIEW ═══ */}
      {view === 'gantt' && (
        <Card className="bg-[#0d1117] border-[#1a2030]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-[#e0dbd0] flex items-center gap-2"><Ic.barChart size={14} className="text-[#c9a962]"/> Import Timeline — Gantt View</CardTitle>
            <CardDescription className="text-[#5a6577] text-xs">Visualize overlapping import processes across vehicles</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <div style={{ minWidth: '800px' }}>
                {/* Month headers */}
                <div className="flex mb-1 border-b border-[#1a2030] pb-1">
                  <div className="w-48 flex-shrink-0"></div>
                  <div className="flex-1 relative h-5">
                    {monthLabels.map((m, i) => (
                      <div key={i} className="absolute text-[9px] text-[#5a6577] font-medium"
                        style={{ left: `${(m.offset / ganttDays) * 100}%`, width: `${(m.width / ganttDays) * 100}%` }}>
                        {m.label}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Today marker label */}
                <div className="flex mb-1">
                  <div className="w-48 flex-shrink-0"></div>
                  <div className="flex-1 relative h-3">
                    {(() => {
                      const todayOffset = (new Date().getTime() - ganttStart.getTime()) / 86400000;
                      const pct = (todayOffset / ganttDays) * 100;
                      if (pct < 0 || pct > 100) return null;
                      return <div className="absolute h-full" style={{ left: `${pct}%` }}><div className="w-0.5 h-full bg-red-500/60"/></div>;
                    })()}
                  </div>
                </div>

                {/* Bars per import */}
                {imports.map((imp) => {
                  const v = vehicles.find(x => x.id === imp.vehicleId);
                  const completedMilestones = imp.milestones.filter(m => m.completed && m.date);
                  const firstDate = completedMilestones.length > 0 ? new Date(completedMilestones[0].date) : new Date();
                  const eta = new Date(imp.estimatedArrival);
                  const startPct = Math.max(0, ((firstDate.getTime() - ganttStart.getTime()) / 86400000 / ganttDays) * 100);
                  const endPct = Math.min(100, ((eta.getTime() - ganttStart.getTime()) / 86400000 / ganttDays) * 100);
                  const width = endPct - startPct;
                  const progressPct = stageProgress(imp.stage);
                  const ci = stageIdx(imp.stage);

                  return (
                    <div key={imp.id} className="flex items-center mb-2 group">
                      <div className="w-48 flex-shrink-0 pr-3">
                        <p className="text-xs font-medium text-[#e0dbd0] truncate">{v?.make} {v?.model}</p>
                        <p className="text-[9px] text-[#4a5568]">{STAGES[ci]?.label} · {imp.originCountry}</p>
                      </div>
                      <div className="flex-1 relative h-8">
                        {/* Grid lines */}
                        <div className="absolute inset-0 flex">
                          {monthLabels.map((m, i) => <div key={i} className="border-l border-[#1a2030]/50" style={{ width: `${(m.width / ganttDays) * 100}%` }}/>)}
                        </div>
                        {/* Bar background */}
                        <div className="absolute rounded-md bg-[#1a2030]/50 h-6 top-1" style={{ left: `${startPct}%`, width: `${width}%` }}>
                          {/* Progress fill */}
                          <div className="h-full rounded-md transition-all" style={{ width: `${progressPct}%`, background: `linear-gradient(90deg, ${stageColors[ci]}, ${stageColors[Math.min(ci+1, 7)]})`, opacity: 0.8 }}/>
                          {/* Stage markers */}
                          {completedMilestones.map((m, mi) => {
                            const mDate = new Date(m.date);
                            const mPct = ((mDate.getTime() - firstDate.getTime()) / (eta.getTime() - firstDate.getTime())) * 100;
                            return <div key={mi} className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-white/60" style={{ left: `${mPct}%` }}/>;
                          })}
                          {/* Label inside bar */}
                          <div className="absolute inset-0 flex items-center px-2">
                            <span className="text-[8px] text-white/70 font-medium truncate">{v?.year} {v?.make} {v?.model}</span>
                          </div>
                        </div>
                        {/* Today line */}
                        {(() => {
                          const todayPct = ((new Date().getTime() - ganttStart.getTime()) / 86400000 / ganttDays) * 100;
                          if (todayPct < 0 || todayPct > 100) return null;
                          return <div className="absolute top-0 bottom-0 w-0.5 bg-red-500/40" style={{ left: `${todayPct}%` }}/>;
                        })()}
                      </div>
                    </div>
                  );
                })}

                {/* Legend */}
                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[#1a2030]">
                  <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-red-500/60"/><span className="text-[9px] text-[#5a6577]">Today</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-white/60"/><span className="text-[9px] text-[#5a6577]">Milestone</span></div>
                  {STAGES.slice(0, 5).map((s, i) => <div key={s.key} className="flex items-center gap-1"><div className="w-3 h-2 rounded-sm" style={{ background: stageColors[i] }}/><span className="text-[8px] text-[#4a5568]">{s.label}</span></div>)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function LeadsPage() {
  const { leads, setLeads } = useApp();
  const [showAdd, setShowAdd] = useState(false);
  const [sel, setSel] = useState<Lead|null>(null);
  const statuses: LeadStatus[] = ['new','contacted','qualified','negotiation','won','lost'];
  return <div className="space-y-5">
    <div className="flex items-center justify-between"><p className="text-xs text-[#5a6577]">{leads.length} leads</p><Button size="sm" onClick={()=>setShowAdd(true)} className="bg-[#c9a962] text-[#0d1117] hover:bg-[#d4b46e] h-9 text-xs gap-1"><Ic.plus size={14}/> Add</Button></div>
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">{statuses.map(status=>{const sl=leads.filter(l=>l.status===status);return<div key={status} className="space-y-2"><div className="flex items-center justify-between px-1"><Badge className={`text-[9px] ${sc[status]} border`}>{status}</Badge><span className="text-[10px] text-[#4a5568]">{sl.length}</span></div><div className="space-y-2">{sl.map(l=><Card key={l.id} className="bg-[#0d1117] border-[#1a2030] hover:border-[#2a3544] cursor-pointer transition-all" onClick={()=>setSel(l)}><CardContent className="p-3 space-y-1"><p className="text-xs font-medium text-[#e0dbd0]">{l.name}</p><p className="text-[10px] text-[#5a6577]">{l.interestedIn}</p><p className="text-[10px] font-medium text-[#c9a962]">{fmt(l.budget)}</p></CardContent></Card>)}</div></div>;})}</div>
    <Dialog open={!!sel} onOpenChange={()=>setSel(null)}><DialogContent className="bg-[#0d1117] border-[#1e2733] max-w-md"><DialogHeader><DialogTitle className="text-[#f0ece2]">{sel?.name}</DialogTitle><DialogDescription className="text-[#5a6577]">Lead</DialogDescription></DialogHeader>{sel&&<div className="space-y-3"><div className="grid grid-cols-2 gap-3"><IB label="Email" value={sel.email}/><IB label="Phone" value={sel.phone}/><IB label="Source" value={sel.source}/><IB label="Budget" value={fmt(sel.budget)}/></div><Select value={sel.status} onValueChange={v=>{setLeads(p=>p.map(l=>l.id===sel.id?{...l,status:v as LeadStatus}:l));setSel({...sel,status:v as LeadStatus});}}><SelectTrigger className="bg-[#080b12] border-[#1a2030] text-[#e0dbd0] text-sm h-9"><SelectValue/></SelectTrigger><SelectContent className="bg-[#0d1117] border-[#1e2733]">{statuses.map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>}</DialogContent></Dialog>
    <Dialog open={showAdd} onOpenChange={setShowAdd}><DialogContent className="bg-[#0d1117] border-[#1e2733] max-w-md"><DialogHeader><DialogTitle className="text-[#f0ece2]">Add Lead</DialogTitle><DialogDescription className="text-[#5a6577]">New lead</DialogDescription></DialogHeader><LeadForm onAdd={l=>{setLeads(p=>[...p,l]);setShowAdd(false);}}/></DialogContent></Dialog>
  </div>;
}

function LeadForm({ onAdd }:{ onAdd:(l:Lead)=>void }) {
  const [f,setF]=useState({name:'',email:'',phone:'',source:'',interestedIn:'',budget:'0',notes:''});const s=(k:string,v:string)=>setF(p=>({...p,[k]:v}));
  return <div className="space-y-3"><div className="grid grid-cols-2 gap-3">{[['Name','name'],['Email','email'],['Phone','phone'],['Source','source'],['Interested In','interestedIn'],['Budget ($)','budget']].map(([l,k])=><div key={k}><Label className="text-[10px] text-[#5a6577] uppercase">{l}</Label><Input value={(f as any)[k]} onChange={e=>s(k,e.target.value)} type={k==='budget'?'number':'text'} className="bg-[#080b12] border-[#1a2030] text-[#e0dbd0] text-sm h-9"/></div>)}</div>
    <Button onClick={()=>onAdd({id:`l${Date.now()}`,...f,budget:+f.budget,status:'new',createdAt:new Date().toISOString().split('T')[0],lastContact:new Date().toISOString().split('T')[0]})} className="w-full bg-[#c9a962] text-[#0d1117] hover:bg-[#d4b46e] h-9 text-sm">Add</Button></div>;
}

function CustomersPage() {
  const { customers, setCustomers, vehicles } = useApp();
  const [sel, setSel] = useState<Customer|null>(null);
  const [msgType, setMsgType] = useState<'WhatsApp'|'Email'|'SMS'>('WhatsApp');
  const [msgText, setMsgText] = useState('');
  const [showCompose, setShowCompose] = useState(false);

  const sendMessage = (custId: string) => {
    if (!msgText.trim()) return;
    setCustomers(prev => prev.map(c => c.id !== custId ? c : {
      ...c, communications: [...c.communications, {
        id: `cm-${Date.now()}`, date: new Date().toISOString().split('T')[0], type: msgType, channel: 'outbound' as const,
        summary: msgText.trim(), status: 'sent' as const, automated: false,
      }],
    }));
    setMsgText(''); setShowCompose(false);
    setSel(prev => prev ? customers.find(c => c.id === prev.id) || prev : prev);
  };

  const typeIcons: Record<string, any> = { WhatsApp: Ic.whatsapp, Email: Ic.mail, SMS: Ic.phone, Call: Ic.phone, Meeting: Ic.users };
  const typeColors: Record<string, string> = { WhatsApp:'bg-green-500/10 text-green-400 border-green-500/20', Email:'bg-sky-500/10 text-sky-400 border-sky-500/20', SMS:'bg-violet-500/10 text-violet-400 border-violet-500/20', Call:'bg-amber-500/10 text-amber-400 border-amber-500/20', Meeting:'bg-[#c9a962]/10 text-[#c9a962] border-[#c9a962]/20' };

  return (
    <div className="space-y-5">
      <p className="text-xs text-[#5a6577]">{customers.length} customers</p>
      {customers.map(c => {
        const cvs = vehicles.filter(v => c.vehicleIds.includes(v.id));
        const recentComms = [...c.communications].sort((a,b) => b.date.localeCompare(a.date));
        const isSel = sel?.id === c.id;
        return (
          <Card key={c.id} className={`bg-[#0d1117] border-[#1a2030] transition-all ${isSel ? 'border-[#c9a962]/30' : ''}`}>
            <CardContent className="p-5">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 cursor-pointer" onClick={() => setSel(isSel ? null : c)}>
                <div className="flex items-start gap-4">
                  <Avatar className="h-12 w-12 border border-[#2a3544]"><AvatarFallback className="bg-gradient-to-br from-[#c9a962] to-[#8b6f3a] text-[#0d1117] font-bold text-sm">{c.name.split(' ').map(n=>n[0]).join('')}</AvatarFallback></Avatar>
                  <div>
                    <h3 className="text-sm font-semibold text-[#f0ece2]">{c.name}</h3>
                    <p className="text-xs text-[#5a6577]">{c.email} · {c.phone}</p>
                    <div className="flex gap-1.5 mt-1">{cvs.map(v => <Badge key={v.id} className="text-[8px] bg-[#121824] text-[#6a7589] border-[#1a2030]">{v.make} {v.model}</Badge>)}</div>
                  </div>
                </div>
                <div className="text-right"><p className="text-[10px] text-[#5a6577] uppercase">Total Spent</p><p className="text-lg font-bold text-[#c9a962]" style={{fontFamily:pf}}>{fmt(c.totalSpent)}</p>
                  <p className="text-[10px] text-[#4a5568] mt-0.5">{c.communications.length} messages</p>
                </div>
              </div>

              {/* Expanded Communication Hub */}
              {isSel && (
                <div className="mt-4 space-y-4">
                  <Separator className="bg-[#1a2030]"/>

                  {/* Quick actions */}
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => { setShowCompose(true); setMsgType('WhatsApp'); }} className="bg-green-600/20 text-green-400 hover:bg-green-600/30 h-8 text-xs gap-1 border border-green-600/30"><Ic.whatsapp size={13}/> WhatsApp</Button>
                    <Button size="sm" onClick={() => { setShowCompose(true); setMsgType('Email'); }} className="bg-sky-600/20 text-sky-400 hover:bg-sky-600/30 h-8 text-xs gap-1 border border-sky-600/30"><Ic.mail size={13}/> Email</Button>
                    <Button size="sm" onClick={() => { setShowCompose(true); setMsgType('SMS'); }} className="bg-violet-600/20 text-violet-400 hover:bg-violet-600/30 h-8 text-xs gap-1 border border-violet-600/30"><Ic.phone size={13}/> SMS</Button>
                  </div>

                  {/* Compose panel */}
                  {showCompose && (
                    <div className="p-4 rounded-xl bg-[#080b12] border border-[#c9a962]/20 space-y-3">
                      <div className="flex items-center gap-2">
                        {msgType === 'WhatsApp' && <Ic.whatsapp size={14} className="text-green-400"/>}
                        {msgType === 'Email' && <Ic.mail size={14} className="text-sky-400"/>}
                        {msgType === 'SMS' && <Ic.phone size={14} className="text-violet-400"/>}
                        <p className="text-xs font-medium text-[#e0dbd0]">Send {msgType} to {c.name}</p>
                        <span className="text-[10px] text-[#5a6577] ml-auto">{c.phone}</span>
                      </div>
                      <Textarea value={msgText} onChange={e => setMsgText(e.target.value)} placeholder={`Type your ${msgType} message...`} className="bg-[#0d1117] border-[#1a2030] text-[#e0dbd0] text-sm min-h-[80px]"/>
                      {/* Template buttons */}
                      <div className="flex gap-1.5 flex-wrap">
                        {['Your vehicle status has been updated', 'Please submit your documents at your earliest convenience', 'Your import is progressing on schedule', 'Let\'s schedule a call to discuss'].map(t => (
                          <button key={t} onClick={() => setMsgText(t)} className="text-[9px] px-2 py-1 rounded-full bg-[#121824] text-[#5a6577] border border-[#1a2030] hover:border-[#2a3544] hover:text-[#a0aab8] transition-all">{t.slice(0,35)}...</button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => sendMessage(c.id)} disabled={!msgText.trim()} className="bg-[#c9a962] text-[#0d1117] hover:bg-[#d4b46e] h-8 text-xs gap-1 disabled:opacity-40"><Ic.send size={12}/> Send</Button>
                        <Button size="sm" variant="ghost" onClick={() => { setShowCompose(false); setMsgText(''); }} className="h-8 text-xs text-[#6a7589]">Cancel</Button>
                      </div>
                    </div>
                  )}

                  {/* Communication timeline */}
                  <div>
                    <p className="text-xs font-medium text-[#6a7589] mb-2">Communication History ({c.communications.length})</p>
                    <ScrollArea className="h-[280px]">
                      <div className="space-y-2">
                        {recentComms.map(m => {
                          const TIcon = typeIcons[m.type] || Ic.msgSquare;
                          return (
                            <div key={m.id} className={`p-3 rounded-lg bg-[#080b12] border border-[#1a2030] ${m.channel === 'inbound' ? 'ml-0 mr-8' : 'ml-8 mr-0'}`}>
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-1.5">
                                  <Badge className={`text-[8px] px-1.5 border ${typeColors[m.type] || typeColors.Call}`}><TIcon size={9} className="inline mr-0.5"/> {m.type}</Badge>
                                  {m.automated && <Badge className="text-[7px] bg-[#121824] text-[#4a5568] border-[#1a2030]">Auto</Badge>}
                                  <Badge className="text-[7px] bg-[#0d1117] text-[#3a4556] border-[#1a2030]">{m.channel}</Badge>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className={`text-[8px] ${m.status === 'read' ? 'text-green-400' : m.status === 'delivered' ? 'text-sky-400' : m.status === 'sent' ? 'text-amber-400' : 'text-[#4a5568]'}`}>● {m.status}</span>
                                  <span className="text-[9px] text-[#4a5568]">{m.date}</span>
                                </div>
                              </div>
                              <p className="text-[11px] text-[#a0aab8]">{m.summary}</p>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function VendorsPage() {
  const { vendors } = useApp();
  return <div className="space-y-5"><div className="grid grid-cols-1 md:grid-cols-2 gap-4">{vendors.map(v=><Card key={v.id} className="bg-[#0d1117] border-[#1a2030]"><CardContent className="p-5 space-y-3">
    <div className="flex items-start justify-between"><div><h3 className="text-sm font-semibold text-[#f0ece2]">{v.name}</h3><p className="text-xs text-[#5a6577]">{v.service} · {v.country}</p></div><div className="flex gap-0.5">{Array.from({length:5}).map((_,i)=><span key={i} className={`text-xs ${i<v.rating?'text-[#c9a962]':'text-[#2a3544]'}`}>★</span>)}</div></div>
    <Separator className="bg-[#1a2030]"/>
    <div className="grid grid-cols-2 gap-2"><div className="flex items-center gap-1.5 text-xs text-[#a0aab8]"><Ic.user size={12} className="text-[#5a6577]"/>{v.contactName}</div><div className="flex items-center gap-1.5 text-xs text-[#a0aab8]"><Ic.mail size={12} className="text-[#5a6577]"/>{v.email}</div></div>
  </CardContent></Card>)}</div></div>;
}

function TasksPage() {
  const { tasks, setTasks } = useApp();
  const [filter, setFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const alerts = getDeadlineAlerts(tasks);
  const filtered = tasks.filter(t => filter === 'all' || t.status === filter || t.priority === filter);

  // Auto-mark overdue
  const today = new Date().toISOString().split('T')[0];
  const withOverdue = filtered.map(t => {
    if (t.status !== 'completed' && t.dueDate < today && t.status !== 'overdue') return { ...t, status: 'overdue' as TaskStatus };
    return t;
  });

  return (
    <div className="space-y-5">
      {/* ── Deadline Alerts ── */}
      {(alerts.overdue.length > 0 || alerts.dueSoon.length > 0) && (
        <div className="space-y-2">
          {alerts.overdue.length > 0 && (
            <div className="flex items-start gap-3 p-3 rounded-xl bg-red-500/5 border border-red-500/20">
              <Ic.alertTri size={16} className="text-red-400 mt-0.5 flex-shrink-0"/>
              <div className="flex-1">
                <p className="text-xs font-medium text-red-400">{alerts.overdue.length} overdue task{alerts.overdue.length > 1 ? 's' : ''}</p>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {alerts.overdue.map(t => (
                    <span key={t.id} className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-300 border border-red-500/20">{t.title.split('—')[0].trim()} · due {t.dueDate}</span>
                  ))}
                </div>
              </div>
            </div>
          )}
          {alerts.dueSoon.length > 0 && (
            <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
              <Ic.alarm size={16} className="text-amber-400 mt-0.5 flex-shrink-0"/>
              <div className="flex-1">
                <p className="text-xs font-medium text-amber-400">{alerts.dueSoon.length} task{alerts.dueSoon.length > 1 ? 's' : ''} due within 48 hours</p>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {alerts.dueSoon.map(t => (
                    <span key={t.id} className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">{t.title.split('—')[0].trim()} · {t.dueDate}</span>
                  ))}
                </div>
              </div>
            </div>
          )}
          {alerts.upcoming.length > 0 && (
            <div className="flex items-center gap-3 p-2.5 rounded-xl bg-sky-500/5 border border-sky-500/15">
              <Ic.alarm size={14} className="text-sky-400 flex-shrink-0"/>
              <p className="text-xs text-sky-400">{alerts.upcoming.length} task{alerts.upcoming.length > 1 ? 's' : ''} due within 7 days</p>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-1.5 flex-wrap">
          {['all', 'pending', 'in_progress', 'overdue', 'completed'].map(f => (
            <Button key={f} variant="ghost" size="sm" onClick={() => setFilter(f)}
              className={`text-xs h-7 ${filter === f ? 'bg-[#c9a962]/10 text-[#c9a962]' : 'text-[#6a7589]'}`}>
              {f.replace('_', ' ')}
              {f === 'overdue' && alerts.overdue.length > 0 && <span className="ml-1 w-4 h-4 rounded-full bg-red-500 text-[9px] text-white flex items-center justify-center">{alerts.overdue.length}</span>}
            </Button>
          ))}
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)} className="bg-[#c9a962] text-[#0d1117] hover:bg-[#d4b46e] h-8 text-xs gap-1"><Ic.plus size={14}/> Add</Button>
      </div>

      <div className="rounded-xl border border-[#1a2030] overflow-hidden">
        <Table>
          <TableHeader><TableRow className="border-[#1a2030] hover:bg-transparent">
            <TableHead className="text-[10px] text-[#5a6577] uppercase font-medium">Task</TableHead>
            <TableHead className="text-[10px] text-[#5a6577] uppercase font-medium">Priority</TableHead>
            <TableHead className="text-[10px] text-[#5a6577] uppercase font-medium">Status</TableHead>
            <TableHead className="text-[10px] text-[#5a6577] uppercase font-medium">Due</TableHead>
            <TableHead className="text-[10px] text-[#5a6577] uppercase font-medium w-[60px]"></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {withOverdue.map(t => {
              const isOverdue = t.status === 'overdue';
              const isDueSoon = !isOverdue && t.status !== 'completed' && alerts.dueSoon.some(a => a.id === t.id);
              return (
                <TableRow key={t.id} className={`border-[#1a2030] ${isOverdue ? 'bg-red-500/3' : isDueSoon ? 'bg-amber-500/3' : ''} hover:bg-[#0d1117]/50`}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {isOverdue && <Ic.alertTri size={11} className="text-red-400 flex-shrink-0"/>}
                      {isDueSoon && <Ic.alarm size={11} className="text-amber-400 flex-shrink-0"/>}
                      <div><p className="text-xs font-medium text-[#e0dbd0]">{t.title}</p><p className="text-[10px] text-[#4a5568]">{t.assignedTo} · {t.category}</p></div>
                    </div>
                  </TableCell>
                  <TableCell><Badge className={`text-[9px] ${sc[t.priority]}`}>{t.priority}</Badge></TableCell>
                  <TableCell>
                    <Select value={t.status} onValueChange={v => setTasks(p => p.map(x => x.id === t.id ? { ...x, status: v as TaskStatus } : x))}>
                      <SelectTrigger className={`h-7 bg-transparent border-[#1a2030] text-xs w-[100px] ${isOverdue ? 'text-red-400' : ''}`}><SelectValue/></SelectTrigger>
                      <SelectContent className="bg-[#0d1117] border-[#1e2733]">{(['pending', 'in_progress', 'completed', 'overdue'] as TaskStatus[]).map(s => <SelectItem key={s} value={s} className="text-xs">{s.replace('_', ' ')}</SelectItem>)}</SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <span className={`text-xs ${isOverdue ? 'text-red-400 font-medium' : isDueSoon ? 'text-amber-400' : 'text-[#a0aab8]'}`}>{t.dueDate}</span>
                  </TableCell>
                  <TableCell><Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-[#5a6577] hover:text-red-400" onClick={() => setTasks(p => p.filter(x => x.id !== t.id))}><Ic.trash size={13}/></Button></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={showAdd} onOpenChange={setShowAdd}><DialogContent className="bg-[#0d1117] border-[#1e2733] max-w-md"><DialogHeader><DialogTitle className="text-[#f0ece2]">Add Task</DialogTitle><DialogDescription className="text-[#5a6577]">New task</DialogDescription></DialogHeader>
        <TaskForm onAdd={t => { setTasks(p => [...p, t]); setShowAdd(false); }}/></DialogContent></Dialog>
    </div>
  );
}

function TaskForm({ onAdd }:{ onAdd:(t:Task)=>void }) {
  const [f,setF]=useState({title:'',description:'',assignedTo:'',priority:'medium' as TaskPriority,dueDate:'',category:'General'});const s=(k:string,v:string)=>setF(p=>({...p,[k]:v}));
  return <div className="space-y-3"><div><Label className="text-[10px] text-[#5a6577] uppercase">Title</Label><Input value={f.title} onChange={e=>s('title',e.target.value)} className="bg-[#080b12] border-[#1a2030] text-[#e0dbd0] text-sm h-9"/></div>
    <div className="grid grid-cols-2 gap-3"><div><Label className="text-[10px] text-[#5a6577] uppercase">Assigned</Label><Input value={f.assignedTo} onChange={e=>s('assignedTo',e.target.value)} className="bg-[#080b12] border-[#1a2030] text-[#e0dbd0] text-sm h-9"/></div><div><Label className="text-[10px] text-[#5a6577] uppercase">Due</Label><Input type="date" value={f.dueDate} onChange={e=>s('dueDate',e.target.value)} className="bg-[#080b12] border-[#1a2030] text-[#e0dbd0] text-sm h-9"/></div></div>
    <Button onClick={()=>onAdd({id:`t${Date.now()}`,...f,status:'pending',relatedTo:''})} className="w-full bg-[#c9a962] text-[#0d1117] hover:bg-[#d4b46e] h-9 text-sm">Add</Button></div>;
}

// ═══════════════════════════════════════════════════
// ★ CUSTOM FIELDS: Reusable Renderer + Editor
// ═══════════════════════════════════════════════════
function CustomFieldsView({ objectType, data }: { objectType: ObjectType; data?: Record<string, any> }) {
  const { customFields } = useApp();
  const fields = customFields.filter(f => f.objectType === objectType && f.visible).sort((a, b) => a.order - b.order);
  if (fields.length === 0 || !data) return null;
  const hasValues = fields.some(f => data[f.fieldKey] !== undefined && data[f.fieldKey] !== '');
  if (!hasValues) return null;
  return (
    <div>
      <p className="text-[10px] text-[#5a6577] uppercase tracking-wider mb-1.5 flex items-center gap-1.5"><Ic.layers size={10} className="text-[#c9a962]"/> Custom Fields</p>
      <div className="grid grid-cols-2 gap-2">
        {fields.map(f => {
          const val = data[f.fieldKey];
          if (val === undefined || val === '') return null;
          return <div key={f.id} className="p-2 rounded bg-[#080b12] border border-[#1a2030]">
            <p className="text-[10px] text-[#5a6577] uppercase">{f.label}</p>
            <p className="text-xs text-[#e0dbd0] mt-0.5">{String(val)}</p>
          </div>;
        })}
      </div>
    </div>
  );
}

function CustomFieldsEditor({ objectType, data, onChange }: { objectType: ObjectType; data: Record<string, any>; onChange: (d: Record<string, any>) => void }) {
  const { customFields } = useApp();
  const fields = customFields.filter(f => f.objectType === objectType && f.visible).sort((a, b) => a.order - b.order);
  if (fields.length === 0) return null;
  const inp = "bg-[#080b12] border-[#1a2030] text-[#e0dbd0] text-sm h-9 focus:border-[#c9a962]/50";
  return (
    <div className="p-4 rounded-xl bg-[#080b12] border border-[#1a2030] space-y-3">
      <p className="text-xs font-medium text-[#a0aab8] flex items-center gap-1.5"><Ic.layers size={12} className="text-[#c9a962]"/> Custom Fields</p>
      <div className="grid grid-cols-2 gap-3">
        {fields.map(f => (
          <div key={f.id}>
            <Label className="text-[10px] text-[#5a6577] uppercase">{f.label}{f.required && <span className="text-red-400 ml-0.5">*</span>}</Label>
            {f.fieldType === 'text' && <Input value={data[f.fieldKey] || ''} onChange={e => onChange({ ...data, [f.fieldKey]: e.target.value })} className={inp}/>}
            {f.fieldType === 'number' && <Input type="number" value={data[f.fieldKey] || ''} onChange={e => onChange({ ...data, [f.fieldKey]: e.target.value })} className={inp}/>}
            {f.fieldType === 'date' && <Input type="date" value={data[f.fieldKey] || ''} onChange={e => onChange({ ...data, [f.fieldKey]: e.target.value })} className={inp}/>}
            {f.fieldType === 'select' && (
              <Select value={data[f.fieldKey] || ''} onValueChange={v => onChange({ ...data, [f.fieldKey]: v })}>
                <SelectTrigger className={inp}><SelectValue placeholder="Select..."/></SelectTrigger>
                <SelectContent className="bg-[#0d1117] border-[#1e2733]">
                  {(f.options || []).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// ★ SETTINGS PAGE (with Custom Fields Builder)
// ═══════════════════════════════════════════════════
function SettingsPage() {
  const { user, customFields, setCustomFields } = useApp();
  const sa = user?.role === 'super_admin';
  const [settingsTab, setSettingsTab] = useState<'general' | 'custom_fields'>('general');
  const [editObj, setEditObj] = useState<ObjectType>('vehicle');
  const [showAddField, setShowAddField] = useState(false);
  const [newField, setNewField] = useState({ label: '', fieldKey: '', fieldType: 'text' as CustomFieldDef['fieldType'], options: '', required: false });
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const objFields = customFields.filter(f => f.objectType === editObj).sort((a, b) => a.order - b.order);
  const objectTypes: { key: ObjectType; label: string; icon: any }[] = [
    { key: 'vehicle', label: 'Vehicle', icon: Ic.car },
    { key: 'lead', label: 'Lead', icon: Ic.user },
    { key: 'customer', label: 'Customer', icon: Ic.users },
    { key: 'vendor', label: 'Vendor', icon: Ic.box },
    { key: 'task', label: 'Task', icon: Ic.check },
  ];

  const addField = () => {
    if (!newField.label.trim()) return;
    const key = newField.fieldKey.trim() || newField.label.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
    const field: CustomFieldDef = {
      id: `cf-${crypto.randomUUID()}`, objectType: editObj, label: newField.label.trim(), fieldKey: key,
      fieldType: newField.fieldType, options: newField.fieldType === 'select' ? newField.options.split(',').map(o => o.trim()).filter(Boolean) : undefined,
      required: newField.required, order: objFields.length, visible: true,
    };
    setCustomFields(prev => [...prev, field]);
    setNewField({ label: '', fieldKey: '', fieldType: 'text', options: '', required: false });
    setShowAddField(false);
  };

  const removeField = (id: string) => setCustomFields(prev => prev.filter(f => f.id !== id));
  const toggleVisible = (id: string) => setCustomFields(prev => prev.map(f => f.id === id ? { ...f, visible: !f.visible } : f));

  // Drag-and-drop reorder
  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => { e.preventDefault(); setDragOverIdx(idx); };
  const handleDrop = (idx: number) => {
    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setDragOverIdx(null); return; }
    const reordered = [...objFields];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(idx, 0, moved);
    const updated = reordered.map((f, i) => ({ ...f, order: i }));
    setCustomFields(prev => [...prev.filter(f => f.objectType !== editObj), ...updated]);
    setDragIdx(null); setDragOverIdx(null);
  };

  const fieldTypeIcons: Record<string, string> = { text: 'Aa', number: '#', select: '▾', date: '📅' };
  const inp = "bg-[#080b12] border-[#1a2030] text-[#e0dbd0] text-sm h-9 focus:border-[#c9a962]/50";

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-lg bg-[#080b12] border border-[#1a2030] max-w-md">
        <button onClick={() => setSettingsTab('general')} className={`flex-1 py-2 px-3 rounded-md text-xs font-medium transition-all ${settingsTab === 'general' ? 'bg-[#c9a962]/10 text-[#c9a962]' : 'text-[#5a6577]'}`}><Ic.gear size={12} className="inline mr-1.5"/> General</button>
        {sa && <button onClick={() => setSettingsTab('custom_fields')} className={`flex-1 py-2 px-3 rounded-md text-xs font-medium transition-all ${settingsTab === 'custom_fields' ? 'bg-[#c9a962]/10 text-[#c9a962]' : 'text-[#5a6577]'}`}><Ic.layers size={12} className="inline mr-1.5"/> Custom Fields</button>}
      </div>

      {/* General tab */}
      {settingsTab === 'general' && (
        <div className="max-w-2xl space-y-6">
          <Card className="bg-[#0d1117] border-[#1a2030]"><CardHeader><CardTitle className="text-sm text-[#e0dbd0]">General</CardTitle></CardHeader><CardContent className="space-y-4">
            <div className="flex items-center justify-between"><div><p className="text-xs text-[#e0dbd0]">Email Notifications</p></div><Switch/></div>
            <Separator className="bg-[#1a2030]"/>
            <div className="flex items-center justify-between"><div><p className="text-xs text-[#e0dbd0]">Dual Currency (USD + NIS)</p></div><Switch defaultChecked/></div>
          </CardContent></Card>
          <Card className="bg-[#0d1117] border-[#1a2030]"><CardHeader><CardTitle className="text-sm text-[#e0dbd0]">Israeli Tax Config</CardTitle></CardHeader><CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3"><div><Label className="text-[10px] text-[#5a6577] uppercase">Purchase Tax (%)</Label><Input defaultValue="83" className={inp}/></div><div><Label className="text-[10px] text-[#5a6577] uppercase">VAT (%)</Label><Input defaultValue="17" className={inp}/></div></div>
            <Button className="bg-[#c9a962] text-[#0d1117] hover:bg-[#d4b46e] h-9 text-xs">Save</Button>
          </CardContent></Card>
        </div>
      )}

      {/* Custom Fields Builder tab */}
      {settingsTab === 'custom_fields' && sa && (
        <div className="max-w-3xl space-y-5">
          <Card className="bg-[#0d1117] border-[#1a2030]">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-[#e0dbd0] flex items-center gap-2"><Ic.layers size={14} className="text-[#c9a962]"/> Custom Fields Builder</CardTitle>
              <CardDescription className="text-[#5a6577] text-xs">Add custom fields to any object. Drag to reorder. Data stored in metadata — no schema changes needed.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Object type selector */}
              <div className="flex gap-1.5 flex-wrap">
                {objectTypes.map(o => (
                  <button key={o.key} onClick={() => setEditObj(o.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${editObj === o.key ? 'bg-[#c9a962]/10 text-[#c9a962] border border-[#c9a962]/30' : 'text-[#5a6577] border border-[#1a2030] hover:border-[#2a3544]'}`}>
                    <o.icon size={13}/> {o.label}
                    <span className="text-[9px] ml-0.5 opacity-60">({customFields.filter(f => f.objectType === o.key).length})</span>
                  </button>
                ))}
              </div>

              {/* Field list with drag-and-drop */}
              {objFields.length === 0 ? (
                <div className="p-6 text-center border-2 border-dashed border-[#1a2030] rounded-xl">
                  <Ic.layers size={24} className="mx-auto text-[#2a3544] mb-2"/>
                  <p className="text-xs text-[#4a5568]">No custom fields for {editObj}s yet</p>
                  <p className="text-[10px] text-[#3a4556] mt-1">Click "Add Field" to create one</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 px-3 py-1">
                    <span className="w-6 text-[9px] text-[#3a4556]">#</span>
                    <span className="flex-1 text-[9px] text-[#5a6577] uppercase">Field Label</span>
                    <span className="w-16 text-[9px] text-[#5a6577] uppercase text-center">Type</span>
                    <span className="w-16 text-[9px] text-[#5a6577] uppercase text-center">Required</span>
                    <span className="w-16 text-[9px] text-[#5a6577] uppercase text-center">Visible</span>
                    <span className="w-16"></span>
                  </div>
                  {objFields.map((field, idx) => (
                    <div key={field.id}
                      draggable
                      onDragStart={() => handleDragStart(idx)}
                      onDragOver={e => handleDragOver(e, idx)}
                      onDrop={() => handleDrop(idx)}
                      onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg transition-all cursor-grab active:cursor-grabbing group ${
                        dragOverIdx === idx ? 'bg-[#c9a962]/5 border border-[#c9a962]/30' :
                        dragIdx === idx ? 'opacity-50 bg-[#121824]' :
                        'bg-[#080b12] border border-[#1a2030] hover:border-[#2a3544]'
                      }`}>
                      {/* Drag handle */}
                      <span className="w-6 text-[#3a4556] group-hover:text-[#5a6577] flex-shrink-0 cursor-grab">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><circle cx="3" cy="2" r="1"/><circle cx="3" cy="6" r="1"/><circle cx="3" cy="10" r="1"/><circle cx="8" cy="2" r="1"/><circle cx="8" cy="6" r="1"/><circle cx="8" cy="10" r="1"/></svg>
                      </span>
                      {/* Label & key */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-[#e0dbd0] truncate">{field.label}</p>
                        <p className="text-[9px] text-[#3a4556] font-mono">{field.fieldKey}</p>
                      </div>
                      {/* Type badge */}
                      <div className="w-16 flex justify-center">
                        <Badge className="text-[9px] bg-[#121824] text-[#6a7589] border-[#1a2030]">
                          {fieldTypeIcons[field.fieldType]} {field.fieldType}
                        </Badge>
                      </div>
                      {/* Required */}
                      <div className="w-16 flex justify-center">
                        {field.required && <Badge className="text-[8px] bg-red-500/10 text-red-400 border-red-500/20">req</Badge>}
                      </div>
                      {/* Visible toggle */}
                      <div className="w-16 flex justify-center">
                        <button onClick={() => toggleVisible(field.id)} className={`w-7 h-4 rounded-full transition-all ${field.visible ? 'bg-[#c9a962]/30' : 'bg-[#1a2030]'}`}>
                          <div className={`w-3 h-3 rounded-full transition-all ${field.visible ? 'bg-[#c9a962] translate-x-3.5' : 'bg-[#3a4556] translate-x-0.5'}`}/>
                        </button>
                      </div>
                      {/* Delete */}
                      <div className="w-16 flex justify-end">
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-[#3a4556] hover:text-red-400 opacity-0 group-hover:opacity-100" onClick={() => removeField(field.id)}>
                          <Ic.trash size={11}/>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add field */}
              {!showAddField ? (
                <Button size="sm" onClick={() => setShowAddField(true)} className="bg-[#c9a962] text-[#0d1117] hover:bg-[#d4b46e] h-9 text-xs gap-1">
                  <Ic.plus size={14}/> Add Field to {editObj.charAt(0).toUpperCase() + editObj.slice(1)}
                </Button>
              ) : (
                <div className="p-4 rounded-xl bg-[#080b12] border border-[#c9a962]/20 space-y-3">
                  <p className="text-xs font-medium text-[#c9a962] flex items-center gap-1.5"><Ic.plus size={12}/> New Custom Field</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-[10px] text-[#5a6577] uppercase">Label</Label><Input value={newField.label} onChange={e => setNewField(p => ({ ...p, label: e.target.value }))} placeholder="e.g. Insurance Provider" className={inp}/></div>
                    <div><Label className="text-[10px] text-[#5a6577] uppercase">Field Key</Label><Input value={newField.fieldKey} onChange={e => setNewField(p => ({ ...p, fieldKey: e.target.value.replace(/[^a-z0-9_]/gi, '_').toLowerCase() }))} placeholder="auto-generated from label" className={`${inp} font-mono`}/></div>
                    <div><Label className="text-[10px] text-[#5a6577] uppercase">Type</Label>
                      <Select value={newField.fieldType} onValueChange={(v: any) => setNewField(p => ({ ...p, fieldType: v }))}>
                        <SelectTrigger className={inp}><SelectValue/></SelectTrigger>
                        <SelectContent className="bg-[#0d1117] border-[#1e2733]">
                          <SelectItem value="text">Aa Text</SelectItem>
                          <SelectItem value="number"># Number</SelectItem>
                          <SelectItem value="select">▾ Select (Picklist)</SelectItem>
                          <SelectItem value="date">📅 Date</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end gap-3">
                      <div className="flex items-center gap-2 pb-2">
                        <button onClick={() => setNewField(p => ({ ...p, required: !p.required }))}
                          className={`w-4 h-4 rounded border flex items-center justify-center ${newField.required ? 'bg-[#c9a962] border-[#c9a962] text-[#0d1117]' : 'border-[#3a4556]'}`}>
                          {newField.required && <span className="text-[8px]">✓</span>}
                        </button>
                        <span className="text-[10px] text-[#5a6577]">Required</span>
                      </div>
                    </div>
                  </div>
                  {newField.fieldType === 'select' && (
                    <div><Label className="text-[10px] text-[#5a6577] uppercase">Options (comma-separated)</Label><Input value={newField.options} onChange={e => setNewField(p => ({ ...p, options: e.target.value }))} placeholder="e.g. Option A, Option B, Option C" className={inp}/></div>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" onClick={addField} disabled={!newField.label.trim()} className="bg-[#c9a962] text-[#0d1117] hover:bg-[#d4b46e] h-8 text-xs disabled:opacity-40">Create Field</Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowAddField(false)} className="h-8 text-xs text-[#6a7589]">Cancel</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Preview card */}
          {objFields.length > 0 && (
            <Card className="bg-[#0d1117] border-[#1a2030]">
              <CardHeader className="pb-2"><CardTitle className="text-xs text-[#6a7589]">Preview — How custom fields appear on {editObj} detail pages</CardTitle></CardHeader>
              <CardContent>
                <div className="p-4 rounded-xl bg-[#080b12] border border-[#1a2030] space-y-3">
                  <p className="text-[10px] text-[#5a6577] uppercase tracking-wider flex items-center gap-1.5"><Ic.layers size={10} className="text-[#c9a962]"/> Custom Fields</p>
                  <div className="grid grid-cols-2 gap-2">
                    {objFields.filter(f => f.visible).map(f => (
                      <div key={f.id} className="p-2 rounded bg-[#0d1117] border border-[#1a2030]">
                        <p className="text-[10px] text-[#5a6577] uppercase">{f.label}</p>
                        <p className="text-xs text-[#3a4556] italic mt-0.5">
                          {f.fieldType === 'text' ? 'Sample text value' :
                           f.fieldType === 'number' ? '12345' :
                           f.fieldType === 'date' ? '2026-03-15' :
                           f.options?.[0] || 'Option'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function CustomerPortal() {
  const { vehicles, imports, customers, user, setUser, notifications, setVehicles } = useApp();
  const cust = customers.find(c => c.name === user?.name);
  const cvs = vehicles.filter(v => cust?.vehicleIds.includes(v.id));
  const custNotifs = notifications.filter(n => n.recipientId === cust?.id).slice(0, 10);
  const [portalTab, setPortalTab] = useState<'vehicle' | 'documents' | 'messages'>('vehicle');
  const [uploadCat, setUploadCat] = useState('identity');
  const fileRef = useRef<HTMLInputElement>(null);

  const [portalUploading, setPortalUploading] = useState(false);

  const uploadDoc = async (files: FileList | null) => {
    if (!files || cvs.length === 0) return;
    setPortalUploading(true);
    const v = cvs[0];
    const newAtts: VehicleAttachment[] = [];
    for (const f of Array.from(files)) {
      const result = await supabaseUploadFile(f, 'customer_document', cust?.id || v.id, {
        category: uploadCat, uploadedBy: user?.name || 'Customer', notes: `Client upload: ${uploadCat}`,
      });
      if (result.success && result.file) {
        newAtts.push({
          id: result.file.id, name: f.name,
          fileType: f.name.split('.').pop()?.toUpperCase() || 'FILE',
          size: f.size > 1048576 ? `${(f.size/1048576).toFixed(1)} MB` : `${(f.size/1024).toFixed(0)} KB`,
          category: 'document' as const, uploadDate: new Date().toISOString().split('T')[0],
          uploadedBy: user?.name || 'Customer', notes: `Client upload: ${uploadCat}`,
        });
      } else {
        newAtts.push({
          id: crypto.randomUUID(), name: f.name,
          fileType: f.name.split('.').pop()?.toUpperCase() || 'FILE',
          size: f.size > 1048576 ? `${(f.size/1048576).toFixed(1)} MB` : `${(f.size/1024).toFixed(0)} KB`,
          category: 'document' as const, uploadDate: new Date().toISOString().split('T')[0],
          uploadedBy: user?.name || 'Customer', notes: `Client upload: ${uploadCat}`,
        });
      }
    }
    setVehicles(prev => prev.map(veh => veh.id !== v.id ? veh : { ...veh, attachments: [...veh.attachments, ...newAtts] }));
    setPortalUploading(false);
  };

  const docCategories = [
    { key: 'identity', label: 'ID / Passport', icon: '🪪' },
    { key: 'power_of_attorney', label: 'Power of Attorney', icon: '📝' },
    { key: 'proof_of_payment', label: 'Proof of Payment', icon: '💳' },
    { key: 'insurance', label: 'Insurance Certificate', icon: '🛡️' },
    { key: 'other', label: 'Other Document', icon: '📎' },
  ];

  return (
    <div className="min-h-screen bg-[#080b12] p-4 md:p-8" style={{fontFamily:sf}}>
      <FontsLink/>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#c9a962] to-[#8b6f3a] flex items-center justify-center"><span className="text-lg font-bold text-[#0d1117]" style={{fontFamily:pf}}>G</span></div>
            <div><h1 className="text-lg font-semibold text-[#f0ece2]" style={{fontFamily:pf}}>My Portal</h1><p className="text-xs text-[#5a6577]">Welcome, {user?.name}</p></div>
          </div>
          <Button variant="ghost" size="sm" className="text-[#6a7589] hover:text-[#c9a962]" onClick={() => setUser(null)}><Ic.out size={16}/></Button>
        </div>

        {/* Portal tabs */}
        <div className="flex gap-1 p-1 rounded-lg bg-[#0d1117] border border-[#1a2030]">
          {([
            { key: 'vehicle' as const, label: 'My Vehicle', icon: Ic.car },
            { key: 'documents' as const, label: 'Upload Documents', icon: Ic.uploadCloud },
            { key: 'messages' as const, label: `Messages${custNotifs.length > 0 ? ` (${custNotifs.filter(n=>!n.read).length})` : ''}`, icon: Ic.msgSquare },
          ]).map(t => (
            <button key={t.key} onClick={() => setPortalTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-md text-xs font-medium transition-all ${portalTab === t.key ? 'bg-[#c9a962]/10 text-[#c9a962]' : 'text-[#5a6577] hover:text-[#a0aab8]'}`}>
              <t.icon size={14}/> {t.label}
            </button>
          ))}
        </div>

        {/* Vehicle tab */}
        {portalTab === 'vehicle' && cvs.map(v => {
          const imp = imports.find(i => i.id === v.importProcessId);
          return (
            <Card key={v.id} className="bg-[#0d1117] border-[#1a2030]"><CardContent className="p-6 space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div><h2 className="text-xl font-bold text-[#f0ece2]" style={{fontFamily:pf}}>{v.year} {v.make} {v.model}</h2><p className="text-sm text-[#5a6577]">{v.color} · VIN: {v.vin}</p></div>
                <Badge className={`${sc[v.status]} border text-xs`}>{v.status.replace('_', ' ')}</Badge>
              </div>
              <ImageGallery vehicle={v}/>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Object.entries(v.specs).slice(0, 8).map(([k, val]) => <div key={k} className="p-3 rounded-xl bg-[#080b12] border border-[#1a2030]"><p className="text-[10px] text-[#5a6577] uppercase">{k.replace(/([A-Z])/g, ' $1')}</p><p className="text-sm text-[#e0dbd0] mt-0.5">{val}</p></div>)}</div>
              {imp && <div><h3 className="text-sm font-medium text-[#e0dbd0] mb-4">Import Progress</h3><ImportTimeline imp={imp}/><div className="mt-4 p-3 rounded-xl bg-[#080b12] border border-[#1a2030]"><p className="text-xs text-[#5a6577]">ETA: <span className="text-[#c9a962] font-medium">{imp.estimatedArrival}</span></p></div></div>}
            </CardContent></Card>
          );
        })}

        {/* Document Upload tab */}
        {portalTab === 'documents' && (
          <Card className="bg-[#0d1117] border-[#1a2030]"><CardContent className="p-6 space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-[#f0ece2] mb-1">Upload Required Documents</h3>
              <p className="text-xs text-[#5a6577]">Submit your documents securely. We need these to complete the import and registration process.</p>
            </div>

            {/* Required docs checklist */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {docCategories.map(dc => {
                const existing = cvs[0]?.attachments.filter(a => a.notes?.includes(dc.key)) || [];
                return (
                  <div key={dc.key} onClick={() => { if (!portalUploading) { setUploadCat(dc.key); fileRef.current?.click(); } }}
                    className={`p-4 rounded-xl border transition-all ${portalUploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${existing.length > 0 ? 'bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40' : 'bg-[#080b12] border-[#1a2030] hover:border-[#c9a962]/30'}`}>
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{dc.icon}</span>
                      <div className="flex-1">
                        <p className="text-xs font-medium text-[#e0dbd0]">{dc.label}</p>
                        {existing.length > 0 ? (
                          <p className="text-[10px] text-emerald-400">✓ {existing.length} file{existing.length > 1 ? 's' : ''} uploaded</p>
                        ) : (
                          <p className="text-[10px] text-[#5a6577]">Click to upload</p>
                        )}
                      </div>
                      {existing.length > 0 ? <Ic.check size={16} className="text-emerald-400"/> : <Ic.uploadCloud size={16} className="text-[#3a4556]"/>}
                    </div>
                  </div>
                );
              })}
            </div>
            <input ref={fileRef} type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="hidden" onChange={e => uploadDoc(e.target.files)}/>

            {/* Uploaded files list */}
            {cvs[0]?.attachments.filter(a => a.uploadedBy === user?.name || a.notes?.startsWith('Client')).length > 0 && (
              <div>
                <p className="text-xs font-medium text-[#6a7589] mb-2">Your Uploads</p>
                <div className="space-y-1.5">
                  {cvs[0]?.attachments.filter(a => a.uploadedBy === user?.name || a.notes?.startsWith('Client')).map(att => (
                    <div key={att.id} className="flex items-center gap-3 p-3 rounded-lg bg-[#080b12] border border-[#1a2030]">
                      <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center text-[10px] font-bold text-emerald-400 border border-emerald-500/20">{att.fileType}</div>
                      <div className="flex-1"><p className="text-xs text-[#e0dbd0]">{att.name}</p><p className="text-[10px] text-[#4a5568]">{att.size} · {att.uploadDate}</p></div>
                      <Badge className="text-[8px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Uploaded</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent></Card>
        )}

        {/* Messages tab */}
        {portalTab === 'messages' && (
          <Card className="bg-[#0d1117] border-[#1a2030]"><CardContent className="p-6 space-y-4">
            <h3 className="text-sm font-semibold text-[#f0ece2]">Notifications & Messages</h3>
            {custNotifs.length === 0 && cust?.communications.length === 0 ? (
              <div className="p-8 text-center"><Ic.msgSquare size={24} className="mx-auto text-[#2a3544] mb-2"/><p className="text-xs text-[#4a5568]">No messages yet</p></div>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {/* Merge notifications + communications, sort by date */}
                  {[
                    ...custNotifs.map(n => ({ id: n.id, date: n.time, type: n.channel || n.type, summary: `${n.title}: ${n.message}`, isNotif: true, channel: n.channel })),
                    ...(cust?.communications || []).map(c => ({ id: c.id, date: c.date, type: c.type, summary: c.summary, isNotif: false, channel: c.channel })),
                  ].sort((a, b) => b.date.localeCompare(a.date)).map(item => (
                    <div key={item.id} className={`p-3 rounded-lg border ${item.channel === 'inbound' ? 'bg-[#080b12] border-[#1a2030] mr-12' : 'bg-[#0d1117] border-[#1a2030] ml-6'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          {item.type === 'WhatsApp' && <Ic.whatsapp size={11} className="text-green-400"/>}
                          {item.type === 'Email' && <Ic.mail size={11} className="text-sky-400"/>}
                          {item.type === 'import_update' && <Ic.ship size={11} className="text-violet-400"/>}
                          <span className="text-[10px] text-[#5a6577]">{item.type}</span>
                        </div>
                        <span className="text-[9px] text-[#3a4556]">{item.date}</span>
                      </div>
                      <p className="text-[11px] text-[#a0aab8]">{item.summary}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent></Card>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════
export default function App() {
  const [user, setUser] = useState<User|null>(null);
  const [page, setPage] = useState<Page>('dashboard');
  const [collapsed, setCollapsed] = useState(false);
  const [vehicles, setVehicles] = useState(seedVehicles);
  const [imports, setImports] = useState(seedImports);
  const [leads, setLeads] = useState(seedLeads);
  const [customers, setCustomers] = useState(seedCustomers);
  const [vendors] = useState(seedVendors);
  const [tasks, setTasks] = useState(seedTasks);
  const [wishlist, setWishlist] = useState(seedWishlist);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [customFields, setCustomFields] = useState<CustomFieldDef[]>([
    { id:'cf1', objectType:'vehicle', label:'Insurance Provider', fieldKey:'insurance_provider', fieldType:'text', required:false, order:0, visible:true },
    { id:'cf2', objectType:'vehicle', label:'Warranty Expiry', fieldKey:'warranty_expiry', fieldType:'date', required:false, order:1, visible:true },
    { id:'cf3', objectType:'vehicle', label:'Condition Grade', fieldKey:'condition_grade', fieldType:'select', options:['A+ Pristine','A Excellent','B+ Very Good','B Good','C Fair'], required:false, order:2, visible:true },
    { id:'cf4', objectType:'lead', label:'Preferred Contact Method', fieldKey:'preferred_contact', fieldType:'select', options:['WhatsApp','Phone','Email','Telegram'], required:false, order:0, visible:true },
    { id:'cf5', objectType:'lead', label:'Referral Source Detail', fieldKey:'referral_detail', fieldType:'text', required:false, order:1, visible:true },
    { id:'cf6', objectType:'customer', label:'VIP Level', fieldKey:'vip_level', fieldType:'select', options:['Standard','Silver','Gold','Platinum'], required:false, order:0, visible:true },
    { id:'cf7', objectType:'vendor', label:'Contract Expiry', fieldKey:'contract_expiry', fieldType:'date', required:false, order:0, visible:true },
    { id:'cf8', objectType:'task', label:'Estimated Hours', fieldKey:'estimated_hours', fieldType:'number', required:false, order:0, visible:true },
  ]);
  const [notifications, setNotifications] = useState<Notification[]>([
    { id:'n0-1', type:'import_update', title:'Porsche 911 Turbo S → Tax & Fees', message:'Import advanced. Awaiting tax assessment.', vehicleId:'v3', time:'10:30 AM', read:false },
    { id:'n0-2', type:'whatsapp', title:'WhatsApp sent to Noam Shapiro', message:'Tax assessment scheduled for next week', recipientId:'c1', vehicleId:'v3', time:'10:31 AM', read:false, channel:'WhatsApp' },
    { id:'n0-3', type:'system', title:'New lead: David Levy', message:'Interested in Lamborghini, budget $400K via Instagram', time:'8:15 AM', read:true },
  ]);

  if(!user) return <LoginScreen onLogin={setUser}/>;

  const ctx: AppCtx = { user, setUser, page, setPage, vehicles, setVehicles, imports, setImports, leads, setLeads, customers, setCustomers, vendors, tasks, setTasks, wishlist, setWishlist, compareIds, setCompareIds, customFields, setCustomFields, notifications, setNotifications };

  if(user.role==='customer') return <Ctx.Provider value={ctx}><CustomerPortal/></Ctx.Provider>;

  const renderPage = () => {
    switch(page) {
      case 'dashboard': return <DashboardPage/>;
      case 'vehicles': return <VehiclesPage/>;
      case 'imports': return <ImportsPage/>;
      case 'leads': return <LeadsPage/>;
      case 'customers': return <CustomersPage/>;
      case 'wishlist': return <WishlistPage/>;
      case 'vendors': return user.role==='super_admin' ? <VendorsPage/> : <DashboardPage/>;
      case 'tasks': return <TasksPage/>;
      case 'settings': return <SettingsPage/>;
      default: return <DashboardPage/>;
    }
  };

  return (
    <Ctx.Provider value={ctx}>
      <div className="min-h-screen bg-[#080b12] text-[#e0dbd0]" style={{fontFamily:sf}}>
        <FontsLink/>
        <Sidebar collapsed={collapsed} toggle={()=>setCollapsed(p=>!p)}/>
        <div className={`transition-all duration-300 ${collapsed?'ml-[68px]':'ml-[220px]'}`}>
          <TopBar/>
          <main className="p-6">{renderPage()}</main>
        </div>
      </div>
    </Ctx.Provider>
  );
}
