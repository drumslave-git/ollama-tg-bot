import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..");
const typecheckDir = join(repoRoot, ".typecheck");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function resolveTsconfig(path, seen = new Set()) {
  const normalized = path.replace(/\\/g, "/");
  if (seen.has(normalized)) {
    throw new Error(`Circular tsconfig extends: ${path}`);
  }
  seen.add(normalized);

  const cfg = readJson(path);
  const dir = dirname(path);
  if (!cfg.extends) {
    return {
      compilerOptions: { ...(cfg.compilerOptions ?? {}) },
      include: cfg.include,
    };
  }

  const parentPath = join(dir, cfg.extends);
  const parent = resolveTsconfig(parentPath, seen);
  return {
    compilerOptions: {
      ...parent.compilerOptions,
      ...(cfg.compilerOptions ?? {}),
    },
    include: cfg.include ?? parent.include,
  };
}

function defaultInclude(packageDir) {
  const include = ["src"];
  if (existsSync(join(packageDir, "test"))) {
    include.push("test");
  }
  return include;
}

function resolveInclude(packageDir, resolvedInclude) {
  const include = [...(resolvedInclude ?? defaultInclude(packageDir))];
  if (existsSync(join(packageDir, "test")) && !include.includes("test")) {
    include.push("test");
  }
  return include;
}

export function typecheckPackage(packageDir) {
  const appConfig = join(packageDir, "tsconfig.app.json");
  if (existsSync(appConfig)) {
    return runTsc(packageDir, appConfig);
  }

  const baseConfig = join(packageDir, "tsconfig.json");
  if (!existsSync(baseConfig)) {
    console.error(`No tsconfig found in ${relative(repoRoot, packageDir)}`);
    return 1;
  }

  const resolved = resolveTsconfig(baseConfig);
  const compilerOptions = {
    ...resolved.compilerOptions,
    noEmit: true,
    declaration: false,
  };
  delete compilerOptions.rootDir;
  delete compilerOptions.outDir;

  mkdirSync(typecheckDir, { recursive: true });
  const slug = relative(repoRoot, packageDir).replace(/[\\/]/g, "__");
  const generatedConfig = join(typecheckDir, `${slug}.json`);
  const packageRelative = relative(typecheckDir, packageDir).replace(/\\/g, "/");
  const include = resolveInclude(packageDir, resolved.include).map(
    (entry) => `${packageRelative}/${entry}`,
  );
  writeFileSync(
    generatedConfig,
    `${JSON.stringify(
      {
        compilerOptions: {
          ...compilerOptions,
          baseUrl: packageRelative,
        },
        include,
      },
      null,
      2,
    )}\n`,
  );

  return runTsc(packageDir, generatedConfig);
}

function runTsc(packageDir, configPath) {
  const tsc = join(repoRoot, "node_modules/typescript/bin/tsc");
  const result = spawnSync(process.execPath, [tsc, "-p", configPath], {
    cwd: packageDir,
    stdio: "inherit",
    env: process.env,
  });
  return result.status ?? 1;
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isMainModule()) {
  process.exit(typecheckPackage(process.cwd()));
}
