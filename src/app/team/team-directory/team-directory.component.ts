import { Component, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { DepartmentItem, TeamInvite, TeamItem, TeamMember } from '../../Interface/team';
import { TeamService } from '../../services/Team/team.service';
import { NotificationsService } from '../../services/notifications.service';
import { LoaderService } from '../../services/Loader/loader.service';
import { TeamUi } from '../team-ui';

/** One card / row of the directory: a member or a pending invite. */
interface PersonEntry {
  Key: string;
  MemberID: number | null;
  InviteID: number | null;
  Name: string;
  Email: string;
  Phone: string;
  Designation: string;
  DepartmentID: number | null;
  TeamID: number | null;
  Location: string;
  Status: 'Active' | 'Invited' | 'Inactive';
  Skills: string[];
  Note: string;
}

@Component({
    selector: 'app-team-directory',
    templateUrl: './team-directory.component.html',
    styleUrl: './team-directory.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class TeamDirectoryComponent implements OnInit {
  ui = TeamUi;
  members: TeamMember[] = [];
  invites: TeamInvite[] = [];
  departments: DepartmentItem[] = [];
  teams: TeamItem[] = [];
  entries: PersonEntry[] = [];

  view: 'grid' | 'table' = 'grid';
  searchValue = '';
  departmentID: number | null = null;
  teamID: number | null = null;
  location = '';
  status = '';
  showMoreFilters = false;
  statusOptions = ['Active', 'Invited', 'Inactive'];
  locations: string[] = [];

  sortColumn: keyof PersonEntry = 'Name';
  sortColumnDir: 'asc' | 'desc' = 'asc';

  constructor(private teamService: TeamService, private router: Router,
    private notificationsService: NotificationsService, private loaderService: LoaderService) { }

  ngOnInit() {
    this.load();
  }

  load() {
    this.loaderService.showLoader();
    forkJoin([this.teamService.getMembers(), this.teamService.getInvites(), this.teamService.getDepartments(), this.teamService.getTeams()])
      .subscribe({
        next: ([m, i, d, t]) => {
          this.members = m;
          this.invites = i.filter(x => x.Status === 'Pending');
          this.departments = d;
          this.teams = t;
          this.locations = Array.from(new Set(m.map(x => x.Location))).sort();
          this.entries = [
            ...m.map(x => ({
              Key: 'm' + x.ID, MemberID: x.ID, InviteID: null, Name: x.Name, Email: x.Email, Phone: x.Phone, Designation: x.Designation,
              DepartmentID: x.DepartmentID, TeamID: x.TeamID, Location: x.Location, Status: x.Status, Skills: x.Skills,
              Note: `Joined ${new Date(x.JoinedOn + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`
            })),
            ...this.invites.map(x => ({
              Key: 'i' + x.ID, MemberID: null, InviteID: x.ID, Name: this.nameFromEmail(x.Email), Email: x.Email, Phone: '',
              Designation: TeamUi.roleName(x.RoleID) + ' (invited)', DepartmentID: t.find(tt => tt.ID === x.TeamID)?.DepartmentID ?? null,
              TeamID: x.TeamID, Location: '', Status: 'Invited' as const, Skills: [], Note: `Invite expires ${x.ExpiresOn}`
            }))
          ];
          this.loaderService.hideLoader();
        },
        error: () => {
          this.loaderService.hideLoader();
          this.notificationsService.showNotification('error', 'Something went wrong. Please try again.');
        }
      });
  }

  private nameFromEmail(email: string): string {
    return email.split('@')[0].split(/[._-]/).filter(Boolean).map(p => p[0].toUpperCase() + p.slice(1)).join(' ');
  }

  get kpi() {
    return {
      total: this.members.filter(m => m.Status !== 'Inactive').length,
      active: this.members.filter(m => m.Status === 'Active').length,
      invited: this.invites.length,
      departments: this.departments.length
    };
  }

  get teamOptions(): TeamItem[] {
    return this.departmentID ? this.teams.filter(t => t.DepartmentID === this.departmentID) : this.teams;
  }

  get filtered(): PersonEntry[] {
    const q = this.searchValue.trim().toLowerCase();
    const rows = this.entries.filter(e =>
      (!q || [e.Name, e.Email, e.Designation, e.Location, ...e.Skills].some(v => v.toLowerCase().includes(q))) &&
      (!this.departmentID || e.DepartmentID === this.departmentID) &&
      (!this.teamID || e.TeamID === this.teamID) &&
      (!this.location || e.Location === this.location) &&
      (!this.status || e.Status === this.status));
    const dir = this.sortColumnDir === 'asc' ? 1 : -1;
    return rows.sort((a, b) => String(a[this.sortColumn] ?? '').localeCompare(String(b[this.sortColumn] ?? '')) * dir);
  }

  get hasFilters(): boolean {
    return !!(this.searchValue || this.departmentID || this.teamID || this.location || this.status);
  }

  onDepartmentChange() {
    if (this.teamID && !this.teamOptions.some(t => t.ID === this.teamID)) this.teamID = null;
  }

  clearFilters() {
    this.searchValue = '';
    this.departmentID = null;
    this.teamID = null;
    this.location = '';
    this.status = '';
  }

  orderBy(column: keyof PersonEntry) {
    this.sortColumnDir = this.sortColumn === column && this.sortColumnDir === 'asc' ? 'desc' : 'asc';
    this.sortColumn = column;
  }

  sortIcon(column: string): string {
    return this.sortColumn === column && this.sortColumnDir === 'desc'
      ? '../../assets/images/certificate/bottom-arrow.svg'
      : '../../assets/images/certificate/top-arrow.svg';
  }

  open(e: PersonEntry) {
    if (e.MemberID) this.router.navigate(['/team/people', e.MemberID]);
    else this.router.navigate(['/team/invite']);
  }

  teamName(ID: number | null): string {
    return TeamUi.teamLabel(ID, this.teams);
  }

  deptName(ID: number | null): string {
    return TeamUi.deptLabel(ID, this.departments);
  }

  resend(i: TeamInvite, event: Event) {
    event.stopPropagation();
    this.teamService.resendInvite(i.ID).subscribe(res => {
      this.notificationsService.showNotification('success', res.Status);
      this.load();
    });
  }
}
