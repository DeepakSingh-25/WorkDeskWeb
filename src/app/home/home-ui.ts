import { TaskUi } from '../task/task-ui';
import { CalendarItemType, HomeNotification, InboxItem, NotificationType } from '../Interface/home';

/** One plain sentence: <b>Who</b> Action <b>Target</b> After. */
export interface Sentence { Who: string; Action: string; Target: string; After: string; }

/** View helpers for the dashboard screens (builds on TaskUi / ProjectUi). */
export class HomeUi extends TaskUi {
  static notifLabels: { [k in NotificationType]: string } = {
    assignment: 'Assigned', mention: 'Mentions', approval: 'Approvals', due: 'Due soon',
    overdue: 'Late', milestone: 'Milestones', sprint: 'Sprints',
  };

  static calMeta: { [k in CalendarItemType]: { label: string; color: string } } = {
    task: { label: 'Task due', color: '#0043E0' },
    milestone: { label: 'Milestone', color: '#7A3FE4' },
    leave: { label: 'My leave', color: '#C77800' },
    holiday: { label: 'Holiday', color: '#029848' },
    sprint: { label: 'Sprint', color: '#0E9AA7' },
  };

  static greeting(): string {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }

  /** True when a click started on a button, link, input or "⋯" menu inside a clickable row. */
  static isControl(e: Event): boolean {
    const el = e.target as HTMLElement | null;
    return !!el?.closest?.('button, a, input, select, .dropdown');
  }

  /** Calendar chip text without leading glyphs (◆ ▶ ■) or task keys. */
  static chipTitle(title: string): string {
    return TaskUi.stripKey((title || '').replace(/^[◆▶■]\s*/, ''));
  }

  /** Plain sentence for a notification, e.g. "Neha Gupta mentioned you in Lead scoring model". */
  static notifSentence(n: HomeNotification, taskTitles: { [id: number]: string } = {}): Sentence {
    const who = n.ActorName === 'System' ? '' : n.ActorName;
    const task = TaskUi.stripKey(n.Text);
    switch (n.Type) {
      case 'assignment': return { Who: who, Action: 'assigned you', Target: task, After: '' };
      case 'mention': {
        const title = taskTitles[n.QueryParams?.['task']];
        return { Who: who, Action: title ? 'mentioned you in' : 'mentioned you in a comment', Target: title ? TaskUi.stripKey(title) : '', After: '' };
      }
      case 'approval': return { Who: who, Action: 'needs your approval for', Target: n.Text, After: '' };
      case 'due': return { Who: '', Action: '', Target: task, After: n.Title.endsWith('today') ? 'is due today' : 'is due tomorrow' };
      case 'overdue': {
        const d = Number(/by (\d+)d$/.exec(n.Title)?.[1] || 0);
        return { Who: '', Action: '', Target: task, After: d === 1 ? 'is 1 day late' : d ? `is ${d} days late` : 'is late' };
      }
      case 'milestone': {
        const name = n.Title.replace(/^[^:]*:\s*/, '');
        const days = /in (\d+)d/.exec(n.Title)?.[1];
        const after = n.Title.startsWith('Milestone missed') ? 'was missed'
          : days === '0' ? 'is due today' : days === '1' ? 'is due tomorrow' : `is due in ${days} days`;
        return { Who: '', Action: 'Milestone', Target: name, After: after };
      }
      case 'sprint': return { Who: '', Action: '', Target: n.Title.replace(/ started$/, ''), After: 'has started' };
      default: return { Who: who, Action: '', Target: n.Title, After: '' };
    }
  }

  /** Plain sentence for an inbox item, e.g. "Rohit Mehta assigned you Quotation template". */
  static inboxSentence(i: InboxItem): Sentence {
    const title = TaskUi.stripKey(i.Title);
    switch (i.Type) {
      case 'task': return { Who: i.FromName, Action: 'assigned you', Target: title, After: '' };
      case 'approval': return { Who: i.FromName, Action: 'needs your approval for', Target: title, After: '' };
      case 'mention': return { Who: i.FromName, Action: 'mentioned you in', Target: title, After: '' };
      default: return i.Snippet.startsWith('Your task')
        ? { Who: '', Action: 'Your task', Target: title, After: 'is waiting for review' }
        : { Who: i.FromName, Action: 'asked you to review', Target: title, After: '' };
    }
  }

  /** Today / Yesterday / Earlier bucket of an ISO date-time. */
  static dayBucket(iso: string): 'Today' | 'Yesterday' | 'Earlier' {
    const day = iso ? HomeUi.localDay(iso) : '';
    const today = TaskUi.today();
    if (day === today) return 'Today';
    if (TaskUi.daysBetween(day, today) === 1) return 'Yesterday';
    return 'Earlier';
  }

  /** Local yyyy-MM-dd of an ISO date-time. */
  static localDay(iso: string): string {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  static dayTitle(day: string): string {
    const today = TaskUi.today();
    const diff = TaskUi.daysBetween(day, today);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return '';
  }
}
