import { stat } from "node:fs/promises";
import { resolve, isAbsolute, join } from "node:path";

export async function assertRepoPath(repoPath: string): Promise<string> {
  if (!repoPath || typeof repoPath !== "string") {
    throw new Error("repoPath is required");
  }
  if (!isAbsolute(repoPath)) {
    throw new Error("repoPath must be an absolute path");
  }
  const resolved = resolve(repoPath);
  let info;
  try {
    info = await stat(resolved);
  } catch {
    throw new Error(`Repo path does not exist: ${resolved}`);
  }
  if (!info.isDirectory()) {
    throw new Error(`Repo path is not a directory: ${resolved}`);
  }
  try {
    const gitDir = await stat(join(resolved, ".git"));
    if (!gitDir.isDirectory() && !gitDir.isFile()) {
      throw new Error(`Not a git repository: ${resolved}`);
    }
  } catch {
    throw new Error(`Not a git repository: ${resolved}`);
  }
  return resolved;
}
