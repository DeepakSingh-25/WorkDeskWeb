import { ProjectUi } from '../project/project-ui';
import { Task } from '../Interface/task';

/** View helpers for task screens (builds on ProjectUi for avatars, initials and dates). */
export class TaskUi extends ProjectUi {
  static taskStatuses = ['To Do', 'In Progress', 'In Review', 'Done'];

  static taskStatusClass(status: string): string {
    switch (status) {
      case 'In Progress': return 'st-progress';
      case 'In Review': return 'st-review';
      case 'Done': return 'st-completed';
      default: return 'st-todo';
    }
  }

  static statusColor(status: string): string {
    switch (status) {
      case 'In Progress': return '#0043E0';
      case 'In Review': return '#7A3FE4';
      case 'Done': return '#029848';
      default: return '#8A94A6';
    }
  }

  static priorityColor(priority: string): string {
    switch (priority) {
      case 'Critical': return '#E0401C';
      case 'High': return '#C77800';
      case 'Low': return '#029848';
      default: return '#0043E0';
    }
  }

  static isOverdue(t: Task): boolean {
    return t.Status !== 'Done' && !!t.DueDate && t.DueDate < ProjectUi.today();
  }

  static dueClass(t: Task): string {
    if (t.Status === 'Done' || !t.DueDate) return '';
    const left = ProjectUi.daysLeft(t.DueDate);
    return left < 0 ? 'due-late' : left <= 2 ? 'due-soon' : '';
  }

  static dueLabel(t: Task): string {
    if (!t.DueDate) return 'No due date';
    if (t.Status === 'Done') return '';
    const left = ProjectUi.daysLeft(t.DueDate);
    if (left === -1) return '1 day late';
    if (left < 0) return `${-left} days late`;
    if (left === 0) return 'Due today';
    if (left === 1) return 'Due tomorrow';
    return `${left} days left`;
  }

  /** Plain words: "45 min", "2 hr", "1 hr 30 min". */
  static formatMinutes(min: number): string {
    const h = Math.floor((min || 0) / 60), m = (min || 0) % 60;
    return h ? (m ? `${h} hr ${m} min` : `${h} hr`) : `${m} min`;
  }

  /** Plain words: "just now", "5 min ago", "3 hours ago", "Yesterday", "4 days ago" or a date. */
  static ago(iso: string | null | undefined): string {
    if (!iso) return '';
    const diff = Math.max(0, Date.now() - new Date(iso).getTime());
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return h === 1 ? '1 hour ago' : `${h} hours ago`;
    const d = Math.floor(h / 24);
    if (d === 1) return 'Yesterday';
    if (d < 30) return `${d} days ago`;
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  /** Drops task keys like "SDA-3 " from the front of a title. */
  static stripKey(title: string): string {
    return (title || '').replace(/^[A-Z]+-[A-Z0-9]+\s+/, '');
  }

  /**
   * One short plain sentence for an activity entry, rendered as
   * <b>User</b> {{Action}} <b>{{Target}}</b> {{After}}
   * e.g. "Rohit Mehta" + "moved" + "Quotation template" + "to In Progress".
   * Works for task activity (TaskService.getActivity) and feed items with Type/Text/Target.
   */
  static simpleActivity(a: { Type: string; Text: string; Target?: string }): { Action: string; Target: string; After: string } {
    const target = TaskUi.stripKey(a.Target || '');
    const t = a.Text || '';
    switch (a.Type) {
      case 'created': return { Action: 'created', Target: target || 'this task', After: '' };
      case 'status': {
        const to = /to (.+)$/.exec(t)?.[1];
        return to ? { Action: 'moved', Target: target || 'this task', After: `to ${to}` } : { Action: 'updated', Target: target, After: '' };
      }
      case 'assignee': {
        const who = /assigned to (.+)$/.exec(t)?.[1];
        return who ? { Action: 'assigned', Target: target || 'this task', After: `to ${who}` } : { Action: 'unassigned', Target: target, After: '' };
      }
      case 'comment': return { Action: target ? 'commented on' : 'added a comment', Target: target, After: '' };
      case 'attachment': return { Action: t.startsWith('removed') ? 'removed a file' + (target ? ' from' : '') : 'added a file' + (target ? ' to' : ''), Target: target, After: '' };
      case 'worklog': {
        const time = /logged (.+)$/.exec(t)?.[1];
        return { Action: (time ? `worked ${time}` : 'logged time') + (target ? ' on' : ''), Target: target, After: '' };
      }
      case 'subtask': return { Action: 'updated the checklist' + (target ? ' of' : ''), Target: target, After: '' };
      case 'dependency': return { Action: 'changed what' + (target ? '' : ' this task'), Target: target, After: 'is waiting on' };
      case 'milestone': return { Action: 'completed milestone', Target: target, After: '' };
      case 'sprint': return { Action: 'started', Target: target, After: '' };
      default: return { Action: 'updated', Target: target || 'this task', After: '' };
    }
  }

  static formatBytes(b: number): string {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
    return `${(b / 1024 / 1024).toFixed(1)} MB`;
  }

  static fileKind(name: string, type: string): 'img' | 'pdf' | 'xls' | 'doc' | 'other' {
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (type.startsWith('image/')) return 'img';
    if (ext === 'pdf') return 'pdf';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return 'xls';
    if (['doc', 'docx', 'txt', 'md'].includes(ext)) return 'doc';
    return 'other';
  }

  static fileExt(name: string): string {
    return (name.split('.').pop() || 'FILE').toUpperCase().slice(0, 4);
  }
}
