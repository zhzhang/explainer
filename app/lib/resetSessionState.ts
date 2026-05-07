import { unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { clearTtsCache } from "./ttsCache";
import { assertRepoPath } from "./repoPath";

async function removeIfPresent(path: string): Promise<boolean> {
  try {
    await unlink(path);
    return true;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") return false;
    throw err;
  }
}

export interface ResetSessionStateResult {
  ttsEntriesCleared: number;
  removedExplainerMdPaths: string[];
  removedExplainerYamlPaths: string[];
}

export async function resetSessionState(
  repoPath?: string,
): Promise<ResetSessionStateResult> {
  const roots = [process.cwd()];
  if (repoPath?.trim()) {
    try {
      const validatedRepo = await assertRepoPath(repoPath.trim());
      if (!roots.includes(validatedRepo)) {
        roots.push(validatedRepo);
      }
    } catch {}
  }

  const removedExplainerMdPaths: string[] = [];
  const removedExplainerYamlPaths: string[] = [];

  await Promise.all(
    roots.map(async (root) => {
      const mdPath = resolve(root, "explainer.md");
      const yamlPath = resolve(root, "explainer.yaml");
      const [removedMd, removedYaml] = await Promise.all([
        removeIfPresent(mdPath),
        removeIfPresent(yamlPath),
      ]);
      if (removedMd) removedExplainerMdPaths.push(mdPath);
      if (removedYaml) removedExplainerYamlPaths.push(yamlPath);
    }),
  );

  return {
    ttsEntriesCleared: clearTtsCache(),
    removedExplainerMdPaths,
    removedExplainerYamlPaths,
  };
}
