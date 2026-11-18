import { TaskUi } from '../task/task-ui';
import {
  AutomationAction, AutomationActionType, AutomationTrigger, RecurrenceSpec, TextSegment
} from '../Interface/workspace';
import { PROJECTS, USERS, ymd } from '../services/Shared/mock-directory';

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const ORDINALS = ['', 'first', 'second', 'third', 'fourth', 'last'];

/** View helpers for the workspace screens (builds on TaskUi). */
export class WorkspaceUi extends TaskUi {
  static weekdays = WEEKDAYS;
  static weekdaysShort = WEEKDAYS_SHORT;

  // ---------------- text highlight ----------------
  /** Splits `text` into plain / matched segments for every search term (no innerHTML needed). */
  static segments(text: string, query: string): TextSegment[] {
    const value = text || '';
    const terms = (query || '').toLowerCase().split(/\s+/).filter(t => t.length > 0);
    if (!terms.length || !value) return [{ Text: value, Match: false }];
    const lower = value.toLowerCase();
    const marks: boolean[] = new Array(value.length).fill(false);
    terms.forEach(t => {
      let i = lower.indexOf(t);
      while (i >= 0) {
        for (let k = i; k < i + t.length; k++) marks[k] = true;
        i = lower.indexOf(t, i + t.length);
      }
    });
    const out: TextSegment[] = [];
    for (let i = 0; i < value.length; i++) {
      const last = out[out.length - 1];
      if (last && last.Match === marks[i]) last.Text += value[i];
      else out.push({ Text: value[i], Match: marks[i] });
    }
    return out;
  }

  /** every term of the query appears in one of the fields */
  static matches(query: string, ...fields: (string | undefined | null)[]): boolean {
    const hay = fields.filter(Boolean).join(' ').toLowerCase();
    return (query || '').toLowerCase().split(/\s+/).filter(Boolean).every(t => hay.includes(t));
  }

  // ---------------- dates ----------------
  static daysSince(iso: string): number {
    return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  }

  static relative(iso: string | null | undefined): string {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    const future = diff < 0;
    const m = Math.round(Math.abs(diff) / 60000);
    let s: string;
    if (m < 1) return 'just now';
    if (m < 60) s = `${m} min`;
    else if (m < 60 * 24) s = `${Math.round(m / 60)} h`;
    else s = `${Math.round(m / 1440)} d`;
    return future ? `in ${s}` : `${s} ago`;
  }

  // ---------------- recurrence ----------------
  static scheduleSummary(r: RecurrenceSpec): string {
    const at = r.Time ? ` at ${r.Time}` : '';
    switch (r.Frequency) {
      case 'Daily': return `Every day${at}`;
      case 'Weekly': {
        const days = [...(r.Weekdays || [])].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
        if (!days.length) return `Weekly (no day selected)`;
        if (days.length === 5 && [1, 2, 3, 4, 5].every(d => days.includes(d))) return `Every weekday${at}`;
        return `Every ${days.map(d => days.length > 2 ? WEEKDAYS_SHORT[d] : WEEKDAYS[d]).join(', ')}${at}`;
      }
      case 'Monthly':
        return r.MonthlyMode === 'Weekday'
          ? `Monthly on the ${ORDINALS[r.MonthWeek] || 'first'} ${WEEKDAYS[r.MonthWeekday]}${at}`
          : `Monthly on day ${r.MonthDay}${at}`;
      default:
        return Number(r.IntervalDays) === 1 ? `Every day${at}` : `Every ${r.IntervalDays} days${at}`;
    }
  }

