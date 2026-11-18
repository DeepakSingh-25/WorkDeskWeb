import { TaskUi } from '../task/task-ui';
import { AuditLog } from '../Interface/settings';

/** View helpers for the settings (administration & security) screens. */
export class SettingsUi extends TaskUi {
  static weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  static userStatusClass(status: string): string {
    switch (status) {
      case 'Active': return 'st-completed';
      case 'Invited': return 'st-pending';
      default: return 'st-cancelled';
    }
  }

  static scoreColor(score: number): string {
    return score >= 80 ? '#029848' : score >= 55 ? '#C77800' : '#E0401C';
  }

  /** conic-gradient ring background for a 0..100 score. */
  static ring(score: number): string {
    const c = SettingsUi.scoreColor(score);
    return `conic-gradient(${c} ${score * 3.6}deg, #EAF0FF 0deg)`;
  }

  static meterClass(pct: number): string {
    return pct >= 90 ? 'red' : pct >= 75 ? 'orange' : '';
  }

  static escapeHtml(v: unknown): string {
    return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c] as string));
  }

  /**
   * Audit entry as one plain sentence: <b>Actor</b> {{Action}} <b>{{Target}}</b> {{After}}
   * e.g. "Aarav Sharma" + "changed the role of" + "Neha Gupta" + "to Admin".
   */
  static auditSentence(a: AuditLog): { Action: string; Target: string; After: string } {
    const to = (k: string): string => {
      const v = a.After?.[k];
      return v === undefined || v === null ? '' : `to ${v}`;
    };
    const name = TaskUi.stripKey(a.EntityName);
    switch (a.Action) {
      case 'Signed in': return { Action: 'logged in', Target: '', After: '' };
      case 'Failed sign-in': return { Action: 'tried to log in', Target: '', After: '(wrong password)' };
      case 'Changed user role': return { Action: 'changed the role of', Target: name, After: to('Role') };
      case 'Invited user': return { Action: 'invited', Target: name, After: '' };
      case 'Bulk updated users': return { Action: 'updated', Target: name, After: '' };
      case 'Sent password reset': return { Action: 'sent a password reset to', Target: name, After: '' };
      case 'Removed user': return { Action: 'removed', Target: name, After: '' };
      case 'Updated role permissions': return { Action: 'changed what', Target: name, After: 'can do' };
      case 'Updated access policies': return { Action: 'changed the', Target: 'security settings', After: '' };
      case 'Updated workspace settings': return { Action: 'changed the', Target: 'organization settings', After: '' };
      case 'Updated email settings': return { Action: 'changed the', Target: 'email sending settings', After: '' };
      case 'Generated API key': return { Action: 'created the API key', Target: name, After: '' };
      case 'Revoked API key': return { Action: 'turned off the API key', Target: name, After: '' };
      case 'Permission denied': return { Action: 'was blocked from opening', Target: name, After: '' };
      case 'Exported report': return { Action: 'downloaded', Target: name, After: '' };
      case 'Changed subscription plan': return { Action: 'changed the plan', Target: '', After: to('Plan') };
      case 'Added seats': return { Action: 'added', Target: name, After: '' };
      case 'Connected integration': return { Action: 'connected', Target: name, After: '' };
      case 'Disconnected integration': return { Action: 'disconnected', Target: name, After: '' };
      case 'Updated task': {
        const moved = a.Before?.['Status'] !== a.After?.['Status'] && to('Status');
        return moved ? { Action: 'moved', Target: name, After: moved } : { Action: 'updated', Target: name, After: '' };
      }
      default: {
        // "Created task" -> "created task <name>"
        const verb = a.Action.charAt(0).toLowerCase() + a.Action.slice(1);
        return { Action: verb, Target: name, After: '' };
      }
    }
  }
}
