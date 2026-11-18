import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import { NgApexchartsModule } from 'ng-apexcharts';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { AgileRoutingModule } from './agile-routing.module';
import { AgileNavComponent } from './agile-nav/agile-nav.component';
import { AgileIssueDrawerComponent } from './agile-issue-drawer/agile-issue-drawer.component';
import { AgileCompleteSprintComponent } from './agile-complete-sprint/agile-complete-sprint.component';
import { AgileBacklogComponent } from './agile-backlog/agile-backlog.component';
import { AgilePlanningComponent } from './agile-planning/agile-planning.component';
import { AgileBoardComponent } from './agile-board/agile-board.component';

@NgModule({
  declarations: [
    AgileNavComponent,
    AgileIssueDrawerComponent,
    AgileCompleteSprintComponent,
    AgileBacklogComponent,
    AgilePlanningComponent,
    AgileBoardComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    NgSelectModule,
    NgApexchartsModule,
    FontAwesomeModule,
    AgileRoutingModule
  ]
})
export class AgileModule { }
