// Claude Sync: botão na barra de status que roda o motor sincronizar.py (repositório claude-config).
// O motor decide o que é seguro (novo de um lado, ou mudou só de um lado) e aplica com backup;
// o resto vira "pendência", resolvida aqui com Trazer / Enviar / Ignorar / Ver diferenças.
const vscode = require("vscode");
const cp = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

let item, out, timer;
let ocupado = false, ultimo = null, conv = null, convRodando = false;

const cfg = () => vscode.workspace.getConfiguration("claudeSync");
const motor = () => (cfg().get("motor") || path.join(os.homedir(), "claude-config", "scripts", "sincronizar", "sincronizar.py")).replace(/^~/, os.homedir());
const python = () => cfg().get("python") || (process.platform === "win32" ? "py" : "python3");
const hm = (d) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
const gb = (b) => (b >= 2 ** 30 ? (b / 2 ** 30).toFixed(1).replace(".", ",") + " GB" : (b / 2 ** 20).toFixed(0) + " MB");

// Histórico diário do tamanho das conversas no Drive, gravado pelo motor após cada cópia.
function drive() {
  let h;
  try { h = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".claude", "sync-drive-historico.json"), "utf8")); } catch (e) { return null; }
  const d = Object.keys(h).sort();
  if (!d.length) return null;
  const dias = Math.round((new Date(d[d.length - 1]) - new Date(d[0])) / 86400000);
  return { bytes: h[d[d.length - 1]], dias, ritmo: dias >= 1 ? (h[d[d.length - 1]] - h[d[0]]) / dias : null };
}

function rodar(args, timeoutMs = 180000) {
  return new Promise((resolve) => {
    if (!fs.existsSync(motor())) return resolve({ erro: `motor não encontrado: ${motor()} (clone o repositório claude-config ou ajuste claudeSync.motor)` });
    cp.execFile(python(), ["-I", "-X", "utf8", motor(), ...args, "--json"],
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 20 * 1024 * 1024 },
      (err, stdout, stderr) => {
        out.appendLine(`[${hm(new Date())}] ${args.join(" ")}${stderr ? "\n" + stderr.trim() : ""}`);
        const linha = (stdout || "").trim().split("\n").pop();
        try { resolve(JSON.parse(linha)); }
        catch { resolve({ erro: (stderr || (err && err.message) || "sem resposta do motor").trim().slice(-300) }); }
      });
  });
}

function render() {
  const d = ultimo;
  const n = d && d.pendencias ? d.pendencias.length : 0;
  if (ocupado) item.text = "$(sync~spin) Claude: sincronizando…";
  else if (!d) item.text = "$(sync) Claude";
  else if (d.erro) item.text = "$(warning) Claude: erro";
  else if (n) item.text = `$(sync) Claude: ${plural(n, "pendência", "pendências")}`;
  else item.text = "$(check) Claude: tudo igual";
  if (convRodando) item.text += " $(cloud-upload)";
  item.backgroundColor = d && (d.erro || n) && !ocupado ? new vscode.ThemeColor("statusBarItem.warningBackground") : undefined;
  item.command = n && !ocupado ? "claudeSync.resolver" : "claudeSync.sincronizar";

  const md = new vscode.MarkdownString("**Claude Sync**", true);
  if (d) {
    md.appendMarkdown(`\n\nEste PC: **${d.perfil || "?"}** · conferido às ${hm(d.quando)}`);
    if (d.erro) md.appendMarkdown(`\n\n⚠️ ${d.erro}`);
    if (d.aplicados && d.aplicados.length) md.appendMarkdown(`\n\nAplicado sozinho:\n${d.aplicados.map((x) => `- ${x.acao}: ${x.item}`).join("\n")}`);
    if (d.seguros && d.seguros.length) md.appendMarkdown(`\n\nPronto para aplicar (seguro): ${d.seguros.length}`);
    if (n) md.appendMarkdown(`\n\nPrecisa da sua decisão:\n${d.pendencias.map((x) => `- **${x.item}**: ${x.motivo}`).join("\n")}`);
  }
  if (conv) md.appendMarkdown(`\n\nConversas (Drive): ${conv.erro ? "⚠️ " + conv.erro
    : `enviadas às ${hm(conv.quando)}${conv.novas !== undefined ? ` · do trabalho: ${conv.novas} novas, ${conv.atualizadas} atualizadas` : ""}${conv.trabalho ? ` · ${conv.trabalho}` : ""}`}`);
  const dr = drive();
  if (dr) md.appendMarkdown(`\n\nEspaço no Drive: **${gb(dr.bytes)}**${dr.ritmo !== null
    ? ` · cresce ~${(dr.ritmo / 2 ** 20).toFixed(0)} MB/dia · em 1 ano: **~${gb(dr.bytes + dr.ritmo * 365)}** (medido em ${dr.dias} dia${dr.dias === 1 ? "" : "s"})`
    : " · projeção de 1 ano a partir de amanhã (precisa de 2 dias medidos)"}`);
  if (convRodando) md.appendMarkdown("\n\nCopiando conversas…");
  md.appendMarkdown(`\n\n${n ? "Clique para resolver." : "Clique para sincronizar agora."}`);
  item.tooltip = md;
  item.show();
}

