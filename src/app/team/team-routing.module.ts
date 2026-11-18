import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TeamDirectoryComponent } from './team-directory/team-directory.component';
import { TeamInviteComponent } from './team-invite/team-invite.component';
import { TeamProfileComponent } from './team-profile/team-profile.component';

const routes: Routes = [
  { path: '', component: TeamDirectoryComponent },
  { path: 'invite', component: TeamInviteComponent },
  { path: 'people/:id', component: TeamProfileComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TeamRoutingModule { }
