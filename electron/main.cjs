/* Mini SK para PC — abre o Mini SK numa janela própria e liga, por dentro:
   - o 💻 Terminal do computador (cmd do Windows), no lugar do Termux;
   - a ⇅ ponte de arquivos (Mandar / Trazer) numa pasta de verdade:
     Documentos\Mini-SK\NOME-DO-PROJETO
   - e libera o Ollama (IA grátis no seu PC) sem configurar nada. */
const { app, BrowserWindow, shell, session, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');
const crypto = require('crypto');

const SO_TESTAR = process.env.TESTE_SAIR === '1';
if (!SO_TESTAR && !app.requestSingleInstanceLock()) { app.quit(); return; }

const CASA = process.env.DADOS_EM || path.join(app.getPath('documents'), 'Mini-SK');
fs.mkdirSync(CASA, { recursive: true });
const REGISTRO = path.join(CASA, 'registro.txt');
const log = (...a) => { try { fs.appendFileSync(REGISTRO, new Date().toLocaleString('pt-BR') + ' ' + a.map((x) => (x instanceof Error ? x.stack : String(x))).join(' ') + '\n'); } catch {} console.log(...a); };
process.on('uncaughtException', (e) => log('ERRO:', e));

const APP = path.join(__dirname, '..', 'app');
const CODIGO = crypto.randomBytes(16).toString('hex');
const PORTA_APP = 7680, PORTA_TERMINAL = 7681, PORTA_PONTE = 7682;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.md': 'text/markdown; charset=utf-8', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8' };

function portaOcupada(p) { return new Promise((ok) => { const s = net.createServer(); s.once('error', () => ok(true)); s.listen(p, '127.0.0.1', () => s.close(() => ok(false))); }); }

function servirApp() {
  return new Promise((ok) => {
    const srv = http.createServer((req, res) => {
      let u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (u === '/' || u === '') u = '/index.html';
      const f = path.join(APP, path.normalize(u).replace(/^([/\\])+/, ''));
      if (!f.startsWith(APP) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('não existe'); }
      const h = { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' };
      res.writeHead(200, h); fs.createReadStream(f).pipe(res);
    });
    // porta FIXA: os projetos ficam guardados "por endereço"; se a porta mudasse, eles sumiriam
    srv.once('error', (e) => { log('ERRO ao abrir a porta ' + PORTA_APP + ':', e); dialog.showErrorBox('Mini SK', 'A porta ' + PORTA_APP + ' está ocupada por outro programa. Feche-o e abra o Mini SK de novo.'); app.exit(1); });
    srv.listen(PORTA_APP, '127.0.0.1', () => ok(PORTA_APP));
  });
}

async function ligarTudo() {
  const porta = await servirApp();
  const origem = 'http://127.0.0.1:' + porta;
  log('Mini SK em ' + origem + ' · pasta ' + CASA);
  if (await portaOcupada(PORTA_PONTE)) log('⚠ A porta ' + PORTA_PONTE + ' (ponte) está ocupada — outro Mini SK aberto?');
  else { process.env.PONTE_CODIGO = CODIGO; process.env.PONTE_PORTA = String(PORTA_PONTE); process.env.PONTE_BASE = CASA; require('./ponte.cjs'); }
  if (await portaOcupada(PORTA_TERMINAL)) log('⚠ A porta ' + PORTA_TERMINAL + ' (terminal) está ocupada — feche o outro programa que usa ela.');
  else require('./terminal.cjs')({ porta: PORTA_TERMINAL, base: CASA, origem });
  return origem;
}

function pedir(url, headers) { return new Promise((ok) => { const q = http.get(url, { headers }, (r) => { r.resume(); ok(r.statusCode); }); q.on('error', () => ok(0)); q.setTimeout(4000, () => q.destroy()); }); }

let janela = null;
app.whenReady().then(async () => {
  const origem = await ligarTudo();
  if (SO_TESTAR) {
    await new Promise((r) => setTimeout(r, 800));
    const a = await pedir(origem + '/index.html');
    const b = await pedir('http://127.0.0.1:' + PORTA_PONTE + '/ping', { 'X-Codigo': CODIGO });
    log('TESTE: tela=' + a + ' ponte=' + b);
    app.exit(a === 200 && b === 200 ? 0 : 1);
    return;
  }
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(['media', 'clipboard-read', 'clipboard-sanitized-write', 'notifications', 'fullscreen'].includes(perm)));
  janela = new BrowserWindow({
    width: 1360, height: 900, title: 'Mini SK', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, spellcheck: true, additionalArguments: ['--minisk-codigo=' + CODIGO, '--minisk-pasta=' + CASA] },
  });
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(origem) || url.startsWith('blob:') || url === 'about:blank') return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true } };
    shell.openExternal(url); return { action: 'deny' };
  });
  janela.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(origem)) { e.preventDefault(); shell.openExternal(url); } });
  janela.loadURL(origem + '/index.html');
});
app.on('second-instance', () => { if (janela) { if (janela.isMinimized()) janela.restore(); janela.focus(); } });
app.on('window-all-closed', () => app.quit());
