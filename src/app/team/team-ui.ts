import { TaskUi } from '../task/task-ui';
import { Task } from '../Interface/task';
import { Holiday, LeaveRequest, LeaveType, TeamMember, WorkloadDay, WorkloadRow, WorkloadTask } from '../Interface/team';
import { DEPARTMENTS, ROLES, TEAMS, ymd } from '../services/Shared/mock-directory';

/** View helpers + workload maths shared by the Team screens. */
export class TeamUi extends TaskUi {
  static weekDayShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  static leaveTypes: LeaveType[] = ['Casual', 'Sick', 'Earned', 'WFH'];

  static roleName(ID: number | null | undefined): string {
    return ROLES.find(r => r.ID === ID)?.Name || '';
  }

  /** Name lookups that fall back to the static directory (service data is passed in when available). */
  static teamLabel(ID: number | null | undefined, teams: { ID: number; Name: string }[] = TEAMS): string {
    return teams.find(t => t.ID === ID)?.Name || '';
  }

  static deptLabel(ID: number | null | undefined, depts: { ID: number; Name: string }[] = DEPARTMENTS): string {
    return depts.find(d => d.ID === ID)?.Name || '';
  }

  static memberStatusClass(status: string): string {
    switch (status) {
      case 'Active': return 'st-completed';
      case 'Invited': return 'st-hold';
      case 'Pending': return 'st-hold';
      case 'Expired': return 'st-cancelled';
      case 'Revoked': return 'st-notstarted';
      case 'Accepted': return 'st-progress';
      default: return 'st-notstarted';
    }
  }

  static leaveStatusClass(status: string): string {
    return status === 'Approved' ? 'st-completed' : status === 'Rejected' ? 'st-cancelled' : 'st-hold';
  }

  static leaveClass(type: string): string {
    return 'lv-' + (type || 'casual').toLowerCase();
  }

  static leaveColor(type: string): string {
    switch (type) {
      case 'Sick': return '#E0401C';
      case 'Earned': return '#7A3FE4';
      case 'WFH': return '#0E9AA7';
      default: return '#C77800';
    }
  }

  static utilClass(pct: number): string {
    return pct > 100 ? 'red' : pct >= 80 ? 'orange' : 'green';
  }

  static heatClass(d: WorkloadDay): string {
    if (d.Off && d.Capacity === 0) return 'off';
    if (!d.Hours) return 'h0';
    const r = d.Capacity ? d.Hours / d.Capacity : 2;
    if (r > 1) return 'h-over';
    if (r >= 0.8) return 'h-full';
    if (r >= 0.5) return 'h3';
    if (r >= 0.25) return 'h2';
    return 'h1';
  }

  // ---------------- dates ----------------

  static parse(d: string): Date {
    return new Date(d + 'T00:00:00');
  }

  static addDays(d: string, n: number): string {
    const x = TeamUi.parse(d);
    x.setDate(x.getDate() + n);
    return ymd(x);
  }

  static weekStart(d: string = TeamUi.today()): string {
    const x = TeamUi.parse(d);
    const dow = x.getDay();
    x.setDate(x.getDate() - (dow === 0 ? 6 : dow - 1));
    return ymd(x);
  }

  /** Mon-Fri of this week and next week. */
  static gridDays(): string[] {
    const mon = TeamUi.weekStart();
    return [0, 1, 2, 3, 4, 7, 8, 9, 10, 11].map(n => TeamUi.addDays(mon, n));
  }

  static dow(d: string): number {
    return TeamUi.parse(d).getDay();
  }

  static leaveDays(l: LeaveRequest): number {
    return l.HalfDay ? 0.5 : TeamUi.daysBetween(l.FromDate, l.ToDate) + 1;
  }

  // ---------------- capacity ----------------

  static leaveOn(member: TeamMember, date: string, leaves: LeaveRequest[]): LeaveRequest | undefined {
    return leaves.find(l => l.UserID === member.ID && l.Status === 'Approved' && l.FromDate <= date && l.ToDate >= date);
  }

