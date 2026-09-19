import { useId, useState } from "react";

function normalizeImage(item) {
  if (typeof item === "string") return { url: item.trim() };
  return {
    ...item,
    url: String(item?.url || "").trim()
  };
}

function normalizeImages(value) {
  return (Array.isArray(value) ? value : [])
    .map(normalizeImage)
    .filter((item) => item.url);
}

export function ImageManager({
  value = [],
  thumbnailUrl = "",
  onChange,
  onUpload,
  uploading = false,
  min = 4,
  max = 15,
  label = "Product images"
}) {
  const images = normalizeImages(value);
  const uploadId = useId();
  const [urlDraft, setUrlDraft] = useState("");
  const selectedThumbnail = images.some((item) => item.url === thumbnailUrl)
    ? thumbnailUrl
    : images[0]?.url || "";

  function change(nextImages, nextThumbnail = selectedThumbnail) {
    const next = normalizeImages(nextImages);
    onChange?.({
      images: next,
      thumbnailUrl: next.some((item) => item.url === nextThumbnail)
        ? nextThumbnail
        : next[0]?.url || ""
    });
  }

  function move(index, targetIndex) {
    if (index === targetIndex || targetIndex < 0 || targetIndex >= images.length) return;
    const next = [...images];
    const [item] = next.splice(index, 1);
    next.splice(targetIndex, 0, item);
    change(next);
  }

  function remove(index) {
    const removed = images[index];
    const next = images.filter((_, itemIndex) => itemIndex !== index);
    const nextThumbnail = removed?.url === selectedThumbnail ? next[0]?.url || "" : selectedThumbnail;
    change(next, nextThumbnail);
  }

  function addUrl() {
    const url = urlDraft.trim();
    if (!url || images.some((item) => item.url === url) || images.length >= max) return;
    change([...images, { url }], selectedThumbnail || url);
    setUrlDraft("");
  }

  async function addFiles(event) {
    const files = [...(event.target.files || [])].slice(0, Math.max(0, max - images.length));
    if (!files.length || !onUpload) {
      event.target.value = "";
      return;
    }
    try {
      const uploaded = await onUpload(files);
      const additions = normalizeImages(uploaded);
      if (additions.length) change([...images, ...additions], selectedThumbnail || images[0]?.url || additions[0].url);
    } finally {
      event.target.value = "";
    }
  }

  return <fieldset className="image-manager">
    <legend>{label} <span>{images.length}/{max}</span></legend>
    <p className="form-hint image-manager-help">
      Add {min}–{max} images, preview every image, then choose the first, last, and thumbnail independently.
    </p>
    <div className="image-manager-toolbar">
      <label className="upload-button secondary" htmlFor={uploadId}>
        {uploading ? "Uploading…" : "Add images"}
        <input id={uploadId} type="file" accept="image/*" multiple hidden onChange={addFiles} disabled={uploading || images.length >= max} />
      </label>
      <div className="image-url-form">
        <label className="sr-only" htmlFor={`${uploadId}-url`}>Add image URL</label>
        <input id={`${uploadId}-url`} type="url" value={urlDraft} onChange={(event) => setUrlDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addUrl(); } }} placeholder="Or paste an image URL" disabled={images.length >= max} />
        <button className="secondary-action" type="button" onClick={addUrl} disabled={!urlDraft.trim() || images.length >= max}>Add URL</button>
      </div>
    </div>
    <div className="image-manager-grid">
      {images.map((item, index) => {
        const isThumbnail = item.url === selectedThumbnail;
        return <article className={`image-manager-card ${isThumbnail ? "is-thumbnail" : ""}`} key={`${item.key || item.url}-${index}`}>
          <div className="image-manager-preview">
            <img src={item.url} alt={`${label} preview ${index + 1}`} loading="lazy" />
            <span className="image-manager-order">{index + 1}</span>
            {isThumbnail && <span className="image-manager-badge">Thumbnail</span>}
          </div>
          <div className="image-manager-card-copy">
            <strong>{index === 0 ? "First image" : index === images.length - 1 ? "Last image" : `Image ${index + 1}`}</strong>
            <span>{item.key ? "Saved to R2" : "External image URL"}</span>
          </div>
          <div className="image-manager-actions">
            <button type="button" onClick={() => move(index, 0)} disabled={index === 0}>First</button>
            <button type="button" onClick={() => move(index, images.length - 1)} disabled={index === images.length - 1}>Last</button>
            <button type="button" onClick={() => change(images, item.url)} disabled={isThumbnail}>{isThumbnail ? "Thumbnail selected" : "Use as thumbnail"}</button>
            <button type="button" className="danger-action" onClick={() => remove(index)}>Remove</button>
          </div>
        </article>;
      })}
      {!images.length && <div className="image-manager-empty">Your image previews will appear here.</div>}
    </div>
    <p className="form-hint image-manager-footer">The thumbnail is selected separately from the first and last image. Unused uploaded R2 files are cleaned up automatically after the weekly maintenance scan.</p>
  </fieldset>;
}
