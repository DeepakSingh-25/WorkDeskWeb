import { Component, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { InviteRow, TeamInvite, TeamItem, TeamMember } from '../../Interface/team';
import { TeamService } from '../../services/Team/team.service';
import { NotificationsService } from '../../services/notifications.service';
import { LoaderService } from '../../services/Loader/loader.service';
import { CURRENT_USER_ID, ROLES, userName } from '../../services/Shared/mock-directory';
import { TeamUi } from '../team-ui';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

@Component({
    selector: 'app-team-invite',
    templateUrl: './team-invite.component.html',
    styleUrl: './team-invite.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class TeamInviteComponent implements OnInit {
  ui = TeamUi;
  roles = ROLES.filter(r => r.ID !== 1);           // Super Admin (ID 1) cannot be invited
  inviterName = userName(CURRENT_USER_ID);
  members: TeamMember[] = [];
  teams: TeamItem[] = [];
  invites: TeamInvite[] = [];
  submitted = false;
  inviteFilter = 'Pending';
  showPreview = false;
  showMoreOptions = false;

  inviteForm: FormGroup;

  constructor(private fb: FormBuilder, private teamService: TeamService,
    private notificationsService: NotificationsService, private loaderService: LoaderService) {
    this.inviteForm = this.fb.group({
      Rows: this.fb.array([this.newRow()]),
      txtBulk: [''],
      txtMessage: ['', Validators.maxLength(500)],
    });
  }

  ngOnInit() {
    forkJoin([this.teamService.getMembers(), this.teamService.getTeams()]).subscribe(([m, t]) => {
      this.members = m;
      this.teams = t;
    });
    this.loadInvites();
  }

  loadInvites() {
    this.teamService.getInvites().subscribe(i => this.invites = i);
  }

  get rows(): FormArray {
    return this.inviteForm.get('Rows') as FormArray;
  }

  private newRow(email = '') {
    return this.fb.group({
      txtEmail: [email, [Validators.required, Validators.maxLength(150)]],
      drpRole: [4, Validators.required],
      drpTeam: [null as number | null],
    });
  }

  addRow() {
    const last = this.rows.at(this.rows.length - 1)?.value;
    const row = this.newRow();
    if (last) row.patchValue({ drpRole: last.drpRole, drpTeam: last.drpTeam });
    this.rows.push(row);
  }

  removeRow(i: number) {
    if (this.rows.length === 1) this.rows.at(0).reset({ txtEmail: '', drpRole: 4, drpTeam: null });
    else this.rows.removeAt(i);
  }

  /** Adds every email from the paste box as a new row (empty first row is reused). */
  addBulk() {
    const text: string = this.inviteForm.value.txtBulk || '';
    const emails = Array.from(new Set(text.split(/[\s,;]+/).map(e => e.trim().toLowerCase()).filter(Boolean)));
    if (!emails.length) {
      this.notificationsService.showNotification('error', 'Paste one or more email addresses first');
      return;
    }
    const existing = new Set(this.rows.controls.map(c => String(c.value.txtEmail || '').trim().toLowerCase()));
    let added = 0;
    emails.forEach(e => {
      if (existing.has(e)) return;
      const first = this.rows.at(0);
      if (this.rows.length === 1 && !String(first.value.txtEmail || '').trim()) first.patchValue({ txtEmail: e });
      else {
        this.addRow();
        this.rows.at(this.rows.length - 1).patchValue({ txtEmail: e });
      }
      existing.add(e);
      added++;
    });
    this.inviteForm.patchValue({ txtBulk: '' });
    this.notificationsService.showNotification('success', `${added} email${added === 1 ? '' : 's'} added to the list`);
  }

  rowError(i: number): string {
    const email = String(this.rows.at(i).value.txtEmail || '').trim().toLowerCase();
    const touched = this.submitted || this.rows.at(i).get('txtEmail')?.touched;
    if (!email) return touched ? 'Email is Required' : '';
    if (!EMAIL_RE.test(email)) return 'Enter a valid email address';
    const firstIndex = this.rows.controls.findIndex(c => String(c.value.txtEmail || '').trim().toLowerCase() === email);
    if (firstIndex !== i) return 'Duplicate email in this list';
    const m = this.members.find(x => x.Email.toLowerCase() === email);
    if (m) return `${m.Name} is already a member`;
    if (this.invites.some(x => x.Email === email && x.Status === 'Pending')) return 'Already invited (pending)';
    return '';
  }

  get validCount(): number {
    return this.rows.controls.filter((c, i) => String(c.value.txtEmail || '').trim() && !this.rowError(i)).length;
  }

  get previewRow(): { email: string; role: string; team: string } {
    const r = this.rows.controls.find(c => String(c.value.txtEmail || '').trim())?.value || this.rows.at(0).value;
    return {
      email: String(r.txtEmail || '').trim() || 'name@company.com',
      role: TeamUi.roleName(Number(r.drpRole)) || 'Member',
      team: TeamUi.teamLabel(r.drpTeam, this.teams)
    };
  }

  get filteredInvites(): TeamInvite[] {
    return this.inviteFilter ? this.invites.filter(i => i.Status === this.inviteFilter) : this.invites;
  }

  countBy(status: string): number {
    return status ? this.invites.filter(i => i.Status === status).length : this.invites.length;
  }

  onSend() {
    this.submitted = true;
    this.rows.controls.forEach(c => c.markAllAsTouched());
    const errors = this.rows.controls.map((_, i) => this.rowError(i));
    if (this.inviteForm.invalid || errors.some(e => e)) {
      this.notificationsService.showNotification('error', 'Please fix the highlighted rows');
      return;
    }
    const rows: InviteRow[] = this.rows.controls.map(c => ({
      Email: String(c.value.txtEmail).trim(), RoleID: Number(c.value.drpRole), TeamID: c.value.drpTeam ?? null
    }));
    this.loaderService.showLoader();
    this.teamService.sendInvites(rows, this.inviteForm.value.txtMessage || '').subscribe({
      next: (res) => {
        this.loaderService.hideLoader();
        this.notificationsService.showNotification('success', res.Status);
        this.onReset();
        this.loadInvites();
      },
      error: () => {
        this.loaderService.hideLoader();
        this.notificationsService.showNotification('error', 'Something went wrong. Please try again.');
      }
    });
  }

  onReset() {
    this.submitted = false;
    while (this.rows.length > 1) this.rows.removeAt(1);
    this.rows.at(0).reset({ txtEmail: '', drpRole: 4, drpTeam: null });
    this.inviteForm.patchValue({ txtBulk: '', txtMessage: '' });
  }

  resend(i: TeamInvite) {
    this.teamService.resendInvite(i.ID).subscribe(res => {
      this.notificationsService.showNotification('success', res.Status);
      this.loadInvites();
    });
  }

  revoke(i: TeamInvite) {
    this.notificationsService.showdelete(`Revoke the invite sent to ${i.Email}?`).then(ok => {
      if (!ok) return;
      this.teamService.revokeInvite(i.ID).subscribe(res => {
        this.notificationsService.showNotification('success', res.Status);
        this.loadInvites();
      });
    });
  }

  expiresLabel(i: TeamInvite): string {
    const left = TeamUi.daysLeft(i.ExpiresOn);
    if (i.Status !== 'Pending') return '';
    if (left < 0) return 'Expired';
    if (left === 0) return 'Expires today';
    return left === 1 ? '1 day left' : `${left} days left`;
  }

  teamName(ID: number | null): string {
    return TeamUi.teamLabel(ID, this.teams);
  }
}
