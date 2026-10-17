// photos/upload-client.ts — браузерная часть загрузки: сжатие и PUT в Storage с прогрессом.
// Импортируется только клиентскими компонентами. Библиотека сжатия (~50 КБ) грузится по требованию,
// при выборе первого большого файла, — страница фото не платит за неё заранее.
import { COMPRESS_FROM_BYTES, COMPRESS_MAX_SIDE_PX, COMPRESS_TARGET_MB } from './rules';

export type ProgressFn = (percent: number) => void;

const RETRY_DELAY_MS = 800;
const CACHE_SECONDS = '31536000'; // имя объекта уникально (uuid) — кэшируем на год

// Сжимает только файлы > 2 МБ. Возвращает исходный файл, если сжатие не уменьшило размер.
export async function compressIfNeeded(file: File, onProgress: ProgressFn): Promise<File> {
  if (file.size <= COMPRESS_FROM_BYTES) {
    onProgress(100);
    return file;
  }
  const { default: imageCompression } = await import('browser-image-compression');
  const blob = await imageCompression(file, {
    maxSizeMB: COMPRESS_TARGET_MB,
    maxWidthOrHeight: COMPRESS_MAX_SIDE_PX,
    useWebWorker: true,
    onProgress,
  });
  if (blob.size >= file.size) return file;
  return new File([blob], file.name, { type: blob.type || file.type, lastModified: file.lastModified });
}

// Один PUT на подписанную ссылку. fetch не умеет прогресс отправки — поэтому XHR.
function putOnce(url: string, file: File, onProgress: ProgressFn, signal: AbortSignal): Promise<'ok' | 'network' | 'rejected'> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300 ? 'ok' : 'rejected');
    xhr.onerror = () => resolve('network');
    xhr.onabort = () => resolve('rejected');
    signal.addEventListener('abort', () => xhr.abort(), { once: true });
    // Формат как у supabase-js uploadToSignedUrl: multipart, тип файла берётся из части с файлом.
    const body = new FormData();
    body.append('cacheControl', CACHE_SECONDS);
    body.append('', file);
    xhr.send(body);
  });
}

// Сетевая ошибка — один повтор (подписанная ссылка живёт 2 часа). Отказ сервера не повторяем.
export async function uploadToSignedUrl(url: string, file: File, onProgress: ProgressFn, signal: AbortSignal): Promise<boolean> {
  const first = await putOnce(url, file, onProgress, signal);
  if (first !== 'network' || signal.aborted) return first === 'ok';
  await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  onProgress(0);
  return (await putOnce(url, file, onProgress, signal)) === 'ok';
}
