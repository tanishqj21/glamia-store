import { useEffect, useId, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';

export function ProductVideoField({ value = '', onChange, disabled = false, onBusyChange }) {
  const id = useId(), controller = useRef(null), mounted = useRef(true);
  const [working, setWorking] = useState(false), [status, setStatus] = useState(''), [error, setError] = useState('');
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  async function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || controller.current) return;
    const task = new AbortController(); controller.current = task;
    setWorking(true); onBusyChange(true); setError(''); setStatus('Preparing video…');
    try {
      const { compressProductVideo } = await import('../lib/compressProductVideo');
      const compressed = await compressProductVideo(file, {
        signal: task.signal,
        onProgress: (percent, attempt) => mounted.current && setStatus(`${attempt ? 'Compressing again' : 'Compressing video'}… ${percent}%`)
      });
      if (task.signal.aborted) return;
      setStatus(`Uploading video… ${(compressed.size / 1_000_000).toFixed(1)} MB`);
      const response = await apiFetch('/api/uploads/video', { method: 'POST', body: compressed, headers: { 'Content-Type': compressed.type }, signal: task.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Video upload failed. Please try again.');
      if (!task.signal.aborted) { onChange(data.videoUrl); setStatus(`Video ready · ${(compressed.size / 1_000_000).toFixed(1)} MB. Save the listing to publish it.`); }
    } catch (reason) {
      if (!task.signal.aborted) { setError(reason.message || 'Video could not be prepared. Please try another file.'); setStatus(''); }
    } finally {
      if (controller.current === task) { controller.current = null; if (mounted.current) { setWorking(false); onBusyChange(false); } }
    }
  }
  return <fieldset className="image-manager product-video-field">
    <legend>Product video <span>Optional</span></legend>
    <p className="form-hint">Add one short clip, up to 5 minutes and 500 MB. We compress it before upload, aiming for 30–40 MB. Smaller clips stay smaller.</p>
    {value && <video key={value} src={value} controls playsInline preload="none" aria-label="Product video preview" />}
    <div className="image-manager-toolbar">
      <label className="upload-button secondary" htmlFor={id}>{value ? 'Replace video' : 'Add video'}<input id={id} type="file" accept="video/*,.mp4,.mov,.webm,.m4v" hidden onChange={upload} disabled={disabled || working} /></label>
      {value && <button type="button" className="secondary-action" disabled={disabled || working} onClick={() => { onChange(''); setStatus('Video removed. Save the listing to apply.'); setError(''); }}>Remove video</button>}
      {working && <button type="button" className="secondary-action" onClick={() => { controller.current?.abort(); setStatus('Video preparation cancelled.'); }}>Cancel video upload</button>}
    </div>
    <p className="form-hint">Video is optional. You can create or save a listing without one.</p>
    {status && (value || !status.startsWith('Video ready')) && <p className="form-hint" role="status">{status}</p>}
    {error && <p className="form-status" role="alert">{error}</p>}
  </fieldset>;
}
