import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { WorkspaceRoutingModule } from './workspace-routing.module';
import { WorkspaceNavComponent } from './workspace-nav/workspace-nav.component';
import { GlobalSearchBoxComponent } from './global-search-box/global-search-box.component';
import { GlobalSearchComponent } from './global-search/global-search.component';
import { DocumentLibraryComponent } from './document-library/document-library.component';
import { RecurringTasksComponent } from './recurring-tasks/recurring-tasks.component';
import { RecurringFormComponent } from './recurring-form/recurring-form.component';

@NgModule({
  declarations: [
    WorkspaceNavComponent,
    GlobalSearchBoxComponent,
    GlobalSearchComponent,
    DocumentLibraryComponent,
    RecurringTasksComponent,
    RecurringFormComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    NgSelectModule,
    FontAwesomeModule,
    WorkspaceRoutingModule
  ],
  exports: [GlobalSearchBoxComponent]
})
export class WorkspaceModule { }
