import type { Task } from '@tackle/shared';

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const EXT_ICON: Record<Task['external_system'], string> = {
  github: 'GH',
  ado: 'ADO',
};
