import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HomeOverviewComponent } from './home-overview/home-overview.component';
import { HomeTasksComponent } from './home-tasks/home-tasks.component';
import { HomeNotificationsComponent } from './home-notifications/home-notifications.component';

const routes: Routes = [
  { path: '', component: HomeOverviewComponent },
  { path: 'tasks', component: HomeTasksComponent },
  { path: 'notifications', component: HomeNotificationsComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class HomeRoutingModule { }
