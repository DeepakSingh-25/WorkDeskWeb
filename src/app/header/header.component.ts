import { Component, ChangeDetectionStrategy } from '@angular/core';
import { ThemeService } from '../services/Theme/theme.service';
import { ProfilePhotoService } from '../services/User-Profile/profile-photo.service';
import { AuthService } from '../services/Auth/auth.service';
import { faUnlockKeyhole,faCartShopping, faTrashCan } from '@fortawesome/free-solid-svg-icons';
@Component({
    selector: 'app-header',
    templateUrl: './header.component.html',
    styleUrl: './header.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class HeaderComponent {
   lock=faUnlockKeyhole;
   cart=faCartShopping;
   trash=faTrashCan;

   email: string | null = '';
   crnNumer: string | null = '';
   companyName: string | null = '';

   constructor(public theme: ThemeService, public photoService: ProfilePhotoService, public authService: AuthService) {
     this.photoService.refresh();
     this.email = localStorage.getItem("email");
     this.crnNumer = localStorage.getItem("CRNnumber");
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
