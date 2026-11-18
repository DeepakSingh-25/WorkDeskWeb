import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { GlobalSearchComponent } from './global-search/global-search.component';
import { DocumentLibraryComponent } from './document-library/document-library.component';
import { RecurringTasksComponent } from './recurring-tasks/recurring-tasks.component';
import { RecurringFormComponent } from './recurring-form/recurring-form.component';

const routes: Routes = [
  { path: '', redirectTo: 'search', pathMatch: 'full' },
  { path: 'search', component: GlobalSearchComponent },
  { path: 'documents', component: DocumentLibraryComponent },
  { path: 'recurring', component: RecurringTasksComponent },
  { path: 'recurring/create', component: RecurringFormComponent },
  { path: 'recurring/edit/:id', component: RecurringFormComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class WorkspaceRoutingModule { }
