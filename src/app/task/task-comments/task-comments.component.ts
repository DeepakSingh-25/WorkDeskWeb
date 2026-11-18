import { Component, ElementRef, EventEmitter, Input, OnChanges, OnInit, Output, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { Task, TaskComment } from '../../Interface/task';
import { TaskService } from '../../services/Task/task.service';
import { NotificationsService } from '../../services/notifications.service';
import { TaskUi } from '../task-ui';

interface CommentView extends TaskComment {
  parts: { text: string; mention: boolean }[];
}

@Component({
    selector: 'app-task-comments',
    templateUrl: './task-comments.component.html',
    styleUrl: './task-comments.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class TaskCommentsComponent implements OnInit, OnChanges {
  @Input({ required: true }) task!: Task;
  @Output() changed = new EventEmitter<void>();
  @ViewChild('composer') composer!: ElementRef<HTMLTextAreaElement>;

  ui = TaskUi;
  me = '';
  users: { ID: number; Name: string }[] = [];
  comments: CommentView[] = [];
  newestFirst = false;
  draft = '';
  editingId = 0;
  editDraft = '';
  posting = false;

  // mention menu state
  mentionOpen = false;
  mentionQuery = '';
  mentionStart = -1;
  mentionIndex = 0;
  private loadedFor = 0;

  constructor(private taskService: TaskService, private notificationsService: NotificationsService) {
    this.me = taskService.currentUser.Name;
  }

  ngOnInit() {
    this.taskService.getUserOptions().subscribe(u => {
      this.users = u;
      this.comments = this.comments.map(c => this.toView(c));
    });
  }

  ngOnChanges() {
    if (this.task.ID !== this.loadedFor) {
      this.loadedFor = this.task.ID;
      this.load();
    }
  }

  load() {
    this.taskService.getComments(this.task.ID).subscribe(d => this.comments = d.map(c => this.toView(c)));
  }

  get sortedComments(): CommentView[] {
    return this.newestFirst ? [...this.comments].reverse() : this.comments;
  }

  /** split text into plain / @mention parts (rendered as text, never as HTML) */
  private toView(c: TaskComment): CommentView {
    const names = this.users.map(u => u.Name).sort((a, b) => b.length - a.length)
      .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!names.length) return { ...c, parts: [{ text: c.Text, mention: false }] };
    const re = new RegExp(`@(${names.join('|')})`, 'g');
    const parts: CommentView['parts'] = [];
    let last = 0, m: RegExpExecArray | null;
    while ((m = re.exec(c.Text))) {
      if (m.index > last) parts.push({ text: c.Text.slice(last, m.index), mention: false });
      parts.push({ text: m[0], mention: true });
      last = m.index + m[0].length;
    }
    if (last < c.Text.length) parts.push({ text: c.Text.slice(last), mention: false });
    return { ...c, parts };
  }

  // ---------- mentions ----------

  get mentionOptions() {
    const q = this.mentionQuery.toLowerCase();
    return this.users.filter(u => u.Name.toLowerCase().includes(q)).slice(0, 6);
  }

  get draftMentions(): string[] {
    return this.users.map(u => u.Name).filter(n => this.draft.includes('@' + n));
  }

  onDraftInput() {
    const el = this.composer.nativeElement;
    const upto = el.value.slice(0, el.selectionStart ?? el.value.length);
    const m = /(^|\s)@([^\s@]{0,20}(?: [^\s@]{0,20})?)$/.exec(upto);
    if (m) {
      this.mentionOpen = true;
      this.mentionQuery = m[2];
      this.mentionStart = upto.length - m[2].length - 1;
      this.mentionIndex = 0;
      if (!this.mentionOptions.length) this.mentionOpen = false;
    } else {
      this.mentionOpen = false;
    }
  }

  onComposerKeydown(event: KeyboardEvent) {
    if (this.mentionOpen && this.mentionOptions.length) {
      if (event.key === 'ArrowDown') { event.preventDefault(); this.mentionIndex = (this.mentionIndex + 1) % this.mentionOptions.length; return; }
      if (event.key === 'ArrowUp') { event.preventDefault(); this.mentionIndex = (this.mentionIndex - 1 + this.mentionOptions.length) % this.mentionOptions.length; return; }
      if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); this.pickMention(this.mentionOptions[this.mentionIndex].Name); return; }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.mentionOpen = false; return; }
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.post();
    }
  }

  pickMention(name: string) {
    const el = this.composer.nativeElement;
    const caret = el.selectionStart ?? this.draft.length;
    this.draft = this.draft.slice(0, this.mentionStart) + '@' + name + ' ' + this.draft.slice(caret);
    this.mentionOpen = false;
    const pos = this.mentionStart + name.length + 2;
    setTimeout(() => { el.focus(); el.setSelectionRange(pos, pos); });
  }

  insertAt() {
    const el = this.composer.nativeElement;
    const caret = el.selectionStart ?? this.draft.length;
    const prefix = caret > 0 && !/\s/.test(this.draft[caret - 1]) ? ' @' : '@';
    this.draft = this.draft.slice(0, caret) + prefix + this.draft.slice(caret);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(caret + prefix.length, caret + prefix.length);
      this.onDraftInput();
    });
  }

  // ---------- CRUD ----------

  post() {
    const text = this.draft.trim();
    if (!text || this.posting) return;
    this.posting = true;
    this.taskService.commentAddEdit({ ID: 0, TaskID: this.task.ID, Text: text }).subscribe(res => {
      this.posting = false;
      this.draft = '';
      this.mentionOpen = false;
      const mentioned = this.users.map(u => u.Name).filter(n => text.includes('@' + n));
      this.notificationsService.showNotification('success', mentioned.length ? `Comment added. Notified ${mentioned.join(', ')}` : res.Status);
      this.load();
      this.changed.emit();
    });
  }

  startEdit(c: CommentView) {
    this.editingId = c.ID;
    this.editDraft = c.Text;
  }

  saveEdit() {
    const text = this.editDraft.trim();
    if (!text) return;
    this.taskService.commentAddEdit({ ID: this.editingId, TaskID: this.task.ID, Text: text }).subscribe(() => {
      this.editingId = 0;
      this.load();
    });
  }

  remove(c: CommentView) {
    this.notificationsService.showdelete('Delete this comment?').then(ok => {
      if (!ok) return;
      this.taskService.deleteComment(c.ID).subscribe(res => {
        this.notificationsService.showNotification('success', res.Status);
        this.load();
        this.changed.emit();
      });
    });
  }
}
