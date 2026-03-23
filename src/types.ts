export interface EnvVar {
  id: string;
  key: string;
  val: string;
  revealed: boolean;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  vars: EnvVar[];
}
