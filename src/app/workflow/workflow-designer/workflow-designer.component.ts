import { Component, ChangeDetectionStrategy, ElementRef, HostListener, OnInit, ViewChild, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  faArrowLeft, faCircleCheck, faCopy, faExpand, faFloppyDisk, faLink, faMagnifyingGlassMinus, faMagnifyingGlassPlus,
  faRocket, faTrash, faTriangleExclamation, faCircleXmark, faXmark
} from '@fortawesome/free-solid-svg-icons';
import { WfEdge, WfNode, WfNodeType, Workflow, WorkflowStatusDef } from '../../Interface/workflow';
import { WorkflowService } from '../../services/Workflow/workflow.service';
import { NotificationsService } from '../../services/notifications.service';
import { LoaderService } from '../../services/Loader/loader.service';
import { WorkflowUi } from '../workflow-ui';

interface Issue { Level: 'error' | 'warning'; Message: string; NodeID?: string; }
interface Point { x: number; y: number; }

/**
 * Workflow Designer (`/workflows/designer/:id`, `/workflows/designer/new`).
 * Plain HTML nodes on a scalable canvas + an SVG layer for the transitions (no diagram library).
 */
@Component({
    selector: 'app-workflow-designer',
    templateUrl: './workflow-designer.component.html',
    styleUrl: './workflow-designer.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class WorkflowDesignerComponent implements OnInit {
  ui = WorkflowUi;
  faBack = faArrowLeft;
  faSave = faFloppyDisk;
  faPublish = faRocket;
  faZoomIn = faMagnifyingGlassPlus;
  faZoomOut = faMagnifyingGlassMinus;
  faFit = faExpand;
  faValid = faCircleCheck;
  faWarn = faTriangleExclamation;
  faError = faCircleXmark;
  faTrash = faTrash;
  faLink = faLink;
  faCopy = faCopy;
  faClose = faXmark;

  private wfService = inject(WorkflowService);
  private notificationsService = inject(NotificationsService);
  private loaderService = inject(LoaderService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  @ViewChild('wrap') wrapRef?: ElementRef<HTMLDivElement>;
  @ViewChild('stage') stageRef?: ElementRef<HTMLDivElement>;

  readonly W = 2400;
  readonly H = 1400;
  readonly GRID = 20;

  palette: { Type: WfNodeType; Label: string; Hint: string }[] = [
    { Type: 'Start', Label: 'Start', Hint: 'Where the workflow begins.' },
    { Type: 'Step', Label: 'Status', Hint: 'A stage the item waits in, like In Review.' },
    { Type: 'Approval', Label: 'Approval', Hint: 'Someone must approve before it moves on.' },
    { Type: 'Condition', Label: 'Yes / No check', Hint: 'Goes one way or the other based on a field.' },
    { Type: 'Notification', Label: 'Send a message', Hint: 'Sends an email or in-app message.' },
    { Type: 'End', Label: 'End', Hint: 'Where the workflow finishes.' },
  ];
  conditionFields = ['Priority', 'Amount', 'Days', 'Risk', 'Severity', 'Project', 'Requester role', 'Labels'];
  operators = ['=', '≠', '>', '≥', '<', '≤', 'contains'];
  statusLib: WorkflowStatusDef[] = [];

  wf: Workflow | null = null;
  isNew = false;
  dirty = false;
  zoom = 1;
  selected: { Kind: 'node' | 'edge'; ID: string } | null = null;
  connectFrom: string | null = null;
  connectTarget = '';
  mouse: Point = { x: 0, y: 0 };
  private drag: { ID: string; OffX: number; OffY: number; Moved: boolean } | null = null;
  private paletteDrag: WfNodeType | null = null;
  private seq = 0;

  issues: Issue[] = [];
  validated = false;
  showIssues = false;
  showMore = false;

  ngOnInit() {
    this.wfService.getStatuses().subscribe(s => this.statusLib = s);
    this.route.paramMap.subscribe(p => {
      const id = p.get('id');
      this.selected = null;
      this.connectFrom = null;
      this.issues = [];
      this.validated = false;
      if (!id || id === 'new') {
        this.isNew = true;
        this.wf = this.blankWorkflow();
        this.dirty = false;
        setTimeout(() => this.fit(0.75));
      } else {
        this.isNew = false;
        this.loaderService.showLoader();
        this.wfService.getWorkflow(Number(id)).subscribe(w => {
          this.loaderService.hideLoader();
          if (!w) {
            this.notificationsService.showNotification('error', 'Workflow not found');
            this.router.navigate(['/workflows']);
            return;
          }
          this.wf = w;
          this.dirty = false;
          setTimeout(() => this.fit(0.75));
        });
      }
    });
  }

  private blankWorkflow(): Workflow {
    return {
      ID: 0, Name: 'Untitled workflow', Description: '', AppliesTo: 'Task', ProjectIDs: [], Status: 'Draft', Version: 0,
      UpdatedByID: this.wfService.currentUserID, UpdatedOn: new Date().toISOString(),
      Nodes: [
        { ID: 'n1', Type: 'Start', Name: 'Start', X: 60, Y: 222 },
        { ID: 'n2', Type: 'Step', Name: 'Open', X: 260, Y: 210, Category: 'To Do' },
        { ID: 'n3', Type: 'End', Name: 'Done', X: 520, Y: 222, Outcome: 'Completed' },
      ],
      Edges: [{ ID: 'e1', From: 'n1', To: 'n2', Label: '' }, { ID: 'e2', From: 'n2', To: 'n3', Label: '' }],
    };
  }

  // ---------------- geometry ----------------

  size(n: WfNode): { w: number; h: number } {
    return n.Type === 'Start' || n.Type === 'End' ? { w: 150, h: 46 } : { w: 196, h: 70 };
  }

  outPort(n: WfNode): Point {
    const s = this.size(n);
    return { x: n.X + s.w, y: n.Y + s.h / 2 };
  }

  inPort(n: WfNode): Point {
    const s = this.size(n);
    return { x: n.X, y: n.Y + s.h / 2 };
  }

  node(ID: string): WfNode | undefined {
    return this.wf?.Nodes.find(n => n.ID === ID);
  }

  private curve(a: Point, b: Point): { d: string; mid: Point } {
    const back = b.x < a.x + 20;
    let c1: Point, c2: Point;
    if (back) {
      // route backwards transitions in a loop below the nodes
      const drop = Math.max(70, Math.abs(b.y - a.y) / 2 + 60);
      c1 = { x: a.x + 120, y: Math.max(a.y, b.y) + drop };
      c2 = { x: b.x - 120, y: Math.max(a.y, b.y) + drop };
    } else {
      const dx = Math.max(50, (b.x - a.x) / 2);
      c1 = { x: a.x + dx, y: a.y };
      c2 = { x: b.x - dx, y: b.y };
    }
    const mid = {
      x: 0.125 * a.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * b.x,
      y: 0.125 * a.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * b.y,
    };
    return { d: `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x - 6} ${b.y}`, mid };
  }

  edgePath(e: WfEdge): string {
    const a = this.node(e.From), b = this.node(e.To);
    return a && b ? this.curve(this.outPort(a), this.inPort(b)).d : '';
  }

  edgeMid(e: WfEdge): Point {
    const a = this.node(e.From), b = this.node(e.To);
    return a && b ? this.curve(this.outPort(a), this.inPort(b)).mid : { x: 0, y: 0 };
  }

  get tempPath(): string {
    const a = this.connectFrom ? this.node(this.connectFrom) : undefined;
    return a ? this.curve(this.outPort(a), { x: this.mouse.x + 6, y: this.mouse.y }).d : '';
  }

  private toCanvas(ev: MouseEvent | DragEvent): Point {
    const rect = this.stageRef?.nativeElement.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (ev.clientX - rect.left) / this.zoom, y: (ev.clientY - rect.top) / this.zoom };
  }

  private snap(v: number): number {
    return Math.max(0, Math.round(v / 10) * 10);
  }

  // ---------------- selection ----------------

  get selNode(): WfNode | null {
    return this.selected?.Kind === 'node' ? this.node(this.selected.ID) || null : null;
  }

  get selEdge(): WfEdge | null {
    return this.selected?.Kind === 'edge' ? this.wf?.Edges.find(e => e.ID === this.selected!.ID) || null : null;
  }

  isSel(kind: 'node' | 'edge', ID: string): boolean {
    return this.selected?.Kind === kind && this.selected.ID === ID;
  }

  selectNode(ID: string) {
    this.selected = { Kind: 'node', ID };
  }

  typeLabel(t: WfNodeType): string {
    return this.palette.find(p => p.Type === t)?.Label || t;
  }

  typeHint(t: WfNodeType): string {
    return this.palette.find(p => p.Type === t)?.Hint || '';
  }

  readonly msgPlaceholder = 'Use {{key}}, {{title}}, {{requester}} as placeholders';

  selectEdge(e: WfEdge, ev: Event) {
    ev.stopPropagation();
    this.selected = { Kind: 'edge', ID: e.ID };
  }

  outgoing(n: WfNode): WfEdge[] {
    return this.wf?.Edges.filter(e => e.From === n.ID) || [];
  }

  incoming(n: WfNode): WfEdge[] {
    return this.wf?.Edges.filter(e => e.To === n.ID) || [];
  }

  connectOptions(n: WfNode): WfNode[] {
    if (!this.wf || n.Type === 'End') return [];
    return this.wf.Nodes.filter(x => x.ID !== n.ID && x.Type !== 'Start' && !this.wf!.Edges.some(e => e.From === n.ID && e.To === x.ID));
  }

  nodeName(ID: string): string {
    return this.node(ID)?.Name || '?';
  }

  // ---------------- mouse: drag & connect ----------------

  onCanvasMouseDown(ev: MouseEvent) {
    if (ev.button !== 0) return;
    if (this.connectFrom) { this.connectFrom = null; return; }
    this.selected = null;
  }

  onNodeMouseDown(n: WfNode, ev: MouseEvent) {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    if (this.connectFrom) return;                 // finishing a connection happens on mouseup
    this.selected = { Kind: 'node', ID: n.ID };
    const p = this.toCanvas(ev);
    this.drag = { ID: n.ID, OffX: p.x - n.X, OffY: p.y - n.Y, Moved: false };
    ev.preventDefault();
  }

  onNodeMouseUp(n: WfNode, ev: MouseEvent) {
    if (!this.connectFrom || this.connectFrom === n.ID) return;
    ev.stopPropagation();
    this.addEdge(this.connectFrom, n.ID);
    this.connectFrom = null;
  }

  onOutPortDown(n: WfNode, ev: MouseEvent) {
    ev.stopPropagation();
    ev.preventDefault();
    if (this.connectFrom === n.ID) { this.connectFrom = null; return; }
    this.connectFrom = n.ID;
    this.selected = { Kind: 'node', ID: n.ID };
    this.mouse = this.toCanvas(ev);
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(ev: MouseEvent) {
    if (this.drag) {
      const n = this.node(this.drag.ID);
      if (!n) return;
      const p = this.toCanvas(ev);
      const s = this.size(n);
      const x = Math.min(this.W - s.w, this.snap(p.x - this.drag.OffX));
      const y = Math.min(this.H - s.h, this.snap(p.y - this.drag.OffY));
      if (x !== n.X || y !== n.Y) {
        n.X = x; n.Y = y;
        this.drag.Moved = true;
        this.markDirty();
      }
    } else if (this.connectFrom) {
      this.mouse = this.toCanvas(ev);
    }
  }

  @HostListener('document:mouseup')
  onMouseUp() {
    this.drag = null;
  }

  @HostListener('document:keydown', ['$event'])
  onKey(ev: KeyboardEvent) {
    const tag = (ev.target as HTMLElement)?.tagName;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || (ev.target as HTMLElement)?.isContentEditable) return;
    if (ev.key === 'Escape') { this.connectFrom = null; this.selected = null; }
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && this.selected) {
      ev.preventDefault();
      this.deleteSelected();
    }
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(ev: BeforeUnloadEvent) {
    if (this.dirty) { ev.preventDefault(); ev.returnValue = ''; }
  }

  // ---------------- palette ----------------

  onPaletteDragStart(t: WfNodeType, ev: DragEvent) {
    this.paletteDrag = t;
    ev.dataTransfer?.setData('text/plain', t);
    if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'copy';
  }

  onCanvasDragOver(ev: DragEvent) {
    if (this.paletteDrag) ev.preventDefault();
  }

  onCanvasDrop(ev: DragEvent) {
    ev.preventDefault();
    if (!this.paletteDrag) return;
    const p = this.toCanvas(ev);
    const tmp: WfNode = { ID: '', Type: this.paletteDrag, Name: '', X: 0, Y: 0 };
    const s = this.size(tmp);
    this.addNode(this.paletteDrag, p.x - s.w / 2, p.y - s.h / 2);
    this.paletteDrag = null;
  }

  onPaletteDragEnd() {
    this.paletteDrag = null;
  }

  addFromPalette(t: WfNodeType) {
    const wrap = this.wrapRef?.nativeElement;
    let x = 200, y = 200;
    if (wrap) {
      x = (wrap.scrollLeft + wrap.clientWidth / 2) / this.zoom - 98;
      y = (wrap.scrollTop + wrap.clientHeight / 2) / this.zoom - 35;
    }
    // avoid stacking exactly on top of another node
    while (this.wf?.Nodes.some(n => Math.abs(n.X - x) < 20 && Math.abs(n.Y - y) < 20)) { x += 30; y += 30; }
    this.addNode(t, x, y);
  }

  private addNode(t: WfNodeType, x: number, y: number) {
    if (!this.wf) return;
    if (t === 'Start' && this.wf.Nodes.some(n => n.Type === 'Start')) {
      this.notificationsService.showNotification('error', 'A workflow can have only one Start block');
      return;
    }
    const ID = 'n' + Date.now().toString(36) + (++this.seq);
    const defaults: { [k: string]: Partial<WfNode> } = {
      Start: { Name: 'Start' },
      Step: { Name: 'New status', Category: 'In Progress', SlaHours: null },
      Approval: { Name: 'Approval', ApproverType: 'Manager', ApproverID: null, ApprovalRule: 'Any', SlaHours: 24 },
      Condition: { Name: 'Condition', Field: 'Priority', Operator: '=', Value: 'High' },
      Notification: { Name: 'Notify requester', NotifyTarget: 'Requester', NotifyID: null, Channel: 'Email + In-app', Message: '' },
      End: { Name: 'End', Outcome: 'Completed' },
    };
    const n: WfNode = { ID, Type: t, Name: t, X: this.snap(x), Y: this.snap(y), ...defaults[t] };
    this.wf.Nodes.push(n);
    this.selected = { Kind: 'node', ID };
    this.markDirty();
  }

  // ---------------- edges ----------------

  addEdge(from: string, to: string) {
    if (!this.wf) return;
    const a = this.node(from), b = this.node(to);
    if (!a || !b || from === to) return;
    if (a.Type === 'End') { this.notificationsService.showNotification('error', 'Nothing can come after an End block'); return; }
    if (b.Type === 'Start') { this.notificationsService.showNotification('error', 'Nothing can point back to the Start block'); return; }
    if (this.wf.Edges.some(e => e.From === from && e.To === to)) { this.notificationsService.showNotification('error', 'These blocks are already connected'); return; }
    let Branch: WfEdge['Branch'] = '';
    let Label = '';
    if (a.Type === 'Condition') {
      const used = this.outgoing(a).map(e => e.Branch);
      if (used.includes('Yes') && used.includes('No')) {
        this.notificationsService.showNotification('error', 'A Yes / No check already has both ways out');
        return;
      }
      Branch = used.includes('Yes') ? 'No' : 'Yes';
      Label = Branch;
    } else if (a.Type === 'Approval') {
      Label = this.outgoing(a).length ? 'Rejected' : 'Approved';
    }
    const ID = 'e' + Date.now().toString(36) + (++this.seq);
    this.wf.Edges.push({ ID, From: from, To: to, Label, Branch });
    this.selected = { Kind: 'edge', ID };
    this.markDirty();
  }

  connectSelectedTo() {
    const n = this.selNode;
    if (n && this.connectTarget) {
      this.addEdge(n.ID, this.connectTarget);
      this.selected = { Kind: 'node', ID: n.ID };
    }
    this.connectTarget = '';
  }

  startConnect(n: WfNode) {
    this.connectFrom = n.ID;
    const p = this.outPort(n);
    this.mouse = { x: p.x + 60, y: p.y };
  }

  onBranchChange(e: WfEdge) {
    if (e.Branch && (!e.Label || e.Label === 'Yes' || e.Label === 'No')) e.Label = e.Branch;
    this.markDirty();
  }

  deleteEdge(e: WfEdge) {
    if (!this.wf) return;
    this.wf.Edges = this.wf.Edges.filter(x => x.ID !== e.ID);
    if (this.isSel('edge', e.ID)) this.selected = null;
    this.markDirty();
  }

  deleteNode(n: WfNode) {
    if (!this.wf) return;
    this.wf.Nodes = this.wf.Nodes.filter(x => x.ID !== n.ID);
    this.wf.Edges = this.wf.Edges.filter(e => e.From !== n.ID && e.To !== n.ID);
    this.selected = null;
    this.markDirty();
  }

  duplicateNode(n: WfNode) {
    if (!this.wf || n.Type === 'Start') return;
    const ID = 'n' + Date.now().toString(36) + (++this.seq);
    this.wf.Nodes.push({ ...n, ID, Name: n.Name + ' (copy)', X: n.X + 30, Y: n.Y + 90 });
    this.selected = { Kind: 'node', ID };
    this.markDirty();
  }

  deleteSelected() {
    if (this.selNode) this.deleteNode(this.selNode);
    else if (this.selEdge) this.deleteEdge(this.selEdge);
  }

  // ---------------- zoom ----------------

  zoomBy(d: number) {
    this.setZoom(this.zoom + d);
  }

  private setZoom(z: number) {
    this.zoom = Math.round(Math.min(1.6, Math.max(0.4, z)) * 100) / 100;
  }

  /** @param minZoom on first load keep labels readable instead of squeezing a wide workflow to 40% */
  fit(minZoom = 0) {
    const wrap = this.wrapRef?.nativeElement;
    if (!wrap || !this.wf || !this.wf.Nodes.length) { this.setZoom(1); return; }
    const xs = this.wf.Nodes.map(n => n.X), ys = this.wf.Nodes.map(n => n.Y);
    const minX = Math.min(...xs) - 40, minY = Math.min(...ys) - 60;
    const maxX = Math.max(...this.wf.Nodes.map(n => n.X + this.size(n).w)) + 40;
    const maxY = Math.max(...this.wf.Nodes.map(n => n.Y + this.size(n).h)) + 120;
    const z = Math.min(1.2, (wrap.clientWidth) / (maxX - minX), (wrap.clientHeight) / (maxY - minY));
    this.setZoom(Math.max(minZoom, z));
    setTimeout(() => {
      wrap.scrollLeft = Math.max(0, minX * this.zoom);
      wrap.scrollTop = Math.max(0, minY * this.zoom);
    });
  }

  // ---------------- node summary ----------------

  summary(n: WfNode): string {
    switch (n.Type) {
      case 'Step': return `${n.Category || 'In Progress'}${n.SlaHours ? ' · ' + this.ui.formatMinutes(n.SlaHours * 60) + ' limit' : ''}`;
      case 'Approval': {
        const who = n.ApproverType === 'Manager' ? 'Reporting manager'
          : n.ApproverType === 'Role' ? (this.ui.roleName(n.ApproverID) || 'Pick a role')
          : this.ui.userName(n.ApproverID) || 'Pick a user';
        return who;
      }
      case 'Condition': return `Is ${n.Field || '?'} ${n.Operator || '='} ${n.Value || '?'}?`;
      case 'Notification': {
        const to = n.NotifyTarget === 'User' ? this.ui.userName(n.NotifyID) || 'user'
          : n.NotifyTarget === 'Role' ? this.ui.roleName(n.NotifyID) || 'role' : (n.NotifyTarget || 'Requester');
        return `${n.Channel || 'Email'} to ${to}`;
      }
      case 'End': return n.Outcome || 'Completed';
      default: return '';
    }
  }

  statusDef(name: string): WorkflowStatusDef | undefined {
    return this.statusLib.find(s => s.Name.toLowerCase() === (name || '').toLowerCase());
  }

  onStepNameChange(n: WfNode) {
    const s = this.statusDef(n.Name);
    if (s) n.Category = s.Category;
    this.markDirty();
  }

  hasIssue(n: WfNode): 'error' | 'warning' | '' {
    if (!this.validated) return '';
    const own = this.issues.filter(i => i.NodeID === n.ID);
    return own.some(i => i.Level === 'error') ? 'error' : own.length ? 'warning' : '';
  }

  // ---------------- validation ----------------

  validate(show = true): Issue[] {
    const issues: Issue[] = [];
    const wf = this.wf;
    if (!wf) return issues;
    if (!wf.Name.trim()) issues.push({ Level: 'error', Message: 'Give the workflow a name.' });
    const starts = wf.Nodes.filter(n => n.Type === 'Start');
    const ends = wf.Nodes.filter(n => n.Type === 'End');
    if (!starts.length) issues.push({ Level: 'error', Message: 'Add a Start block so the workflow knows where to begin.' });
    if (starts.length > 1) starts.slice(1).forEach(s => issues.push({ Level: 'error', Message: `There can be only one Start block. Remove “${s.Name}”.`, NodeID: s.ID }));
    if (!ends.length) issues.push({ Level: 'error', Message: 'Add an End block so the workflow can finish.' });

    const out = (id: string) => wf.Edges.filter(e => e.From === id).map(e => e.To);
    const inc = (id: string) => wf.Edges.filter(e => e.To === id).map(e => e.From);
    const bfs = (seeds: string[], next: (id: string) => string[]) => {
      const seen = new Set<string>(seeds);
      const q = [...seeds];
      while (q.length) {
        const c = q.shift()!;
        next(c).forEach(x => { if (!seen.has(x)) { seen.add(x); q.push(x); } });
      }
      return seen;
    };
    const reach = starts.length ? bfs([starts[0].ID], out) : new Set<string>();
    const canEnd = bfs(ends.map(e => e.ID), inc);

    if (starts.length && ends.length && !ends.some(e => reach.has(e.ID))) {
      issues.push({ Level: 'error', Message: 'There is no way to get from Start to an End block.', NodeID: starts[0].ID });
    }

    wf.Nodes.forEach(n => {
      const o = out(n.ID), i = inc(n.ID);
      if (!o.length && !i.length && wf.Nodes.length > 1) {
        issues.push({ Level: 'error', Message: `“${n.Name}” is not connected to any other block.`, NodeID: n.ID });
        return;
      }
      if (n.Type !== 'Start' && starts.length && !reach.has(n.ID)) issues.push({ Level: 'error', Message: `Nothing leads to “${n.Name}”, so it will never be used.`, NodeID: n.ID });
      if (n.Type !== 'End' && !o.length) issues.push({ Level: 'error', Message: `“${n.Name}” does not lead anywhere. Connect it to the next block.`, NodeID: n.ID });
      else if (n.Type !== 'End' && ends.length && !canEnd.has(n.ID)) issues.push({ Level: 'warning', Message: `Items in “${n.Name}” can go round in circles and never finish.`, NodeID: n.ID });
      if (n.Type === 'Start' && i.length) issues.push({ Level: 'error', Message: 'Nothing can point back to the Start block.', NodeID: n.ID });
      if (n.Type === 'End' && o.length) issues.push({ Level: 'error', Message: `“${n.Name}” is an End block, so nothing should come after it.`, NodeID: n.ID });
      if (!n.Name.trim()) issues.push({ Level: 'error', Message: `A ${this.typeLabel(n.Type).toLowerCase()} block has no name.`, NodeID: n.ID });
      if (n.Type === 'Approval' && n.ApproverType !== 'Manager' && !n.ApproverID) {
        issues.push({ Level: 'error', Message: `Choose who approves “${n.Name}”.`, NodeID: n.ID });
      }
      if (n.Type === 'Condition') {
        if (!n.Field || !n.Value) issues.push({ Level: 'error', Message: `Fill in what “${n.Name}” should check.`, NodeID: n.ID });
        const br = wf.Edges.filter(e => e.From === n.ID).map(e => e.Branch);
        if (!br.includes('Yes') || !br.includes('No')) issues.push({ Level: 'warning', Message: `“${n.Name}” should have both a Yes and a No way out.`, NodeID: n.ID });
      }
      if (n.Type === 'Notification' && (n.NotifyTarget === 'User' || n.NotifyTarget === 'Role') && !n.NotifyID) {
        issues.push({ Level: 'warning', Message: `Choose who gets the message “${n.Name}”.`, NodeID: n.ID });
      }
      if (n.Type === 'Step' && !this.statusDef(n.Name)) {
        issues.push({ Level: 'warning', Message: `The status “${n.Name}” does not exist yet. Add it on the Statuses page.`, NodeID: n.ID });
      }
    });

    this.issues = issues;
    this.validated = true;
    if (show) this.showIssues = true;
    return issues;
  }

  get errorCount(): number { return this.issues.filter(i => i.Level === 'error').length; }
  get warningCount(): number { return this.issues.filter(i => i.Level === 'warning').length; }

  focusIssue(i: Issue) {
    if (!i.NodeID) return;
    const n = this.node(i.NodeID);
    if (!n) return;
    this.selected = { Kind: 'node', ID: n.ID };
    const wrap = this.wrapRef?.nativeElement;
    if (wrap) {
      wrap.scrollLeft = Math.max(0, n.X * this.zoom - wrap.clientWidth / 2 + 100);
      wrap.scrollTop = Math.max(0, n.Y * this.zoom - wrap.clientHeight / 2 + 35);
    }
  }

  // ---------------- save / publish ----------------

  markDirty() {
    this.dirty = true;
    if (this.validated) this.validate(false);
  }

  saveDraft() {
    if (!this.wf) return;
    if (!this.wf.Name.trim()) { this.notificationsService.showNotification('error', 'Workflow Name is Required'); return; }
    this.persist(false);
  }

  publish() {
    if (!this.wf) return;
    const issues = this.validate();
    if (issues.some(i => i.Level === 'error')) {
      this.notificationsService.showNotification('error', `Fix ${this.errorCount} problem${this.errorCount === 1 ? '' : 's'} before publishing`);
      return;
    }
    const warn = this.warningCount ? ` There ${this.warningCount === 1 ? 'is 1 thing' : 'are ' + this.warningCount + ' things'} worth checking.` : '';
    this.notificationsService.showConfirm(`Publish “${this.wf.Name}”? Projects using it will start using this version.${warn}`).then(ok => {
      if (ok) this.persist(true);
    });
  }

  private persist(publish: boolean) {
    if (!this.wf) return;
    this.loaderService.showLoader();
    this.wfService.saveWorkflow(this.wf, publish).subscribe({
      next: res => {
        this.loaderService.hideLoader();
        this.dirty = false;
        this.notificationsService.showNotification('success', res.Status);
        if (this.isNew) {
          this.router.navigate(['/workflows/designer', res.Workflow.ID], { replaceUrl: true });
        } else {
          this.wf = { ...res.Workflow, Nodes: this.wf!.Nodes, Edges: this.wf!.Edges };
        }
      },
      error: () => {
        this.loaderService.hideLoader();
        this.notificationsService.showNotification('error', 'Something went wrong. Please try again.');
      }
    });
  }

  back() {
    if (!this.dirty) { this.router.navigate(['/workflows']); return; }
    this.notificationsService.showConfirm('You have unsaved changes. Leave the designer and discard them?').then(ok => {
      if (ok) { this.dirty = false; this.router.navigate(['/workflows']); }
    });
  }
}
