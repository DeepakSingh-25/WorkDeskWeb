import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AgileBacklogComponent } from './agile-backlog/agile-backlog.component';
import { AgilePlanningComponent } from './agile-planning/agile-planning.component';
import { AgileBoardComponent } from './agile-board/agile-board.component';

const routes: Routes = [
  { path: '', redirectTo: 'backlog', pathMatch: 'full' },
  { path: 'backlog', component: AgileBacklogComponent },
  { path: 'planning', component: AgilePlanningComponent },
  { path: 'board', component: AgileBoardComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AgileRoutingModule { }
