// Live capture helpers. The picker itself is opened by the caller inside the
// click handler; this module only extracts frames and attaches streams.

// Extract packed RGBA at the video's NATURAL size. Over-budget frames are
// refused (14002) instead of being downscaled, so the decoder never sees a
// silently resized image.
export function captureFrame(video, options = {}) {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!Number.isSafeInteger(width) || width <= 0 ||
      !Number.isSafeInteger(height) || height <= 0) {
    if (options.onError) options.onError(14001);
    return null;
  }

  const pixels = width * height;
  const maxPixels = options.maxPixels || 4194304;
  if (!Number.isSafeInteger(pixels) || pixels > maxPixels) {
    if (options.onError) options.onError(14002);
    return null;
  }

  const createCanvas = options.createCanvas || ((w, h) => new OffscreenCanvas(w, h));
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.drawImage(video, 0, 0, width, height);
  const image = context.getImageData(0, 0, width, height);
  return { width, height, pixels: image.data.buffer };
}

// Attach a captured stream to a video element and report when it ends.
export function attachStream(video, stream, onEnded) {
  video.srcObject = stream;
  const track = stream.getVideoTracks()[0];
  if (track && typeof onEnded === 'function') {
    track.addEventListener('ended', onEnded);
  }
  return {
    stop() {
      for (const t of stream.getTracks()) t.stop();
      video.srcObject = null;
    },
  };
}