  /** Capacity (hours) of a person on a date after working days, holidays and approved leave. */
  static dayCapacity(member: TeamMember, date: string, leaves: LeaveRequest[], holidays: Holiday[]): { cap: number; off: WorkloadDay['Off'] } {
    const days = member.WorkingDays.length || 5;
    const full = Math.round(member.WeeklyCapacityHours / days * 10) / 10;
    if (!member.WorkingDays.includes(TeamUi.dow(date))) return { cap: 0, off: 'Non-working' };
    if (holidays.some(h => h.Date === date)) return { cap: 0, off: 'Holiday' };
    const l = TeamUi.leaveOn(member, date, leaves);
    if (l && l.Type !== 'WFH') return { cap: l.HalfDay ? full / 2 : 0, off: 'Leave' };
    return { cap: full, off: '' };
  }

  static remainingHours(t: Task): number {
    return Math.max(0, Math.round((t.EstimateHours - (t.LoggedMinutes || 0) / 60) * 10) / 10);
  }

  /**
   * Spreads the remaining estimate of each open task evenly over the person's available
   * working days between max(today, start) and the due date. Overdue work lands on today.
   */
  static computeWorkload(member: TeamMember, tasks: Task[], leaves: LeaveRequest[], holidays: Holiday[]): WorkloadRow {
    const today = TeamUi.today();
    const grid = TeamUi.gridDays();
    const hours: { [d: string]: number } = {};
    const open = tasks.filter(t => t.AssigneeID === member.ID && t.Status !== 'Done');

    const isAvailable = (d: string) => TeamUi.dayCapacity(member, d, leaves, holidays).cap > 0;
    const nextAvailable = (d: string) => {
      let x = d;
      for (let i = 0; i < 30 && !isAvailable(x); i++) x = TeamUi.addDays(x, 1);
      return x;
    };

    open.forEach(t => {
      const rem = TeamUi.remainingHours(t);
      if (!rem) return;
      let from = t.StartDate && t.StartDate > today ? t.StartDate : today;
      let to = t.DueDate || TeamUi.addDays(from, 9);
      if (to < from) { from = nextAvailable(today); to = from; }
      const days: string[] = [];
      for (let d = from; d <= to && days.length < 90; d = TeamUi.addDays(d, 1)) if (isAvailable(d)) days.push(d);
      if (!days.length) days.push(nextAvailable(from));
      const per = rem / days.length;
      days.forEach(d => hours[d] = (hours[d] || 0) + per);
    });

    const Days: WorkloadDay[] = grid.map(d => {
      const c = TeamUi.dayCapacity(member, d, leaves, holidays);
      return { Date: d, Hours: Math.round((hours[d] || 0) * 10) / 10, Capacity: c.cap, Off: c.off };
    });
    const week = Days.slice(0, 5);
    const WeekHours = Math.round(week.reduce((s, d) => s + d.Hours, 0) * 10) / 10;
    const WeekCapacity = Math.round(week.reduce((s, d) => s + d.Capacity, 0) * 10) / 10;
    const OpenTasks: WorkloadTask[] = open
      .map(t => ({
        ID: t.ID, Key: t.Key, Title: t.Title, ProjectName: t.ProjectName, Priority: t.Priority, Status: t.Status,
        DueDate: t.DueDate, EstimateHours: t.EstimateHours, RemainingHours: TeamUi.remainingHours(t)
      }))
      .sort((a, b) => (a.DueDate || '9999').localeCompare(b.DueDate || '9999'));
    return {
      Member: member, OpenTasks, WeekHours, WeekCapacity, Days,
      Utilization: WeekCapacity ? Math.round(WeekHours / WeekCapacity * 100) : (WeekHours ? 999 : 0)
    };
  }

  /** Completion date of a done task: last update made in this session, else start + 5 days (matches seeded activity). */
  static completedOn(t: Task): string {
    if (t.UpdatedOn && t.CreatedOn && t.UpdatedOn > t.CreatedOn) return t.UpdatedOn.slice(0, 10);
    const base = t.StartDate || (t.CreatedOn || '').slice(0, 10) || TeamUi.today();
    const d = TeamUi.addDays(base, 5);
    return d > TeamUi.today() ? TeamUi.today() : d;
  }
}
