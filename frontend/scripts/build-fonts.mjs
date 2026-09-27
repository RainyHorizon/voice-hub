// 把 fonts-src/ 下的 HarmonyOS Sans SC 切成带 unicode-range 的 woff2 分片，
// 输出到 src/assets/fonts/harmonyos-sans/，浏览器只下载页面实际用到的字符分片。
// 字体源文件需自行从华为开发者网站下载并接受许可协议，不提交到 Git。
// 支持两种字体包：新版单文件可变字体 HarmonyOS_Sans_SC.ttf，或旧版 Regular/Medium/Bold 三个静态字重。
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(root, "fonts-src");
const outputDir = path.join(root, "src", "assets", "fonts", "harmonyos-sans");
const family = "HarmonyOS Sans SC";
const staticWeights = [
  { weight: "400", label: "Regular", pattern: /regular/i },
  { weight: "500", label: "Medium", pattern: /medium/i },
  { weight: "700", label: "Bold", pattern: /bold/i },
];

function fail(message) {
  console.error(`\n[fonts:build] ${message}\n`);
  process.exit(1);
}

function isVariableFont(buffer) {
  const tables = buffer.readUInt16BE(4);
  for (let i = 0; i < tables; i += 1) {
    if (buffer.toString("latin1", 12 + i * 16, 16 + i * 16) === "fvar") return true;
  }
  return false;
}

// 只接受简体中文字体：排除繁体（TC）、阿拉伯文、窄体和斜体等变体。
const candidates = existsSync(sourceDir)
  ? (await readdir(sourceDir)).filter(
      (name) =>
        /\.(ttf|otf)$/i.test(name) &&
        /harmony/i.test(name) &&
        /(^|[_\s-])sc([_\s.-]|$)/i.test(name) &&
        !/condensed|italic|arabic|naskh/i.test(name),
    )
  : [];

const jobs = [];
for (const name of candidates) {
  const buffer = await readFile(path.join(sourceDir, name));
  if (isVariableFont(buffer)) {
    jobs.splice(0, jobs.length, { file: name, buffer, weight: "100 900", dir: "variable" });
    break;
  }
}
if (!jobs.length) {
  for (const item of staticWeights) {
    // Bold 不能误匹配 SemiBold、ExtraBold 等其他字重。
    const file = candidates.find((name) => item.pattern.test(name) && !/semi|extra|black|light|thin/i.test(name));
    if (file) jobs.push({ file, buffer: await readFile(path.join(sourceDir, file)), weight: item.weight, dir: item.weight });
  }
  const missing = staticWeights.filter((item) => !jobs.some((job) => job.weight === item.weight));
  if (missing.length) {
    fail(
      `在 ${sourceDir} 中没有找到可用的 HarmonyOS Sans SC 字体。\n` +
        "请从华为开发者网站下载 HarmonyOS Sans，阅读并接受许可协议后，把以下任一种放入该目录：\n" +
        "  · 新版字体包：HarmonyOS_Sans_SC.ttf（单文件可变字体，推荐）\n" +
        "  · 旧版字体包：HarmonyOS_Sans_SC_Regular.ttf、HarmonyOS_Sans_SC_Medium.ttf、HarmonyOS_Sans_SC_Bold.ttf\n" +
        (jobs.length ? `当前只找到静态字重，缺少：${missing.map((item) => item.label).join("、")}。` : ""),
    );
  }
}

let fontSplit;
try {
  ({ fontSplit } = await import("cn-font-split"));
} catch (error) {
  fail(
    `无法加载 cn-font-split 原生库：${error instanceof Error ? error.message : error}\n` +
      "npm 安装时 postinstall 会下载原生库，网络受限时可能失败。可以手动执行：\n" +
      "  npx cn-font-split i default\n" +
      "或从 GitHub Release 下载对应平台的库文件，并用环境变量 CN_FONT_SPLIT_BIN 指向它。",
  );
}

await rm(outputDir, { recursive: true, force: true });
const faces = [];
for (const job of jobs) {
  const outDir = path.join(outputDir, job.dir);
  await mkdir(outDir, { recursive: true });
  const started = Date.now();
  await fontSplit({
    input: new Uint8Array(job.buffer),
    outDir,
    css: { fontFamily: family, fontWeight: job.weight, fontStyle: "normal", fontDisplay: "swap", localFamily: [], commentUnicodes: false },
    renameOutputFont: "[hash:10].[ext]",
    testHtml: false,
    reporter: false,
    silent: true,
  });
  const css = await readFile(path.join(outDir, "result.css"), "utf8");
  faces.push(
    css
      // 去掉头部注释（含字体名称表文本），并移除 local()：按家族名匹配本机字体可能把所有字重都映射成同一个。
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/src:\s*local\([^)]*\)\s*,/g, "src:")
      .replace(/url\(\s*["']?\.\/([^"')]+)["']?\s*\)/g, `url("./${job.dir}/$1")`)
      .trim(),
  );
  await rm(path.join(outDir, "result.css"), { force: true });
  await rm(path.join(outDir, "index.proto"), { force: true });
  const chunks = (await readdir(outDir)).filter((name) => name.endsWith(".woff2")).length;
  const kind = job.dir === "variable" ? "可变字重 100–900" : `字重 ${job.weight}`;
  console.log(`[fonts:build] ${job.file}（${kind}）→ ${job.dir}/，${chunks} 个分片，${Date.now() - started} ms`);
}

await writeFile(
  path.join(outputDir, "index.css"),
  `/* 由 npm run fonts:build 生成，请勿手工编辑。${family} 许可见 THIRD_PARTY_NOTICES.md。 */\n${faces.join("\n")}\n`,
);
console.log(`[fonts:build] 已写入 ${path.relative(root, path.join(outputDir, "index.css"))}`);
// cn-font-split 的原生库在 Windows 上会在进程自然退出时段错误（退出码 139），输出已完整写入，这里直接退出。
process.exit(0);
