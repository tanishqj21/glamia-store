import { readBoundedBody } from './security.js';

export const MAX_PRODUCT_VIDEO_BYTES = 40_000_000;
const VIDEO_KEY = /^product-videos\/[A-Za-z0-9_-]{32}\/[a-f0-9-]{36}\.(mp4|webm)$/;
const failure = (message, status = 400) => Object.assign(new Error(message), { status });

export async function storeProductVideo(request, env, user, { ownerKey, reserve, release }) {
  const type = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  if (!['video/mp4', 'video/webm'].includes(type)) throw failure('Choose an MP4 or WebM video.');
  // Read the raw body once; multipart parsing would duplicate large buffers in the Worker.
  let bytes;
  try { bytes = await readBoundedBody(request, MAX_PRODUCT_VIDEO_BYTES); }
  catch (error) { if (error.status === 413) throw failure('Video must be compressed to 40 MB or smaller.', 413); throw error; }
  const text = (start, end) => new TextDecoder().decode(bytes.subarray(start, end));
  const valid = type === 'video/mp4'
    ? bytes.length >= 24 && text(4, 8) === 'ftyp'
    : bytes.length >= 16 && [0x1a, 0x45, 0xdf, 0xa3].every((byte, i) => bytes[i] === byte);
  if (!valid) throw failure('The file is not a valid MP4 or WebM video.');
  if (!env.PRODUCT_IMAGES) throw failure('Video uploads are temporarily unavailable.', 503);
  const key = `product-videos/${ownerKey}/${crypto.randomUUID()}.${type === 'video/mp4' ? 'mp4' : 'webm'}`;
  await reserve(bytes.length);
  try {
    await env.PRODUCT_IMAGES.put(key, bytes, {
      httpMetadata: { contentType: type },
      customMetadata: { uploadedBy: user.email, kind: 'product-video' }
    });
  } catch (error) {
    await release(bytes.length).catch(() => {});
    throw error;
  }
  return { videoUrl: `/api/assets/${key}`, bytes: bytes.length };
}

export async function validateProductVideo(value, env, user) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || !value.startsWith('/api/assets/')) throw failure('Upload the product video using Add video.');
  const key = value.slice('/api/assets/'.length);
  if (!VIDEO_KEY.test(key)) throw failure('Upload the product video using Add video.');
  const object = await env.PRODUCT_IMAGES?.head(key);
  if (!object || object.customMetadata?.kind !== 'product-video' || object.size > MAX_PRODUCT_VIDEO_BYTES) {
    throw failure('This video is unavailable. Please upload it again.');
  }
  if (!user?.is_owner && object.customMetadata.uploadedBy?.toLowerCase() !== user?.email?.toLowerCase()) {
    throw failure('This account cannot use that uploaded video.', 403);
  }
  return value;
}

// Browsers seek using byte ranges. Never run videos through the image cache/optimizer.
export async function serveProductVideo(request, env, key) {
  if (!VIDEO_KEY.test(key)) return new Response(null, { status: 404 });
  const info = await env.PRODUCT_IMAGES.head(key);
  if (!info) return new Response(null, { status: 404 });
  const headers = new Headers({
    'Content-Type': key.endsWith('.mp4') ? 'video/mp4' : 'video/webm',
    'Content-Length': String(info.size), 'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'ETag': info.httpEtag, 'X-Content-Type-Options': 'nosniff'
  });
  if (request.method === 'HEAD') return new Response(null, { headers });
  const ifRange = request.headers.get('If-Range');
  const range = !ifRange || ifRange === info.httpEtag ? request.headers.get('Range') : null;
  let offset = 0, length = info.size, status = 200;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match && (match[1] || match[2])) {
      offset = match[1] ? Number(match[1]) : Math.max(0, info.size - Number(match[2]));
      const end = match[1] && match[2] ? Math.min(Number(match[2]), info.size - 1) : info.size - 1;
      length = end - offset + 1;
      if (Number.isSafeInteger(offset) && Number.isSafeInteger(length) && offset < info.size && length > 0) status = 206;
    }
    if (status !== 206) {
      headers.set('Content-Range', `bytes */${info.size}`);
      headers.delete('Content-Length');
      return new Response(null, { status: 416, headers });
    }
    headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${info.size}`);
    headers.set('Content-Length', String(length));
  }
  const object = await env.PRODUCT_IMAGES.get(key, status === 206 ? { range: { offset, length } } : undefined);
  if (!object) return new Response(null, { status: 404 });
  return new Response(object.body, { status, headers });
}
