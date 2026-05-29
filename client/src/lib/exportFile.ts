import { api } from '@/api/client';

export async function downloadApiFile(
  path: string,
  params: Record<string, string | number | undefined | null>,
  filename: string,
  responseType: 'blob' | 'arraybuffer' = 'blob'
) {
  const res = await api.get(path, {
    params,
    responseType,
  });
  const blob = new Blob([res.data], {
    type: res.headers['content-type'] || 'application/octet-stream',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
