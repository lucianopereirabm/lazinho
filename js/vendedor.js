// App do vendedor — Lazinho
import {
  auth, db, signInWithEmailAndPassword, signOut, onAuthStateChanged, doc, getDoc, setDoc, updateDoc, collection, query, where, onSnapshot,
  serverTimestamp, emailVendedor, senhaVendedor, usuarioDeNome, $, $$, h, semAcento, porNome, ymd, mesDe, dataBR, dataHoraBR, brl, r2, mesNome,
  docFmt, toast, abreModal, fechaModal, confirma, erroMsg, pegaGPS, reduzFoto, avisoRede, atualizaAgora, statusInfo, VERSAO, lsGet, lsSet
} from './fb.js';

avisoRede();
$('#versao').textContent = 'Lazinho Vendas ' + VERSAO;

// ---------- estado ----------
let me = null;                 // { uid, vendedorId, nome }
let clientes = [], clientesBase = [], clientesNovos = [], produtos = [], condicoes = [], resumo = {}, pedidos = [], visitas = [], vendedoresDb = [];
let unsubs = [];
let leads = [], leadsSub = null, fFun = { q: '', e: 'todos', t: '', c: '', mais: 60 };
let tab = 'inicio';
let fPed = { mes: ymd().slice(0, 7), st: 'todos', v: '' };
let fCli = { q: '', f: 'todos' };
let fVis = { mes: ymd().slice(0, 7) };
let np = novoVazio();          // pedido em digitação
let vs = null;                 // visita em digitação

function novoVazio(cli) { return { editId: '', clienteDoc: cli || '', itens: [{ key: '', qtd: '', preco: '' }], condicaoId: '', obs: '', dataEntrega: '', data: ymd() }; }

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
$('#atualiza').onclick = () => atualizaAgora($('#atualiza'), assina);
$('#sem-sair').onclick = () => signOut(auth);
$('#lg-usuario').value = lsGet('lz-usuario') || '';

function mostra(id) {
  ['carregando', 'v-login', 'v-sem', 't-inicio', 't-pedidos', 't-novo', 't-clientes', 't-visita', 't-funil'].forEach(x => $('#' + x).hidden = x !== id);
}
function paraLogin() {
  unsubs.forEach(u => { try { u(); } catch (e) {} }); unsubs = []; me = null;
  $('#tabbar').hidden = true; $('#sair').hidden = true; $('#atualiza').hidden = true; $('#quem').innerHTML = ''; mostra('v-login');
}

onAuthStateChanged(auth, async user => {
  if (!user) { paraLogin(); return; }
  try {
    const u = await getDoc(doc(db, 'usuarios', user.uid));
    if (!u.exists() || !u.data().vendedorId) { mostra('v-sem'); $('#quem').innerHTML = ''; return; }
    me = { uid: user.uid, vendedorId: u.data().vendedorId, nome: u.data().nome || '', perm: permDe(u.data()) };
  } catch (e) { mostra('v-sem'); return; }
  $('#quem').innerHTML = `<b>${h(me.nome.split(' ')[0])}</b>${me.perm.todos ? 'Supervisor' : 'Vendedor'} · ${VERSAO}`; $('#sair').hidden = false; $('#atualiza').hidden = false; $('#tabbar').hidden = false;
  aplicaPerm(); assina(); vaiTab(tab);
});

