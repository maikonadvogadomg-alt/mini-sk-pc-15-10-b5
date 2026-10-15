// Conta para o Mini SK que ele está no PC (terminal e ponte já ligados pelo programa).
const { contextBridge } = require('electron');
const arg = (n) => { const a = process.argv.find((x) => x.startsWith('--' + n + '=')); return a ? a.slice(n.length + 3) : ''; };
contextBridge.exposeInMainWorld('miniskPC', { codigo: arg('minisk-codigo'), pasta: arg('minisk-pasta'), so: process.platform });
