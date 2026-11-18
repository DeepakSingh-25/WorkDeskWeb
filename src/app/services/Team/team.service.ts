import { Injectable } from '@angular/core';
import { Observable, delay, of } from 'rxjs';
import {
  CURRENT_USER_ID, DEPARTMENTS, ROLES, TEAMS, USERS, daysFromToday, userName
} from '../Shared/mock-directory';
import {
  DepartmentItem, Holiday, InviteRow, LeaveRequest, LeaveStatus, LeaveType, TeamInvite, TeamItem, TeamMember
} from '../../Interface/team';

/**
 * Team & Resource management service.
 *
 * NOTE: OM-API me abhi Team / Leave / Invite endpoints nahi hain, isliye ye service in-memory
 * mock data use karti hai (page refresh par reset). People, departments and teams are seeded
 * from Shared/mock-directory.ts so IDs and names match the Projects / Tasks modules.
 * Invites are mock only - no email is actually sent.
 */
@Injectable({
  providedIn: 'root'
})
export class TeamService {
  private latency = 200;

  readonly roles = ROLES;
  readonly leaveTypes: LeaveType[] = ['Casual', 'Sick', 'Earned', 'WFH'];

  private members: TeamMember[] = [];
  private departments: DepartmentItem[] = [];
  private teams: TeamItem[] = [];
  private invites: TeamInvite[] = [];
  private leaves: LeaveRequest[] = [];
  private holidays: Holiday[] = [];

  constructor() {
    this.seed();
  }

  get currentUserId(): number {
    return CURRENT_USER_ID;
  }

  // ---------------- People ----------------

  getMembers(): Observable<TeamMember[]> {
    return this.respond(this.members.map(m => this.clone(m)));
  }

  getMember(ID: number): Observable<TeamMember | undefined> {
    const m = this.members.find(x => x.ID === Number(ID));
    return this.respond(m ? this.clone(m) : undefined);
  }

  updateCapacity(ID: number, WeeklyCapacityHours: number, WorkingDays: number[]): Observable<any> {
    const m = this.members.find(x => x.ID === Number(ID));
    if (!m) return this.respond({ Status: 'Member Not Found' });
    m.WeeklyCapacityHours = Number(WeeklyCapacityHours) || 0;
    m.WorkingDays = [...WorkingDays].sort();
    return this.respond({ Status: 'Capacity Updated Successfully...' });
  }

  // ---------------- Departments ----------------

  getDepartments(): Observable<DepartmentItem[]> {
    return this.respond(this.departments.map(d => ({ ...d })));
  }

  departmentAddEdit(data: DepartmentItem & { AddEdit: 'A' | 'E' }): Observable<any> {
    if (this.departments.some(d => d.ID !== data.ID && d.Name.trim().toLowerCase() === data.Name.trim().toLowerCase())) {
      return this.respond({ Status: 'Department Already Exists' });
    }
    if (data.AddEdit === 'A') {
      const ID = Math.max(0, ...this.departments.map(d => d.ID)) + 1;
      this.departments.push({ ID, Name: data.Name.trim(), HeadID: data.HeadID, Description: data.Description || '' });
      return this.respond({ Status: 'Department Added Successfully...', ID });
    }
    const d = this.departments.find(x => x.ID === data.ID);
    if (!d) return this.respond({ Status: 'Department Not Found' });
    Object.assign(d, { Name: data.Name.trim(), HeadID: data.HeadID, Description: data.Description || '' });
    return this.respond({ Status: 'Department Updated Successfully...' });
  }

  deleteDepartment(ID: number): Observable<any> {
    if (this.teams.some(t => t.DepartmentID === ID)) {
      return this.respond({ Status: 'Department has teams. Move or delete them first.' });
    }
    this.departments = this.departments.filter(d => d.ID !== ID);
    return this.respond({ Status: 'Department Deleted Successfully!' });
  }

  // ---------------- Teams ----------------

  getTeams(): Observable<TeamItem[]> {
    return this.respond(this.teams.map(t => ({ ...t })));
  }

