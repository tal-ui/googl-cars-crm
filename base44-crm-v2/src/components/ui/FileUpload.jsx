/**
 * FileUpload — the ONE upload control.
 *
 * Replaces ~30 ad-hoc UploadFile call sites across 15 files with two different
 * import spellings (audit I-128). Handles drag-drop, progress, error → toast (not
 * alert()), and returns { url, name, type } to the caller. RTL-correct.
 */
import { useRef, useState } from 'react';
import { UploadFile } from '@/api/integrations';
import { toast } from '@/lib/toast';

export default function FileUpload({
  onUploaded,
  accept,
  label = 'העלה קובץ',
  multiple = false,
  disabled = false,
}) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setBusy(true);
    try {
      for (const file of files) {
        const { file_url } = await UploadFile({ file });
        onUploaded?.({ url: file_url, name: file.name, type: file.type });
      }
      toast.success('הקובץ הועלה');
    } catch (err) {
      toast.error('העלאת הקובץ נכשלה'); // no raw error to the user
      console.error('[FileUpload]', err);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div dir="rtl">
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        className={`flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-sm transition
          ${dragOver ? 'border-amber-400 bg-amber-400/10' : 'border-slate-600 hover:border-slate-400'}
          ${busy ? 'opacity-60' : ''}`}
      >
        {busy ? 'מעלה…' : label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
