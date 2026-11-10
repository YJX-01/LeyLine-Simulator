import { formatJson } from '@leyline/schema';
export function downloadJson(value: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([formatJson(value)], { type: 'application/json' }));
  try {
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