  teamAddEdit(data: TeamItem & { AddEdit: 'A' | 'E'; MemberIDs?: number[] }): Observable<any> {
    if (this.teams.some(t => t.ID !== data.ID && t.Name.trim().toLowerCase() === data.Name.trim().toLowerCase())) {
      return this.respond({ Status: 'Team Already Exists' });
    }
    let ID = data.ID;
    if (data.AddEdit === 'A') {
      ID = Math.max(0, ...this.teams.map(t => t.ID)) + 1;
      this.teams.push({ ID, Name: data.Name.trim(), DepartmentID: data.DepartmentID, LeadID: data.LeadID, Description: data.Description || '' });
    } else {
      const t = this.teams.find(x => x.ID === data.ID);
      if (!t) return this.respond({ Status: 'Team Not Found' });
      Object.assign(t, { Name: data.Name.trim(), DepartmentID: data.DepartmentID, LeadID: data.LeadID, Description: data.Description || '' });
    }
    // members picked in the form move to this team (lead always belongs to it)
    const ids = new Set([...(data.MemberIDs || []), data.LeadID]);
    this.members.forEach(m => {
      if (ids.has(m.ID)) { m.TeamID = ID; m.DepartmentID = data.DepartmentID; }
    });
    return this.respond({ Status: data.AddEdit === 'A' ? 'Team Added Successfully...' : 'Team Updated Successfully...', ID });
  }

  deleteTeam(ID: number): Observable<any> {
    if (this.members.some(m => m.TeamID === ID && m.Status !== 'Inactive')) {
      return this.respond({ Status: 'Team has members. Move them to another team first.' });
    }
    this.teams = this.teams.filter(t => t.ID !== ID);
    return this.respond({ Status: 'Team Deleted Successfully!' });
  }

  // ---------------- Invites ----------------

  getInvites(): Observable<TeamInvite[]> {
    this.expireInvites();
    return this.respond(this.invites.map(i => ({ ...i })).sort((a, b) => b.InvitedOn.localeCompare(a.InvitedOn)));
  }

  sendInvites(rows: InviteRow[], Message: string): Observable<any> {
    rows.forEach(r => {
      const ID = Math.max(0, ...this.invites.map(i => i.ID)) + 1;
      this.invites.push({
        ID, Email: r.Email.trim().toLowerCase(), RoleID: r.RoleID, TeamID: r.TeamID, Message: Message || '',
        InvitedBy: userName(CURRENT_USER_ID), InvitedOn: daysFromToday(0), ExpiresOn: daysFromToday(7), Status: 'Pending', ResentCount: 0
      });
    });
    return this.respond({ Status: `${rows.length} Invite${rows.length === 1 ? '' : 's'} Sent Successfully...` });
  }

  resendInvite(ID: number): Observable<any> {
    const i = this.invites.find(x => x.ID === ID);
    if (!i) return this.respond({ Status: 'Invite Not Found' });
    Object.assign(i, { Status: 'Pending', InvitedOn: daysFromToday(0), ExpiresOn: daysFromToday(7), ResentCount: i.ResentCount + 1 });
    return this.respond({ Status: 'Invite Resent Successfully...' });
  }

  revokeInvite(ID: number): Observable<any> {
    const i = this.invites.find(x => x.ID === ID);
    if (i) i.Status = 'Revoked';
    return this.respond({ Status: 'Invite Revoked Successfully!' });
  }

  // ---------------- Leave & holidays ----------------

  getLeaves(): Observable<LeaveRequest[]> {
    return this.respond(this.leaves.map(l => ({ ...l })).sort((a, b) => a.FromDate.localeCompare(b.FromDate)));
  }

  applyLeave(data: Omit<LeaveRequest, 'ID' | 'UserName' | 'Status' | 'AppliedOn'>): Observable<any> {
    const overlap = this.leaves.some(l => l.UserID === data.UserID && l.Status !== 'Rejected'
      && l.FromDate <= data.ToDate && l.ToDate >= data.FromDate);
    if (overlap) return this.respond({ Status: 'A leave request already exists for these dates' });
    const ID = Math.max(0, ...this.leaves.map(l => l.ID)) + 1;
    this.leaves.push({ ...data, ID, UserName: userName(data.UserID), Status: 'Pending', AppliedOn: daysFromToday(0) });
    return this.respond({ Status: 'Leave Request Added Successfully...', ID });
  }

  setLeaveStatus(ID: number, Status: LeaveStatus): Observable<any> {
    const l = this.leaves.find(x => x.ID === ID);
    if (!l) return this.respond({ Status: 'Leave Request Not Found' });
    l.Status = Status;
    l.ActionBy = userName(CURRENT_USER_ID);
    return this.respond({ Status: `Leave Request ${Status} Successfully...` });
  }

  getHolidays(): Observable<Holiday[]> {
    return this.respond(this.holidays.map(h => ({ ...h })));
  }

  // ---------------- internals ----------------

  private respond<T>(value: T): Observable<T> {
    return of(value).pipe(delay(this.latency));
  }

  private clone(m: TeamMember): TeamMember {
    return { ...m, Skills: [...m.Skills], WorkingDays: [...m.WorkingDays] };
  }

