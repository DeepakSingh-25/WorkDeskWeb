import { Component, ChangeDetectionStrategy } from '@angular/core';
import { ThemeService } from '../services/Theme/theme.service';
import { ProfilePhotoService } from '../services/User-Profile/profile-photo.service';
import { AuthService } from '../services/Auth/auth.service';
import { faCartShopping, faTrashCan, faUnlockKeyhole } from '@fortawesome/free-solid-svg-icons';

@Component({
    selector: 'app-header-responsive',
    templateUrl: './header-responsive.component.html',
    styleUrl: './header-responsive.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class HeaderResponsiveComponent {
  lock=faUnlockKeyhole;
  cart=faCartShopping;
  trash=faTrashCan;
  email: string | null = '';
  crnNumber: string | null = '';
  companyName: string | null = '';

  constructor(public theme: ThemeService, public photoService: ProfilePhotoService, public authService: AuthService) {
     this.photoService.refresh();
    this.email = localStorage.getItem("EmailID");
    this.crnNumber = localStorage.getItem("CRNnumber");
    this.companyName = localStorage.getItem("CompanyName");
  }
  messages = [
    {
      image:"../../assets/images/profile.webp",
      name: "Manish Purohit",
      time: "Octomber 22, Creadent"
    },
    {
      image:"../../assets/images/profile.webp",
      name: "Manish Purohit",
      time: "Octomber 22, Creadent"
    },
    {
      image:"../../assets/images/profile.webp",
      name: "Manish Purohit",
      time: "Octomber 22, Creadent"
    },
    {
      image:"../../assets/images/profile.webp",
      name: "Manish Purohit",
      time: "Octomber 22, Creadent"
    },
    {
      image:"../../assets/images/profile.webp",
      name: "Manish Purohit",
      time: "Octomber 22, Creadent"
    },
    {
      image:"../../assets/images/profile.webp",
      name: "Manish Purohit",
      time: "Octomber 22, Creadent"
    },
    {
      image:"../../assets/images/profile.webp",
      name: "Manish Purohit",
      time: "Octomber 22, Creadent"
    },
    {
      image:"../../assets/images/profile.webp",
      name: "Manish Purohit",
      time: "Octomber 22, Creadent"
    },
    {
      image:"../../assets/images/profile.webp",
      name: "Manish Purohit",
      time: "Octomber 22, Creadent"
    },
    {
      image:"../../assets/images/profile.webp",
      name: "Manish Purohit",
      time: "Octomber 22, Creadent"
    },
    {
      image:"../../assets/images/profile.webp",
      name: "Manish Purohit",
      time: "Octomber 22, Creadent"
    },
    {
      image:"../../assets/images/profile.webp",
      name: "Manish Purohit",
      time: "Octomber 22, Creadent"
    },
    {
      image:"../../assets/images/profile.webp",
      name: "Manish Purohit",
      time: "Octomber 22, Creadent"
    },
    {
      image:"../../assets/images/profile.webp",
      name: "Manish Purohit",
      time: "Octomber 22, Creadent"
    },
    {
      image:"../../assets/images/profile.webp",
      name: "Manish Purohit",
      time: "Octomber 22, Creadent"
    }
  ]

   toggle(){
    const navbar:any = window.document.querySelector(".navbar");
    navbar.classList.toggle('active');
  }

  Logout(){
  this.photoService.clear();
  localStorage.clear();
  this.theme.persist();
  window.location.href = '/Login';
  }

}
