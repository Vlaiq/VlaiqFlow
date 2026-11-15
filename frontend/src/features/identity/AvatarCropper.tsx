import { useEffect, useRef, useState } from 'react';
import { X, Check, ZoomIn, Move } from 'lucide-react';
export function AvatarCropper({
  file,
  onConfirm,
  onClose,
}: {
  file: File;
  onConfirm: (blob: Blob) => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    image = useRef<HTMLImageElement>(null);
  const [url, setUrl] = useState(''),
    [zoom, setZoom] = useState(1),
    [x, setX] = useState(0),
    [y, setY] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [dimensions, setDimensions] = useState({ w: 240, h: 240 });
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    if (!dialog.current?.open) dialog.current?.showModal();
    return () => URL.revokeObjectURL(next);
  }, [file]);
  const scale = Math.max(240 / dimensions.w, 240 / dimensions.h) * zoom;
  const dx = (dimensions.w * scale - 240) / 2,
    dy = (dimensions.h * scale - 240) / 2;
  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      if (!ctx || !image.current) throw new Error();
      ctx.drawImage(
        image.current,
        (dimensions.w - 240 / scale) / 2 - (x * dx) / scale,
        (dimensions.h - 240 / scale) / 2 - (y * dy) / scale,
        240 / scale,
        240 / scale,
        0,
        0,
        512,
        512,
      );
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject()), 'image/webp', 0.9),
      );
      await onConfirm(blob);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fotografia nu a putut fi salvată.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      className="identity-crop-dialog"
      aria-labelledby="crop-title"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <div className="identity-section-heading">
        <div>
          <span className="flow-eyebrow">FOTOGRAFIA TA</span>
          <h2 id="crop-title">Pune-te în cadru.</h2>
        </div>
        <button aria-label="Închide decuparea" disabled={busy} onClick={onClose}>
          <X />
        </button>
      </div>
      <div
        className="identity-crop-stage"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, left: x, top: y };
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          setX(
            Math.max(
              -1,
              Math.min(1, drag.current.left + (e.clientX - drag.current.x) / Math.max(1, dx)),
            ),
          );
          setY(
            Math.max(
              -1,
              Math.min(1, drag.current.top + (e.clientY - drag.current.y) / Math.max(1, dy)),
            ),
          );
        }}
      >
        <img
          ref={image}
          draggable={false}
          src={url}
          alt="Previzualizarea fotografiei decupate"
          onLoad={(e) =>
            setDimensions({
              w: e.currentTarget.naturalWidth,
              h: e.currentTarget.naturalHeight,
            })
          }
          onError={() => setError('Imaginea nu poate fi citită. Alege alt fișier.')}
          style={{
            width: dimensions.w * scale,
            height: dimensions.h * scale,
            maxWidth: 'none',
            left: 120 - (dimensions.w * scale) / 2 + x * dx,
            top: 120 - (dimensions.h * scale) / 2 + y * dy,
          }}
        />
      </div>
      <p className="identity-muted">
        <Move size={14} /> Trage fotografia sau folosește controalele.
      </p>
      <label className="identity-range">
        <ZoomIn size={17} /> Zoom
        <input
          aria-label="Zoom fotografie"
          type="range"
          min="1"
          max="3"
          step=".05"
          value={zoom}
          onChange={(e) => setZoom(+e.target.value)}
        />
      </label>
      <label className="identity-range">
        Orizontal
        <input
          aria-label="Poziție orizontală"
          type="range"
          min="-1"
          max="1"
          step=".01"
          value={x}
          onChange={(e) => setX(+e.target.value)}
        />
      </label>
      <label className="identity-range">
        Vertical
        <input
          aria-label="Poziție verticală"
          type="range"
          min="-1"
          max="1"
          step=".01"
          value={y}
          onChange={(e) => setY(+e.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className="identity-alert">
          {error}
        </p>
      )}
      <div className="identity-actions">
        <button className="identity-primary" disabled={busy} onClick={() => void confirm()}>
          <Check size={18} />
          {busy ? 'Salvăm…' : 'Salvează fotografia'}
        </button>
        <button disabled={busy} className="identity-secondary" onClick={onClose}>
          Anulează
        </button>
      </div>
    </dialog>
  );
}
