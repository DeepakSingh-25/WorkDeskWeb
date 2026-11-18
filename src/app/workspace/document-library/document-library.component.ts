import { Component, ChangeDetectionStrategy, OnDestroy, OnInit } from '@angular/core';
import { FormControl, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import {
  faChevronDown, faChevronRight, faClockRotateLeft, faFolder, faFolderOpen, faFolderPlus, faGrip, faList, faStar,
  faUpload, faXmark, faArrowRightArrowLeft, faHardDrive
} from '@fortawesome/free-solid-svg-icons';
import { DocFile, DocFolder } from '../../Interface/workspace';
import { WorkspaceService } from '../../services/Workspace/workspace.service';
import { NotificationsService } from '../../services/notifications.service';
import { LoaderService } from '../../services/Loader/loader.service';
import { PROJECTS } from '../../services/Shared/mock-directory';
import { WorkspaceUi } from '../workspace-ui';

interface TreeRow { Folder: DocFolder; Depth: number; HasChildren: boolean; }
type NameDialog = { Mode: 'newFolder' | 'renameFolder' | 'renameFile'; TargetID: number | null; Title: string };

/** Document library with folder tree, upload, versions and preview (`/workspace/documents`). */
@Component({
    selector: 'app-document-library',
    templateUrl: './document-library.component.html',
    styleUrl: './document-library.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class DocumentLibraryComponent implements OnInit, OnDestroy {
  ui = WorkspaceUi;
  faDown = faChevronDown; faRight = faChevronRight; faFolder = faFolder; faFolderOpen = faFolderOpen; faNewFolder = faFolderPlus;
  faGrid = faGrip; faList = faList; faStar = faStar; faUpload = faUpload; faClose = faXmark; faMove = faArrowRightArrowLeft;
  faRecent = faClockRotateLeft; faDrive = faHardDrive;
  projects = PROJECTS;

  folders: DocFolder[] = [];
  files: DocFile[] = [];
  expanded = new Set<number>([1, 2]);
  currentFolderId: number | null = null;
  special: '' | 'starred' | 'recent' = '';
  layout: 'grid' | 'list' = 'grid';
  search = '';
  sortBy: 'Name' | 'ModifiedOn' | 'FileSize' = 'ModifiedOn';
  sortDir: 'asc' | 'desc' = 'desc';
  dragOver = false;

  // drawers / dialogs
  preview: DocFile | null = null;
  previewTab: 'preview' | 'details' | 'versions' = 'preview';
  previewUrl: SafeResourceUrl | null = null;
  newTag = '';
  versionNote = '';
  nameDialog: NameDialog | null = null;
  txtName = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(120)] });
  moveFile: DocFile | null = null;
  moveTarget: number | null = null;

  private subs = new Subscription();
  private pendingDocId: number | null = null;

  constructor(
    private workspaceService: WorkspaceService,
    private notificationsService: NotificationsService,
    private loaderService: LoaderService,
    private sanitizer: DomSanitizer,
    private router: Router,
    private route: ActivatedRoute
  ) { }

  ngOnInit() {
    this.subs.add(this.route.queryParamMap.subscribe(q => {
      const doc = Number(q.get('doc')) || null;
      this.pendingDocId = doc;
      if (!doc) this.preview = null;
      this.applyDocParam();
    }));
    this.load();
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  load(after?: () => void) {
    this.loaderService.showLoader();
    this.workspaceService.getFolders().subscribe(folders => {
      this.folders = folders;
      this.workspaceService.getFiles().subscribe({
        next: files => {
          this.files = files;
          this.loaderService.hideLoader();
          if (this.preview) this.preview = this.files.find(f => f.ID === this.preview!.ID) || null;
          this.applyDocParam();
          after?.();
        },
        error: () => this.loaderService.hideLoader()
      });
    });
  }

  private applyDocParam() {
    if (!this.pendingDocId || !this.files.length) return;
    const f = this.files.find(x => x.ID === this.pendingDocId);
    if (f && this.preview?.ID !== f.ID) {
      this.openFolder(f.FolderID);
      this.showPreview(f);
    }
  }

  // ---------------- tree ----------------
  get treeRows(): TreeRow[] {
    const rows: TreeRow[] = [];
    const walk = (parent: number | null, depth: number) => {
      this.folders.filter(f => f.ParentID === parent).sort((a, b) => a.Name.localeCompare(b.Name)).forEach(f => {
        const HasChildren = this.folders.some(c => c.ParentID === f.ID);
        rows.push({ Folder: f, Depth: depth, HasChildren });
        if (HasChildren && this.expanded.has(f.ID)) walk(f.ID, depth + 1);
      });
    };
    walk(null, 0);
    return rows;
  }

  toggle(f: DocFolder, event: Event) {
    event.stopPropagation();
    if (this.expanded.has(f.ID)) this.expanded.delete(f.ID); else this.expanded.add(f.ID);
  }

  openFolder(ID: number | null) {
    this.currentFolderId = ID;
    this.special = '';
    this.search = '';
    // expand ancestors so the folder is visible in the tree
    let f = this.folders.find(x => x.ID === ID);
    while (f && f.ParentID) {
      this.expanded.add(f.ParentID);
      const pid: number = f.ParentID;
      f = this.folders.find(x => x.ID === pid);
    }
    if (ID) this.expanded.add(ID);
  }

  openSpecial(s: 'starred' | 'recent') {
    this.special = s;
    this.currentFolderId = null;
    this.search = '';
  }

  get currentFolder(): DocFolder | undefined {
    return this.folders.find(f => f.ID === this.currentFolderId);
  }

  get breadcrumbs(): DocFolder[] {
    const out: DocFolder[] = [];
    let f = this.currentFolder;
    while (f) {
      out.unshift(f);
      const pid = f.ParentID;
      f = this.folders.find(x => x.ID === pid);
    }
    return out;
  }

  get subFolders(): DocFolder[] {
    if (this.special || this.search) return [];
    return this.folders.filter(f => f.ParentID === this.currentFolderId).sort((a, b) => a.Name.localeCompare(b.Name));
  }

  folderItemCount(f: DocFolder): number {
    const ids = this.descendants(f.ID);
    return this.files.filter(x => ids.includes(x.FolderID)).length + this.folders.filter(x => x.ParentID === f.ID).length;
  }

  private descendants(ID: number): number[] {
    const out = [ID];
    this.folders.filter(f => f.ParentID === ID).forEach(c => out.push(...this.descendants(c.ID)));
    return out;
  }

  // ---------------- files ----------------
  get visibleFiles(): DocFile[] {
    let rows: DocFile[];
    if (this.special === 'starred') rows = this.files.filter(f => f.Starred);
    else if (this.special === 'recent') rows = [...this.files].sort((a, b) => b.ModifiedOn.localeCompare(a.ModifiedOn)).slice(0, 12);
    else if (this.search) {
      const scope = this.currentFolderId ? this.descendants(this.currentFolderId) : null;
      rows = this.files.filter(f => !scope || scope.includes(f.FolderID));
    } else rows = this.files.filter(f => f.FolderID === this.currentFolderId);
    if (this.search) rows = rows.filter(f => WorkspaceUi.matches(this.search, f.Name, f.Tags.join(' '), f.OwnerName, f.ProjectName));
    if (this.special === 'recent' && !this.search) return rows;
    const dir = this.sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const r = this.sortBy === 'FileSize' ? a.FileSize - b.FileSize : String(a[this.sortBy]).localeCompare(String(b[this.sortBy]));
      return r * dir;
    });
  }

  get title(): string {
    if (this.special === 'starred') return 'Starred';
    if (this.special === 'recent') return 'Recent';
    return this.currentFolder?.Name || 'All documents';
  }

  /** "<column>-<dir>" value for the sort dropdown, e.g. "ModifiedOn-desc". */
  get sortKey(): string { return `${this.sortBy}-${this.sortDir}`; }

  setSortKey(v: string) {
    const [col, dir] = v.split('-') as ['Name' | 'ModifiedOn' | 'FileSize', 'asc' | 'desc'];
    this.sortBy = col;
    this.sortDir = dir;
  }

  setSort(col: 'Name' | 'ModifiedOn' | 'FileSize') {
    this.sortDir = this.sortBy === col && this.sortDir === 'asc' ? 'desc' : 'asc';
    this.sortBy = col;
  }

  get usedBytes(): number {
    return this.files.reduce((s, f) => s + f.Versions.reduce((x, v) => x + v.FileSize, 0), 0);
  }

  get usedPct(): number {
    return Math.min(100, this.usedBytes / this.workspaceService.storageQuota * 100);
  }

  get quota(): number {
    return this.workspaceService.storageQuota;
  }

  kind(f: DocFile): string {
    return WorkspaceUi.fileKind(f.Name, f.FileType);
  }

  isImage(f: DocFile): boolean {
    return f.FileType.startsWith('image/');
  }

  isPdf(f: DocFile): boolean {
    return f.FileType === 'application/pdf' || f.Name.toLowerCase().endsWith('.pdf');
  }

  folderPath(ID: number): string {
    return this.workspaceService.folderPath(ID);
  }

  // ---------------- upload ----------------
  onDragOver(e: DragEvent) {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    this.dragOver = true;
  }

  onDrop(e: DragEvent) {
    e.preventDefault();
    this.dragOver = false;
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length) this.upload(files);
  }

  onBrowse(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    input.value = '';
    if (files.length) this.upload(files);
  }

  get canUpload(): boolean {
    return !!this.currentFolderId && !this.special;
  }

  private upload(files: File[]) {
    if (!this.canUpload) {
      this.notificationsService.showNotification('error', 'Open a folder first to upload files into it.');
      return;
    }
    const tooBig = files.filter(f => f.size > 100 * 1024 * 1024);
    if (tooBig.length) {
      this.notificationsService.showNotification('error', `${tooBig[0].name} is larger than 100 MB.`);
      return;
    }
    this.workspaceService.uploadFiles(this.currentFolderId!, files).subscribe(res => {
      this.notificationsService.showNotification('success', res.Status);
      this.load();
    });
  }

  // ---------------- file actions ----------------
  toggleStar(f: DocFile, e?: Event) {
    e?.stopPropagation();
    this.workspaceService.updateFile(f.ID, { Starred: !f.Starred }).subscribe(() => {
      f.Starred = !f.Starred;
      const inList = this.files.find(x => x.ID === f.ID);
      if (inList && inList !== f) inList.Starred = f.Starred;
    });
  }

  onDeleteFile(f: DocFile, e?: Event) {
    e?.stopPropagation();
    this.notificationsService.showdelete(`Delete “${f.Name}”? It will be moved to the recycle bin for 30 days.`).then(ok => {
      if (!ok) return;
      this.workspaceService.deleteFile(f.ID).subscribe(res => {
        this.notificationsService.showNotification('success', res.Status);
        if (this.preview?.ID === f.ID) this.closePreview();
        this.load();
      });
    });
  }

  onDeleteFolder(f: DocFolder) {
    this.notificationsService.showdelete(`Delete folder “${f.Name}” with all sub-folders? Files move to the recycle bin.`).then(ok => {
      if (!ok) return;
      this.workspaceService.deleteFolder(f.ID).subscribe(res => {
        this.notificationsService.showNotification('success', res.Status);
        this.currentFolderId = f.ParentID;
        this.load();
      });
    });
  }

  // name dialog (new folder / rename)
  openNewFolder() {
    this.nameDialog = { Mode: 'newFolder', TargetID: this.currentFolderId, Title: this.currentFolder ? `New folder in “${this.currentFolder.Name}”` : 'New folder' };
    this.txtName.reset('');
  }

  openRenameFolder(f: DocFolder) {
    this.nameDialog = { Mode: 'renameFolder', TargetID: f.ID, Title: 'Rename folder' };
    this.txtName.reset(f.Name);
  }

  openRenameFile(f: DocFile, e?: Event) {
    e?.stopPropagation();
    this.nameDialog = { Mode: 'renameFile', TargetID: f.ID, Title: 'Rename file' };
    this.txtName.reset(f.Name);
  }

  saveName() {
    this.txtName.markAsTouched();
    if (this.txtName.invalid || !this.nameDialog || !this.txtName.value.trim()) return;
    const d = this.nameDialog, name = this.txtName.value.trim();
    const done = (res: any) => {
      if (res.Status.includes('Exists')) {
        this.notificationsService.showNotification('error', 'A folder with this name already exists here.');
        return;
      }
      this.notificationsService.showNotification('success', res.Status);
      this.nameDialog = null;
      this.load(() => { if (d.Mode === 'newFolder' && res.ID) this.openFolder(res.ID); });
    };
    if (d.Mode === 'newFolder') this.workspaceService.folderAddEdit({ ID: 0, Name: name, ParentID: d.TargetID }).subscribe(done);
    else if (d.Mode === 'renameFolder') this.workspaceService.folderAddEdit({ ID: d.TargetID!, Name: name, ParentID: this.folders.find(f => f.ID === d.TargetID)?.ParentID ?? null }).subscribe(done);
    else this.workspaceService.updateFile(d.TargetID!, { Name: name }).subscribe(done);
  }

  // move drawer
  openMove(f: DocFile, e?: Event) {
    e?.stopPropagation();
    this.moveFile = f;
    this.moveTarget = f.FolderID;
  }

  get allFolderRows(): { Folder: DocFolder; Depth: number }[] {
    const rows: { Folder: DocFolder; Depth: number }[] = [];
    const walk = (parent: number | null, depth: number) => this.folders.filter(f => f.ParentID === parent)
      .sort((a, b) => a.Name.localeCompare(b.Name)).forEach(f => { rows.push({ Folder: f, Depth: depth }); walk(f.ID, depth + 1); });
    walk(null, 0);
    return rows;
  }

  confirmMove() {
    if (!this.moveFile || !this.moveTarget) return;
    const f = this.moveFile, target = this.moveTarget;
    this.workspaceService.updateFile(f.ID, { FolderID: target }).subscribe(() => {
      this.notificationsService.showNotification('success', `Moved to ${this.folderPath(target)}`);
      this.moveFile = null;
      this.load();
    });
  }

  // ---------------- preview drawer ----------------
  openPreview(f: DocFile) {
    this.router.navigate([], { relativeTo: this.route, queryParams: { doc: f.ID }, queryParamsHandling: 'merge' });
  }

  private showPreview(f: DocFile) {
    this.preview = f;
    this.previewTab = 'preview';
    this.newTag = '';
    this.versionNote = '';
    this.previewUrl = f.Url && f.Url.startsWith('blob:') && this.isPdf(f) ? this.sanitizer.bypassSecurityTrustResourceUrl(f.Url) : null;
  }

  closePreview() {
    this.preview = null;
    this.router.navigate([], { relativeTo: this.route, queryParams: { doc: null }, queryParamsHandling: 'merge' });
  }

  setProject(ID: number | null) {
    if (!this.preview) return;
    const f = this.preview;
    this.workspaceService.updateFile(f.ID, { ProjectID: ID }).subscribe(() => {
      this.notificationsService.showNotification('success', ID ? `Linked to ${WorkspaceUi.projectName(ID)}` : 'Project link removed');
      this.load();
    });
  }

  addTag() {
    const t = this.newTag.trim();
    if (!this.preview || !t || this.preview.Tags.includes(t)) { this.newTag = ''; return; }
    const Tags = [...this.preview.Tags, t];
    this.workspaceService.updateFile(this.preview.ID, { Tags }).subscribe(() => { this.newTag = ''; this.load(); });
  }

  removeTag(t: string) {
    if (!this.preview) return;
    this.workspaceService.updateFile(this.preview.ID, { Tags: this.preview.Tags.filter(x => x !== t) }).subscribe(() => this.load());
  }

  onVersionFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !this.preview) return;
    this.workspaceService.uploadVersion(this.preview.ID, file, this.versionNote.trim()).subscribe(res => {
      this.notificationsService.showNotification('success', res.Status);
      this.versionNote = '';
      const id = this.preview!.ID;
      this.load(() => {
        const f = this.files.find(x => x.ID === id);
        if (f) { this.showPreview(f); this.previewTab = 'versions'; }
      });
    });
  }
}
