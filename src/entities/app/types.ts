// Domain types for app-level metadata (export/import).
export interface ExportMetadata {
  schemaVersion: number;
  exportedAt: string; // ISO datetime
  appVersion?: string;
  source?: 'taskman-pwa';
}

export interface ImportPayload<TData> {
  meta: ExportMetadata;
  data: TData;
}
