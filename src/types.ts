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
