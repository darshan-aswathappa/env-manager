export type InheritanceMode = 'merge-child-wins' | 'merge-parent-wins' | 'isolated';

export interface EnvVar {
  id: string;
  key: string;
  val: string;
  revealed: boolean;
  sourceProjectId: string;
}

export interface Environment {
  suffix: string;   // "" = .env, "local" = .env.local, "production" = .env.production
  vars: EnvVar[];
}

export const ENV_SUFFIXES = ['', 'local', 'development', 'production', 'testing', 'staging'] as const;

export function envDisplayName(suffix: string): string {
  return suffix ? `.env.${suffix}` : '.env';
}

export interface Project {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
  vars: EnvVar[];
  environments: Environment[];
  activeEnv: string;
  inheritanceMode: InheritanceMode;
  sortOrder: number;
}

export interface ProjectTreeNode {
  project: Project;
  depth: number;
  children: ProjectTreeNode[];
  ancestorChain: Project[];
}

export type ProjectRegistry = Project[];

export type GitignoreStatus = 'no_gitignore' | 'not_listed' | 'listed';

export interface AppSettings {
  defaultShell: 'zsh' | 'bash';
  defaultInheritanceMode: InheritanceMode;
  autoMaskMinutes: number;
  clipboardClearSeconds: number;
}

// ── Push to Stage Types ────────────────────────────────────────

export type ConflictStrategy = 'overwrite' | 'skip';

export interface ConflictDetail {
  key: string;
  sourceVal: string;
  targetVal: string;
}

export interface ConflictReport {
  newKeys: string[];
  conflictSame: string[];        // identical value — will be auto-skipped
  conflictDifferent: ConflictDetail[];
}

export interface PushSummary {
  written: string[];             // keys that will be written (new or overwritten)
  skippedConflict: string[];     // keys skipped due to 'skip' strategy
  skippedNoChange: string[];     // keys with identical values (auto-skipped)
}

export interface AtomicWriteResult {
  snapshot: string | null;
  targetCreated: boolean;
}

export interface PushVarsRequest {
  projectId: string;
  sourceSuffix: string;
  targetSuffix: string;
  varsToPush: Array<{ key: string; val: string }>;
  conflictDecisions: Map<string, ConflictStrategy>; // per-key decisions; default is 'overwrite'
}

export interface PushResult {
  summary: PushSummary;
  snapshot: string | null;       // pre-push target content for undo
  targetCreated: boolean;
  updatedVars: import('./types').EnvVar[];  // the target env after push (re-read from disk)
}

// ── Cross-Environment Diff Types ──────────────────────────────────────────

export type DiffStatus = 'added' | 'removed' | 'modified' | 'unchanged';
// 'added'    — key exists only in the right env
// 'removed'  — key exists only in the left env
// 'modified' — key exists in both, values differ
// 'unchanged'— key exists in both, values identical

export interface DiffEntry {
  key: string;
  status: DiffStatus;
  leftVal: string | null;    // null when status is 'added'
  rightVal: string | null;   // null when status is 'removed'
}

export interface DiffResult {
  leftSuffix: string;
  rightSuffix: string;
  entries: DiffEntry[];
  addedCount: number;
  removedCount: number;
  modifiedCount: number;
  unchangedCount: number;
}

// ── Import / Export Types ──────────────────────────────────────────────────

export type ExportFormat = 'env' | 'json' | 'yaml' | 'csv' | 'shell'
export type ExportScope = 'active' | 'all'
export type ImportStep = 'pick' | 'preview' | 'conflicts' | 'done'

export interface ImportPreviewRow {
  key: string
  status: 'new' | 'same' | 'conflict'
  incomingVal: string
  currentVal: string | null
}