  private expireInvites() {
    const today = daysFromToday(0);
    this.invites.forEach(i => { if (i.Status === 'Pending' && i.ExpiresOn < today) i.Status = 'Expired'; });
  }

  private seed() {
    this.departments = DEPARTMENTS.map(d => ({ ...d }));
    this.teams = TEAMS.map(t => ({ ...t }));
    this.members = USERS.map(u => ({
      ...u, Skills: [...u.Skills],
      WorkingDays: u.ID === 7 ? [1, 2, 3, 4] : [1, 2, 3, 4, 5]          // Vikram works a 4-day week (32h)
    }));
    // a former employee so the Inactive filter has data (no tasks assigned)
    this.members.push({
      ID: 9, Name: 'Rahul Desai', Email: 'rahul.desai@example.com', Phone: '+91 98200 11009', Designation: 'Support Engineer',
      DepartmentID: 4, TeamID: 6, ManagerID: 7, Location: 'Jaipur', JoinedOn: '2020-02-03', Status: 'Inactive', RoleID: 4,
      WeeklyCapacityHours: 40, Skills: ['ITIL', 'Windows Server'], WorkingDays: [1, 2, 3, 4, 5]
    });

    const by = userName(CURRENT_USER_ID);
    this.invites = [
      { ID: 1, Email: 'meera.joshi@example.com', RoleID: 4, TeamID: 1, Message: 'Welcome to the Web Platform team!', InvitedBy: by, InvitedOn: daysFromToday(-2), ExpiresOn: daysFromToday(5), Status: 'Pending', ResentCount: 0 },
      { ID: 2, Email: 'arjun.nair@example.com', RoleID: 4, TeamID: 3, Message: '', InvitedBy: by, InvitedOn: daysFromToday(-5), ExpiresOn: daysFromToday(2), Status: 'Pending', ResentCount: 1 },
      { ID: 3, Email: 'divya.kulkarni@example.com', RoleID: 3, TeamID: 4, Message: '', InvitedBy: userName(4), InvitedOn: daysFromToday(-1), ExpiresOn: daysFromToday(6), Status: 'Pending', ResentCount: 0 },
      { ID: 4, Email: 'sameer.khan@example.com', RoleID: 5, TeamID: 5, Message: '', InvitedBy: by, InvitedOn: daysFromToday(-12), ExpiresOn: daysFromToday(-5), Status: 'Pending', ResentCount: 0 },
    ];

    const leave = (ID: number, UserID: number, Type: LeaveType, from: number, to: number, Status: LeaveStatus, Reason: string, HalfDay = false): LeaveRequest => ({
      ID, UserID, UserName: userName(UserID), Type, FromDate: daysFromToday(from), ToDate: daysFromToday(to), HalfDay, Reason, Status,
      AppliedOn: daysFromToday(Math.min(from, 0) - 3), ActionBy: Status === 'Pending' ? undefined : userName(CURRENT_USER_ID)
    });
    this.leaves = [
      leave(1, 2, 'Sick', -3, -2, 'Approved', 'Viral fever'),
      leave(2, 6, 'WFH', 0, 0, 'Approved', 'Internet installation at home'),
      leave(3, 5, 'Casual', 0, 0, 'Approved', 'Family function'),
      leave(4, 3, 'Earned', 2, 4, 'Approved', 'Short vacation'),
      leave(5, 8, 'Earned', 8, 12, 'Approved', 'Hometown visit'),
      leave(6, 4, 'Casual', 13, 14, 'Pending', 'Personal work'),
      leave(7, 7, 'Casual', 3, 3, 'Pending', 'Bank work', true),
      leave(8, 2, 'WFH', 6, 6, 'Pending', 'Plumber visit'),
      leave(9, 3, 'Casual', -9, -9, 'Rejected', 'Release week - please reschedule'),
      leave(10, 1, 'WFH', -6, -6, 'Approved', 'Working from home'),
      leave(11, 6, 'Sick', 20, 21, 'Pending', 'Doctor appointment'),
    ];

    const y = new Date().getFullYear();
    const fixed: [string, string][] = [
      ['01-26', 'Republic Day'], ['03-04', 'Holi'], ['05-01', 'Labour Day'], ['08-15', 'Independence Day'],
      ['10-02', 'Gandhi Jayanti'], ['10-20', 'Dussehra'], ['11-08', 'Diwali'], ['11-09', 'Diwali (Day 2)'], ['12-25', 'Christmas'],
    ];
    this.holidays = [y, y + 1].flatMap(yr => fixed.map(([md, Name]) => ({ Date: `${yr}-${md}`, Name })));
  }
}
