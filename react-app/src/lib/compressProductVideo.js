import { Input, BlobSource, ALL_FORMATS, Output, BufferTarget, Mp4OutputFormat, WebMOutputFormat, Conversion, Quality, canEncodeVideo, canEncodeAudio } from 'mediabunny';

export const MAX_VIDEO_BYTES = 40_000_000;
const TARGET_BYTES = 35_000_000;
const abortError = () => new DOMException('Video preparation cancelled.', 'AbortError');

export async function compressProductVideo(file, { signal, onProgress = () => {} } = {}) {
  if (!file.size || file.size > 500_000_000) throw new Error('Choose a video under 500 MB.');
  if (typeof VideoEncoder === 'undefined') throw new Error('This browser cannot compress videos. Please use an updated Chrome or Edge browser.');
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  let conversion;
  const cancel = () => { void conversion?.cancel().catch(() => {}); };
  signal?.addEventListener('abort', cancel);
  try {
    if (signal?.aborted) throw abortError();
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new Error('Choose a file that contains a video.');
    const audio = await input.getPrimaryAudioTrack();
    const duration = await input.computeDuration();
    if (!Number.isFinite(duration) || duration <= 0 || duration > 300) throw new Error('Choose a short video up to 5 minutes long.');
    if (!(await video.canDecode()) || (audio && !(await audio.canDecode()))) throw new Error('This video format cannot be read by your browser. Try an MP4 or WebM file.');
    const sourceWidth = await video.getDisplayWidth(), sourceHeight = await video.getDisplayHeight();
    const scale = Math.min(1, 1920 / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(2, Math.round(sourceWidth * scale / 2) * 2);
    const height = Math.max(2, Math.round(sourceHeight * scale / 2) * 2);
    let codec, audioCodec, format;
    for (const candidate of ['avc', 'vp9', 'vp8']) {
      const sound = candidate === 'avc' ? 'aac' : 'opus';
      if (await canEncodeVideo(candidate, { width, height }) && (!audio || await canEncodeAudio(sound, { numberOfChannels: 2, sampleRate: 48000 }))) {
        codec = candidate; audioCodec = sound;
        format = candidate === 'avc' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat();
        break;
      }
    }
    if (!codec) throw new Error('Video compression is unavailable in this browser. Please try updated Chrome or Edge.');
    // Budget for sound and container overhead. Small clips are never padded to 30 MB.
    const budget = Math.min(TARGET_BYTES, file.size * 0.9);
    let bitrate = Math.max(100_000, Math.min(6_000_000, budget * 8 * 0.92 / duration - (audio ? 128_000 : 0)));
    for (let attempt = 0; attempt < 3; attempt++) {
      if (signal?.aborted) throw abortError();
      const target = new BufferTarget();
      const output = new Output({ format, target });
      conversion = await Conversion.init({
        input, output, tracks: 'primary', tags: {},
        video: { codec, quality: new Quality({ bitrate: Math.floor(bitrate), bitrateMode: 'variable' }), width, height, fit: 'contain', frameRate: 30, keyFrameInterval: 2, forceTranscode: true, allowTransformationMetadata: false },
        audio: { codec: audioCodec, quality: new Quality({ bitrate: 128_000 }), numberOfChannels: 2, sampleRate: 48000, forceTranscode: true }
      });
      if (signal?.aborted) throw abortError();
      // Never silently lose video or sound when a codec cannot be decoded/encoded.
      if (!conversion.isValid || !conversion.utilizedTracks.includes(video) || (audio && !conversion.utilizedTracks.includes(audio))) {
        throw new Error('This video could not be compressed without losing media. Try another MP4 or WebM file.');
      }
      conversion.onProgress = progress => onProgress(Math.min(99, Math.round(progress * 100)), attempt);
      await conversion.execute();
      if (signal?.aborted) throw abortError();
      if (target.buffer.byteLength <= MAX_VIDEO_BYTES) {
        const extension = codec === 'avc' ? 'mp4' : 'webm';
        onProgress(100, attempt);
        return new File([target.buffer], `product-video.${extension}`, { type: `video/${extension}` });
      }
      bitrate = Math.max(50_000, Math.floor(bitrate * TARGET_BYTES / target.buffer.byteLength * 0.85));
    }
    throw new Error('This clip could not be reduced below 40 MB. Please choose a shorter video.');
  } catch (error) {
    if (signal?.aborted) throw abortError();
    throw error;
  } finally {
    signal?.removeEventListener('abort', cancel);
    await conversion?.cancel().catch(() => {});
    input.dispose();
  }
}
