// App do vendedor — Lazinho
import {
  auth, db, signInWithEmailAndPassword, signOut, onAuthStateChanged, doc, getDoc, setDoc, updateDoc, collection, query, where, onSnapshot,
  serverTimestamp, emailVendedor, senhaVendedor, usuarioDeNome, $, $$, h, semAcento, porNome, ymd, mesDe, dataBR, dataHoraBR, brl, r2, mesNome,
  docFmt, toast, abreModal, fechaModal, confirma, erroMsg, pegaGPS, reduzFoto, avisoRede, statusInfo, VERSAO, lsGet, lsSet
} from './fb.js';

avisoRede();
$('#versao').textContent = 'Lazinho Vendas ' + VERSAO;

// ---------- estado ----------
let me = null;                 // { uid, vendedorId, nome }
let clientes = [], produtos = [], condicoes = [], resumo = {}, pedidos = [], visitas = [];
let unsubs = [];
let tab = 'pedidos';
let fPed = { mes: ymd().slice(0, 7), st: 'todos' };
let fCli = { q: '', f: 'todos' };
let fVis = { mes: ymd().slice(0, 7) };
let np = novoVazio();          // pedido em digitação
let vs = null;                 // visita em digitação

function novoVazio(cli) { return { clienteDoc: cli || '', itens: [{ key: '', qtd: '', preco: '' }], condicaoId: '', obs: '', dataEntrega: '', data: ymd() }; }

// ---------- login ----------
$('#f-login').addEventListener('submit', async e => {
  e.preventDefault();
  const usuario = usuarioDeNome($('#lg-usuario').value), cod = $('#lg-senha').value;
  const msg = $('#lg-msg'); msg.textContent = '';
  if (!usuario) { msg.textContent = 'Digite seu nome de usuário.'; return; }
  if (!cod) { msg.textContent = 'Digite a senha.'; return; }
  $('#lg-btn').disabled = true; $('#lg-btn').textContent = 'Entrando…';
  try { await signInWithEmailAndPassword(auth, emailVendedor(usuario), senhaVendedor(cod)); lsSet('lz-usuario', usuario); }
  catch (err) { msg.textContent = erroMsg(err); $('#lg-senha').value = ''; $('#lg-senha').focus(); }
  $('#lg-btn').disabled = false; $('#lg-btn').textContent = 'Entrar';
});
$('#sair').onclick = async () => { if (await confirma('Sair do app?', 'Sair')) await signOut(auth); };
$('#sem-sair').onclick = () => signOut(auth);
$('#lg-usuario').value = lsGet('lz-usuario') || '';

function mostra(id) {
  ['carregando', 'v-login', 'v-sem', 't-pedidos', 't-novo', 't-clientes', 't-visita'].forEach(x => $('#' + x).hidden = x !== id);
}
function paraLogin() {
  unsubs.forEach(u => { try { u(); } catch (e) {} }); unsubs = []; me = null;
  $('#tabbar').hidden = true; $('#sair').hidden = true; $('#quem').innerHTML = ''; mostra('v-login');
}

onAuthStateChanged(auth, async user => {
  if (!user) { paraLogin(); return; }
  try {
    const u = await getDoc(doc(db, 'usuarios', user.uid));
    if (!u.exists() || !u.data().vendedorId) { mostra('v-sem'); $('#quem').innerHTML = ''; return; }
    me = { uid: user.uid, vendedorId: u.data().vendedorId, nome: u.data().nome || '' };
  } catch (e) { mostra('v-sem'); return; }
  $('#quem').innerHTML = `<b>${h(me.nome.split(' ')[0])}</b>Vendedor`; $('#sair').hidden = false; $('#tabbar').hidden = false;
  assina(); vaiTab(tab);
});

