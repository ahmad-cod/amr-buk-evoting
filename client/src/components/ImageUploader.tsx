import { useRef, useState } from 'react';
import { ImagePlus, Upload, X, Loader2 } from 'lucide-react';
import { useToast } from '@/store/ToastContext';

const MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

export function ImageUploader({
  currentUrl,
  onUpload,
  uploading,
}: {
  currentUrl?: string;
  onUpload: (file: File) => void;
  uploading?: boolean;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handleFile = (file?: File) => {
    if (!file) return;
    if (!ALLOWED.includes(file.type)) {
      toast.error('Only JPG, PNG, or WEBP images are allowed.');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error('Image must be under 3MB.');
      return;
    }
    setPreview(URL.createObjectURL(file));
    onUpload(file);
  };

  const shown = preview || currentUrl;

  return (
    <div>
      <div className="flex items-center gap-4">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-charcoal-200 bg-charcoal-100">
          {shown ? (
            <img src={shown} alt="Candidate" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-charcoal-300">
              <ImagePlus size={28} />
            </div>
          )}
        </div>
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <button
            type="button"
            className="btn-secondary"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Uploading…
              </>
            ) : (
              <>
                <Upload size={16} /> {shown ? 'Replace photo' : 'Upload photo'}
              </>
            )}
          </button>
          {shown && !uploading && (
            <button
              type="button"
              className="btn-ghost ml-2 px-2 py-2 text-charcoal-500"
              onClick={() => {
                setPreview(null);
                if (inputRef.current) inputRef.current.value = '';
              }}
              aria-label="Clear preview"
            >
              <X size={16} />
            </button>
          )}
          <p className="mt-2 text-xs text-charcoal-400">JPG, PNG, or WEBP · max 3MB</p>
        </div>
      </div>
    </div>
  );
}