const permDe = d => ({ pedido: d.permPedido !== false, preco: d.permPreco !== false, visita: d.permVisita !== false, cliente: d.permCliente === true || d.permTodos === true, todos: d.permTodos === true });
function aplicaPerm() {
  { const q = $('#quem b'); if (q) q.nextSibling.textContent = (me.perm.todos ? 'Supervisor' : 'Vendedor') + ' · ' + VERSAO; }
  $$('#tabbar button').forEach(b => { b.hidden = (b.dataset.tab === 'novo' && !me.perm.pedido) || (b.dataset.tab === 'visita' && !me.perm.visita) || (b.dataset.tab === 'funil' && !me.perm.todos); });
  if ((tab === 'novo' && !me.perm.pedido) || (tab === 'visita' && !me.perm.visita) || (tab === 'funil' && !me.perm.todos)) tab = 'pedidos';
}
const meu = c => !me || me.perm.todos || c.vendedorId === me.vendedorId;
const endLinha = c => [[c.logradouro, c.numero].filter(Boolean).join(', '), c.bairro].filter(Boolean).join(' — ');
const buscaTxt = c => semAcento(c.nome + ' ' + (c.fantasia || '') + ' ' + (c.municipio || '') + ' ' + endLinha(c));
const juntaClientes = () => { const m = new Map(clientesBase.filter(meu).map(c => [c.doc, c])); clientesNovos.forEach(c => { if (!m.has(c.doc)) m.set(c.doc, { ...c, novo: true }); }); clientes = [...m.values()].sort(porNome); };
function assina() {
  unsubs.forEach(u => { try { u(); } catch (e) {} }); unsubs = []; leadsSub = null; leads = [];
  const onErr = n => e => toast('Erro ao carregar ' + n + ': ' + erroMsg(e));
  const watch = (nome, q, fn) => unsubs.push(onSnapshot(q, { includeMetadataChanges: true }, s => { fn(s); }, onErr(nome)));
  unsubs.push(onSnapshot(doc(db, 'usuarios', me.uid), d => { if (d.exists()) { const era = me.perm.todos; me.perm = permDe(d.data()); aplicaPerm(); if (era !== me.perm.todos) { assina(); vaiTab(tab); return; } assinaLeads(); juntaClientes(); render(); } }, () => {}));
  watch('clientes', collection(db, 'clientes'), s => { clientesBase = s.docs.map(d => ({ ...d.data(), doc: d.id })); juntaClientes(); refresh('clientes'); });
  watch('clientes novos', query(collection(db, 'clientesNovos'), where('vendedorId', '==', me.vendedorId)), s => { clientesNovos = s.docs.map(d => ({ ...d.data(), doc: d.id })); juntaClientes(); refresh('clientes'); });
  watch('produtos', collection(db, 'produtos'), s => { produtos = s.docs.map(d => ({ ...d.data(), id: d.id })).filter(p => p.ativo !== false); refresh('novo'); });
  watch('condições', collection(db, 'condicoes'), s => { condicoes = s.docs.map(d => ({ ...d.data(), id: d.id })).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR', { numeric: true })); refresh('novo'); });
  watch('resumo', collection(db, 'resumo'), s => { resumo = {}; s.docs.forEach(d => resumo[d.id] = d.data()); refresh('clientes'); });
  watch('vendedores', collection(db, 'vendedores'), s => { vendedoresDb = s.docs.map(d => ({ ...d.data(), id: d.id })); refresh('inicio'); });
  const meus = col => me.perm.todos ? collection(db, col) : query(collection(db, col), where('vendedorId', '==', me.vendedorId));
  watch('pedidos', meus('pedidos'), s => {
    pedidos = s.docs.map(d => ({ ...d.data(), id: d.id, _pend: d.metadata.hasPendingWrites })).sort((a, b) => (b.criadoMs || 0) - (a.criadoMs || 0)); refresh('pedidos');
  });
  watch('visitas', meus('visitas'), s => {
    visitas = s.docs.map(d => ({ ...d.data(), id: d.id, _pend: d.metadata.hasPendingWrites })).sort((a, b) => (b.criadoMs || 0) - (a.criadoMs || 0)); refresh('visita');
  });
  assinaLeads();
}
function assinaLeads() {
  if (leadsSub || !me || !me.perm.todos) return;
  leadsSub = onSnapshot(collection(db, 'leads'), { includeMetadataChanges: true }, s => { leads = s.docs.map(d => { const x = d.data(); return { ...x, id: d.id, etapa: etapaDe(x.etapa) }; }); refresh('funil'); }, e => toast('Erro ao carregar o funil: ' + erroMsg(e)));
  unsubs.push(() => { if (leadsSub) leadsSub(); leadsSub = null; });
}
function refresh(t) {
  if (!me || (t !== tab && tab !== 'inicio')) return;
  if (t === 'novo') renderNovoSePreciso(); else render();
}

// ---------- abas ----------
$$('#tabbar button').forEach(b => b.onclick = () => { fechaSheet(); vaiTab(b.dataset.tab); });
function vaiTab(t) {
  tab = t;
  $$('#tabbar button').forEach(b => b.setAttribute('aria-current', b.dataset.tab === t ? 'true' : 'false'));
  mostra('t-' + t); render(); window.scrollTo(0, 0);
}
function render() { ({ inicio: renderInicio, pedidos: renderPedidos, novo: renderNovo, clientes: renderClientes, visita: renderVisitas, funil: renderFunil })[tab](); }

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


// ---------- INÍCIO (painel do mês) ----------
// Mesma regra de comissão do Portal: % cadastrado; sem cadastro, Marlene 7%, venda direta 0%, demais 5%
const pctVend = id => { const v = vendedoresDb.find(x => x.id === id); if (v && v.comissaoPct != null && v.comissaoPct !== '') return +v.comissaoPct || 0; return id === 'marlene' ? 7 : (id === 'venda-direta' ? 0 : 5); };
function renderInicio() {
  const mes = ymd().slice(0, 7), sup = me.perm.todos;
  const fat = d => { const r = resumo[d]; return r && r.mes === mes ? (+r.mesTotal || 0) : 0; };
  const comprou = c => fat(c.doc) > 0;
  const comp = clientes.filter(comprou), nao = clientes.filter(c => !comprou(c));
  const docsMeus = new Set(clientes.map(c => c.doc));
  const totFat = sup ? Object.keys(resumo).reduce((t, d) => t + fat(d), 0) : clientes.reduce((t, c) => t + fat(c.doc), 0);
  const porV = new Map();
  clientes.forEach(c => { const id = c.vendedorId || '__sem', g = porV.get(id) || { id, fat: 0, n: 0, nc: 0 }; g.n++; if (comprou(c)) { g.nc++; g.fat += fat(c.doc); } porV.set(id, g); });
  if (sup) { const sem = Object.keys(resumo).filter(d => !docsMeus.has(d)).reduce((t, d) => t + fat(d), 0); if (sem > 0) { const g = porV.get('__sem') || { id: '__sem', fat: 0, n: 0, nc: 0 }; g.fat += sem; porV.set('__sem', g); } }
  const nomeV = id => id === '__sem' ? 'Venda direta / sem vendedor' : ((vendedoresDb.find(v => v.id === id) || {}).nome || id);
  const linhas = [...porV.values()].map(g => ({ ...g, pct: g.id === '__sem' ? 0 : pctVend(g.id) })).map(g => ({ ...g, com: r2(g.fat * g.pct / 100) })).sort((a, b) => b.fat - a.fat);
  const pctMeu = pctVend(me.vendedorId), com = sup ? r2(linhas.reduce((t, g) => t + g.com, 0)) : r2(totFat * pctMeu / 100);
  const doMes = pedidos.filter(p => mesDe(p.data) === mes && p.status !== 'cancelado');
  const aFat = pedidos.filter(p => ['novo', 'recebido'].includes(p.status));
  const soma = a => a.reduce((t, p) => t + (+p.total || 0), 0);
  const pc = clientes.length ? Math.round(comp.length * 100 / clientes.length) : 0;
  const ordem = [...nao].sort((a, b) => String((resumo[a.doc] || {}).ultima || '').localeCompare(String((resumo[b.doc] || {}).ultima || '')));
  $('#t-inicio').innerHTML = `
    <div class="hero"><img src="img/logo.png" alt=""><div style="flex:1"><h2>Olá, ${h((me.nome || '').split(' ')[0] || 'vendedor')}!</h2><span>${sup ? 'Painel da empresa toda' : 'Seu painel'} · ${h(mesNome(mes))}</span></div></div>
    <div class="card dash-main"><span class="muted small">${sup ? 'Faturado no mês (empresa)' : 'Faturado no mês'}</span><b class="dash-big">${brl(totFat)}</b>
      <div class="line"><span class="muted">${sup ? 'Comissões do mês (estimativa)' : 'Sua comissão (' + pctMeu + '%)'}</span><b>${brl(com)}</b></div>
      <div class="muted small">Comissão estimada sobre o que já foi faturado no mês; o valor final é confirmado pela Lazinho.</div></div>
    <div class="kpis dash-k2">
      <div class="kpi"><b>${comp.length}</b><span>Clientes que compraram</span></div>
      <div class="kpi"><b>${nao.length}</b><span>Ainda não compraram</span></div></div>
    <div class="card"><div class="line"><span class="muted">Clientes ativos no mês</span><b>${pc}% (${comp.length} de ${clientes.length})</b></div><div class="dash-bar"><i style="width:${pc}%"></i></div></div>
    <div class="card"><div class="label" style="margin-bottom:6px">Pedidos feitos no app</div>
      <div class="line"><span class="muted">Pedidos no mês</span><b>${doMes.length} · ${brl(soma(doMes))}</b></div>
      <div class="line"><span class="muted">Aguardando faturar</span><b>${aFat.length} · ${brl(soma(aFat))}</b></div></div>
    ${sup && linhas.length ? `<div class="card"><div class="label" style="margin-bottom:6px">Por vendedor</div>${linhas.map(g => `<div class="line"><span>${h(nomeV(g.id))}<br><span class="muted small">${g.nc} de ${g.n} clientes compraram${g.pct ? ' · ' + g.pct + '%' : ''}</span></span><span style="text-align:right"><b>${brl(g.fat)}</b>${g.com ? `<br><span class="muted small">comissão ${brl(g.com)}</span>` : ''}</span></div>`).join('')}</div>` : ''}
    <div class="spread"><div class="label">${nao.length ? 'Ainda não compraram em ' + h(mesNome(mes).split('/')[0]) : 'Todos os clientes já compraram no mês 🎉'}</div>${nao.length > 8 ? '<button class="btn ghost sm" id="in-ver">Ver todos</button>' : ''}</div>
    <div class="list">${ordem.slice(0, 8).map(c => { const r = resumo[c.doc] || {}; return `<button class="item" data-d="${h(c.doc)}"><div class="t"><b>${h(c.fantasia || c.nome)}</b><span>${h(c.municipio || '')}${c.uf ? '/' + h(c.uf) : ''}</span></div><div class="r">${r.ultima ? `<span class="muted">última compra</span><b>${dataBR(r.ultima)}</b>` : '<span class="muted">sem compra</span>'}</div></button>`; }).join('')}</div>`;
  const vt = $('#in-ver'); if (vt) vt.onclick = () => { fCli.f = 'nao'; vaiTab('clientes'); };
  $$('#t-inicio [data-d]').forEach(b => b.onclick = () => abreCliente(b.dataset.d));
}

// ---------- PEDIDOS ----------
const EM_ANDAMENTO = ['novo', 'recebido', 'faturado'];
function renderPedidos() {
  const meses = [...new Set([ymd().slice(0, 7), ...pedidos.map(p => mesDe(p.data))])].sort().reverse();
  if (!meses.includes(fPed.mes)) fPed.mes = meses[0];
  const vends = [...new Map(pedidos.filter(p => p.vendedorId).map(p => [p.vendedorId, p.vendedorNome || p.vendedorId])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'pt-BR'));
  const doMes = pedidos.filter(p => mesDe(p.data) === fPed.mes && (!me.perm.todos || !fPed.v || p.vendedorId === fPed.v));
  const lista = doMes.filter(p => fPed.st === 'todos' ? true : fPed.st === 'andamento' ? EM_ANDAMENTO.includes(p.status) : p.status === fPed.st);
  const validos = doMes.filter(p => p.status !== 'cancelado');
  const total = validos.reduce((a, p) => a + (+p.total || 0), 0);
  $('#t-pedidos').innerHTML = `
    <div class="hero"><img src="img/logo.png" alt=""><div style="flex:1"><h2>${me.perm.todos ? 'Pedidos' : 'Meus pedidos'}</h2><span>Olá, ${h(me.nome.split(' ')[0])}!</span></div>${me.perm.pedido ? '<button class="btn wheat sm" id="p-novo">+ Novo</button>' : ''}</div>
    <div class="${me.perm.todos ? 'row2' : ''}"><label class="field"><span>Mês</span><select id="p-mes">${meses.map(m => `<option value="${m}" ${m === fPed.mes ? 'selected' : ''}>${h(mesNome(m))}</option>`).join('')}</select></label>${me.perm.todos ? `<label class="field"><span>Vendedor</span><select id="p-vend"><option value="">Todos</option>${vends.map(([id, n]) => `<option value="${h(id)}" ${fPed.v === id ? 'selected' : ''}>${h(n)}</option>`).join('')}</select></label>` : ''}</div>
    <div class="kpis">
      <div class="kpi"><b>${validos.length}</b><span>pedidos</span></div>
      <div class="kpi"><b>${brl(total)}</b><span>vendido</span></div>
      <div class="kpi"><b>${doMes.filter(p => p.status === 'entregue').length}</b><span>entregues</span></div>
    </div>
    <div class="chips">${[['todos', 'Todos'], ['andamento', 'Em andamento'], ['entregue', 'Entregues'], ['cancelado', 'Cancelados']].map(([k, t]) => `<button class="chip" data-st="${k}" aria-pressed="${fPed.st === k}">${t}</button>`).join('')}</div>
    <div class="list">${lista.length ? lista.map(p => `
      <button class="item" data-ped="${h(p.id)}">
        <div class="t"><b>${h(p.clienteNome)}</b><span>${dataBR(p.data)} · ${(p.itens || []).map(i => i.qtd + ' ' + h(i.un)).join(' + ')}${p.entregueEm ? ' · entregue ' + dataBR(p.entregueEm) : ''}</span>${me.perm.todos ? `<span style="display:block"><span class="tag ok">${h(p.vendedorNome || '—')}</span></span>` : ''}</div>
        <div class="r"><b>${brl(p.total)}</b>${pill(p.status)}${p._pend ? '<br><span class="tag y">aguardando sinal</span>' : ''}</div>
      </button>`).join('') : `<div class="empty"><img class="empty-logo" src="img/logo.png" alt=""><b>Nenhum pedido aqui</b>Toque em “+ Novo pedido” para digitar o primeiro.</div>`}</div>`;
  const pn = $('#p-novo'); if (pn) pn.onclick = () => { np = novoVazio(); vaiTab('novo'); };
  $('#p-mes').onchange = e => { fPed.mes = e.target.value; renderPedidos(); };
  const pv = $('#p-vend'); if (pv) pv.onchange = e => { fPed.v = e.target.value; renderPedidos(); };
  $$('#t-pedidos [data-st]').forEach(b => b.onclick = () => { fPed.st = b.dataset.st; renderPedidos(); });
  $$('#t-pedidos [data-ped]').forEach(b => b.onclick = () => abrePedido(b.dataset.ped));
}

// DANFE (PDF com boleto) e XML da nota, gravados pelo Portal em /anexos/<pedido>
const b64Blob = (b64, tipo) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: tipo }); };
async function anexoNota(p, qual, btn) {
  const msg = $('#sh-anx-msg'), say = t => { if (msg) msg.textContent = t; };
  const txt = btn.textContent; btn.disabled = true; btn.textContent = 'Preparando…'; say('');
  try {
    const m = await getDoc(doc(db, 'anexos', p.id));
    if (!m.exists()) { say('O DANFE desta nota ainda não chegou ao app. Aguarde alguns minutos (o Portal envia sozinho) e toque de novo.'); return; }
    const x = m.data(), nome = 'NF-' + (x.nfNumero || p.nfNumero || '');
    const arq = [];
    if (qual !== 'xml') {
      let b64 = ''; for (let i = 0; i < (x.partes || 0); i++) { const q = await getDoc(doc(db, 'anexos', p.id + '~p' + i)); if (!q.exists()) throw new Error('O PDF ainda está chegando, tente de novo em instantes.'); b64 += q.data().dados || ''; }
      if (!b64) throw new Error('PDF indisponível.');
      arq.push(new File([b64Blob(b64, 'application/pdf')], nome + '-danfe.pdf', { type: 'application/pdf' }));
    }
    if (qual !== 'danfe') { if (!x.xml) throw new Error('XML indisponível.'); arq.push(new File([new Blob([x.xml], { type: 'text/xml' })], (x.chave || nome) + '-nfe.xml', { type: 'text/xml' })); }
    if (qual === 'envia' && navigator.canShare && navigator.canShare({ files: arq })) {
      try { await navigator.share({ files: arq, title: nome, text: 'Segue a nota fiscal ' + (x.nfNumero || '') + ' — Pão de Queijo Lazinho' }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    arq.forEach((f, i) => setTimeout(() => { const u = URL.createObjectURL(f), a = document.createElement('a'); a.href = u; a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 30000); }, i * 400));
    say(qual === 'envia' ? 'Seu aparelho não abriu o compartilhamento; baixei os arquivos para você enviar.' : 'Arquivo baixado.');
  } catch (e) { say('Não consegui: ' + erroMsg(e)); }
  finally { btn.disabled = false; btn.textContent = txt; }
}

function abrePedido(id) {
  const p = pedidos.find(x => x.id === id); if (!p) return;
  const passos = [
    { on: true, t: 'Enviado em ' + dataHoraBR(p.criadoMs) },
    { on: ['recebido', 'faturado', 'entregue'].includes(p.status), t: p.numeroPortal ? 'Recebido pela Lazinho (pedido nº ' + p.numeroPortal + ')' : 'Recebido pela Lazinho' },
    { on: ['faturado', 'entregue'].includes(p.status), t: p.nfNumero ? 'Faturado — NF ' + p.nfNumero + (p.nfEmissao ? ' em ' + dataBR(p.nfEmissao) : '') : 'Faturado' },
    { on: p.status === 'entregue', t: p.entregueEm ? 'Entregue em ' + dataBR(p.entregueEm) : 'Entregue' }
  ];
  const canc = p.status === 'cancelado';
  sheet(`
    <div class="spread"><button class="btn ghost" id="sh-x">← Voltar</button>${pill(p.status)}</div>
    <div><div class="label">Pedido de ${dataBR(p.data)}</div><h2>${h(p.clienteNome)}</h2><div class="muted small">${h(docFmt(p.clienteDoc))}</div>${me.perm.todos ? `<div class="small">Vendedor: <b>${h(p.vendedorNome || '—')}</b></div>` : ''}</div>
    <div class="card">${(p.itens || []).map(i => `<div class="line"><span>${i.qtd} ${h(i.un)} · ${h(i.nome)}<br><span class="muted small">${brl(i.preco)} cada</span></span><b>${brl(i.subtotal)}</b></div>`).join('')}
      <div class="line"><b>Total</b><b>${brl(p.total)}</b></div>
      <div class="line"><span class="muted">Pagamento</span><span>${h(p.condicaoNome || '—')}</span></div>
      ${['faturado', 'entregue'].includes(p.status) && p.nfNumero ? `<div class="line"><span class="muted">Nota fiscal</span><span>NF ${h(p.nfNumero)}${p.nfEmissao ? ' · emitida ' + dataBR(p.nfEmissao) : ''}</span></div>` : ''}
      ${['faturado', 'entregue'].includes(p.status) && (p.vencimentos || []).length ? `<div class="line"><span class="muted">Vencimento${p.vencimentos.length > 1 ? 's' : ''}</span><span>${p.vencimentos.map(v => dataBR(v)).join(' · ')}</span></div>` : ''}
      ${p.dataEntrega ? `<div class="line"><span class="muted">Entrega desejada</span><span>${dataBR(p.dataEntrega)}</span></div>` : ''}
      ${p.obs ? `<div class="line"><span class="muted">Observação</span><span>${h(p.obs)}</span></div>` : ''}</div>
    ${canc ? `<div class="note crit">Pedido cancelado${p.motivoCancel ? ': ' + h(p.motivoCancel) : ''}.</div>` : `<div class="card"><div class="label" style="margin-bottom:8px">Andamento</div><ul class="steps">${passos.map(s => `<li class="${s.on ? 'on' : ''}">${h(s.t)}</li>`).join('')}</ul></div>`}
    ${p.status !== 'novo' && p.status !== 'cancelado' ? '<div class="note">Este pedido já foi recebido pela Lazinho e não pode mais ser alterado no app.</div>' : ''}
    ${p._pend ? '<div class="note warn">Este pedido ainda não subiu: está salvo no celular e envia sozinho quando houver sinal.</div>' : ''}
    ${['faturado', 'entregue'].includes(p.status) && p.nfNumero ? `<div class="card"><div class="label" style="margin-bottom:8px">Nota fiscal ${h(p.nfNumero)}</div><div class="stack">
      <button class="btn primary big" id="sh-danfe">📄 Baixar DANFE (com boleto)</button>
      <button class="btn big" id="sh-xml">🧾 Baixar XML da nota</button>
      <button class="btn wheat big" id="sh-envia">📤 Enviar DANFE + XML ao cliente</button></div><div class="muted small" id="sh-anx-msg" style="margin-top:6px"></div></div>` : ''}
    <div class="stack">
      ${p.status === 'novo' && me.perm.pedido && p.vendedorId === me.vendedorId ? '<button class="btn primary big" id="sh-edit">Editar pedido</button>' : ''}
      ${me.perm.pedido ? '<button class="btn wheat big" id="sh-rep">Repetir este pedido</button>' : ''}
      ${me.perm.visita ? '<button class="btn big" id="sh-vis">Registrar visita neste cliente</button>' : ''}
      ${p.status === 'novo' && p.vendedorId === me.vendedorId ? '<button class="btn danger big" id="sh-canc">Cancelar pedido</button>' : ''}
    </div>`);
  $('#sh-x').onclick = fechaSheet;
  const ed = $('#sh-edit'); if (ed) ed.onclick = () => { np = novoVazio(p.clienteDoc); np.editId = p.id; np.data = p.data; np.dataEntrega = p.dataEntrega || ''; np.obs = p.obs || ''; np.condicaoId = p.condicaoId || ''; np.itens = (p.itens || []).map(i => ({ key: i.prodId + '|' + i.un, qtd: String(i.qtd), preco: String(i.preco) })); fechaSheet(); vaiTab('novo'); };
  ['danfe', 'xml', 'envia'].forEach(k => { const b = $('#sh-' + k); if (b) b.onclick = () => anexoNota(p, k, b); });
  const rp = $('#sh-rep'); if (rp) rp.onclick = () => { np = novoVazio(p.clienteDoc); np.itens = (p.itens || []).map(i => ({ key: i.prodId + '|' + i.un, qtd: String(i.qtd), preco: String(i.preco) })); np.condicaoId = p.condicaoId || ''; fechaSheet(); vaiTab('novo'); };
  const vv = $('#sh-vis'); if (vv) vv.onclick = () => { fechaSheet(); abreVisita(p.clienteDoc); };
  const c = $('#sh-canc'); if (c) c.onclick = async () => {
    if (!(await confirma('Cancelar este pedido?', 'Cancelar pedido'))) return;
    updateDoc(doc(db, 'pedidos', p.id), { status: 'cancelado', canceladoEm: Date.now(), motivoCancel: 'cancelado pelo vendedor' }).then(() => toast('Pedido cancelado.')).catch(e => toast(erroMsg(e)));
    fechaSheet();
  };
}

// ---------- NOVO PEDIDO ----------
let renderNovoSePreciso = () => {};   // não redesenha enquanto digita
function renderNovo() {
  const cli = cliPor(np.clienteDoc);
  if (!np.condicaoId && condicoes.length) { const b14 = condicoes.find(c => /boleto.*14/i.test(c.nome)); np.condicaoId = (b14 || condicoes[0]).id; }
  const ini = cli ? h((cli.fantasia || cli.nome || '?').trim()[0].toUpperCase()) : '+';
  $('#t-novo').innerHTML = `
    <div class="hero"><img src="img/logo.png" alt=""><div><h2>${np.editId ? 'Editando pedido' : 'Novo pedido'}</h2><span>${np.editId ? 'Ainda não recebido pela Lazinho' : 'Escolha o cliente e os produtos'}</span></div></div>
    <button class="cli-card" id="n-cli"><span class="av">${ini}</span><span class="t"><small>Cliente</small><b>${cli ? h(cli.fantasia || cli.nome) : 'Toque para escolher o cliente'}</b>${cli ? `<small>${h(cli.municipio || '')}${cli.uf ? '/' + h(cli.uf) : ''} · ${h(docFmt(cli.doc))}</small>` : ''}</span><span class="r">›</span></button>
    <input type="search" id="n-busca" placeholder="Buscar produto ou código" autocomplete="off" value="${h(np.busca || '')}">
    ${!produtos.length ? '<div class="note warn">Os produtos ainda não foram carregados. Se acabou de instalar, aguarde alguns segundos com internet.</div>' : ''}
    <div class="catalogo" id="n-cat"></div>
    <div class="cartbar" id="n-cart" hidden><div><small id="n-cart-n"></small><b id="n-total">${brl(0)}</b></div><button class="btn wheat" id="n-rev">Revisar pedido ›</button></div>`;
  desenhaCatalogo();
  $('#n-cli').onclick = () => escolheCliente(d => { np.clienteDoc = d; renderNovo(); });
  $('#n-busca').oninput = e => { np.busca = e.target.value; desenhaCatalogo(); };
  $('#n-rev').onclick = revisaPedido;
}
renderNovoSePreciso = () => { /* produtos/condições chegaram: atualiza sem perder o que foi digitado */
  if (!$('#n-cat')) return renderNovo();
  if (document.activeElement && document.activeElement.closest('#n-cat')) return;
  desenhaCatalogo();
};
const fotoProd = p => p.foto ? `<img src="${h(p.foto)}" alt="">` : `<span class="ph">${h((p.nome || '?')[0].toUpperCase())}</span>`;
const itPor = key => np.itens.find(i => i.key === key);
function desenhaCatalogo() {
  const q = semAcento(np.busca || '');
  const lista = produtos.filter(p => !q || semAcento(p.nome + ' ' + (p.codigo || '')).includes(q)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  $('#n-cat').innerHTML = lista.length ? lista.map(p => `
    <div class="prod"><div class="ph-box">${fotoProd(p)}</div>
      <div class="pinfo"><b>${h(p.nome)}</b>${p.codigo ? `<small>Cód. ${h(p.codigo)}</small>` : ''}
        ${(p.unidades || []).map(u => { const key = p.id + '|' + u.un, it = itPor(key), q = it ? (+it.qtd || 0) : 0; return `
        <div class="un" data-key="${h(key)}"><span class="un-t"><b>${h(u.un)}</b> <span class="num">${brl(+u.preco || 0)}</span></span>
          <span class="step"><button data-d="-1" aria-label="menos" ${q ? '' : 'disabled'}>−</button><input type="number" inputmode="numeric" min="0" value="${q || ''}" placeholder="0" aria-label="quantidade"><button data-d="1" aria-label="mais">+</button></span></div>`; }).join('')}
      </div></div>`).join('') : `<div class="empty"><img class="empty-logo" src="img/logo.png" alt=""><b>${produtos.length ? 'Nenhum produto encontrado' : 'Sem produtos ainda'}</b>${produtos.length ? 'Tente outra palavra.' : 'A Lazinho ainda vai liberar o catálogo.'}</div>`;
  atualizaCarrinho();
}
function setQtd(key, q) {
  q = Math.max(0, Math.floor(+q || 0));
  np.itens = np.itens.filter(i => i.key);
  let it = itPor(key);
  if (!it) { const o = opPorKey(key); if (!o) return; it = { key, qtd: '', preco: String(o.preco) }; np.itens.push(it); }
  it.qtd = q ? String(q) : '';
  if (!q) np.itens = np.itens.filter(i => i.key !== key);
  if (!np.itens.length) np.itens = [{ key: '', qtd: '', preco: '' }];
}
$('#t-novo').addEventListener('click', e => {
  const b = e.target.closest('.un button'); if (!b) return;
  const row = b.closest('.un'), key = row.dataset.key, it = itPor(key);
  setQtd(key, (it ? +it.qtd || 0 : 0) + (+b.dataset.d));
  const q = itPor(key) ? +itPor(key).qtd : 0; row.querySelector('input').value = q || ''; row.querySelector('[data-d="-1"]').disabled = !q;
  atualizaCarrinho();
});
$('#t-novo').addEventListener('input', e => {
  const i = e.target.closest('.un input'); if (!i) return;
  const row = i.closest('.un'); setQtd(row.dataset.key, i.value); row.querySelector('[data-d="-1"]').disabled = !(+i.value > 0); atualizaCarrinho();
});
function atualizaCarrinho() {
  const L = np.itens.filter(i => i.key && +i.qtd > 0), n = L.length, t = totalNovo();
  const bar = $('#n-cart'); if (!bar) return;
  bar.hidden = !n; $('#n-cart-n').textContent = n + (n === 1 ? ' item no pedido' : ' itens no pedido'); $('#n-total').textContent = brl(t);
}
function totalNovo() { return r2(np.itens.reduce((a, it) => a + (+it.qtd || 0) * (+String(it.preco).replace(',', '.') || 0), 0)); }
function revisaPedido() {
  const L = np.itens.filter(i => i.key && +i.qtd > 0);
  if (!L.length) return toast('Escolha pelo menos um produto.');
  const cli = cliPor(np.clienteDoc);
  sheet(`
    <div class="hero"><img src="img/logo.png" alt=""><div><h2>Revisar pedido</h2><span>${cli ? h(cli.fantasia || cli.nome) : 'Escolha o cliente'}</span></div></div>
    ${cli ? '' : '<button class="btn wheat" id="r-cli">Escolher cliente</button>'}
    <div class="list">${L.map(it => { const o = opPorKey(it.key), p = produtos.find(x => x.id === (o && o.prodId)) || {}; return `
      <div class="rv" data-key="${h(it.key)}"><div class="ph-box sm">${fotoProd(p)}</div>
        <div class="rv-t"><b>${h(o ? o.nome : it.key)}</b><small>${h(o ? o.un : '')} · ${it.qtd} un.</small></div>
        <label class="rv-p"><small>Preço</small><input type="number" inputmode="decimal" min="0" step="0.01" value="${h(it.preco)}" ${me.perm.preco ? '' : 'readonly'}></label>
        <b class="num rv-s">${brl(r2((+it.qtd || 0) * (+String(it.preco).replace(',', '.') || 0)))}</b></div>`; }).join('')}</div>
    <div class="total"><span>Total</span><span id="r-total">${brl(totalNovo())}</span></div>
    <label class="field"><span>Pagamento</span><select id="n-cond">${condicoes.map(c => `<option value="${h(c.id)}" ${c.id === np.condicaoId ? 'selected' : ''}>${h(c.nome)}</option>`).join('')}</select></label>
    <div class="grid2" style="gap:10px">
      <label class="field"><span>Data do pedido</span><input type="date" id="n-data" value="${h(np.data)}"></label>
      <label class="field"><span>Entrega desejada (opcional)</span><input type="date" id="n-ent" value="${h(np.dataEntrega)}"></label>
    </div>
    <label class="field"><span>Observação</span><textarea id="n-obs" placeholder="Ex.: entregar pela manhã">${h(np.obs)}</textarea></label>
    <button class="btn primary big" id="n-salvar">${np.editId ? 'Salvar alterações' : 'Enviar pedido'}</button>
    <button class="btn ghost" id="r-volta">‹ Voltar e continuar escolhendo</button>
    <button class="btn ghost danger" id="n-limpa">${np.editId ? 'Cancelar edição' : 'Limpar tudo'}</button>`);
  const rc = $('#r-cli'); if (rc) rc.onclick = () => escolheCliente(d => { np.clienteDoc = d; revisaPedido(); });
  $$('#sheet .rv').forEach(row => row.querySelector('input').addEventListener('input', e => {
    const it = itPor(row.dataset.key); it.preco = e.target.value;
    row.querySelector('.rv-s').textContent = brl(r2((+it.qtd || 0) * (+String(it.preco).replace(',', '.') || 0))); $('#r-total').textContent = brl(totalNovo());
  }));
  $('#n-cond').onchange = e => np.condicaoId = e.target.value;
  $('#n-data').onchange = e => np.data = e.target.value;
  $('#n-ent').onchange = e => np.dataEntrega = e.target.value;
  $('#n-obs').oninput = e => np.obs = e.target.value;
  $('#r-volta').onclick = () => { fechaSheet(); renderNovo(); };
  $('#n-limpa').onclick = async () => { if (await confirma(np.editId ? 'Cancelar a edição? As alterações serão descartadas.' : 'Limpar o pedido em digitação?', 'Sim')) { const ed = np.editId; np = novoVazio(); fechaSheet(); if (ed) vaiTab('pedidos'); else renderNovo(); } };
  $('#n-salvar').onclick = () => salvaPedido();
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
  if (np.editId) {
    const { origem, uid, vendedorId, vendedorNome, status, criadoMs, criadoEm, ...campos } = reg;
    updateDoc(doc(db, 'pedidos', np.editId), { ...campos, atualizadoMs: Date.now() }).catch(e => toast(erroMsg(e)));
    toast('Pedido alterado.');
  } else {
    setDoc(doc(db, 'pedidos', id), reg).catch(e => toast(erroMsg(e)));
    // pedido para um contato do funil = virou cliente
    const lf = leads.find(x => x.etapa !== 'cliente' && x.clienteDoc && soDig(x.clienteDoc) === soDig(cli.doc));
    if (lf) gravaLead(lf, { etapa: 'cliente' }, [histItem('etapa', 'Virou cliente (pedido de ' + brl(total) + ')')]);
    toast('Pedido de ' + brl(total) + ' salvo' + (navigator.onLine ? ' e enviado.' : ' no celular. Envia quando houver sinal.'));
  }
  np = novoVazio(); fechaSheet(); fPed.mes = mesDe(reg.data); fPed.st = 'todos'; vaiTab('pedidos');
}

// ---------- escolher cliente ----------
function escolheCliente(cb) {
  let q = '';
  const el = $('#sheet');
  const draw = () => {
    const t = semAcento(q), dig = q.replace(/\D/g, '');
    const l = clientes.filter(c => !t || buscaTxt(c).includes(t) || (dig.length >= 3 && c.doc.includes(dig)));
    $('#cl-lista').innerHTML = l.slice(0, 80).map(c => {
      const r = resumo[c.doc] || {};
      return `<button class="item" data-d="${h(c.doc)}"><div class="t"><b>${h(c.fantasia || c.nome)}</b>${c.fantasia ? `<span>${h(c.nome)}</span>` : ''}<span>${h(endLinha(c))}</span><span>${h(c.municipio || '')}${c.uf ? '/' + h(c.uf) : ''} · ${h(docFmt(c.doc))}</span>${me.perm.todos ? `<span><span class="tag ${c.vendedorId && c.vendedorId !== 'venda-direta' ? 'ok' : 'y'}">${h(c.vendedorNome || 'sem vendedor')}</span></span>` : ''}</div><div class="r">${r.ultima ? '<span class="small muted">última ' + dataBR(r.ultima) + '<br>' + brl(r.ultimoValor) + '</span>' : '<span class="small muted">sem compra</span>'}</div></button>`;
    }).join('') || '<div class="empty"><img class="empty-logo" src="img/logo.png" alt=""><b>Nenhum cliente encontrado</b>' + (me.perm.cliente ? 'Use “+ Novo cliente” na aba Clientes.' : 'Se for cliente novo, peça o cadastro à Lazinho.') + '</div>';
    if (l.length > 80) $('#cl-lista').insertAdjacentHTML('beforeend', `<div class="muted small" style="text-align:center">Mostrando 80 de ${l.length}. Digite mais letras para filtrar.</div>`);
    $$('#cl-lista [data-d]').forEach(b => b.onclick = () => { fechaSheet(); cb(b.dataset.d); });
  };
  sheet(`<div class="spread"><button class="btn ghost" id="cl-x">← Voltar</button><h3>Escolher cliente</h3><span></span></div>
    ${me.perm.cliente ? '<button class="btn" id="cl-novo">+ Cadastrar cliente novo</button>' : ''}<input type="search" id="cl-q" placeholder="Buscar por nome, cidade ou CNPJ" autocomplete="off"><div class="list" id="cl-lista"></div>`);
  const cnv = $('#cl-novo'); if (cnv) cnv.onclick = () => abreNovoCliente();
  $('#cl-x').onclick = fechaSheet; $('#cl-q').oninput = e => { q = e.target.value; draw(); }; draw(); setTimeout(() => $('#cl-q').focus(), 200);
}

// ---------- CLIENTES ----------
function renderClientes() {
  const mes = ymd().slice(0, 7), t = semAcento(fCli.q), dig = fCli.q.replace(/\D/g, '');
  const compMes = c => ((resumo[c.doc] || {}).mes === mes && (+(resumo[c.doc] || {}).mesTotal || 0) > 0);
  let l = clientes.filter(c => !t || buscaTxt(c).includes(t) || (dig.length >= 3 && c.doc.includes(dig)));
  const nComp = clientes.filter(compMes).length;
  if (fCli.f === 'comprou') l = l.filter(compMes); else if (fCli.f === 'nao') l = l.filter(c => !compMes(c));
  $('#t-clientes').innerHTML = `
    <div class="hero"><img src="img/logo.png" alt=""><div style="flex:1"><h2>Clientes</h2><span>${me.perm.todos ? 'Todos os clientes' : 'Seus clientes'} · última venda</span></div>${me.perm.cliente ? '<button class="btn wheat sm" id="c-novo">+ Novo</button>' : ''}</div>
    <input type="search" id="c-q" placeholder="Buscar por nome, cidade ou CNPJ" value="${h(fCli.q)}" autocomplete="off">
    <div class="chips">${[['todos', 'Todos (' + clientes.length + ')'], ['comprou', 'Compraram em ' + mesNome(mes).split('/')[0] + ' (' + nComp + ')'], ['nao', 'Não compraram no mês']].map(([k, tt]) => `<button class="chip" data-f="${k}" aria-pressed="${fCli.f === k}">${tt}</button>`).join('')}</div>
    <div class="list" id="c-lista">${l.slice(0, 120).map(c => { const r = resumo[c.doc] || {};
      return `<button class="item" data-d="${h(c.doc)}"><div class="t"><b>${h(c.fantasia || c.nome)}${c.novo ? ' <span class="tag y">novo</span>' : ''}</b>${c.fantasia ? `<span>${h(c.nome)}</span>` : ''}<span>${h(endLinha(c))}</span><span>${h(c.municipio || '')}${c.uf ? '/' + h(c.uf) : ''}</span>${me.perm.todos ? `<span><span class="tag ${c.vendedorId && c.vendedorId !== 'venda-direta' ? 'ok' : 'y'}">${h(c.vendedorNome || 'sem vendedor')}</span></span>` : ''}</div>
      <div class="r">${r.ultima ? `<b>${dataBR(r.ultima)}</b><span class="muted">${brl(r.ultimoValor)}</span>` : '<span class="muted">sem compra</span>'}${compMes(c) ? '<br><span class="tag ok">comprou no mês</span>' : ''}</div></button>`; }).join('') || '<div class="empty"><img class="empty-logo" src="img/logo.png" alt=""><b>Nenhum cliente</b>Os clientes aparecem depois da carga feita pela Lazinho.</div>'}</div>
    ${l.length > 120 ? `<div class="muted small" style="text-align:center">Mostrando 120 de ${l.length}. Use a busca.</div>` : ''}`;
  const cn = $('#c-novo'); if (cn) cn.onclick = () => abreNovoCliente();
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
    <div><h2>${h(c.fantasia || c.nome)}</h2><div class="muted small">${h(c.nome)} · ${h(docFmt(c.doc))}</div>${me.perm.todos ? `<div class="small">Vendedor: <b>${h(c.vendedorNome || 'sem vendedor')}</b></div>` : ''}</div>
    <div class="card">
      ${end ? `<div class="line"><span class="muted">Endereço</span><span style="text-align:right">${h(end)}<br>${h(c.municipio || '')}${c.uf ? '/' + h(c.uf) : ''}</span></div>` : ''}
      ${c.fone ? `<div class="line"><span class="muted">Telefone</span><a href="tel:${h(c.fone)}">${h(c.fone)}</a></div>` : ''}
    </div>
    <div class="kpis"><div class="kpi"><b>${r.ultima ? dataBR(r.ultima) : '—'}</b><span>última venda</span></div><div class="kpi"><b>${r.ultima ? brl(r.ultimoValor) : '—'}</b><span>valor</span></div><div class="kpi"><b>${r.mes === mes ? brl(r.mesTotal) : brl(0)}</b><span>no mês</span></div></div>
    ${(r.hist || []).length ? `<div class="card"><div class="label" style="margin-bottom:6px">Últimas compras</div>${r.hist.slice(0, 8).map(x => `<div class="line"><span>${dataBR(x.data)}${x.itens ? ' · ' + h(x.itens) : ''}</span><b>${brl(x.total)}</b></div>`).join('')}</div>` : ''}
    ${peds.length ? `<div class="card"><div class="label" style="margin-bottom:6px">Meus pedidos neste cliente</div>${peds.map(p => `<div class="line"><span>${dataBR(p.data)} · ${pill(p.status)}</span><b>${brl(p.total)}</b></div>`).join('')}</div>` : ''}
    ${vis.length ? `<div class="card"><div class="label" style="margin-bottom:6px">Minhas visitas</div>${vis.map(v => `<div class="line"><span>${dataBR(v.data)}${v.obs ? ' · ' + h(v.obs.slice(0, 40)) : ''}</span><button class="btn ghost sm" data-v="${h(v.id)}">ver</button></div>`).join('')}</div>` : ''}
    ${me.perm.pedido ? '<button class="btn primary big" id="sh-ped">Novo pedido para este cliente</button>' : ''}
    ${me.perm.visita ? '<button class="btn wheat big" id="sh-vis">Registrar visita</button>' : ''}`);
  $('#sh-x').onclick = fechaSheet;
  const sp = $('#sh-ped'); if (sp) sp.onclick = () => { np = novoVazio(d); fechaSheet(); vaiTab('novo'); };
  const sv = $('#sh-vis'); if (sv) sv.onclick = () => { fechaSheet(); abreVisita(d); };
  $$('#sheet [data-v]').forEach(b => b.onclick = () => abreDetalheVisita(b.dataset.v));
}

// ---------- NOVO CLIENTE (só com permissão) ----------
function abreNovoCliente(pre = {}, apos = null) {
  const campo = (id, rot, ph = '', tipo = 'text') => `<label class="field"><span>${rot}</span><input type="${tipo}" id="${id}" placeholder="${ph}" autocomplete="off"></label>`;
  sheet(`<div class="spread"><button class="btn ghost" id="nc-x">← Voltar</button><h3>Novo cliente</h3><span></span></div>
    <div class="note">Cadastro enviado à Lazinho. Você já pode digitar pedido para este cliente. Conferimos os dados fiscais depois.</div>
    ${campo('nc-doc', 'CNPJ ou CPF *', 'somente números')}
    <button class="btn" id="nc-busca">Buscar dados pelo CNPJ</button><span class="muted small" id="nc-msg"></span>
    ${campo('nc-nome', 'Razão social / nome *')}${campo('nc-fant', 'Nome fantasia')}${campo('nc-fone', 'Telefone', '(24) 99999-9999', 'tel')}${campo('nc-mail', 'E-mail', '', 'email')}
    ${campo('nc-cep', 'CEP')}${campo('nc-log', 'Rua / avenida')}${campo('nc-num', 'Número')}${campo('nc-bai', 'Bairro')}${campo('nc-mun', 'Município *')}${campo('nc-uf', 'UF *', 'MG')}
    <button class="btn primary big" id="nc-salvar">Salvar cliente</button>`);
  const v = id => $('#' + id).value.trim();
  Object.entries({ 'nc-nome': pre.nome, 'nc-fone': pre.fone, 'nc-cep': pre.cep, 'nc-log': pre.log, 'nc-num': pre.num, 'nc-bai': pre.bai, 'nc-mun': pre.mun, 'nc-uf': pre.uf }).forEach(([k, val]) => { if (val) $('#' + k).value = val; });
  $('#nc-x').onclick = fechaSheet;
  $('#nc-busca').onclick = async () => {
    const d = v('nc-doc').replace(/\D/g, ''); const m = $('#nc-msg');
    if (d.length !== 14) { m.textContent = 'Digite os 14 números do CNPJ.'; return; }
    m.textContent = 'Buscando…';
    try {
      const r = await fetch('https://brasilapi.com.br/api/cnpj/v1/' + d); if (!r.ok) throw new Error('não encontrado');
      const j = await r.json();
      $('#nc-nome').value = j.razao_social || ''; $('#nc-fant').value = j.nome_fantasia || ''; $('#nc-cep').value = String(j.cep || '').replace(/\D/g, '');
      $('#nc-log').value = [j.descricao_tipo_de_logradouro, j.logradouro].filter(Boolean).join(' '); $('#nc-num').value = j.numero || ''; $('#nc-bai').value = j.bairro || '';
      $('#nc-mun').value = j.municipio || ''; $('#nc-uf').value = j.uf || ''; if (j.ddd_telefone_1) $('#nc-fone').value = j.ddd_telefone_1; m.textContent = 'Dados preenchidos. Confira.';
    } catch (e) { m.textContent = 'Não consegui buscar. Preencha à mão.'; }
  };
  $('#nc-salvar').onclick = () => {
    const d = v('nc-doc').replace(/\D/g, ''), nome = v('nc-nome'), mun = v('nc-mun'), uf = v('nc-uf').toUpperCase();
    if (d.length !== 11 && d.length !== 14) return toast('CNPJ (14) ou CPF (11 números).');
    if (!nome || !mun || uf.length !== 2) return toast('Preencha nome, município e UF.');
    if (clientes.some(c => c.doc === d)) return toast('Esse cliente já está cadastrado.');
    const reg = { doc: d, nome, fantasia: v('nc-fant'), fone: v('nc-fone'), email: v('nc-mail'), cep: v('nc-cep').replace(/\D/g, ''), logradouro: v('nc-log'), numero: v('nc-num'), bairro: v('nc-bai'), municipio: mun, uf, vendedorId: me.vendedorId, vendedorNome: me.nome, uid: me.uid, status: 'novo', criadoMs: Date.now() };
    setDoc(doc(db, 'clientesNovos', d), reg).catch(e => toast(erroMsg(e)));
    if (!clientesNovos.some(c => c.doc === d)) { clientesNovos.push({ ...reg, doc: d }); juntaClientes(); }
    toast('Cliente salvo. Já pode digitar pedido para ele.'); fechaSheet();
    if (apos) apos(d);
  };
}


// ---------- FUNIL DE VENDAS (só supervisores) ----------
const ETAPAS = [['a_contatar', 'A contatar'], ['contato', 'Contato feito'], ['cliente', 'Virou cliente'], ['perdido', 'Não rolou']];
const etapaDe = e => (e === 'amostra' || e === 'negociando') ? 'contato' : (e || 'a_contatar');
const TIPOS = [['padaria', 'Padaria'], ['supermercado', 'Supermercado'], ['minimercado', 'Minimercado / mercearia'], ['restaurante', 'Restaurante'], ['lanchonete', 'Lanchonete / cafeteria'], ['acougue', 'Açougue / empório'], ['outro', 'Outro']];
const nomeEtapa = k => (ETAPAS.find(e => e[0] === k) || ['', k || ''])[1];
const nomeTipo = k => (TIPOS.find(e => e[0] === (k || 'padaria')) || ['', k || ''])[1];
const soDig = t => String(t || '').replace(/\D/g, '');
const waNum = l => { let d = soDig(l.telefone); if (!d) return ''; if (d.length <= 11) d = '55' + d; return d; };
const igUser = v => String(v || '').trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').split(/[\/?#\s]/)[0].replace(/[^A-Za-z0-9._]/g, '');
const primeiroNome = () => String(me.nome || '').trim().split(/\s+/)[0];
const MSG_BASE = 'Olá, tudo bem? Meu nome é {vendedor}, sou do Pão de Queijo Lazinho, pão de queijo congelado com receita tradicional de Minas. Gostaria de apresentar nosso produto para {nome}. Posso te mandar o catálogo e combinar uma amostra?';
const chMsg = () => 'lz-msg-' + (me.uid || me.vendedorId), chCat = () => 'lz-cat-' + (me.uid || me.vendedorId);
const msgModelo = () => lsGet(chMsg()) || MSG_BASE;
const msgPara = (modelo, l) => modelo.split('{nome}').join(l.nome || '').split('{vendedor}').join(primeiroNome());
// catálogo anexado fica guardado no celular (IndexedDB), só neste aparelho
const idb = () => new Promise((ok, er) => { const r = indexedDB.open('lazinho-anexos', 1); r.onupgradeneeded = () => r.result.createObjectStore('f'); r.onsuccess = () => ok(r.result); r.onerror = () => er(r.error); });
const anexoGet = async () => { try { const d = await idb(); return await new Promise(ok => { const q = d.transaction('f').objectStore('f').get(chCat()); q.onsuccess = () => ok(q.result || null); q.onerror = () => ok(null); }); } catch (e) { return null; } };
const anexoSet = async f => { try { const d = await idb(); await new Promise((ok, er) => { const t = d.transaction('f', 'readwrite'); f ? t.objectStore('f').put(f, chCat()) : t.objectStore('f').delete(chCat()); t.oncomplete = ok; t.onerror = () => er(t.error); }); return true; } catch (e) { return false; } };
const proxTag = l => { if (!l.proximoContato || l.etapa === 'cliente' || l.etapa === 'perdido') return ''; const hj = ymd(); const c = l.proximoContato < hj ? 'no' : l.proximoContato === hj ? 'y' : ''; return `<span class="tag ${c}">${l.proximoContato < hj ? 'Atrasado · ' : l.proximoContato === hj ? 'Hoje · ' : 'Retorno '}${dataBR(l.proximoContato)}</span>`; };

function renderFunil() {
  const hj = ymd(), ativos = leads.filter(l => l.etapa !== 'cliente' && l.etapa !== 'perdido');
  const atras = ativos.filter(l => l.proximoContato && l.proximoContato <= hj).length;
  const cnt = k => leads.filter(l => l.etapa === k).length;
  const t = semAcento(fFun.q);
  const cidades = [...new Set(leads.map(l => l.cidade).filter(Boolean))].sort();
  const ord = (a, b) => (a.proximoContato || '9999').localeCompare(b.proximoContato || '9999') || (soDig(b.telefone) ? 1 : 0) - (soDig(a.telefone) ? 1 : 0) || String(a.nome).localeCompare(String(b.nome), 'pt-BR');
  const l = leads.filter(x => (fFun.e === 'todos' || x.etapa === fFun.e) && (!fFun.t || (x.tipo || 'padaria') === fFun.t) && (!fFun.c || x.cidade === fFun.c)
    && (!t || semAcento([x.nome, x.bairro, x.cidade, x.telefone, x.endereco, x.contato].join(' ')).includes(t))).sort(ord);
  const opt = (arr, cur, todos) => `<option value="">${todos}</option>` + arr.map(([v, n]) => `<option value="${h(v)}" ${cur === v ? 'selected' : ''}>${h(n)}</option>`).join('');
  $('#t-funil').innerHTML = `
    <div class="hero"><img src="img/logo.png" alt=""><div style="flex:1"><h2>Funil de vendas</h2><span>Prospecção · ${leads.length} contatos</span></div><button class="btn wheat sm" id="f-novo">+ Novo</button></div>
    <div class="kpis"><div class="kpi"><b>${cnt('a_contatar')}</b><span>a contatar</span></div><div class="kpi"><b>${cnt('contato')}</b><span>contato feito</span></div><div class="kpi"><b style="${atras ? 'color:var(--crit)' : ''}">${atras}</b><span>retornos hoje/atrasados</span></div></div>
    <input type="search" id="f-q" placeholder="Buscar nome, bairro, telefone…" value="${h(fFun.q)}" autocomplete="off">
    <div class="chips">${[['todos', 'Todos (' + leads.length + ')'], ...ETAPAS.map(([k, n]) => [k, n + ' (' + cnt(k) + ')'])].map(([k, n]) => `<button class="chip" data-e="${k}" aria-pressed="${fFun.e === k}">${h(n)}</button>`).join('')}</div>
    <div class="row2"><label class="field"><span>Segmento</span><select id="f-t">${opt(TIPOS.map(([k, n]) => [k, n + ' (' + leads.filter(x => (x.tipo || 'padaria') === k).length + ')']), fFun.t, 'Todos (' + leads.length + ')')}</select></label><label class="field"><span>Cidade</span><select id="f-c">${opt(cidades.map(c => [c, c]), fFun.c, 'Todas')}</select></label></div>
    <div class="list">${l.slice(0, fFun.mais).map(x => `<button class="item" data-lead="${h(x.id)}"><div class="t"><b>${h(x.nome)}</b><span style="display:block">${h([x.bairro, x.cidade].filter(Boolean).join(' · '))}</span><span style="display:block">${x.telefone ? h(x.telefone) : 'sem telefone'}</span><span style="display:block;margin-top:4px"><span class="tag">${h(nomeTipo(x.tipo))}</span> <span class="tag ${x.etapa === 'cliente' ? 'ok' : x.etapa === 'perdido' ? 'no' : 'y'}">${h(nomeEtapa(x.etapa))}</span></span></div><div class="r">${proxTag(x)}</div></button>`).join('')
      || '<div class="empty"><img class="empty-logo" src="img/logo.png" alt=""><b>Nenhum contato</b>Os contatos aparecem depois da carga feita pela Lazinho. Use “+ Novo” para cadastrar.</div>'}</div>
    ${l.length > fFun.mais ? `<button class="btn big" id="f-mais">Mostrar mais (${l.length - fFun.mais})</button>` : ''}`;
  $('#f-novo').onclick = () => abreLead('');
  $('#f-q').oninput = e => { fFun.q = e.target.value; fFun.mais = 60; const p = e.target.selectionStart; renderFunil(); const i = $('#f-q'); i.focus(); i.setSelectionRange(p, p); };
  $('#f-t').onchange = e => { fFun.t = e.target.value; fFun.mais = 60; renderFunil(); };
  $('#f-c').onchange = e => { fFun.c = e.target.value; fFun.mais = 60; renderFunil(); };
  $$('#t-funil [data-e]').forEach(b => b.onclick = () => { fFun.e = b.dataset.e; fFun.mais = 60; renderFunil(); });
  $$('#t-funil [data-lead]').forEach(b => b.onclick = () => abreLead(b.dataset.lead));
  const fm = $('#f-mais'); if (fm) fm.onclick = () => { fFun.mais += 60; renderFunil(); };
}
function gravaLead(l, campos, extraHist) {
  const reg = { ...l, ...campos, pendente: true, atualizadoMs: Date.now(), atualizadoPor: me.nome };
  delete reg.id;
  reg.historico = (l.historico || []).concat(extraHist || []);
  if (!leads.some(x => x.id === l.id)) { reg.criadoEm = new Date().toISOString(); reg.origem = 'Cadastrado no app por ' + me.nome; }
  setDoc(doc(db, 'leads', l.id), reg).catch(e => toast(erroMsg(e)));
  return reg;
}
const histItem = (tipo, texto) => ({ data: new Date().toISOString(), tipo, texto: texto + ' — ' + primeiroNome() });
function abreLead(id) {
  const novo = !id;
  const l = novo ? { id: 'lead-app-' + Date.now().toString(36), nome: '', tipo: 'padaria', cidade: '', bairro: '', endereco: '', telefone: '', instagram: '', contato: '', porte: 'pequena', etapa: 'a_contatar', proximoContato: '', obs: '', historico: [] } : leads.find(x => x.id === id);
  if (!l) return;
  const wa = waNum(l), ig = igUser(l.instagram), maps = l.lat ? `https://www.google.com/maps/search/?api=1&query=${l.lat},${l.lng}` : (l.endereco ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(l.nome + ' ' + l.endereco + ' ' + (l.cidade || '')) : '');
  const campo = (i, rot, val, tipo = 'text', ph = '') => `<label class="field"><span>${rot}</span><input type="${tipo}" id="${i}" value="${h(val || '')}" placeholder="${ph}" autocomplete="off"></label>`;
  sheet(`<div class="spread"><button class="btn ghost" id="lf-x">← Voltar</button><h3>${novo ? 'Novo contato' : h(l.nome)}</h3><span></span></div>
    ${novo ? '' : `<div><span class="tag">${h(nomeTipo(l.tipo))}</span> <span class="tag y">${h(nomeEtapa(l.etapa))}</span> ${proxTag(l)}</div>
    <div class="row2">${l.telefone ? `<a class="btn" href="tel:${h(soDig(l.telefone))}">Ligar</a>` : ''}${ig ? `<a class="btn" target="_blank" rel="noopener" href="https://ig.me/m/${h(ig)}">Instagram</a>` : ''}${maps ? `<a class="btn" target="_blank" rel="noopener" href="${h(maps)}">Mapa</a>` : ''}</div>`}
    ${novo || !wa ? '' : `<div class="card"><div class="label" style="margin-bottom:6px">Mensagem de WhatsApp</div>
      <label class="field"><span>Sua mensagem padrão (se mudar, vale para os próximos clientes)</span><textarea id="lw-msg" rows="5">${h(msgPara(msgModelo(), l))}</textarea></label>
      <label class="field"><span>Link do catálogo (opcional, vai no fim da mensagem)</span><input type="url" id="lw-cat" value="${h(lsGet(chCat()) || "")}" placeholder="https://…" autocomplete="off"></label>
      <div class="muted small" id="lw-anexo"></div>
      <div class="row2"><label class="btn" style="text-align:center">📎 Anexar catálogo<input type="file" id="lw-file" accept="application/pdf,image/*" hidden></label><button class="btn ghost" id="lw-orig" type="button">Mensagem original</button></div>
      <button class="btn primary big" id="lw-enviar" type="button">Enviar no WhatsApp</button></div>`}
    <div class="card"><div class="label" style="margin-bottom:6px">Andamento</div>
      <label class="field"><span>Etapa</span><select id="lf-etapa">${ETAPAS.map(([k, n]) => `<option value="${k}" ${l.etapa === k ? 'selected' : ''}>${h(n)}</option>`).join('')}</select></label>
      ${campo('lf-prox', 'Próximo contato', l.proximoContato, 'date')}
      <label class="field"><span>Observações</span><textarea id="lf-obs">${h(l.obs || '')}</textarea></label></div>
    <div class="card"><div class="label" style="margin-bottom:6px">Dados do estabelecimento</div>
      ${campo('lf-nome', 'Nome *', l.nome)}
      <label class="field"><span>Tipo de estabelecimento</span><select id="lf-tipo">${TIPOS.map(([k, n]) => `<option value="${k}" ${(l.tipo || 'padaria') === k ? 'selected' : ''}>${h(n)}</option>`).join('')}</select></label>
      ${campo('lf-tel', 'Telefone / WhatsApp', l.telefone, 'tel')}${campo('lf-ig', 'Instagram', l.instagram, 'text', '@usuario')}${campo('lf-contato', 'Falar com', l.contato, 'text', 'Dono, gerente…')}
      ${campo('lf-end', 'Endereço', l.endereco)}${campo('lf-bai', 'Bairro', l.bairro)}${campo('lf-cid', 'Cidade', l.cidade)}</div>
    <button class="btn primary big" id="lf-salvar">${novo ? 'Cadastrar contato' : 'Salvar alterações'}</button>
    ${novo ? '' : `<div class="card"><div class="label" style="margin-bottom:6px">Registrar contato</div>
      <label class="field"><span>Como foi</span><select id="lh-tipo"><option>WhatsApp</option><option>Instagram</option><option>Ligação</option><option>Visita</option><option>Amostra entregue</option><option>Outro</option></select></label>
      ${campo('lh-prox', 'Retornar em', '', 'date')}
      <label class="field"><span>O que foi conversado</span><textarea id="lh-txt" placeholder="Ex.: falei com o dono, pediu amostra para sexta"></textarea></label>
      <button class="btn wheat big" id="lh-ok">Registrar contato</button></div>
    ${l.etapa !== 'cliente' ? '<button class="btn primary big" id="lf-virou">✅ Virou cliente — cadastrar e fazer pedido</button>' : (l.clienteDoc ? '<button class="btn primary big" id="lf-pedido">Fazer pedido para este cliente</button>' : '')}
    <div class="card"><div class="label" style="margin-bottom:6px">Histórico</div>${(l.historico || []).slice().reverse().map(x => `<div class="line" style="display:block"><span class="muted small">${h(dataHoraBR(Date.parse(x.data)))} · ${h(x.tipo)}</span><br>${h(x.texto)}</div>`).join('') || '<div class="muted small">Nenhum contato registrado ainda.</div>'}</div>`}`);
  const v = i => $('#' + i).value.trim();
  $('#lf-x').onclick = fechaSheet;
  const dados = () => ({ nome: v('lf-nome'), tipo: v('lf-tipo'), telefone: v('lf-tel'), instagram: igUser(v('lf-ig')), contato: v('lf-contato'), endereco: v('lf-end'), bairro: v('lf-bai'), cidade: v('lf-cid'), etapa: v('lf-etapa'), proximoContato: v('lf-prox'), obs: $('#lf-obs').value.trim() });
  $('#lf-salvar').onclick = () => {
    const d = dados(); if (!d.nome) return toast('Escreva o nome do estabelecimento.');
    const hist = d.etapa !== l.etapa && !novo ? [histItem('etapa', 'Etapa: ' + nomeEtapa(l.etapa) + ' → ' + nomeEtapa(d.etapa))] : [];
    gravaLead(l, d, hist); toast(novo ? 'Contato cadastrado.' : 'Alterações salvas.'); fechaSheet();
  };
  const lwm = $('#lw-msg'); if (lwm) {
    const textoFinal = () => { const c = ($('#lw-cat').value || '').trim(); return lwm.value.trim() + (c ? '\n' + c : ''); };
    const guarda = () => { let m = lwm.value.trim(); if (l.nome) m = m.split(l.nome).join('{nome}'); const pv = primeiroNome(); if (pv) m = m.split(pv).join('{vendedor}'); lsSet(chMsg(), m === MSG_BASE ? '' : m); lsSet(chCat(), ($('#lw-cat').value || '').trim()); };
    let anexo = null;
    const mostra = () => { $('#lw-anexo').innerHTML = anexo ? '📎 ' + h(anexo.name) + ' <button class="btn ghost sm" id="lw-rm" type="button">remover</button>' : 'Sem arquivo anexado.'; const rm = $('#lw-rm'); if (rm) rm.onclick = async () => { await anexoSet(null); anexo = null; mostra(); }; };
    anexoGet().then(f => { anexo = f; mostra(); });
    $('#lw-file').onchange = async e => { const f = e.target.files[0]; if (!f) return; if (f.size > 15e6) return toast('Arquivo grande demais (máx. 15 MB).'); if (await anexoSet(f)) { anexo = f; mostra(); toast('Catálogo guardado neste celular.'); } else toast('Não consegui guardar o arquivo.'); };
    $('#lw-orig').onclick = () => { lsSet(chMsg(), ''); lwm.value = msgPara(MSG_BASE, l); toast('Mensagem original restaurada.'); };
    $('#lw-enviar').onclick = async () => {
      guarda(); const txt = textoFinal();
      const reg = () => gravaLead(l, {}, [histItem('WhatsApp', 'Mensagem enviada pelo app' + (anexo ? ' com catálogo anexo' : ''))]);
      if (anexo && navigator.canShare && navigator.canShare({ files: [anexo] })) {
        try { await navigator.share({ files: [anexo], text: txt }); reg(); return; } catch (e) { if (e && e.name === 'AbortError') return; }
      }
      if (anexo) toast('Este celular não deixa anexar direto: mandei só o texto. Anexe o catálogo na conversa.');
      reg(); window.open('https://wa.me/' + wa + '?text=' + encodeURIComponent(txt), '_blank');
    };
  }
  const ok = $('#lh-ok'); if (ok) ok.onclick = () => {
    const txt = v('lh-txt'); if (!txt) return toast('Escreva o que foi conversado.');
    const d = dados(); const prox = v('lh-prox'); if (prox) d.proximoContato = prox;
    const hist = [histItem(v('lh-tipo'), txt)]; if (d.etapa === 'a_contatar') { d.etapa = 'contato'; hist.push(histItem('etapa', 'Etapa: A contatar → Contato feito')); }
    gravaLead(l, d, hist); toast('Contato registrado.'); abreLead(l.id);
  };
  const vc = $('#lf-virou'); if (vc) vc.onclick = () => {
    const d = dados(); if (!d.nome) return toast('Escreva o nome do estabelecimento.');
    const m = /^(.*?),\s*(\d[\w\/-]*)\s*$/.exec(d.endereco || '');
    abreNovoCliente({ nome: d.nome.toUpperCase(), fone: d.telefone, log: m ? m[1] : d.endereco, num: m ? m[2] : '', bai: d.bairro, mun: d.cidade, uf: 'RJ' }, cd => {
      gravaLead(l, { ...d, etapa: 'cliente', clienteDoc: cd }, [histItem('etapa', 'Virou cliente (CNPJ/CPF ' + docFmt(cd) + ')')]);
      np = novoVazio(cd); vaiTab('novo');
    });
  };
  const fp = $('#lf-pedido'); if (fp) fp.onclick = () => { np = novoVazio(l.clienteDoc); fechaSheet(); vaiTab('novo'); };
}

// ---------- VISITAS ----------
function renderVisitas() {
  const meses = [...new Set([ymd().slice(0, 7), ...visitas.map(v => mesDe(v.data))])].sort().reverse();
  if (!meses.includes(fVis.mes)) fVis.mes = meses[0];
  const l = visitas.filter(v => mesDe(v.data) === fVis.mes);
  $('#t-visita').innerHTML = `
    <div class="hero"><img src="img/logo.png" alt=""><div><h2>Visitas</h2><span>Fotos, preços e estoque no cliente</span></div></div>
    <button class="btn primary big" id="v-nova">📍 Registrar visita</button>
    <label class="field"><span>Mês</span><select id="v-mes">${meses.map(m => `<option value="${m}" ${m === fVis.mes ? 'selected' : ''}>${h(mesNome(m))}</option>`).join('')}</select></label>
    <div class="muted small">${l.length} visita(s) no mês</div>
    <div class="list">${l.map(v => `<button class="item" data-v="${h(v.id)}"><div class="t"><b>${h(v.clienteNome)}</b>${me.perm.todos ? ` <span class="tag ok">${h(v.vendedorNome || '')}</span>` : ''}<span>${dataBR(v.data)} ${new Date(v.criadoMs || 0).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · ${(v.fotos || []).length} foto(s)${(v.precos || []).length ? ' · ' + v.precos.length + ' preço(s)' : ''}</span></div><div class="r">${v._pend ? '<span class="tag y">aguardando sinal</span>' : (v.estoqueIni || []).length && !(v.estoqueFim || []).length ? '<span class="tag y">falta estoque final</span>' : '›'}</div></button>`).join('') || '<div class="empty"><img class="empty-logo" src="img/logo.png" alt=""><b>Nenhuma visita neste mês</b>Registre a visita no cliente com fotos, preços e estoque.</div>'}</div>`;
  $('#v-nova').onclick = () => abreVisita('');
  $('#v-mes').onchange = e => { fVis.mes = e.target.value; renderVisitas(); };
  $$('#t-visita [data-v]').forEach(b => b.onclick = () => abreDetalheVisita(b.dataset.v));
}
const estoqueCard = (tit, l) => (l || []).length ? `<div class="card"><div class="label" style="margin-bottom:6px">${tit}</div>${l.map(p => `<div class="line"><span>${h(p.nome)} (${h(p.un)})</span><b>${p.qtd}</b></div>`).join('')}</div>` : '';
const listaEstoque = est => Object.entries(est).filter(([, q]) => q !== '' && q != null && +q >= 0).map(([k, q]) => { const o = opPorKey(k); return o ? { prodId: o.prodId, nome: o.nome, un: o.un, qtd: +q } : null; }).filter(Boolean);
function abreEstoqueFinal(id) {
  const v = visitas.find(x => x.id === id); if (!v) return;
  const ops = opcoesProduto().filter((o, i, a) => a.findIndex(x => x.prodId === o.prodId && x.un === o.un) === i), est = {};
  const ini = Object.fromEntries((v.estoqueIni || v.estoque || []).map(e => [e.prodId + '|' + e.un, e.qtd]));
  sheet(`<div class="spread"><button class="btn ghost" id="ef-x">← Voltar</button><h3>Estoque final</h3><span></span></div>
    <div><div class="label">${dataBR(v.data)}</div><h2>${h(v.clienteNome)}</h2></div>
    <div class="card stack"><div class="label">Estoque no final da visita</div><div class="muted small">Quantidade que ficou no cliente depois da visita (degustação, reposição…). Deixe em branco o que não contou.</div>
      ${ops.map(o => `<label class="field"><span>${h(o.nome)} (${h(o.un)})${ini[o.key] != null ? ' · início: ' + ini[o.key] : ''}</span><input type="number" inputmode="numeric" min="0" step="1" data-e="${h(o.key)}" placeholder="—"></label>`).join('') || '<div class="muted small">Produtos ainda não carregados.</div>'}</div>
    <button class="btn primary big" id="ef-salvar">Salvar estoque final</button>`);
  $('#ef-x').onclick = () => abreDetalheVisita(id);
  $$('#sheet [data-e]').forEach(inp => inp.oninput = () => { est[inp.dataset.e] = inp.value; });
  $('#ef-salvar').onclick = () => {
    const l = listaEstoque(est); if (!l.length) return toast('Informe a quantidade de pelo menos um produto.');
    v.estoqueFim = l;
    updateDoc(doc(db, 'visitas', id), { estoqueFim: l, estoqueFimMs: Date.now() }).catch(e => toast(erroMsg(e)));
    toast('Estoque final salvo' + (navigator.onLine ? ' e enviado.' : ' no celular. Envia quando houver sinal.')); abreDetalheVisita(id);
  };
}
function abreDetalheVisita(id) {
  const v = visitas.find(x => x.id === id); if (!v) return;
  sheet(`
    <div class="spread"><button class="btn ghost" id="sh-x">← Voltar</button>${v._pend ? '<span class="tag y">aguardando sinal</span>' : '<span class="tag ok">enviada</span>'}</div>
    <div><div class="label">Visita em ${dataBR(v.data)} às ${new Date(v.criadoMs || 0).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div><h2>${h(v.clienteNome)}</h2></div>
    ${v.gps ? `<a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${v.gps.lat},${v.gps.lng}">Ver local no mapa (±${v.gps.acc} m)</a>` : ''}
    ${(v.fotos || []).length ? `<div class="fotos">${v.fotos.map(f => `<div class="foto"><img src="${f}" alt="Foto da visita"></div>`).join('')}</div>` : ''}
    ${(v.precos || []).length ? `<div class="card"><div class="label" style="margin-bottom:6px">Preços na loja</div>${v.precos.map(p => `<div class="line"><span>${h(p.produto)}${p.marca ? ' · ' + h(p.marca) : ''}</span><b>${brl(p.preco)}</b></div>`).join('')}</div>` : ''}
    ${estoqueCard('Estoque no início da visita', v.estoqueIni || v.estoque)}
    ${estoqueCard('Estoque no final da visita', v.estoqueFim)}
    ${me.perm.visita && v.vendedorId === me.vendedorId && !(v.estoqueFim || []).length ? '<button class="btn wheat big" id="sh-efim">Informar estoque final</button>' : ''}
    ${v.obs ? `<div class="card"><div class="label" style="margin-bottom:6px">Observação</div>${h(v.obs)}</div>` : ''}`);
  $('#sh-x').onclick = fechaSheet;
  const ef = $('#sh-efim'); if (ef) ef.onclick = () => abreEstoqueFinal(id);
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
    <div class="card stack"><div class="label">Estoque no início da visita</div><div class="muted small">Quantidade que o cliente tem agora, antes de repor ou de fazer degustação. Deixe em branco o que não contou. No fim da visita, abra-a na lista e toque em “Informar estoque final”.</div>
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
  const estoque = listaEstoque(vs.estoque);
  if (!vs.fotos.length && !precos.length && !estoque.length && !vs.obs.trim()) return toast('Registre ao menos uma foto, preço, estoque ou observação.');
  const tam = vs.fotos.reduce((a, f) => a + f.length, 0);
  if (tam > 850000) return toast('As fotos ficaram grandes demais. Remova uma foto.');
  const id = 'vis-' + me.vendedorId + '-' + Date.now().toString(36);
  const reg = { data: ymd(), clienteDoc: cli.doc, clienteNome: cli.fantasia || cli.nome, vendedorId: me.vendedorId, vendedorNome: me.nome, uid: me.uid, fotos: vs.fotos, precos, estoqueIni: estoque, obs: vs.obs.trim(), gps: vs.gps || null, criadoMs: Date.now(), criadoEm: serverTimestamp() };
  setDoc(doc(db, 'visitas', id), reg).catch(e => toast(erroMsg(e)));
  toast('Visita salva' + (navigator.onLine ? ' e enviada.' : ' no celular. Envia quando houver sinal.') + (estoque.length ? ' Ao terminar, informe o estoque final.' : ''));
  vs = null; fechaSheet(); fVis.mes = mesDe(reg.data); vaiTab('visita');
}

// ---------- tela cheia (sheet) ----------
function sheet(html) { const s = $('#sheet'); s.innerHTML = `<div class="sheet-in">${html}</div>`; s.hidden = false; s.scrollTop = 0; }
function fechaSheet() { const s = $('#sheet'); s.hidden = true; s.innerHTML = ''; }

// ---------- service worker ----------
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
