import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import { NgApexchartsModule } from 'ng-apexcharts';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { TeamRoutingModule } from './team-routing.module';
import { TeamNavComponent } from './team-nav/team-nav.component';
import { TeamDirectoryComponent } from './team-directory/team-directory.component';
import { TeamInviteComponent } from './team-invite/team-invite.component';
import { TeamProfileComponent } from './team-profile/team-profile.component';

@NgModule({
  declarations: [
    TeamNavComponent,
    TeamDirectoryComponent,
    TeamInviteComponent,
    TeamProfileComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    NgSelectModule,
    NgApexchartsModule,
    FontAwesomeModule,
    TeamRoutingModule
  ]
})
export class TeamModule { }
