import { Component, EventEmitter, Output, ViewChild, ElementRef, OnDestroy, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface AttendanceCapture {
  photo: string; // base64 thumbnail
  lat: number | null;
  lng: number | null;
}

@Component({
  selector: 'app-attendance-capture',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex flex-col items-center gap-3">
      <video #video autoplay playsinline muted class="w-full max-w-[280px] rounded-[10px] bg-black" [class.hidden]="captured"></video>
      <canvas #canvas class="hidden"></canvas>
      <img *ngIf="captured" [src]="capturedPhoto" class="w-full max-w-[280px] rounded-[10px]" />

      <div *ngIf="errorMsg" class="text-[12px] text-danger-fg bg-danger-bg rounded-[7px] px-3 py-2 text-center">{{ errorMsg }}</div>
      <div *ngIf="geoStatus" class="text-[11px] text-muted-1">{{ geoStatus }}</div>

      <button *ngIf="!captured && !errorMsg" type="button" (click)="takePhoto()"
        class="bg-brand hover:bg-brand-hover text-white rounded-[9px] px-4 py-2 text-sm font-semibold">
        <i class="ph ph-camera"></i> Capture
      </button>
      <button *ngIf="captured" type="button" (click)="retake()"
        class="border border-line-1 rounded-[9px] px-4 py-2 text-sm font-medium text-body-1">
        Retake
      </button>
    </div>
  `,
})
export class AttendanceCaptureComponent implements AfterViewInit, OnDestroy {
  @Output() captureReady = new EventEmitter<AttendanceCapture>();
  @ViewChild('video') videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  captured = false;
  capturedPhoto = '';
  errorMsg = '';
  geoStatus = 'Getting location…';
  private lat: number | null = null;
  private lng: number | null = null;
  private stream: MediaStream | null = null;

  async ngAfterViewInit() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      this.videoRef.nativeElement.srcObject = this.stream;
    } catch (err) {
      this.errorMsg = 'Could not access camera. Check browser permissions, or that this page is loaded over HTTPS.';
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.lat = pos.coords.latitude;
          this.lng = pos.coords.longitude;
          this.geoStatus = `Location captured (±${Math.round(pos.coords.accuracy)}m)`;
        },
        () => {
          this.geoStatus = 'Location unavailable -- check will proceed without geo-tag.';
        },
        { timeout: 8000 }
      );
    } else {
      this.geoStatus = 'Geolocation not supported by this browser.';
    }
  }

  takePhoto() {
    const video = this.videoRef.nativeElement;
    const canvas = this.canvasRef.nativeElement;
    // Small thumbnail, not a full-resolution photo -- keeps storage light
    // since this is a presence-verification snapshot, not a portrait.
    canvas.width = 160;
    canvas.height = 120;
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(video, 0, 0, 160, 120);
    this.capturedPhoto = canvas.toDataURL('image/jpeg', 0.6);
    this.captured = true;
    this.captureReady.emit({ photo: this.capturedPhoto, lat: this.lat, lng: this.lng });
  }

  retake() {
    this.captured = false;
    this.capturedPhoto = '';
  }

  ngOnDestroy() {
    this.stream?.getTracks().forEach((t) => t.stop());
  }
}