async function sincronizar(opts = {}) {
  if (ocupado) return;
  ocupado = true; render();
  const d = await rodar([opts.soConferir ? "status" : "auto"]);
  ocupado = false;
  if (d.ocupado) { render(); return; }  // outra janela já está sincronizando
  ultimo = { ...d, quando: new Date() };
  render();
  const n = (d.pendencias || []).length;
  if (d.erro && !opts.silencioso) vscode.window.showWarningMessage(`Claude Sync: ${d.erro}`, "Ver registro").then((r) => r && out.show());
  else if (n && !opts.soConferir) {
    const msg = `Claude Sync: ${d.aplicados && d.aplicados.length ? plural(d.aplicados.length, "item aplicado", "itens aplicados") + "; " : ""}${plural(n, "pendência precisa", "pendências precisam")} da sua decisão.`;
    vscode.window.showInformationMessage(msg, "Resolver").then((r) => r && resolver());
  } else if (!opts.silencioso && !opts.soConferir) {
    vscode.window.setStatusBarMessage(`Claude Sync: ${d.aplicados && d.aplicados.length ? plural(d.aplicados.length, "item aplicado", "itens aplicados") : "tudo igual"}`, 4000);
  }
  if (!opts.soConferir && cfg().get("conversas")) conversas(true);
}

async function conversas(silencioso) {
  if (convRodando) return;
  convRodando = true; render();
  const r = await rodar(["conversas"], 3600000);
  convRodando = false;
  if (!r.ocupado) conv = { ...r, quando: new Date() };
  render();
  if (r.erro && !silencioso) vscode.window.showWarningMessage(`Claude Sync (conversas): ${r.erro}`);
  else if (!silencioso && !r.ocupado) vscode.window.setStatusBarMessage("Claude Sync: conversas copiadas", 4000);
}

async function diferencas(p) {
  if (p.aqui && p.nuvem) {
    await vscode.commands.executeCommand("vscode.diff", vscode.Uri.file(p.aqui), vscode.Uri.file(p.nuvem), `${p.item}: este PC ↔ nuvem`);
  } else {
    await vscode.window.showTextDocument(vscode.Uri.file(p.aqui || p.nuvem), { preview: true });
  }
}

