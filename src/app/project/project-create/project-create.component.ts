import { Component, OnInit, ChangeDetectionStrategy, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, FormControl, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';
import { ProjectService } from '../../services/Project/project.service';
import { NotificationsService } from '../../services/notifications.service';
import { LoaderService } from '../../services/Loader/loader.service';
import { EntitlementService } from '../../services/Access/entitlement.service';
import { Project, ProjectCategory, ProjectLookups, ProjectPriority, ProjectStatus, ProjectUser, SaveProjectRequest } from '../../Interface/project';
import { ProjectUi } from '../project-ui';
import { ProjectErrorsService } from '../project-errors.service';

/** API 400 field name → form control. */
const FIELD_CONTROLS: Record<string, string> = {
  Name: 'txtName', Code: 'txtCode', ClientName: 'txtClient', CategoryID: 'drpCategory', Description: 'txtDescription',
  StartDate: 'txtStartDate', EndDate: 'txtEndDate', Budget: 'txtBudget', Spent: 'txtSpent', Currency: 'drpCurrency',
  Priority: 'drpPriority', Status: 'drpStatus', ManagerUserID: 'drpManagerID', MemberUserIDs: 'drpMemberIDs'
};
/** Controls that live under "More options" — open it when one of them has an error. */
const MORE_OPTION_CONTROLS = ['txtCode', 'txtBudget', 'txtSpent', 'drpCurrency', 'drpPriority', 'drpStatus', 'txtDescription', 'drpCategory'];

@Component({
    selector: 'app-project-create',
    templateUrl: './project-create.component.html',
    styleUrl: './project-create.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class ProjectCreateComponent implements OnInit {
  ui = ProjectUi;
  projectForm: FormGroup;
  AddEdit: 'A' | 'E' = 'A';
  drpUserData: ProjectUser[] = [];
  drpCategoryData: ProjectCategory[] = [];
  currencyOptions: string[] = [];
  moreOptions = false;
  /** 409 PROJECT_LIMIT_REACHED — inline alert above the actions. */
  limitReached = false;
  limitMessage = '';
  // P9 Users sirf Active hain; edit me inactive manager / members raw Guid na dikhein, isliye alag se jodte hain.
  private lookupUsers: ProjectUser[] = [];
  private extraUsers: ProjectUser[] = [];
  private defaultCurrency = '';
  private rowVersion: string | null = null;
  private destroyed = false;

  constructor(
    private fb: FormBuilder,
    private projectService: ProjectService,
    private notificationsService: NotificationsService,
    private loaderService: LoaderService,
    private entitlement: EntitlementService,
    private errors: ProjectErrorsService,
    private router: Router,
    private route: ActivatedRoute,
    private destroyRef: DestroyRef
  ) {
    this.destroyRef.onDestroy(() => this.destroyed = true);
    this.projectForm = this.fb.group({
      ID: new FormControl(0),
      txtName: new FormControl('', [Validators.required, Validators.maxLength(100)]),
      txtCode: new FormControl('', [Validators.required, Validators.maxLength(20)]),
      txtClient: new FormControl(''),
      drpCategory: new FormControl<number | null>(null),
      txtDescription: new FormControl(''),
      txtStartDate: new FormControl('', [Validators.required]),
      txtEndDate: new FormControl('', [Validators.required]),
      txtBudget: new FormControl<number | null>(null, [Validators.min(0)]),
      txtSpent: new FormControl<number | null>(null, [Validators.min(0)]),
      drpCurrency: new FormControl(''),
      drpPriority: new FormControl('Medium', [Validators.required]),
      drpStatus: new FormControl('Not Started', [Validators.required]),
      drpManagerID: new FormControl<string | null>(null, [Validators.required]),
      drpMemberIDs: new FormControl<string[]>([]),
    }, { validators: this.dateRangeValidator });
  }

  ngOnInit() {
    this.entitlement.ensureLoaded().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();

    const ID = this.route.snapshot.paramMap.get('id');
    if (ID) this.AddEdit = 'E';

    this.projectService.getLookups().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: l => this.applyLookups(l),
      error: (err: unknown) => this.errors.handle(err, 'Could not load users and categories.')
    });

    if (this.AddEdit === 'E') this.loadFormData(Number(ID));
    else this.suggestCode();
  }

  private applyLookups(l: ProjectLookups) {
    this.lookupUsers = l.Users ?? [];
    this.buildUserOptions();
    this.drpCategoryData = l.Categories ?? [];
    this.currencyOptions = l.Currencies ?? [];
    // Q14: Organization currency default, agar list me hai.
    if (l.DefaultCurrency && this.currencyOptions.includes(l.DefaultCurrency)) this.defaultCurrency = l.DefaultCurrency;
    else if (this.currencyOptions.length && !this.currencyOptions.includes(this.defaultCurrency)) this.defaultCurrency = this.currencyOptions[0];
    const currency = this.projectForm.controls['drpCurrency'];
    if (this.AddEdit === 'A' && !currency.dirty) currency.setValue(this.defaultCurrency);
  }

  /** Lookup users + inactive manager / members of the edited project (naya array — cached lookup ko mutate nahi karte). */
  private buildUserOptions() {
    const known = new Set(this.lookupUsers.map(u => u.ID.toLowerCase()));
    const extras = this.extraUsers.filter(u => {
      const id = u.ID.toLowerCase();
      if (known.has(id)) return false;
      known.add(id);
      return true;
    });
    this.drpUserData = [...this.lookupUsers, ...extras];
  }

  /** Edit mode: manager + members jo P9 list me nahi hain (Suspended / Deleted / Invited). */
  private loadExtraUsers(p: Project) {
    this.extraUsers = p.ManagerID ? [{ ID: p.ManagerID, Name: p.ManagerName, Email: '' }] : [];
    this.buildUserOptions();
    this.projectService.getProjectMembers(p.ID).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: members => {
        // Members pehle — unke naam me status (e.g. "Ravi (Suspended)") aata hai, manager wali entry se behtar.
        this.extraUsers = [
          ...members.map(m => ({ ID: m.UserID, Name: m.UserStatus === 'Active' ? m.Name : `${m.Name} (${m.UserStatus})`, Email: m.Email ?? '' })),
          ...this.extraUsers
        ];
        this.buildUserOptions();
      },
      // Sirf labels ke liye — fail ho to Guid hi dikhega, form phir bhi kaam karta hai.
      error: () => { }
    });
  }

  /** PROJECT_LIMIT_REACHED alert me "See Plan & License" link. */
  get canSeeBilling(): boolean {
    return this.entitlement.can('Billing', 'View');
  }

  /** P10 — suggested code; the user may change it. */
  private suggestCode() {
    this.projectService.getNextCode().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: code => {
        const c = this.projectForm.controls['txtCode'];
        if (code && !c.dirty) c.setValue(code);
      },
      error: (err: unknown) => this.errors.handle(err, 'Could not suggest a project code. Please type one.')
    });
  }

  dateRangeValidator(group: AbstractControl): ValidationErrors | null {
    const s = group.get('txtStartDate')?.value;
    const e = group.get('txtEndDate')?.value;
    return s && e && e < s ? { dateRange: true } : null;
  }

  isInvalid(name: string): boolean {
    const c = this.projectForm.controls[name];
    return c.touched && c.invalid;
  }

  hasError(name: string, error: string): boolean {
    const c = this.projectForm.controls[name];
    return c.touched && !!c.errors?.[error];
  }

  /** Server (400) message for a control, or null. */
  serverError(name: string): string | null {
    const e = this.projectForm.controls[name].errors?.['server'];
    return typeof e === 'string' ? e : null;
  }

  get durationDays(): number {
    const { txtStartDate, txtEndDate } = this.projectForm.value;
    return txtStartDate && txtEndDate && txtEndDate >= txtStartDate ? ProjectUi.daysBetween(txtStartDate, txtEndDate) + 1 : 0;
  }

  loadFormData(ID: number) {
    this.loaderService.showLoader();
    this.projectService.getProjectByID(ID).pipe(
      finalize(() => this.loaderService.hideLoader()),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (p) => {
        if (!p) {
          this.notificationsService.showNotification('error', 'Project not found.');
          this.router.navigate(['/projects']);
          return;
        }
        if (!p.CanEdit) {
          this.notificationsService.showNotification('error',
            p.IsArchived ? 'This project is archived. Restore it before editing.' : "You don't have permission to edit this project.");
          this.router.navigate(['/projects', p.ID]);
          return;
        }
        this.rowVersion = p.RowVersion;
        this.loadExtraUsers(p);
        this.projectForm.reset({
          ID: p.ID, txtName: p.Name, txtCode: p.Code, txtClient: p.ClientName ?? '', drpCategory: p.CategoryID,
          txtDescription: p.Description ?? '', txtStartDate: p.StartDate, txtEndDate: p.EndDate, txtBudget: p.Budget,
          txtSpent: p.Spent, drpCurrency: p.Currency, drpPriority: p.Priority, drpStatus: p.Status, drpManagerID: p.ManagerID,
          drpMemberIDs: p.MemberIDs ?? []
        });
      },
      error: (err: unknown) => this.errors.handle(err, 'Could not load the project. Please try again.')
    });
  }

  onSave(): void {
    if (this.projectForm.invalid) {
      this.projectForm.markAllAsTouched();
      if (MORE_OPTION_CONTROLS.some(c => this.projectForm.controls[c].invalid)) this.moreOptions = true;
      return;
    }
    const v = this.projectForm.getRawValue();
    const manager: string = v.drpManagerID;
    const members: string[] = Array.from(new Set([manager, ...((v.drpMemberIDs as string[] | null) || [])]));
    const request: SaveProjectRequest = {
      Code: String(v.txtCode ?? '').trim(),
      Name: String(v.txtName ?? '').trim(),
      Description: String(v.txtDescription ?? '').trim(),
      ClientName: String(v.txtClient ?? '').trim(),
      CategoryID: v.drpCategory ?? null,
      StartDate: v.txtStartDate,
      EndDate: v.txtEndDate,
      Budget: Number(v.txtBudget) || 0,
      // Q3: Spent sirf edit par editable; create par 0.
      Spent: this.AddEdit === 'E' ? Number(v.txtSpent) || 0 : 0,
      Currency: v.drpCurrency,
      Priority: v.drpPriority as ProjectPriority,
      Status: v.drpStatus as ProjectStatus,
      ManagerUserID: manager,
      MemberUserIDs: members,
      RowVersion: this.AddEdit === 'E' ? this.rowVersion : null
    };
    this.loaderService.showLoader();
    this.projectService.projectAddEdit({ ...request, ID: v.ID, AddEdit: this.AddEdit }).pipe(
      finalize(() => this.loaderService.hideLoader()),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (response) => {
        if (!response.Success) {
          this.notificationsService.showNotification('error', response.Message || 'Could not save the project. Please try again.');
          return;
        }
        this.limitReached = false;
        this.notificationsService.showNotification('success',
          response.Message || (this.AddEdit === 'E' ? 'Project updated.' : 'Project created.'));
        this.router.navigate(['/projects', response.ID ?? v.ID]);
      },
      error: (err: unknown) => this.onSaveError(err, v.ID)
    });
  }

  private onSaveError(err: unknown, ID: number) {
    const code = this.errors.code(err);
    if (code === 'CONCURRENCY' && this.AddEdit === 'E') {
      this.notificationsService.showNotification('error', 'Someone else changed this project — reloaded.');
      if (!this.destroyed) this.loadFormData(ID);
      return;
    }
    if (code === 'PROJECT_ARCHIVED' && this.AddEdit === 'E') {
      // Doosre tab ne archive kar diya — ye form ab kabhi save nahi hoga, details par le jao.
      this.notificationsService.showNotification('error', this.errors.message(err, 'This project has been archived.'));
      if (!this.destroyed) this.router.navigate(['/projects', ID]);
      return;
    }
    if (code === 'PROJECT_CODE_EXISTS') {
      const c = this.projectForm.controls['txtCode'];
      c.setErrors({ ...(c.errors ?? {}), exists: true });
      c.markAsTouched();
      this.moreOptions = true;
      this.notificationsService.showNotification('error', this.errors.message(err, 'Project code already exists.'));
      return;
    }
    if (code === 'PROJECT_LIMIT_REACHED') {
      const msg = this.errors.message(err, 'Your plan does not allow more projects.');
      this.limitReached = true;
      this.limitMessage = msg;
      this.notificationsService.showNotification('error', msg);
      return;
    }
    this.applyFieldErrors(this.errors.fieldErrors(err));
    this.errors.handle(err, 'Could not save the project. Please try again.');
  }

  /** 400 `Errors` → inline messages under the matching controls. */
  private applyFieldErrors(fieldErrors: Record<string, string[]> | null) {
    if (!fieldErrors) return;
    let openMore = false;
    Object.entries(fieldErrors).forEach(([field, messages]) => {
      const name = FIELD_CONTROLS[field];
      const c = name ? this.projectForm.controls[name] : null;
      if (!c) return;
      c.setErrors({ ...(c.errors ?? {}), server: (messages ?? []).filter(m => !!m).join(' ') || 'Invalid value' });
      c.markAsTouched();
      if (MORE_OPTION_CONTROLS.includes(name)) openMore = true;
    });
    if (openMore) this.moreOptions = true;
  }

  resetForm(): void {
    this.limitReached = false;
    this.limitMessage = '';
    if (this.AddEdit === 'E') {
      this.loadFormData(this.projectForm.value.ID);
      return;
    }
    this.projectForm.reset({
      ID: 0, txtName: '', txtCode: '', txtClient: '', drpCategory: null,
      txtDescription: '', txtStartDate: '', txtEndDate: '', txtBudget: null, txtSpent: null, drpCurrency: this.defaultCurrency,
      drpPriority: 'Medium', drpStatus: 'Not Started', drpManagerID: null, drpMemberIDs: []
    });
    this.suggestCode();
  }

  onCancel(): void {
    const ID = this.projectForm.value.ID;
    this.router.navigate(this.AddEdit === 'E' ? ['/projects', ID] : ['/projects']);
  }
}
