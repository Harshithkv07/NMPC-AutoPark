// Builds the three presenter study guides from src/*.html into self-contained HTML (maths pre-rendered with KaTeX,
// fonts, CSS and figures inlined, so a single file works offline) and prints each to PDF with headless Edge.
//   python guide_figs.py   (figures, once)
//   node build_guides.js   (all guides)   |   node build_guides.js a   (one guide)
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const katex = require("katex");

const SRC = path.join(__dirname, "src");
const GUIDES = {
  a: ["a_modelling.html", "Person_A_Modelling_Guide"],
  b: ["b_kinematics.html", "Person_B_Kinematics_Guide"],
  c: ["c_planning_control.html", "Person_C_HybridAstar_NMPC_Guide"],
};
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

function katexCss() {
  const dist = path.dirname(require.resolve("katex/dist/katex.min.css"));
  let css = fs.readFileSync(path.join(dist, "katex.min.css"), "utf8");
  // keep only the woff2 source of each font, inlined
  return css.replace(/src:url\(fonts\/([^)]+?\.woff2)\) format\("woff2"\)[^;}]*/g, (_, f) =>
    `src:url(data:font/woff2;base64,${fs.readFileSync(path.join(dist, "fonts", f)).toString("base64")}) format("woff2")`);
}

function renderMath(html, file) {
  const keep = [];
  const put = (s) => `\u0000${keep.push(s) - 1}\u0000`;
  const tex = (src, display) => {
    try {
      return katex.renderToString(src, { displayMode: display, throwOnError: true, strict: "ignore", output: "html" });
    } catch (e) {
      throw new Error(`${file}: bad maths ${JSON.stringify(src)}: ${e.message}`);
    }
  };
  html = html.replace(/\$\$([\s\S]+?)\$\$/g, (_, m) => put(tex(m.trim(), true)));
  html = html.replace(/\$([^$\n]+?)\$/g, (_, m) => put(tex(m, false)));
  return html.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[+i]);
}

function build(key) {
  const [srcName, outName] = GUIDES[key];
  let body = fs.readFileSync(path.join(SRC, srcName), "utf8");
  const title = (body.match(/<!-- title: (.+?) -->/) || [, outName])[1];
  body = body.replace(/<!-- include (\S+) -->/g, (_, f) => fs.readFileSync(path.join(SRC, f), "utf8"));
  body = renderMath(body, srcName);
  body = body.replace(/src="(fig\/[^"]+\.png)"/g, (_, f) =>
    `src="data:image/png;base64,${fs.readFileSync(path.join(__dirname, f)).toString("base64")}"`);
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${katexCss()}</style>
<style>${fs.readFileSync(path.join(SRC, "style.css"), "utf8")}</style>
</head><body>
${body}
</body></html>`;
  const outHtml = path.join(__dirname, outName + ".html");
  const outPdf = path.join(__dirname, outName + ".pdf");
  fs.writeFileSync(outHtml, html);
  execFileSync(EDGE, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--virtual-time-budget=5000",
    `--print-to-pdf=${outPdf}`, "file:///" + outHtml.replace(/\\/g, "/")], { stdio: "ignore", timeout: 120000 });
  console.log("wrote", outName + ".html", "and .pdf", `(${(fs.statSync(outPdf).size / 1024).toFixed(0)} KB pdf)`);
}

const which = process.argv.slice(2);
for (const k of which.length ? which : Object.keys(GUIDES)) {
  if (fs.existsSync(path.join(SRC, GUIDES[k][0]))) build(k);
  else console.log("skip", k, "(no source yet)");
}