async function resolver() {
  const pend = (ultimo && ultimo.pendencias) || [];
  if (!pend.length) { vscode.window.showInformationMessage("Claude Sync: nenhuma pendência."); return; }
  const p = pend.length === 1 ? pend[0] : (await vscode.window.showQuickPick(
    pend.map((x) => ({ label: x.item, description: x.situacao, detail: x.motivo, p: x })),
    { placeHolder: "Qual pendência resolver?" }) || {}).p;
  if (!p) return;

  const rec = (a) => (p.sugestao === a ? " (recomendado)" : "");
  const ops = p.item === "CLAUDE.md"
    ? [{ label: "$(git-merge) Mesclar agora (usa as suas regras)", detail: "Mostra só o que as regras ainda não cobrem; o que você decidir fica lembrado. Faz backup e dá para desfazer.", a: "mesclar" },
       { label: "$(diff) Ver diferenças", a: "diff" },
       { label: "$(comment-discussion) Mesclar com o Claude", detail: "Abre o Claude Code com /sincronizar já escrito (para casos que as regras não resolvem).", a: "claude" },
       { label: "$(discard) Desfazer última mesclagem", detail: "Volta o CLAUDE.md ao que era antes (usa o backup).", a: "desfazer" },
       { label: "$(eye-closed) Ignorar esta versão da nuvem", a: "ignorar" }]
    : [p.aqui && { label: `$(cloud-upload) Enviar: este PC → nuvem${rec("enviar")}`, a: "enviar" },
       p.nuvem && { label: `$(cloud-download) Trazer: nuvem → este PC${rec("trazer")}`, a: "trazer" },
       { label: `$(eye-closed) Ignorar neste PC${rec("ignorar")}`, detail: "Nunca mais pergunta deste item aqui.", a: "ignorar" },
       { label: "$(diff) Ver diferenças", a: "diff" }].filter(Boolean);
  ops.push({ label: "$(refresh) Atualizar agora", detail: "Confere de novo se ainda há pendências.", a: "atualizar" }, { label: "$(clock) Depois", a: "" });
  const e = await vscode.window.showQuickPick(ops, { placeHolder: `${p.item}: ${p.motivo}` });
  if (!e || !e.a) return;
  if (e.a === "diff") { await diferencas(p); return resolver(); }
  if (e.a === "mesclar") return mesclarAgora();
  if (e.a === "desfazer") return desfazerMescla();
  if (e.a === "atualizar") return atualizar();
  if (e.a === "claude") {
    await vscode.env.clipboard.writeText("/sincronizar");  // reserva: se o painel não preencher, é só colar
    const ok = await vscode.env.openExternal(vscode.Uri.parse("vscode://anthropic.claude-code/open?prompt=" + encodeURIComponent("/sincronizar")));
    vscode.window.showInformationMessage(ok
      ? "Claude Code aberto com /sincronizar. Aperte Enter; ele mostra as linhas e só grava com a sua aprovação."
      : "Copiado: /sincronizar. Cole no Claude Code; ele mostra as linhas e só grava com a sua aprovação.");
    return;
  }
  ocupado = true; render();
  const r = await rodar([e.a, p.item]);
  ocupado = false;
  if (r.erro) vscode.window.showWarningMessage(`Claude Sync: ${r.erro}`);
  await sincronizar({ soConferir: true, silencioso: true });
  if (ultimo && ultimo.pendencias && ultimo.pendencias.length) resolver();
  else vscode.window.setStatusBarMessage("Claude Sync: tudo igual", 4000);
}

const curto = (t, n = 170) => (t.length > n ? t.slice(0, n - 1) + "…" : t).replace(/\s*\n\s*/g, " ⏎ ");

// Mescla o CLAUDE.md pelas regras (~/.claude/sync-regras.json): o motor só pergunta o que as regras e as decisões
// já lembradas não cobrem. Marcado = trazer; sem marca = "não" (e nunca mais pergunta esse item).
async function mesclarAgora() {
  ocupado = true; render();
  const pl = await rodar(["mesclar-plano"]);
  ocupado = false; render();
  if (pl.erro) { vscode.window.showWarningMessage(`Claude Sync: ${pl.erro}`); return; }
  const resp = {};
  if (pl.perguntas.length) {
    const rotulo = (q) => q.tipo === "secao" ? `$(add) Seção nova: ${q.secao}`
      : q.tipo === "variante" ? `$(replace-all) Versão diferente em «${q.secao}»` : `$(add) Item novo em «${q.secao}»`;
    const itens = pl.perguntas.map((q) => ({ label: rotulo(q), detail: curto(q.texto) + (q.trocar ? `   ← troca o daqui: ${curto(q.trocar, 90)}` : ""), picked: true, q }));
    const marcados = await vscode.window.showQuickPick(itens, {
      canPickMany: true, matchOnDetail: true,
      title: `CLAUDE.md: ${plural(pl.perguntas.length, "item novo", "itens novos")} da nuvem (${pl.automaticos.nunca} barrados pelas regras, ${pl.automaticos.lembradas} já decididos antes)`,
      placeHolder: "Marque o que TRAZER para este PC. O que ficar sem marca vira “não” e não será perguntado de novo.",
    });
    if (!marcados) return;
    const sim = new Set(marcados.map((m) => m.q.id));
    for (const q of pl.perguntas) resp[q.id] = sim.has(q.id) ? "trazer" : "nao";
  }
  ocupado = true; render();
  const r = await rodar(["mesclar-aplicar", JSON.stringify(resp)]);
  ocupado = false;
  await sincronizar({ soConferir: true, silencioso: true });
  if (r.erro) { vscode.window.showWarningMessage(`Claude Sync: ${r.erro}`); return; }
  const op = await vscode.window.showInformationMessage(
    `CLAUDE.md mesclado: ${plural(r.trazidos, "item trazido", "itens trazidos")}. Backup feito.`, "Desfazer", "Abrir CLAUDE.md");
  if (op === "Desfazer") await desfazerMescla();
  else if (op) await vscode.window.showTextDocument(vscode.Uri.file(path.join(os.homedir(), ".claude", "CLAUDE.md")));
}