  static endSummary(r: RecurrenceSpec): string {
    if (r.EndMode === 'OnDate' && r.EndDate) return `until ${new Date(r.EndDate + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    if (r.EndMode === 'After') return `${r.EndAfter} occurrences`;
    return 'never ends';
  }

  private static matchesDay(r: RecurrenceSpec, d: Date, start: Date): boolean {
    switch (r.Frequency) {
      case 'Daily': return true;
      case 'Weekly': return (r.Weekdays || []).includes(d.getDay());
      case 'Monthly': {
        const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        if (r.MonthlyMode === 'Weekday') {
          if (d.getDay() !== Number(r.MonthWeekday)) return false;
          const week = Number(r.MonthWeek);
          return week === 5 ? d.getDate() + 7 > dim : Math.ceil(d.getDate() / 7) === week;
        }
        return d.getDate() === Math.min(Math.max(1, Number(r.MonthDay) || 1), dim);
      }
      default: {
        const n = Math.max(1, Number(r.IntervalDays) || 1);
        const diff = Math.round((d.getTime() - start.getTime()) / 86400000);
        return diff % n === 0;
      }
    }
  }

  /**
   * Next `count` occurrences (as Date incl. time) on or after `from`.
   * Occurrences are counted from StartDate so "end after N occurrences" is respected.
   */
  static occurrences(r: RecurrenceSpec, count: number, from: Date = new Date()): Date[] {
    if (!r.StartDate) return [];
    const [hh, mm] = (r.Time || '09:00').split(':').map(x => Number(x) || 0);
    const start = new Date(r.StartDate + 'T00:00:00');
    if (isNaN(start.getTime())) return [];
    if (r.Frequency === 'Weekly' && !(r.Weekdays || []).length) return [];
    const end = r.EndMode === 'OnDate' && r.EndDate ? new Date(r.EndDate + 'T23:59:59') : null;
    const maxCount = r.EndMode === 'After' ? Math.max(0, Number(r.EndAfter) || 0) : Infinity;
    const out: Date[] = [];
    let seen = 0;
    const d = new Date(start);
    const limit = new Date(Math.max(from.getTime(), start.getTime()));
    limit.setFullYear(limit.getFullYear() + 3);
    while (d <= limit && out.length < count) {
      if (end && d > end) break;
      if (this.matchesDay(r, d, start)) {
        seen++;
        if (seen > maxCount) break;
        const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm);
        if (at >= from && (!end || at <= end)) out.push(at);
      }
      d.setDate(d.getDate() + 1);
    }
    return out;
  }

  static addDays(date: Date, n: number): string {
    const d = new Date(date);
    d.setDate(d.getDate() + (Number(n) || 0));
    return ymd(d);
  }

  // ---------------- automation ----------------
  static triggerOptions: { Value: AutomationTrigger; Label: string; Hint: string }[] = [
    { Value: 'TaskCreated', Label: 'A task is created', Hint: 'Runs when a new task is added' },
    { Value: 'StatusChanged', Label: 'A task moves to…', Hint: 'Runs when a task moves to a status' },
    { Value: 'DueApproaching', Label: 'A due date is near', Hint: 'Runs a few days before the due date' },
    { Value: 'TaskOverdue', Label: 'A task becomes overdue', Hint: 'Runs once when a task passes its due date' },
    { Value: 'CommentMention', Label: 'Someone is mentioned', Hint: 'Runs when someone is @mentioned in a comment' },
    { Value: 'FieldChanged', Label: 'A field changes', Hint: 'Runs when a selected field changes' },
  ];

  static actionOptions: { Value: AutomationActionType; Label: string }[] = [
    { Value: 'AssignTo', Label: 'Assign to' },
    { Value: 'ChangeStatus', Label: 'Change status' },
    { Value: 'SetPriority', Label: 'Set priority' },
    { Value: 'AddLabel', Label: 'Add label' },
    { Value: 'NotifyUser', Label: 'Notify a person' },
    { Value: 'NotifyRole', Label: 'Notify everyone with a role' },
    { Value: 'CreateSubtask', Label: 'Create subtask' },
    { Value: 'MoveToSprint', Label: 'Move to sprint' },
  ];

  static triggerSummary(trigger: AutomationTrigger, value: string): string {
    switch (trigger) {
      case 'TaskCreated': return 'When a task is created';
      case 'StatusChanged': return value ? `When a task moves to ${value}` : 'When a task changes status';
      case 'DueApproaching': return Number(value || 1) === 1 ? 'When a task is due tomorrow' : `When a task is due in ${value} days`;
      case 'TaskOverdue': return 'When a task becomes overdue';
      case 'CommentMention': return 'When someone is mentioned in a comment';
      case 'FieldChanged': return `When ${value || 'a field'} changes`;
    }
  }

  static actionLabel(type: AutomationActionType): string {
    return this.actionOptions.find(a => a.Value === type)?.Label || type;
  }

  static actionSummary(a: AutomationAction): string {
    const user = (v: string) => USERS.find(u => String(u.ID) === v)?.Name || v;
    switch (a.Type) {
      case 'AssignTo': return `Assign to ${user(a.Value) || '—'}`;
      case 'ChangeStatus': return `Change status to ${a.Value || '—'}`;
      case 'SetPriority': return `Set priority to ${a.Value || '—'}`;
      case 'AddLabel': return `Add label "${a.Value}"`;
      case 'NotifyUser': return `Notify ${user(a.Value) || '—'}`;
      case 'NotifyRole': return `Notify the ${(a.Value || 'team').toLowerCase()}`;
      case 'CreateSubtask': return `Create subtask "${a.Value}"`;
      case 'MoveToSprint': return `Move to ${a.Value || 'sprint'}`;
    }
  }

  /** All actions as one lower-case phrase: "notify the manager, then set priority to High". */
  static actionsSentence(actions: AutomationAction[]): string {
    if (!actions.length) return 'do nothing yet';
    return actions.map(a => { const s = this.actionSummary(a); return s.charAt(0).toLowerCase() + s.slice(1); }).join(', then ');
  }

  // ---------------- misc ----------------
  static projectName(ID: number | string | null | undefined): string {
    return PROJECTS.find(p => String(p.ID) === String(ID))?.Name || '';
  }

  static userName(ID: number | string | null | undefined): string {
    return USERS.find(u => String(u.ID) === String(ID))?.Name || '';
  }
}
