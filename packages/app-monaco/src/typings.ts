export interface NetlessAppMonacoAttributes {
  text?: string;
  /** key: room.observerId */
  cursors: Record<string, string[]>;
  selections: Record<string, string[]>;
}
