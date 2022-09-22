export interface SlideAttributes {
  taskId: string;
  url?: string;
}

export interface PreviewPage {
  width: number;
  height: number;
  thumbnail: string;
}

export interface PreviewInfo {
  width: number;
  height: number;
}

export interface SlideInfo {
  width: number;
  height: number;
  slideCount: number;
}
