import type { Remitter } from "remitter";

export interface DocsViewerEventData {
  play: void;
  next: void;
  back: void;
  jumpPage: number;
  togglePreview: void;
}

export type DocsViewerEvent = keyof DocsViewerEventData;

export type DocsViewerEvents = Remitter<DocsViewerEventData>;

export interface DocsViewerPage {
  src: string;
  height: number;
  width: number;
  thumbnail?: string;
}
