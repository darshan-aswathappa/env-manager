import { readTextFile, writeTextFile, exists } from "@tauri-apps/plugin-fs";
import type { EnvVar } from "../types";

export async function readEnvFile(projectPath: string): Promise<EnvVar[]> {
  const filePath = `${projectPath}/.env`;
  const fileExists = await exists(filePath);
  if (!fileExists) return [];

  const content = await readTextFile(filePath);
  return content
    .split("\n")
    .filter((line) => line.trim() && !line.startsWith("#"))
    .map((line) => {
      const eqIndex = line.indexOf("=");
      if (eqIndex === -1) return null;
      return {
        id: crypto.randomUUID(),
        key: line.slice(0, eqIndex).trim(),
        val: line.slice(eqIndex + 1).trim(),
        revealed: false,
      };
    })
    .filter((v): v is EnvVar => v !== null);
}

export async function writeEnvFile(
  projectPath: string,
  vars: EnvVar[],
): Promise<void> {
  const content = vars
    .filter((v) => v.key.trim())
    .map((v) => `${v.key}=${v.val}`)
    .join("\n");
  await writeTextFile(`${projectPath}/.env`, content);
}

export async function checkGitignore(projectPath: string): Promise<boolean> {
  try {
    const content = await readTextFile(`${projectPath}/.gitignore`);
    return content.split("\n").some((line) => {
      const t = line.trim();
      return t === ".env" || t === "*.env";
    });
  } catch {
    return false;
  }
}
