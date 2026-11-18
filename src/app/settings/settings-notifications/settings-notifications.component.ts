import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { faPaperPlane } from '@fortawesome/free-solid-svg-icons';
import { EmailSettings, EmailTemplate, NotificationEvent, NotificationSettings, NotifyChannel } from '../../Interface/settings';
import { SettingsService } from '../../services/Settings/settings.service';
import { NotificationsService } from '../../services/notifications.service';
import { LoaderService } from '../../services/Loader/loader.service';
import { userName, CURRENT_USER_ID } from '../../services/Shared/mock-directory';
import { SettingsUi } from '../settings-ui';

@Component({
    selector: 'app-settings-notifications',
    templateUrl: './settings-notifications.component.html',
    styleUrl: './settings-notifications.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class SettingsNotificationsComponent implements OnInit {
  ui = SettingsUi;
  faSend = faPaperPlane;

  channels: { Key: NotifyChannel; Label: string }[] = [
    { Key: 'InApp', Label: 'In-app' }, { Key: 'Email', Label: 'Email' }, { Key: 'Slack', Label: 'Slack' }, { Key: 'Push', Label: 'Push' }
  ];

  digestOptions: { Value: 'Off' | 'Daily' | 'Weekly'; Label: string }[] = [
    { Value: 'Off', Label: 'Never' }, { Value: 'Daily', Label: 'Every day' }, { Value: 'Weekly', Label: 'Every week' }
  ];
  /** Plain-word names for the notification events (fallback: the event's own label). */
  private plainLabels: Record<string, string> = {
    task_assigned: 'Someone gives me a task', mentioned: 'Someone mentions me', status_changed: 'A task I follow moves to another stage',
    comment_added: 'Someone comments on a task I follow', due_soon: 'My task is due tomorrow', overdue: 'My task is late',
    approval_requested: 'Someone needs my approval', approval_decided: 'My request is approved or rejected',
    sprint_started: 'A sprint I am in starts', sprint_completed: 'A sprint I am in ends', weekly_digest: 'Weekly summary of my work',
    security_alert: 'New login or password change on my account'
  };
  /** Open advanced section: '' (none), 'email' or 'tpl'. */
  adv = '';

  // notification matrix
  n: NotificationSettings | null = null;
  private nOriginal = '';

  // email + smtp
  emailForm: FormGroup;
  passwordSet = false;
  testTo = '';
  sendingTest = false;

  // templates
  templates: EmailTemplate[] = [];
  tplId: number | null = null;
  tpl: EmailTemplate | null = null;
  private tplOriginal = '';
  showPreview = false;
  placeholders = ['{{user.name}}', '{{actor.name}}', '{{org.name}}', '{{task.key}}', '{{task.title}}', '{{task.due}}', '{{project.name}}', '{{link}}'];
  private sample: Record<string, string> = {
    'user.name': 'Priya Verma', 'actor.name': userName(CURRENT_USER_ID), 'org.name': 'Acme Technologies',
    'task.key': 'CRM-142', 'task.title': 'Payment gateway retry', 'task.due': '24 Oct 2026', 'project.name': 'CRM Portal Revamp',
    'link': 'https://app.example.com/tasks/142'
  };

  constructor(
    private fb: FormBuilder,
    private settingsService: SettingsService,
    private notificationsService: NotificationsService,
    private loaderService: LoaderService
  ) {
    this.emailForm = this.fb.group({
      txtFromName: new FormControl('', [Validators.required, Validators.maxLength(60)]),
      txtFromEmail: new FormControl('', [Validators.required, Validators.email]),
      txtReplyTo: new FormControl('', [Validators.email]),
      chkSmtp: new FormControl(false),
      txtHost: new FormControl(''),
      txtPort: new FormControl<number | null>(587, [Validators.min(1), Validators.max(65535)]),
      txtUsername: new FormControl(''),
      txtPassword: new FormControl(''),
      drpSecurity: new FormControl('STARTTLS'),
    });
  }

  ngOnInit() {
    this.loaderService.showLoader();
    this.settingsService.getNotificationSettings().subscribe(n => { this.n = n; this.nOriginal = JSON.stringify(n); this.loaderService.hideLoader(); });
    this.loadEmail();
    this.settingsService.getEmailTemplates().subscribe(t => {
      this.templates = t;
      if (t.length) this.selectTemplate(t[0]);
    });
  }

  plainLabel(e: NotificationEvent): string { return this.plainLabels[e.Key] || e.Label; }

  toggleAdv(key: string) { this.adv = this.adv === key ? '' : key; }

  // ---------- matrix ----------

  get groups(): string[] { return Array.from(new Set((this.n?.Events || []).map(e => e.Group))); }
  eventsOf(g: string): NotificationEvent[] { return (this.n?.Events || []).filter(e => e.Group === g); }
  get nDirty(): boolean { return !!this.n && JSON.stringify(this.n) !== this.nOriginal; }

  colAll(c: NotifyChannel): boolean { return !!this.n && this.n.Events.every(e => e.Channels[c]); }
  toggleCol(c: NotifyChannel) {
    if (!this.n) return;
    const v = !this.colAll(c);
    this.n.Events.forEach(e => e.Channels[c] = v);
  }

  toggleQuietDay(d: string) {
    if (!this.n) return;
    const days = this.n.QuietDays;
    this.n.QuietDays = days.includes(d) ? days.filter(x => x !== d) : this.ui.weekDays.filter(x => x === d || days.includes(x));
  }

  saveNotifications() {
    if (!this.n) return;
    const n = this.n;
    this.loaderService.showLoader();
    this.settingsService.saveNotificationSettings(n).subscribe(res => {
      this.loaderService.hideLoader();
      this.notificationsService.showNotification('success', res.Status);
      this.nOriginal = JSON.stringify(n);
    });
  }

  discardNotifications() {
    this.n = JSON.parse(this.nOriginal);
  }

  // ---------- email / smtp ----------

  loadEmail() {
    this.settingsService.getEmailSettings().subscribe(e => {
      this.passwordSet = e.SmtpPasswordSet;
      this.emailForm.reset({
        txtFromName: e.FromName, txtFromEmail: e.FromEmail, txtReplyTo: e.ReplyTo, chkSmtp: e.SmtpEnabled, txtHost: e.SmtpHost,
        txtPort: e.SmtpPort, txtUsername: e.SmtpUsername, txtPassword: '', drpSecurity: e.SmtpSecurity
      });
      if (!this.testTo) this.testTo = e.ReplyTo;
    });
  }

  emailInvalid(name: string): boolean {
    const c = this.emailForm.controls[name];
    return !!c && c.touched && c.invalid;
  }

  saveEmail() {
    const v = this.emailForm.value;
    if (this.emailForm.invalid) { this.emailForm.markAllAsTouched(); return; }
    if (v.chkSmtp && (!String(v.txtHost || '').trim() || !v.txtPort)) {
      this.notificationsService.showNotification('error', 'SMTP Host and Port are Required');
      return;
    }
    if (v.chkSmtp && !this.passwordSet && !v.txtPassword) {
      this.notificationsService.showNotification('error', 'SMTP Password is Required');
      return;
    }
    const s: EmailSettings = {
      FromName: String(v.txtFromName).trim(), FromEmail: v.txtFromEmail, ReplyTo: v.txtReplyTo, SmtpEnabled: v.chkSmtp,
      SmtpHost: String(v.txtHost || '').trim(), SmtpPort: Number(v.txtPort), SmtpUsername: v.txtUsername,
      SmtpPasswordSet: this.passwordSet, SmtpSecurity: v.drpSecurity
    };
    const password: string | null = v.txtPassword || null;
    this.emailForm.patchValue({ txtPassword: '' });       // never keep the secret in the form
    this.loaderService.showLoader();
    this.settingsService.saveEmailSettings(s, password).subscribe(res => {
      this.loaderService.hideLoader();
      this.notificationsService.showNotification('success', res.Status);
      this.loadEmail();
    });
  }

  sendTestEmail() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.testTo.trim())) {
      this.notificationsService.showNotification('error', 'Enter a valid recipient email');
      return;
    }
    if (this.emailForm.dirty) {
      this.notificationsService.showNotification('error', 'Save your email settings before sending a test');
      return;
    }
    this.sendingTest = true;
    this.settingsService.sendTestEmail(this.testTo.trim()).subscribe(r => {
      this.sendingTest = false;
      this.notificationsService.showNotification(r.Ok ? 'success' : 'error', r.Message);
    });
  }

  // ---------- templates ----------

  get tplDirty(): boolean { return !!this.tpl && JSON.stringify(this.tpl) !== this.tplOriginal; }

  selectTemplate(t: EmailTemplate) {
    const go = () => {
      this.tplId = t.ID;
      this.tpl = { ...t };
      this.tplOriginal = JSON.stringify(t);
    };
    if (this.tplDirty) this.notificationsService.showConfirm('Discard unsaved template changes?').then(ok => { if (ok) go(); });
    else go();
  }

  insertPlaceholder(ph: string, area: HTMLTextAreaElement) {
    if (!this.tpl) return;
    const start = area.selectionStart ?? this.tpl.Body.length;
    const end = area.selectionEnd ?? start;
    this.tpl.Body = this.tpl.Body.slice(0, start) + ph + this.tpl.Body.slice(end);
    setTimeout(() => { area.focus(); area.setSelectionRange(start + ph.length, start + ph.length); });
  }

  render(text: string): string {
    return (text || '').replace(/\{\{\s*([a-z.]+)\s*\}\}/gi, (m, k: string) => this.sample[k] ?? m);
  }

  unknownPlaceholders(): string[] {
    if (!this.tpl) return [];
    const found = `${this.tpl.Subject} ${this.tpl.Body}`.match(/\{\{\s*[^}]*\s*\}\}/g) || [];
    return Array.from(new Set(found.filter(p => this.sample[p.replace(/[{}\s]/g, '')] === undefined)));
  }

  saveTemplate() {
    const t = this.tpl;
    if (!t) return;
    if (!t.Subject.trim() || !t.Body.trim()) { this.notificationsService.showNotification('error', 'Subject and Body are Required'); return; }
    this.loaderService.showLoader();
    this.settingsService.saveEmailTemplate(t).subscribe(res => {
      this.loaderService.hideLoader();
      this.notificationsService.showNotification('success', res.Status);
      this.tplOriginal = JSON.stringify(t);
      this.settingsService.getEmailTemplates().subscribe(list => {
        this.templates = list;
        const fresh = list.find(x => x.ID === t.ID);
        if (fresh) { this.tpl = { ...fresh }; this.tplOriginal = JSON.stringify(fresh); }
      });
    });
  }

  resetTemplate() {
    if (this.tplOriginal) this.tpl = JSON.parse(this.tplOriginal);
  }
}