async function desfazerMescla() {
  const r = await rodar(["desfazer-mescla"]);
  await sincronizar({ soConferir: true, silencioso: true });
  if (r.erro) vscode.window.showWarningMessage(`Claude Sync: ${r.erro}`);
  else vscode.window.showInformationMessage("Mesclagem desfeita: CLAUDE.md voltou ao que era antes.");
}

async function atualizar() {
  await sincronizar({ soConferir: true, silencioso: true });
  const n = ultimo && ultimo.pendencias ? ultimo.pendencias.length : 0;
  vscode.window.setStatusBarMessage(n ? `Claude Sync: ${plural(n, "pendência", "pendências")}` : "Claude Sync: tudo igual", 4000);
}

// A barra se atualiza quando o CLAUDE.md ou a lista de ignorados mudam (por você, pelo Claude ou pelo motor).
// Não vigia sync-estado.json: o próprio "status" grava nele e causaria laço.
function vigiar() {
  let t, w;
  try {
    w = fs.watch(path.join(os.homedir(), ".claude"), (_, nome) => {
      if (nome !== "CLAUDE.md" && nome !== "sync-ignorar.txt") return;
      clearTimeout(t);
      t = setTimeout(() => { if (!ocupado) sincronizar({ soConferir: true, silencioso: true }); }, 1500);
    });
  } catch (e) { out.appendLine("vigia desligada: " + e.message); }
  return { dispose: () => { clearTimeout(t); if (w) w.close(); } };
}

async function perfil() {
  const f = path.join(os.homedir(), ".claude", "sync-config.json");
  let c = {};
  try { c = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { /* ainda não existe */ }
  const r = await vscode.window.showQuickPick([
    { label: "casa", detail: "Recebe as conversas do trabalho; aceita todas as memórias." },
    { label: "trabalho", detail: "Nunca recebe conversas de casa; memória pessoal só entra com sua decisão." },
  ], { placeHolder: `Este computador é: (agora: ${c.perfil || "padrão do sistema"})` });
  if (!r) return;
  c.perfil = r.label;
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(c, null, 1));
  sincronizar({ soConferir: true });
}

function agendar() {
  clearInterval(timer);
  const m = cfg().get("intervaloMin");
  if (m > 0) timer = setInterval(() => sincronizar({ soConferir: true, silencioso: true }), m * 60000);
}

function activate(context) {
  out = vscode.window.createOutputChannel("Claude Sync");
  item = vscode.window.createStatusBarItem("claudeSync.status", vscode.StatusBarAlignment.Left, 990);
  item.name = "Claude Sync";
  render();
  context.subscriptions.push(item, out,
    vscode.commands.registerCommand("claudeSync.sincronizar", () => sincronizar()),
    vscode.commands.registerCommand("claudeSync.resolver", resolver),
    vscode.commands.registerCommand("claudeSync.conversasAgora", () => conversas(false)),
    vscode.commands.registerCommand("claudeSync.perfil", perfil),
    vscode.commands.registerCommand("claudeSync.log", () => out.show()),
    vscode.commands.registerCommand("claudeSync.atualizar", atualizar),
    vscode.commands.registerCommand("claudeSync.mesclar", mesclarAgora),
    vscode.commands.registerCommand("claudeSync.desfazerMescla", desfazerMescla),
    vigiar(),
    vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration("claudeSync.intervaloMin")) agendar(); }),
    { dispose: () => clearInterval(timer) });
  agendar();
  sincronizar(cfg().get("aoAbrir") ? { silencioso: true } : { soConferir: true, silencioso: true });
}

// Ao fechar: o VS Code não espera tarefas longas, então o motor roda solto (desanexado) e termina sozinho.
function deactivate() {
  if (!cfg().get("aoFechar") || !fs.existsSync(motor())) return;
  const solto = (args) => cp.spawn(python(), ["-I", "-X", "utf8", motor(), ...args], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  solto(["auto"]);
  if (cfg().get("conversas")) solto(["conversas"]);
}

module.exports = { activate, deactivate };
