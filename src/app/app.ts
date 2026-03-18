import { Component, inject } from '@angular/core';
import { RouterOutlet, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SpaceService } from './core/services/space';
import { Navbar } from './components/navbar/navbar';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, Navbar, CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {

  spaces: any[] = [];

  private spaceService = inject(SpaceService);

  constructor(public router: Router) {

    this.spaceService.getSpaces().subscribe(data => {
      console.log('spaces:', data);
      this.spaces = data;
    });

  }

}