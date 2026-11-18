import { Component, ElementRef, OnInit, ViewChild, ChangeDetectionStrategy, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Subscription, finalize } from 'rxjs';
import { Project, ProjectMember, ProjectUser } from '../../Interface/project';
import { NotificationsService } from '../../services/notifications.service';
import { LoaderService } from '../../services/Loader/loader.service';
import { ProjectService } from '../../services/Project/project.service';
import { ProjectContextService } from '../project-context.service';
import { ProjectErrorsService } from '../project-errors.service';
import { ProjectUi } from '../project-ui';

@Component({
    selector: 'app-project-members',
    templateUrl: './project-members.component.html',
    styleUrl: './project-members.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class ProjectMembersComponent implements OnInit {
  @ViewChild('closebutton') closebutton!: ElementRef;
  ui = ProjectUi;
  project: Project | null = null;
  members: ProjectMember[] = [];
  drpUserData: ProjectUser[] = [];
  drpRoleData: string[] = [];
  searchValue = '';
  roleFilter = '';
  memberForm: FormGroup;
  private listSub: Subscription | null = null;
  private destroyed = false;

  constructor(
    private fb: FormBuilder,
    private context: ProjectContextService,
    private projectService: ProjectService,
    private notificationsService: NotificationsService,
    private loaderService: LoaderService,
    private errors: ProjectErrorsService,
    private destroyRef: DestroyRef
  ) {
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      this.listSub?.unsubscribe();
    });
    this.memberForm = this.fb.group({
      ID: new FormControl(0),
      drpUserID: new FormControl<string | null>(null, [Validators.required]),
      drpRole: new FormControl<string | null>(null, [Validators.required]),
      txtAllocation: new FormControl(100, [Validators.required, Validators.min(5), Validators.max(100)]),
    });
  }

  ngOnInit() {
    this.projectService.getLookups().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: l => {
        this.drpUserData = l.Users ?? [];
        this.drpRoleData = l.MemberRoles ?? [];
      },
      error: (err: unknown) => this.errors.handle(err, 'Could not load users and roles.')
    });
    this.context.project$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(p => {
      this.project = p;
      if (p) this.GetMemberList();
    });
  }

  /** Add / edit / remove only while the server says the project is editable. */
  get canEdit(): boolean {
    return !!this.project?.CanEdit;
  }

  GetMemberList() {
    this.listSub?.unsubscribe();
    this.listSub = this.projectService.getProjectMembers(this.context.projectID).subscribe({
      next: d => this.members = d ?? [],
      error: (err: unknown) => this.errors.handle(err, 'Could not load members. Please try again.')
    });
  }

  get filteredMembers(): ProjectMember[] {
    const s = this.searchValue.toLowerCase();
    return this.members.filter(m =>
      (!this.roleFilter || m.Role === this.roleFilter) &&
      (!s || m.Name.toLowerCase().includes(s) || (m.Email || '').toLowerCase().includes(s)));
  }

  get availableUsers(): ProjectUser[] {
    const editingUser: string | null = this.memberForm.value.ID ? this.memberForm.getRawValue().drpUserID : null;
    const list = this.drpUserData.filter(u => this.sameId(u.ID, editingUser) || !this.members.some(m => this.sameId(m.UserID, u.ID)));
    // P9 Users sirf Active — inactive member edit karte waqt uska option khud banao, warna raw Guid dikhta hai.
    if (editingUser && !list.some(u => this.sameId(u.ID, editingUser))) {
      const m = this.members.find(x => this.sameId(x.UserID, editingUser));
      if (m) list.unshift({ ID: m.UserID, Name: m.UserStatus === 'Active' ? m.Name : `${m.Name} (${m.UserStatus})`, Email: m.Email ?? '' });
    }
    return list;
  }

  get totalAllocation(): number {
    return this.members.reduce((s, m) => s + m.Allocation, 0);
  }

  roleCount(role: string): number {
    return this.members.filter(m => m.Role === role).length;
  }

  get usedRoles(): string[] {
    return Array.from(new Set(this.members.map(m => m.Role)));
  }

  isManager(m: ProjectMember): boolean {
    return this.sameId(m.UserID, this.project?.ManagerID ?? null);
  }

  resetForm() {
    this.memberForm.reset({ ID: 0, drpUserID: null, drpRole: null, txtAllocation: 100 });
    this.memberForm.controls['drpUserID'].enable();
  }

  onEdit(m: ProjectMember) {
    this.memberForm.reset({ ID: m.ID, drpUserID: m.UserID, drpRole: m.Role, txtAllocation: m.Allocation });
    this.memberForm.controls['drpUserID'].disable();
  }

  onSave() {
    if (!this.canEdit) return;
    if (this.memberForm.invalid) {
      this.memberForm.markAllAsTouched();
      return;
    }
    const v = this.memberForm.getRawValue();
    this.loaderService.showLoader();
    this.projectService.memberAddEdit({
      ID: v.ID, ProjectID: this.context.projectID, UserID: v.drpUserID, Role: v.drpRole, Allocation: Number(v.txtAllocation)
    }).pipe(
      finalize(() => this.loaderService.hideLoader()),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: res => {
        this.notificationsService.showNotification('success', res.Message || (v.ID ? 'Member updated.' : 'Member added.'));
        this.closebutton.nativeElement.click();
        // context.reload() project$ re-emit karta hai → subscription GetMemberList() chala deta hai.
        this.context.reload();
      },
      error: (err: unknown) => this.onWriteError(err, 'Could not save the member. Please try again.')
    });
  }

  onRemove(m: ProjectMember) {
    if (!this.canEdit) return;
    // UX check only — the server also rejects removing the manager.
    if (this.isManager(m)) {
      this.notificationsService.showNotification('error', 'Project Manager cannot be removed. Change manager first.');
      return;
    }
    this.notificationsService.showdelete(`Remove ${m.Name} from this project?`).then(ok => {
      if (!ok || this.destroyed) return;
      this.loaderService.showLoader();
      this.projectService.removeMember(this.context.projectID, m.ID).pipe(
        finalize(() => this.loaderService.hideLoader()),
        takeUntilDestroyed(this.destroyRef)
      ).subscribe({
        next: res => {
          this.notificationsService.showNotification('success', res.Message || `${m.Name} removed.`);
          this.context.reload();   // list bhi project$ ke saath reload hoti hai
        },
        error: (err: unknown) => this.onWriteError(err, `Could not remove ${m.Name}. Please try again.`)
      });
    });
  }

  private onWriteError(err: unknown, fallback: string) {
    const code = this.errors.code(err);
    if (code === 'MEMBER_EXISTS') {
      this.notificationsService.showNotification('error', 'This user is already a member.');
      this.GetMemberList();
      return;
    }
    if (code === 'PROJECT_ARCHIVED') {
      this.notificationsService.showNotification('error', this.errors.message(err, 'This project is archived and read-only.'));
      this.closebutton?.nativeElement.click();
      this.context.reload();
      return;
    }
    // 404 / 409: list is stale.
    if (this.errors.handle(err, fallback)) this.GetMemberList();
  }

  private sameId(a: string | null | undefined, b: string | null | undefined): boolean {
    return !!a && !!b && a.toLowerCase() === b.toLowerCase();
  }
}