function assina() {
  unsubs.forEach(u => { try { u(); } catch (e) {} }); unsubs = [];
  const onErr = n => e => toast('Erro ao carregar ' + n + ': ' + erroMsg(e));
  const watch = (nome, q, fn) => unsubs.push(onSnapshot(q, { includeMetadataChanges: true }, s => { fn(s); }, onErr(nome)));
  watch('clientes', collection(db, 'clientes'), s => { clientes = s.docs.map(d => ({ ...d.data(), doc: d.id })).sort(porNome); refresh('clientes'); });
  watch('produtos', collection(db, 'produtos'), s => { produtos = s.docs.map(d => ({ ...d.data(), id: d.id })).filter(p => p.ativo !== false); refresh('novo'); });
  watch('condições', collection(db, 'condicoes'), s => { condicoes = s.docs.map(d => ({ ...d.data(), id: d.id })).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR', { numeric: true })); refresh('novo'); });
  watch('resumo', collection(db, 'resumo'), s => { resumo = {}; s.docs.forEach(d => resumo[d.id] = d.data()); refresh('clientes'); });
  watch('pedidos', query(collection(db, 'pedidos'), where('vendedorId', '==', me.vendedorId)), s => {
    pedidos = s.docs.map(d => ({ ...d.data(), id: d.id, _pend: d.metadata.hasPendingWrites })).sort((a, b) => (b.criadoMs || 0) - (a.criadoMs || 0)); refresh('pedidos');
  });
  watch('visitas', query(collection(db, 'visitas'), where('vendedorId', '==', me.vendedorId)), s => {
    visitas = s.docs.map(d => ({ ...d.data(), id: d.id, _pend: d.metadata.hasPendingWrites })).sort((a, b) => (b.criadoMs || 0) - (a.criadoMs || 0)); refresh('visita');
  });
}
function refresh(t) {
  if (!me || t !== tab) return;
  if (t === 'novo') renderNovoSePreciso(); else render();
}

// ---------- abas ----------
$$('#tabbar button').forEach(b => b.onclick = () => { fechaSheet(); vaiTab(b.dataset.tab); });
function vaiTab(t) {
  tab = t;
  $$('#tabbar button').forEach(b => b.setAttribute('aria-current', b.dataset.tab === t ? 'true' : 'false'));
  mostra('t-' + t); render(); window.scrollTo(0, 0);
}
function render() { ({ pedidos: renderPedidos, novo: renderNovo, clientes: renderClientes, visita: renderVisitas })[tab](); }

// ---------- utilidades ----------
const nomeCli = d => { const c = clientes.find(x => x.doc === d); return c ? (c.fantasia || c.nome) : d; };
const cliPor = d => clientes.find(x => x.doc === d);
function opcoesProduto() {
  const o = [];
  produtos.forEach(p => (p.unidades || []).forEach(u => o.push({ key: p.id + '|' + u.un, prodId: p.id, codigo: p.codigo || '', nome: p.nome, un: u.un, preco: +u.preco || 0 })));
  return o.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || a.un.localeCompare(b.un));
}
const opPorKey = k => opcoesProduto().find(o => o.key === k);
const pill = s => { const i = statusInfo(s); return `<span class="pill ${i.c}">${h(i.t)}</span>`; };

// ---------- PEDIDOS ----------
const EM_ANDAMENTO = ['novo', 'recebido', 'faturado'];
function renderPedidos() {
  const meses = [...new Set([ymd().slice(0, 7), ...pedidos.map(p => mesDe(p.data))])].sort().reverse();
  if (!meses.includes(fPed.mes)) fPed.mes = meses[0];
  const doMes = pedidos.filter(p => mesDe(p.data) === fPed.mes);
  const lista = doMes.filter(p => fPed.st === 'todos' ? true : fPed.st === 'andamento' ? EM_ANDAMENTO.includes(p.status) : p.status === fPed.st);
  const validos = doMes.filter(p => p.status !== 'cancelado');
  const total = validos.reduce((a, p) => a + (+p.total || 0), 0);
  $('#t-pedidos').innerHTML = `
    <div class="spread"><h2>Meus pedidos</h2><button class="btn primary sm" id="p-novo">+ Novo pedido</button></div>
    <label class="field"><span>Mês</span><select id="p-mes">${meses.map(m => `<option value="${m}" ${m === fPed.mes ? 'selected' : ''}>${h(mesNome(m))}</option>`).join('')}</select></label>
    <div class="kpis">
      <div class="kpi"><b>${validos.length}</b><span>pedidos</span></div>
      <div class="kpi"><b>${brl(total)}</b><span>vendido</span></div>
      <div class="kpi"><b>${doMes.filter(p => p.status === 'entregue').length}</b><span>entregues</span></div>
    </div>
    <div class="chips">${[['todos', 'Todos'], ['andamento', 'Em andamento'], ['entregue', 'Entregues'], ['cancelado', 'Cancelados']].map(([k, t]) => `<button class="chip" data-st="${k}" aria-pressed="${fPed.st === k}">${t}</button>`).join('')}</div>
    <div class="list">${lista.length ? lista.map(p => `
      <button class="item" data-ped="${h(p.id)}">
        <div class="t"><b>${h(p.clienteNome)}</b><span>${dataBR(p.data)} · ${(p.itens || []).map(i => i.qtd + ' ' + h(i.un)).join(' + ')}${p.entregueEm ? ' · entregue ' + dataBR(p.entregueEm) : ''}</span></div>
        <div class="r"><b>${brl(p.total)}</b>${pill(p.status)}${p._pend ? '<br><span class="tag y">aguardando sinal</span>' : ''}</div>
      </button>`).join('') : `<div class="empty"><b>Nenhum pedido aqui</b>Toque em “+ Novo pedido” para digitar o primeiro.</div>`}</div>`;
  $('#p-novo').onclick = () => { np = novoVazio(); vaiTab('novo'); };
  $('#p-mes').onchange = e => { fPed.mes = e.target.value; renderPedidos(); };
  $$('#t-pedidos [data-st]').forEach(b => b.onclick = () => { fPed.st = b.dataset.st; renderPedidos(); });
  $$('#t-pedidos [data-ped]').forEach(b => b.onclick = () => abrePedido(b.dataset.ped));
}

function abrePedido(id) {
  const p = pedidos.find(x => x.id === id); if (!p) return;
  const passos = [
    { on: true, t: 'Enviado em ' + dataHoraBR(p.criadoMs) },
    { on: ['recebido', 'faturado', 'entregue'].includes(p.status), t: p.numeroPortal ? 'Recebido pela Lazinho (pedido nº ' + p.numeroPortal + ')' : 'Recebido pela Lazinho' },
    { on: ['faturado', 'entregue'].includes(p.status), t: p.nfNumero ? 'Faturado — NF ' + p.nfNumero : 'Faturado' },
    { on: p.status === 'entregue', t: p.entregueEm ? 'Entregue em ' + dataBR(p.entregueEm) : 'Entregue' }
  ];
  const canc = p.status === 'cancelado';
  sheet(`
    <div class="spread"><button class="btn ghost" id="sh-x">← Voltar</button>${pill(p.status)}</div>
    <div><div class="label">Pedido de ${dataBR(p.data)}</div><h2>${h(p.clienteNome)}</h2><div class="muted small">${h(docFmt(p.clienteDoc))}</div></div>
    <div class="card">${(p.itens || []).map(i => `<div class="line"><span>${i.qtd} ${h(i.un)} · ${h(i.nome)}<br><span class="muted small">${brl(i.preco)} cada</span></span><b>${brl(i.subtotal)}</b></div>`).join('')}
      <div class="line"><b>Total</b><b>${brl(p.total)}</b></div>
      <div class="line"><span class="muted">Pagamento</span><span>${h(p.condicaoNome || '—')}</span></div>
      ${p.dataEntrega ? `<div class="line"><span class="muted">Entrega desejada</span><span>${dataBR(p.dataEntrega)}</span></div>` : ''}
      ${p.obs ? `<div class="line"><span class="muted">Observação</span><span>${h(p.obs)}</span></div>` : ''}</div>
    ${canc ? `<div class="note crit">Pedido cancelado${p.motivoCancel ? ': ' + h(p.motivoCancel) : ''}.</div>` : `<div class="card"><div class="label" style="margin-bottom:8px">Andamento</div><ul class="steps">${passos.map(s => `<li class="${s.on ? 'on' : ''}">${h(s.t)}</li>`).join('')}</ul></div>`}
    ${p._pend ? '<div class="note warn">Este pedido ainda não subiu: está salvo no celular e envia sozinho quando houver sinal.</div>' : ''}
    <div class="stack">
      <button class="btn wheat big" id="sh-rep">Repetir este pedido</button>
      <button class="btn big" id="sh-vis">Registrar visita neste cliente</button>
      ${p.status === 'novo' ? '<button class="btn danger big" id="sh-canc">Cancelar pedido</button>' : ''}
    </div>`);
  $('#sh-x').onclick = fechaSheet;
  $('#sh-rep').onclick = () => { np = novoVazio(p.clienteDoc); np.itens = (p.itens || []).map(i => ({ key: i.prodId + '|' + i.un, qtd: String(i.qtd), preco: String(i.preco) })); np.condicaoId = p.condicaoId || ''; fechaSheet(); vaiTab('novo'); };
  $('#sh-vis').onclick = () => { fechaSheet(); abreVisita(p.clienteDoc); };
  const c = $('#sh-canc'); if (c) c.onclick = async () => {
    if (!(await confirma('Cancelar este pedido?', 'Cancelar pedido'))) return;
    updateDoc(doc(db, 'pedidos', p.id), { status: 'cancelado', canceladoEm: Date.now(), motivoCancel: 'cancelado pelo vendedor' }).then(() => toast('Pedido cancelado.')).catch(e => toast(erroMsg(e)));
    fechaSheet();
  };
}

// ---------- NOVO PEDIDO ----------
let renderNovoSePreciso = () => {};   // não redesenha enquanto digita
function renderNovo() {
  const ops = opcoesProduto();
  const cli = cliPor(np.clienteDoc);
  if (!np.condicaoId && condicoes.length) { const b14 = condicoes.find(c => /boleto.*14/i.test(c.nome)); np.condicaoId = (b14 || condicoes[0]).id; }
  $('#t-novo').innerHTML = `
    <h2>Novo pedido</h2>
    <button class="item" id="n-cli"><div class="t"><span>Cliente</span><b>${cli ? h(cli.fantasia || cli.nome) : 'Toque para escolher o cliente'}</b>${cli ? `<span>${h(cli.municipio || '')}${cli.uf ? '/' + h(cli.uf) : ''} · ${h(docFmt(cli.doc))}</span>` : ''}</div><div class="r">›</div></button>
    ${!ops.length ? '<div class="note warn">Os produtos ainda não foram carregados. Se acabou de instalar, aguarde alguns segundos com internet.</div>' : ''}
    <div class="itens" id="n-itens"></div>
    <button class="btn" id="n-add">+ Adicionar item</button>
    <div class="total"><span>Total</span><span id="n-total">${brl(0)}</span></div>
    <label class="field"><span>Pagamento</span><select id="n-cond">${condicoes.map(c => `<option value="${h(c.id)}" ${c.id === np.condicaoId ? 'selected' : ''}>${h(c.nome)}</option>`).join('')}</select></label>
    <div class="grid2" style="gap:10px">
      <label class="field"><span>Data do pedido</span><input type="date" id="n-data" value="${h(np.data)}"></label>
      <label class="field"><span>Entrega desejada (opcional)</span><input type="date" id="n-ent" value="${h(np.dataEntrega)}"></label>
    </div>
    <label class="field"><span>Observação</span><textarea id="n-obs" placeholder="Ex.: entregar pela manhã">${h(np.obs)}</textarea></label>
    <button class="btn primary big" id="n-salvar">Enviar pedido</button>
    <button class="btn ghost" id="n-limpa">Limpar tudo</button>`;
  desenhaItens();
  $('#n-cli').onclick = () => escolheCliente(d => { np.clienteDoc = d; renderNovo(); });
  $('#n-add').onclick = () => { np.itens.push({ key: '', qtd: '', preco: '' }); desenhaItens(); };
  $('#n-cond').onchange = e => np.condicaoId = e.target.value;
  $('#n-data').onchange = e => np.data = e.target.value;
  $('#n-ent').onchange = e => np.dataEntrega = e.target.value;
  $('#n-obs').oninput = e => np.obs = e.target.value;
  $('#n-limpa').onclick = async () => { if (await confirma('Limpar o pedido em digitação?', 'Limpar')) { np = novoVazio(); renderNovo(); } };
  $('#n-salvar').onclick = salvaPedido;
}
renderNovoSePreciso = () => { /* dados de produto/condição chegaram: só redesenha se ainda não começou a digitar */
  if (!np.clienteDoc && np.itens.every(i => !i.qtd && !i.key) && !np.obs) renderNovo();
};
function desenhaItens() {
  const ops = opcoesProduto();
  $('#n-itens').innerHTML = np.itens.map((it, i) => `
    <div class="itrow" data-i="${i}">
      <label class="field full"><span>Produto</span><select data-f="key"><option value="">Escolha…</option>${ops.map(o => `<option value="${h(o.key)}" ${o.key === it.key ? 'selected' : ''}>${h(o.nome)} — ${h(o.un)}</option>`).join('')}</select></label>
      <label class="field"><span>Quantidade</span><input type="number" inputmode="numeric" min="0" step="1" data-f="qtd" value="${h(it.qtd)}" placeholder="0"></label>
      <label class="field"><span>Preço (R$)</span><input type="number" inputmode="decimal" min="0" step="0.01" data-f="preco" value="${h(it.preco)}" placeholder="0,00"></label>
      <div class="sub"><span>Subtotal: <b class="num" data-sub>${brl(r2((+it.qtd || 0) * (+String(it.preco).replace(',', '.') || 0)))}</b></span>${np.itens.length > 1 ? `<button class="btn ghost sm danger" data-rm="${i}">Remover</button>` : '<span></span>'}</div>
    </div>`).join('');
  $$('#n-itens .itrow').forEach(row => {
    const i = +row.dataset.i, it = np.itens[i];
    row.querySelectorAll('[data-f]').forEach(inp => inp.addEventListener('input', () => {
      const f = inp.dataset.f; it[f] = inp.value;
      if (f === 'key') { const o = opPorKey(inp.value); if (o) { it.preco = String(o.preco); row.querySelector('[data-f=preco]').value = it.preco; } }
      row.querySelector('[data-sub]').textContent = brl(r2((+it.qtd || 0) * (+String(it.preco).replace(',', '.') || 0)));
      totalNovo();
    }));
    const rm = row.querySelector('[data-rm]'); if (rm) rm.onclick = () => { np.itens.splice(i, 1); desenhaItens(); };
  });
  totalNovo();
}
function totalNovo() {
  const t = np.itens.reduce((a, it) => a + (+it.qtd || 0) * (+String(it.preco).replace(',', '.') || 0), 0);
  const el = $('#n-total'); if (el) el.textContent = brl(r2(t));
}
function salvaPedido() {
  const cli = cliPor(np.clienteDoc);
  if (!cli) return toast('Escolha o cliente.');
  const itens = [];
  for (const it of np.itens) {
    if (!(+it.qtd > 0)) continue;
    const o = opPorKey(it.key); if (!o) return toast('Escolha o produto de cada item.');
    const preco = +String(it.preco).replace(',', '.'); if (!(preco > 0)) return toast('Informe o preço de ' + o.nome + '.');
    itens.push({ prodId: o.prodId, codigo: o.codigo, nome: o.nome, un: o.un, qtd: +it.qtd, preco, subtotal: r2(+it.qtd * preco) });
  }
  if (!itens.length) return toast('Informe a quantidade de pelo menos um item.');
  const cond = condicoes.find(c => c.id === np.condicaoId); if (!cond) return toast('Escolha o pagamento.');
  const total = r2(itens.reduce((a, i) => a + i.subtotal, 0));
  const id = 'app-' + me.vendedorId + '-' + Date.now().toString(36);
  const reg = {
    origem: 'app', data: np.data || ymd(), clienteDoc: cli.doc, clienteNome: cli.nome, clienteMun: cli.municipio || '',
    itens, total, condicaoId: cond.id, condicaoNome: cond.nome, condicaoTipo: cond.tipo || '', prazo: cond.dias || '',
    obs: (np.obs || '').trim(), dataEntrega: np.dataEntrega || '',
    vendedorId: me.vendedorId, vendedorNome: me.nome, uid: me.uid, status: 'novo', criadoMs: Date.now(), criadoEm: serverTimestamp()
  };
  // grava no celular na hora; sobe sozinho quando houver sinal
  setDoc(doc(db, 'pedidos', id), reg).catch(e => toast(erroMsg(e)));
  toast('Pedido de ' + brl(total) + ' salvo' + (navigator.onLine ? ' e enviado.' : ' no celular. Envia quando houver sinal.'));
  np = novoVazio(); fPed.mes = mesDe(reg.data); fPed.st = 'todos'; vaiTab('pedidos');
}

// ---------- escolher cliente ----------
function escolheCliente(cb) {
  let q = '';
  const el = $('#sheet');
  const draw = () => {
    const t = semAcento(q), dig = q.replace(/\D/g, '');
    const l = clientes.filter(c => !t || semAcento(c.nome + ' ' + (c.fantasia || '') + ' ' + (c.municipio || '')).includes(t) || (dig.length >= 3 && c.doc.includes(dig)));
    $('#cl-lista').innerHTML = l.slice(0, 80).map(c => {
      const r = resumo[c.doc] || {};
      return `<button class="item" data-d="${h(c.doc)}"><div class="t"><b>${h(c.fantasia || c.nome)}</b><span>${h(c.municipio || '')}${c.uf ? '/' + h(c.uf) : ''} · ${h(docFmt(c.doc))}</span></div><div class="r">${r.ultima ? '<span class="small muted">última ' + dataBR(r.ultima) + '</span>' : ''}</div></button>`;
    }).join('') || '<div class="empty"><b>Nenhum cliente encontrado</b>Se for cliente novo, peça o cadastro à Lazinho.</div>';
    if (l.length > 80) $('#cl-lista').insertAdjacentHTML('beforeend', `<div class="muted small" style="text-align:center">Mostrando 80 de ${l.length}. Digite mais letras para filtrar.</div>`);
    $$('#cl-lista [data-d]').forEach(b => b.onclick = () => { fechaSheet(); cb(b.dataset.d); });
  };
  sheet(`<div class="spread"><button class="btn ghost" id="cl-x">← Voltar</button><h3>Escolher cliente</h3><span></span></div>
    <input type="search" id="cl-q" placeholder="Buscar por nome, cidade ou CNPJ" autocomplete="off"><div class="list" id="cl-lista"></div>`);
  $('#cl-x').onclick = fechaSheet; $('#cl-q').oninput = e => { q = e.target.value; draw(); }; draw(); setTimeout(() => $('#cl-q').focus(), 200);
}

// ---------- CLIENTES ----------
function renderClientes() {
  const mes = ymd().slice(0, 7), t = semAcento(fCli.q), dig = fCli.q.replace(/\D/g, '');
  const compMes = c => ((resumo[c.doc] || {}).mes === mes && (+(resumo[c.doc] || {}).mesTotal || 0) > 0);
  let l = clientes.filter(c => !t || semAcento(c.nome + ' ' + (c.fantasia || '') + ' ' + (c.municipio || '')).includes(t) || (dig.length >= 3 && c.doc.includes(dig)));
  const nComp = clientes.filter(compMes).length;
  if (fCli.f === 'comprou') l = l.filter(compMes); else if (fCli.f === 'nao') l = l.filter(c => !compMes(c));
  $('#t-clientes').innerHTML = `
    <h2>Clientes</h2>
    <input type="search" id="c-q" placeholder="Buscar por nome, cidade ou CNPJ" value="${h(fCli.q)}" autocomplete="off">
    <div class="chips">${[['todos', 'Todos (' + clientes.length + ')'], ['comprou', 'Compraram em ' + mesNome(mes).split('/')[0] + ' (' + nComp + ')'], ['nao', 'Não compraram no mês']].map(([k, tt]) => `<button class="chip" data-f="${k}" aria-pressed="${fCli.f === k}">${tt}</button>`).join('')}</div>
    <div class="list" id="c-lista">${l.slice(0, 120).map(c => { const r = resumo[c.doc] || {};
      return `<button class="item" data-d="${h(c.doc)}"><div class="t"><b>${h(c.fantasia || c.nome)}</b><span>${h(c.municipio || '')}${c.uf ? '/' + h(c.uf) : ''}</span></div>
      <div class="r">${r.ultima ? `<b>${dataBR(r.ultima)}</b><span class="muted">${brl(r.ultimoValor)}</span>` : '<span class="muted">sem compra</span>'}${compMes(c) ? '<br><span class="tag ok">comprou no mês</span>' : ''}</div></button>`; }).join('') || '<div class="empty"><b>Nenhum cliente</b>Os clientes aparecem depois da carga feita pela Lazinho.</div>'}</div>
    ${l.length > 120 ? `<div class="muted small" style="text-align:center">Mostrando 120 de ${l.length}. Use a busca.</div>` : ''}`;
  $('#c-q').oninput = e => { fCli.q = e.target.value; const p = e.target.selectionStart; renderClientes(); const i = $('#c-q'); i.focus(); i.setSelectionRange(p, p); };
  $$('#t-clientes [data-f]').forEach(b => b.onclick = () => { fCli.f = b.dataset.f; renderClientes(); });
  $$('#t-clientes [data-d]').forEach(b => b.onclick = () => abreCliente(b.dataset.d));
}
function abreCliente(d) {
  const c = cliPor(d); if (!c) return; const r = resumo[d] || {}, mes = ymd().slice(0, 7);
  const vis = visitas.filter(v => v.clienteDoc === d).slice(0, 5), peds = pedidos.filter(p => p.clienteDoc === d && p.status !== 'cancelado').slice(0, 5);
  const end = [c.logradouro, c.numero].filter(Boolean).join(', ') + (c.bairro ? ' — ' + c.bairro : '');
  sheet(`
    <div class="spread"><button class="btn ghost" id="sh-x">← Voltar</button><span></span></div>
    <div><h2>${h(c.fantasia || c.nome)}</h2><div class="muted small">${h(c.nome)} · ${h(docFmt(c.doc))}</div></div>
    <div class="card">
      ${end ? `<div class="line"><span class="muted">Endereço</span><span style="text-align:right">${h(end)}<br>${h(c.municipio || '')}${c.uf ? '/' + h(c.uf) : ''}</span></div>` : ''}
      ${c.fone ? `<div class="line"><span class="muted">Telefone</span><a href="tel:${h(c.fone)}">${h(c.fone)}</a></div>` : ''}
    </div>
    <div class="kpis"><div class="kpi"><b>${r.ultima ? dataBR(r.ultima) : '—'}</b><span>última venda</span></div><div class="kpi"><b>${r.ultima ? brl(r.ultimoValor) : '—'}</b><span>valor</span></div><div class="kpi"><b>${r.mes === mes ? brl(r.mesTotal) : brl(0)}</b><span>no mês</span></div></div>
    ${(r.hist || []).length ? `<div class="card"><div class="label" style="margin-bottom:6px">Últimas compras</div>${r.hist.slice(0, 8).map(x => `<div class="line"><span>${dataBR(x.data)}${x.itens ? ' · ' + h(x.itens) : ''}</span><b>${brl(x.total)}</b></div>`).join('')}</div>` : ''}
    ${peds.length ? `<div class="card"><div class="label" style="margin-bottom:6px">Meus pedidos neste cliente</div>${peds.map(p => `<div class="line"><span>${dataBR(p.data)} · ${pill(p.status)}</span><b>${brl(p.total)}</b></div>`).join('')}</div>` : ''}
    ${vis.length ? `<div class="card"><div class="label" style="margin-bottom:6px">Minhas visitas</div>${vis.map(v => `<div class="line"><span>${dataBR(v.data)}${v.obs ? ' · ' + h(v.obs.slice(0, 40)) : ''}</span><button class="btn ghost sm" data-v="${h(v.id)}">ver</button></div>`).join('')}</div>` : ''}
    <button class="btn primary big" id="sh-ped">Novo pedido para este cliente</button>
    <button class="btn wheat big" id="sh-vis">Registrar visita</button>`);
  $('#sh-x').onclick = fechaSheet;
  $('#sh-ped').onclick = () => { np = novoVazio(d); fechaSheet(); vaiTab('novo'); };
  $('#sh-vis').onclick = () => { fechaSheet(); abreVisita(d); };
  $$('#sheet [data-v]').forEach(b => b.onclick = () => abreDetalheVisita(b.dataset.v));
}

// ---------- VISITAS ----------
function renderVisitas() {
  const meses = [...new Set([ymd().slice(0, 7), ...visitas.map(v => mesDe(v.data))])].sort().reverse();
  if (!meses.includes(fVis.mes)) fVis.mes = meses[0];
  const l = visitas.filter(v => mesDe(v.data) === fVis.mes);
  $('#t-visita').innerHTML = `
    <div class="spread"><h2>Visitas</h2></div>
    <button class="btn primary big" id="v-nova">📍 Registrar visita</button>
    <label class="field"><span>Mês</span><select id="v-mes">${meses.map(m => `<option value="${m}" ${m === fVis.mes ? 'selected' : ''}>${h(mesNome(m))}</option>`).join('')}</select></label>
    <div class="muted small">${l.length} visita(s) no mês</div>
    <div class="list">${l.map(v => `<button class="item" data-v="${h(v.id)}"><div class="t"><b>${h(v.clienteNome)}</b><span>${dataBR(v.data)} ${new Date(v.criadoMs || 0).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · ${(v.fotos || []).length} foto(s)${(v.precos || []).length ? ' · ' + v.precos.length + ' preço(s)' : ''}</span></div><div class="r">${v._pend ? '<span class="tag y">aguardando sinal</span>' : '›'}</div></button>`).join('') || '<div class="empty"><b>Nenhuma visita neste mês</b>Registre a visita no cliente com fotos, preços e estoque.</div>'}</div>`;
  $('#v-nova').onclick = () => abreVisita('');
  $('#v-mes').onchange = e => { fVis.mes = e.target.value; renderVisitas(); };
  $$('#t-visita [data-v]').forEach(b => b.onclick = () => abreDetalheVisita(b.dataset.v));
}
function abreDetalheVisita(id) {
  const v = visitas.find(x => x.id === id); if (!v) return;
  sheet(`
    <div class="spread"><button class="btn ghost" id="sh-x">← Voltar</button>${v._pend ? '<span class="tag y">aguardando sinal</span>' : '<span class="tag ok">enviada</span>'}</div>
    <div><div class="label">Visita em ${dataBR(v.data)} às ${new Date(v.criadoMs || 0).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div><h2>${h(v.clienteNome)}</h2></div>
    ${v.gps ? `<a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${v.gps.lat},${v.gps.lng}">Ver local no mapa (±${v.gps.acc} m)</a>` : ''}
    ${(v.fotos || []).length ? `<div class="fotos">${v.fotos.map(f => `<div class="foto"><img src="${f}" alt="Foto da visita"></div>`).join('')}</div>` : ''}
    ${(v.precos || []).length ? `<div class="card"><div class="label" style="margin-bottom:6px">Preços na loja</div>${v.precos.map(p => `<div class="line"><span>${h(p.produto)}${p.marca ? ' · ' + h(p.marca) : ''}</span><b>${brl(p.preco)}</b></div>`).join('')}</div>` : ''}
    ${(v.estoque || []).length ? `<div class="card"><div class="label" style="margin-bottom:6px">Estoque no cliente</div>${v.estoque.map(p => `<div class="line"><span>${h(p.nome)} (${h(p.un)})</span><b>${p.qtd}</b></div>`).join('')}</div>` : ''}
    ${v.obs ? `<div class="card"><div class="label" style="margin-bottom:6px">Observação</div>${h(v.obs)}</div>` : ''}`);
  $('#sh-x').onclick = fechaSheet;
  $$('#sheet .foto img').forEach(im => im.onclick = () => abreModal(`<img class="bigfoto" src="${im.src}" alt=""><button class="btn" onclick="document.getElementById('modal').hidden=true">Fechar</button>`));
}

function abreVisita(clienteDoc) {
  vs = { clienteDoc: clienteDoc || '', fotos: [], precos: [], estoque: {}, obs: '', gps: null, gpsMsg: 'Localização ainda não marcada.' };
  desenhaVisita();
  marcaGPS();
}
async function marcaGPS() {
  vs.gpsMsg = 'Pegando localização…'; atualizaGpsTxt();
  try { vs.gps = await pegaGPS(); vs.gpsMsg = 'Local marcado (±' + vs.gps.acc + ' m).'; }
  catch (e) { vs.gps = null; vs.gpsMsg = e.message + ' Você pode salvar mesmo assim.'; }
  atualizaGpsTxt();
}
const atualizaGpsTxt = () => { const e = $('#vs-gps'); if (e && vs) e.textContent = vs.gpsMsg; };
function desenhaVisita() {
  const cli = cliPor(vs.clienteDoc), ops = opcoesProduto().filter((o, i, a) => a.findIndex(x => x.prodId === o.prodId && x.un === o.un) === i);
  sheet(`
    <div class="spread"><button class="btn ghost" id="vs-x">← Cancelar</button><h3>Registrar visita</h3><span></span></div>
    <button class="item" id="vs-cli"><div class="t"><span>Cliente</span><b>${cli ? h(cli.fantasia || cli.nome) : 'Toque para escolher o cliente'}</b></div><div class="r">›</div></button>
    <div class="note"><span id="vs-gps">${h(vs.gpsMsg)}</span> <button class="btn ghost sm" id="vs-regps">Marcar de novo</button></div>
    <div class="card stack"><div class="label">Fotos do produto / gôndola</div>
      <div class="fotos">${vs.fotos.map((f, i) => `<div class="foto"><img src="${f}" alt="Foto ${i + 1}"><button data-rf="${i}" aria-label="Remover foto">×</button></div>`).join('')}
        ${vs.fotos.length < 4 ? `<label class="addfoto"><b>+</b>Tirar foto<input type="file" accept="image/*" capture="environment" id="vs-foto"></label>` : ''}</div></div>
    <div class="card stack"><div class="label">Preços praticados na loja</div>
      ${vs.precos.map((p, i) => `<div class="itrow" data-p="${i}"><label class="field full"><span>Produto</span><input type="text" data-f="produto" value="${h(p.produto)}" list="vs-prods" placeholder="Ex.: Lazinho Tradicional 300g"></label>
        <label class="field" style="grid-column:1/3"><span>Marca</span><input type="text" data-f="marca" value="${h(p.marca)}" placeholder="Lazinho ou concorrente"></label>
        <label class="field"><span>Preço (R$)</span><input type="number" inputmode="decimal" step="0.01" min="0" data-f="preco" value="${h(p.preco)}"></label>
        <div class="sub"><span></span><button class="btn ghost sm danger" data-rp="${i}">Remover</button></div></div>`).join('')}
      <datalist id="vs-prods">${[...new Set(produtos.map(p => p.nome))].sort().map(n => `<option value="${h(n)}">`).join('')}</datalist>
      <button class="btn" id="vs-addp">+ Registrar um preço</button></div>
    <div class="card stack"><div class="label">Estoque no cliente hoje</div><div class="muted small">Quantidade que o cliente tem agora. Deixe em branco o que não contou.</div>
      ${ops.map(o => `<label class="field"><span>${h(o.nome)} (${h(o.un)})</span><input type="number" inputmode="numeric" min="0" step="1" data-e="${h(o.key)}" value="${h((vs.estoque[o.key] ?? ''))}" placeholder="—"></label>`).join('') || '<div class="muted small">Produtos ainda não carregados.</div>'}</div>
    <label class="field"><span>Observação</span><textarea id="vs-obs" placeholder="O que você viu, o que o cliente disse…">${h(vs.obs)}</textarea></label>
    <button class="btn primary big" id="vs-salvar">Salvar visita</button>`);
  $('#vs-x').onclick = async () => { if (await confirma('Descartar esta visita?', 'Descartar')) { vs = null; fechaSheet(); } };
  $('#vs-cli').onclick = () => { const guarda = vs; escolheCliente(d => { vs = guarda; vs.clienteDoc = d; desenhaVisita(); }); };
  $('#vs-regps').onclick = marcaGPS;
  const f = $('#vs-foto'); if (f) f.onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    try { vs.fotos.push(await reduzFoto(file, 1000, .62)); desenhaVisita(); } catch (err) { toast(err.message); }
  };
  $$('#sheet [data-rf]').forEach(b => b.onclick = () => { vs.fotos.splice(+b.dataset.rf, 1); desenhaVisita(); });
  $('#vs-addp').onclick = () => { vs.precos.push({ produto: '', marca: 'Lazinho', preco: '' }); desenhaVisita(); };
  $$('#sheet [data-rp]').forEach(b => b.onclick = () => { vs.precos.splice(+b.dataset.rp, 1); desenhaVisita(); });
  $$('#sheet [data-p]').forEach(row => row.querySelectorAll('[data-f]').forEach(inp => inp.oninput = () => { vs.precos[+row.dataset.p][inp.dataset.f] = inp.value; }));
  $$('#sheet [data-e]').forEach(inp => inp.oninput = () => { vs.estoque[inp.dataset.e] = inp.value; });
  $('#vs-obs').oninput = e => vs.obs = e.target.value;
  $('#vs-salvar').onclick = salvaVisita;
}
function salvaVisita() {
  const cli = cliPor(vs.clienteDoc); if (!cli) return toast('Escolha o cliente da visita.');
  const precos = vs.precos.filter(p => p.produto.trim() && +String(p.preco).replace(',', '.') > 0).map(p => ({ produto: p.produto.trim(), marca: (p.marca || '').trim(), preco: +String(p.preco).replace(',', '.') }));
  const estoque = Object.entries(vs.estoque).filter(([, q]) => q !== '' && q != null && +q >= 0).map(([k, q]) => { const o = opPorKey(k); return o ? { prodId: o.prodId, nome: o.nome, un: o.un, qtd: +q } : null; }).filter(Boolean);
  if (!vs.fotos.length && !precos.length && !estoque.length && !vs.obs.trim()) return toast('Registre ao menos uma foto, preço, estoque ou observação.');
  const tam = vs.fotos.reduce((a, f) => a + f.length, 0);
  if (tam > 850000) return toast('As fotos ficaram grandes demais. Remova uma foto.');
  const id = 'vis-' + me.vendedorId + '-' + Date.now().toString(36);
  const reg = { data: ymd(), clienteDoc: cli.doc, clienteNome: cli.fantasia || cli.nome, vendedorId: me.vendedorId, vendedorNome: me.nome, uid: me.uid, fotos: vs.fotos, precos, estoque, obs: vs.obs.trim(), gps: vs.gps || null, criadoMs: Date.now(), criadoEm: serverTimestamp() };
  setDoc(doc(db, 'visitas', id), reg).catch(e => toast(erroMsg(e)));
  toast('Visita salva' + (navigator.onLine ? ' e enviada.' : ' no celular. Envia quando houver sinal.'));
  vs = null; fechaSheet(); fVis.mes = mesDe(reg.data); vaiTab('visita');
}

// ---------- tela cheia (sheet) ----------
function sheet(html) { const s = $('#sheet'); s.innerHTML = `<div class="sheet-in">${html}</div>`; s.hidden = false; s.scrollTop = 0; }
function fechaSheet() { const s = $('#sheet'); s.hidden = true; s.innerHTML = ''; }

// ---------- service worker ----------
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
