import { Component, ChangeDetectionStrategy, Input, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { Project } from '../../Interface/project';
import { DatePreset, ReportFilter } from '../../Interface/reports';
import { ReportsService } from '../../services/Reports/reports.service';
import { TEAMS } from '../../services/Shared/mock-directory';

/** Shared filter bar of every report page (date range presets, projects, team). */
@Component({
    selector: 'app-report-filter-bar',
    templateUrl: './report-filter-bar.component.html',
    styleUrl: './report-filter-bar.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class ReportFilterBarComponent implements OnInit, OnDestroy {
  @Input() projects: Project[] = [];
  /** Hide the team selector on pages where it does not apply. */
  @Input() showTeam = true;

  moreFilters = false;
  teams = TEAMS;
  presets: { key: DatePreset; label: string }[] = [
    { key: 'week', label: 'This week' },
    { key: 'month', label: 'This month' },
    { key: 'last30', label: 'Last 30 days' },
    { key: 'quarter', label: 'This quarter' },
    { key: 'custom', label: 'Custom' },
  ];
  filter!: ReportFilter;
  private sub = new Subscription();

  constructor(public reports: ReportsService) { }

  ngOnInit() {
    this.sub.add(this.reports.filter$.subscribe(f => this.filter = { ...f, ProjectIDs: [...f.ProjectIDs] }));
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  get hasFilters(): boolean {
    return this.filter.Preset !== 'last30' || this.filter.ProjectIDs.length > 0 || !!this.filter.TeamID;
  }

  setPreset(p: DatePreset) {
    this.reports.setFilter({ Preset: p });
  }

  setDate(field: 'From' | 'To', value: string) {
    if (!value) return;
    this.reports.setFilter({ Preset: 'custom', [field]: value });
  }

  setProjects(ids: number[] | null) {
    this.reports.setFilter({ ProjectIDs: ids || [] });
  }

  setTeam(id: number | null) {
    this.reports.setFilter({ TeamID: id ? Number(id) : null });
  }

  reset() {
    this.reports.resetFilter();
    this.moreFilters = false;
  }
}
