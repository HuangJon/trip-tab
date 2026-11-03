/** Shrinks a photo until it fits in one database document. */
import { LIMITS } from '../config/app.js';

export function shrinkPhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable image')); };
    img.onload = () => {
      URL.revokeObjectURL(url);
      for (const [side, quality] of [[LIMITS.receiptMaxSide, 0.8], [LIMITS.receiptMaxSide, 0.6], [900, 0.6], [700, 0.5], [500, 0.45]]) {
        const scale = Math.min(1, side / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        if (dataUrl.length <= LIMITS.receiptMaxChars) { resolve(dataUrl); return; }
      }
      reject(new Error('image too large'));
    };
    img.src = url;
  });
}
