import { Component, ChangeDetectionStrategy, ElementRef, HostListener, Input } from '@angular/core';
import { faChevronDown, faFileCsv, faFileExcel, faFilePdf } from '@fortawesome/free-solid-svg-icons';
import { ExportFormat } from '../../Interface/reports';
import { ReportsService } from '../../services/Reports/reports.service';
import { NotificationsService } from '../../services/notifications.service';
import { ExportColumn } from '../../services/Shared/export.util';

/** "Export" dropdown (CSV / Excel / PDF) for the main table of a report page. */
@Component({
    selector: 'app-report-export-menu',
    templateUrl: './report-export-menu.component.html',
    styleUrl: './report-export-menu.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class ReportExportMenuComponent {
  @Input() title = 'Report';
  @Input() fileName = 'report';
  @Input() source = 'Reports';
  @Input() rows: any[] = [];
  @Input() columns: ExportColumn[] = [];

  faDown = faChevronDown;
  formats: { key: ExportFormat; label: string; icon: any; hint: string }[] = [
    { key: 'Excel', label: 'Excel', icon: faFileExcel, hint: '.xls workbook' },
    { key: 'CSV', label: 'CSV', icon: faFileCsv, hint: 'Comma separated' },
    { key: 'PDF', label: 'PDF', icon: faFilePdf, hint: 'Print / save as PDF' },
  ];
  open = false;

  constructor(private el: ElementRef<HTMLElement>, private reports: ReportsService, private notificationsService: NotificationsService) { }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent) {
    if (this.open && !this.el.nativeElement.contains(e.target as Node)) this.open = false;
  }

  @HostListener('document:keydown.escape')
  onEsc() {
    this.open = false;
  }

  run(format: ExportFormat) {
    this.open = false;
    if (!this.rows.length) {
      this.notificationsService.showNotification('error', 'There is no data to export for the current filters.');
      return;
    }
    const ok = this.reports.runExport(format, this.title, this.rows, this.columns, {
      source: this.source, fileName: this.fileName, subtitle: this.reports.filterSummary()
    });
    if (!ok) this.notificationsService.showNotification('error', 'Pop-up blocked. Please allow pop-ups to export as PDF.');
    else if (format !== 'PDF') this.notificationsService.showNotification('success', `${this.title} exported as ${format}.`);
  }
}
