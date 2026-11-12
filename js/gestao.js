// Gestão — Lazinho Vendas (administrador)
import {
  auth, db, signInWithEmailAndPassword, signOut, onAuthStateChanged, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, onSnapshot, writeBatch,
  criarAcessoVendedor, apagarContaVendedor, usuarioDeNome, $, $$, h, semAcento, porNome, ymd, mesDe, dataBR, dataHoraBR, brl, r2, mesNome, docFmt,
  toast, abreModal, fechaModal, confirma, erroMsg, atualizaAgora, statusInfo, STATUS, VERSAO
} from './fb.js';

const ADMIN_UID = 'z0MjWvFOXqUqWPS2I0vD6mBxOOR2';
let pedidos = [], visitas = [], vendedores = [], usuarios = [], clientesNovos = [], nClientes = 0, nProdutos = 0;
const SO_USUARIOS = location.hash === '#usuarios';   // modo embutido no Portal: só a tela de vendedores/acessos
let unsubs = [], aba = SO_USUARIOS ? 'vendedores' : 'pedidos';
if (SO_USUARIOS) document.documentElement.classList.add('embutido');
let fP = { mes: ymd().slice(0, 7), vend: '', st: '' }, fV = { mes: ymd().slice(0, 7), vend: '' };

// ---------- login ----------
$('#f-adm').addEventListener('submit', async e => {
  e.preventDefault(); const m = $('#adm-msg'); m.textContent = '';
  try { await signInWithEmailAndPassword(auth, $('#adm-email').value.trim(), $('#adm-senha').value); }
  catch (err) { m.textContent = erroMsg(err); }
});
$('#sair').onclick = () => signOut(auth);
$('#atualiza').onclick = () => atualizaAgora($('#atualiza'), () => { assina(); desenha(); });
const mostra = x => { $('#g-login').hidden = x !== 'login'; $('#g-app').hidden = x !== 'app'; };
onAuthStateChanged(auth, user => {
  unsubs.forEach(u => { try { u(); } catch (e) {} }); unsubs = [];
  if (!user) { $('#sair').hidden = true; $('#atualiza').hidden = true; $('#quem').innerHTML = ''; mostra('login'); return; }
  if (user.uid !== ADMIN_UID) { $('#adm-msg').textContent = 'Este login não é de administrador. Vendedores usam o app (index).'; signOut(auth); return; }
  $('#sair').hidden = false; $('#atualiza').hidden = false; $('#quem').innerHTML = '<b>Luciano</b>Administrador'; mostra('app'); assina(); desenha();
});
function assina() {
  const w = (nome, c, fn) => unsubs.push(onSnapshot(c, s => { fn(s); desenha(); }, e => toast('Erro ao carregar ' + nome + ': ' + erroMsg(e))));
  w('pedidos', collection(db, 'pedidos'), s => pedidos = s.docs.map(d => ({ ...d.data(), id: d.id })).sort((a, b) => (b.criadoMs || 0) - (a.criadoMs || 0)));
  w('visitas', collection(db, 'visitas'), s => visitas = s.docs.map(d => ({ ...d.data(), id: d.id })).sort((a, b) => (b.criadoMs || 0) - (a.criadoMs || 0)));
  w('vendedores', collection(db, 'vendedores'), s => vendedores = s.docs.map(d => ({ ...d.data(), id: d.id })).sort(porNome));
  w('usuarios', collection(db, 'usuarios'), s => usuarios = s.docs.map(d => ({ ...d.data(), uid: d.id })));
  w('clientes novos', collection(db, 'clientesNovos'), s => clientesNovos = s.docs.map(d => ({ ...d.data(), doc: d.id })));
  w('clientes', collection(db, 'clientes'), s => nClientes = s.size);
  w('produtos', collection(db, 'produtos'), s => nProdutos = s.size);
}
$$('#menu button').forEach(b => b.onclick = () => { aba = b.dataset.t; $$('#menu button').forEach(x => x.setAttribute('aria-current', x === b ? 'true' : 'false')); desenha(); });
let timer; function desenha() { clearTimeout(timer); timer = setTimeout(() => ({ pedidos: abaPedidos, visitas: abaVisitas, vendedores: abaVendedores, carga: abaCarga })[aba](), 60); }
const main = () => $('#g-main');
const pill = s => { const i = statusInfo(s); return `<span class="pill ${i.c}">${h(i.t)}</span>`; };
const opMeses = (lista, sel) => { const m = [...new Set([ymd().slice(0, 7), ...lista.map(x => mesDe(x.data))])].sort().reverse(); return m.map(x => `<option value="${x}" ${x === sel ? 'selected' : ''}>${h(mesNome(x))}</option>`).join(''); };
const opVend = sel => `<option value="">Todos os vendedores</option>` + vendedores.map(v => `<option value="${h(v.id)}" ${v.id === sel ? 'selected' : ''}>${h(v.nome)}</option>`).join('');

// ---------- PEDIDOS ----------
function abaPedidos() {
  const l = pedidos.filter(p => mesDe(p.data) === fP.mes && (!fP.vend || p.vendedorId === fP.vend) && (!fP.st || p.status === fP.st));
  const val = l.filter(p => p.status !== 'cancelado'), total = val.reduce((a, p) => a + (+p.total || 0), 0);
  const novos = pedidos.filter(p => p.status === 'novo').length;
  main().innerHTML = `
    <div class="spread"><h2>Pedidos dos vendedores</h2>${novos ? `<span class="pill live">${novos} novo(s) aguardando recebimento</span>` : ''}</div>
    <div class="row">
      <select id="fp-mes" style="width:auto">${opMeses(pedidos, fP.mes)}</select>
      <select id="fp-vend" style="width:auto">${opVend(fP.vend)}</select>
      <select id="fp-st" style="width:auto"><option value="">Todos os status</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === fP.st ? 'selected' : ''}>${v.t}</option>`).join('')}</select>
    </div>
    <div class="kpis"><div class="kpi"><b>${val.length}</b><span>pedidos</span></div><div class="kpi"><b>${brl(total)}</b><span>vendido (sem cancelados)</span></div><div class="kpi"><b>${l.filter(p => p.status === 'entregue').length}</b><span>entregues</span></div></div>
    <div class="table-wrap"><table><thead><tr><th>Data</th><th>Cliente</th><th>Vendedor</th><th>Itens</th><th class="r">Total</th><th>Pagamento</th><th>Status</th><th></th></tr></thead><tbody>
    ${l.map(p => `<tr><td>${dataBR(p.data)}</td><td><b>${h(p.clienteNome)}</b><br><span class="muted small">${h(docFmt(p.clienteDoc))}</span></td><td>${h(p.vendedorNome)}</td>
      <td>${(p.itens || []).map(i => `${i.qtd} ${h(i.un)} × ${brl(i.preco)}`).join('<br>')}</td><td class="r"><b>${brl(p.total)}</b></td><td>${h(p.condicaoNome || '')}</td>
      <td>${pill(p.status)}${p.entregueEm ? `<br><span class="muted small">entregue ${dataBR(p.entregueEm)}</span>` : ''}${p.numeroPortal ? `<br><span class="muted small">Portal nº ${h(p.numeroPortal)}</span>` : ''}</td>
      <td><button class="btn sm" data-ed="${h(p.id)}">Andamento</button></td></tr>`).join('') || '<tr><td colspan="8" class="muted" style="text-align:center;padding:22px">Nenhum pedido com esses filtros.</td></tr>'}
    </tbody></table></div>`;
  $('#fp-mes').onchange = e => { fP.mes = e.target.value; abaPedidos(); };
  $('#fp-vend').onchange = e => { fP.vend = e.target.value; abaPedidos(); };
  $('#fp-st').onchange = e => { fP.st = e.target.value; abaPedidos(); };
  $$('[data-ed]').forEach(b => b.onclick = () => editaPedido(b.dataset.ed));
}
function editaPedido(id) {
  const p = pedidos.find(x => x.id === id); if (!p) return;
  abreModal(`<h3>${h(p.clienteNome)} — ${brl(p.total)}</h3>
    <div class="muted small">Pedido de ${dataBR(p.data)} · ${h(p.vendedorNome)} · enviado ${dataHoraBR(p.criadoMs)}</div>
    <div class="card">${(p.itens || []).map(i => `<div class="line"><span>${i.qtd} ${h(i.un)} · ${h(i.nome)}</span><b>${brl(i.subtotal)}</b></div>`).join('')}${p.obs ? `<div class="line"><span class="muted">Obs.</span><span>${h(p.obs)}</span></div>` : ''}${p.dataEntrega ? `<div class="line"><span class="muted">Entrega desejada</span><span>${dataBR(p.dataEntrega)}</span></div>` : ''}</div>
    <label class="field"><span>Status</span><select id="e-st">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === p.status ? 'selected' : ''}>${v.t}</option>`).join('')}</select></label>
    <label class="field"><span>Nº do pedido no Portal</span><input type="text" id="e-np" value="${h(p.numeroPortal || '')}"></label>
    <label class="field"><span>Nº da nota fiscal</span><input type="text" id="e-nf" value="${h(p.nfNumero || '')}"></label>
    <label class="field"><span>Data da entrega</span><input type="date" id="e-ent" value="${h(p.entregueEm || '')}"></label>
    <div class="row end"><button class="btn danger" id="e-del">Excluir</button><button class="btn" id="e-x">Voltar</button><button class="btn primary" id="e-ok">Salvar</button></div>`);
  $('#e-x').onclick = fechaModal;
  $('#e-del').onclick = async () => { if (await confirma('Excluir este pedido do app? (não apaga do Portal)', 'Excluir')) { await deleteDoc(doc(db, 'pedidos', id)).catch(e => toast(erroMsg(e))); fechaModal(); } };
  $('#e-ok').onclick = async () => {
    const st = $('#e-st').value, upd = { status: st, statusEm: Date.now(), numeroPortal: $('#e-np').value.trim(), nfNumero: $('#e-nf').value.trim(), entregueEm: $('#e-ent').value || '' };
    if (st === 'entregue' && !upd.entregueEm) upd.entregueEm = ymd();
    if (st !== 'entregue' && st !== 'faturado' && st !== 'recebido') upd.entregueEm = upd.entregueEm || '';
    if (['recebido', 'faturado', 'entregue'].includes(st) && !p.recebidoEm) upd.recebidoEm = Date.now();
    if (['faturado', 'entregue'].includes(st) && !p.faturadoEm) upd.faturadoEm = Date.now();
    try { await updateDoc(doc(db, 'pedidos', id), upd); toast('Pedido atualizado.'); fechaModal(); } catch (e) { toast(erroMsg(e)); }
  };
}

// ---------- VISITAS ----------
function abaVisitas() {
  const l = visitas.filter(v => mesDe(v.data) === fV.mes && (!fV.vend || v.vendedorId === fV.vend));
  main().innerHTML = `
    <h2>Visitas dos vendedores</h2>
    <div class="row"><select id="fv-mes" style="width:auto">${opMeses(visitas, fV.mes)}</select><select id="fv-vend" style="width:auto">${opVend(fV.vend)}</select><span class="muted small">${l.length} visita(s)</span></div>
    <div class="stack">${l.map(v => `<div class="card stack">
      <div class="spread"><div><b>${h(v.clienteNome)}</b><br><span class="muted small">${h(v.vendedorNome)} · ${dataBR(v.data)} ${new Date(v.criadoMs || 0).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span></div>
      ${v.gps ? `<a class="btn sm" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${v.gps.lat},${v.gps.lng}">Mapa</a>` : '<span class="tag">sem GPS</span>'}</div>
      ${(v.fotos || []).length ? `<div class="fotosg">${v.fotos.map(f => `<img src="${f}" alt="Foto da visita" data-big>`).join('')}</div>` : ''}
      ${(v.precos || []).length ? `<div class="small"><b>Preços:</b> ${v.precos.map(p => `${h(p.produto)}${p.marca ? ' (' + h(p.marca) + ')' : ''}: <b>${brl(p.preco)}</b>`).join(' · ')}</div>` : ''}
      ${(v.estoque || []).length ? `<div class="small"><b>Estoque no cliente:</b> ${v.estoque.map(e => `${h(e.nome)} (${h(e.un)}): <b>${e.qtd}</b>`).join(' · ')}</div>` : ''}
      ${v.obs ? `<div class="small"><b>Obs.:</b> ${h(v.obs)}</div>` : ''}</div>`).join('') || '<div class="empty"><b>Nenhuma visita neste período</b></div>'}</div>`;
  $('#fv-mes').onchange = e => { fV.mes = e.target.value; abaVisitas(); };
  $('#fv-vend').onchange = e => { fV.vend = e.target.value; abaVisitas(); };
  $$('[data-big]').forEach(im => im.onclick = () => abreModal(`<img class="bigfoto" src="${im.src}" alt=""><button class="btn" id="big-x">Fechar</button>`) || ($('#big-x').onclick = fechaModal));
}

// ---------- VENDEDORES ----------
const PERMS = [['permPedido', 'Digitar pedido', true], ['permPreco', 'Alterar preço no pedido', true], ['permVisita', 'Registrar visita', true], ['permCliente', 'Cadastrar cliente', false]];
const permHtml = u => `<div class="stack" style="gap:6px">${PERMS.map(([k, t, d]) => `<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-perm="${k}" ${(u && u[k] !== undefined ? u[k] !== false && (d || u[k] === true) : d) ? 'checked' : ''}> ${t}</label>`).join('')}</div>`;
const permLer = () => Object.fromEntries($$('[data-perm]').map(c => [c.dataset.perm, c.checked]));
const permTags = u => PERMS.map(([k, t, d]) => { const on = u[k] === undefined ? d : (d ? u[k] !== false : u[k] === true); return `<span class="tag ${on ? 'ok' : ''}" title="${t}">${on ? '✓' : '✗'} ${t.replace('Alterar preço no pedido', 'Preço').replace('Digitar pedido', 'Pedido').replace('Registrar visita', 'Visita').replace('Cadastrar cliente', 'Cliente')}</span>`; }).join(' ');
function abaVendedores() {
  const usr = id => usuarios.find(u => u.vendedorId === id);
  main().innerHTML = `
    <div class="spread"><h2>Vendedores</h2><div class="row"><button class="btn wheat" id="v-padrao">Cadastrar Fernanda, João e Marlene (senha 2026)</button><button class="btn primary" id="v-novo">+ Novo vendedor</button></div></div>
    <div class="note">Cada vendedor entra no app com o <b>usuário</b> (primeiro nome, sem acento) e uma <b>senha</b> (mínimo 4 caracteres) que você define aqui. Os vendedores também podem vir da carga do Portal.</div>
    <div class="table-wrap"><table><thead><tr><th>Vendedor</th><th>Comissão</th><th>Acesso ao app</th><th>O que pode fazer</th><th></th></tr></thead><tbody>
    ${vendedores.map(v => { const u = usr(v.id); return `<tr><td><b>${h(v.nome)}</b><br><span class="muted small">id: ${h(v.id)}</span></td><td>${v.comissaoPct != null ? v.comissaoPct + '%' : '—'}</td>
      <td>${u ? `<span class="tag ok">ativo</span> usuário <b>${h(u.usuario || '')}</b>` : '<span class="tag">sem acesso</span>'}</td>
      <td>${u ? permTags(u) : '—'}</td>
      <td class="r"><button class="btn sm" data-ac="${h(v.id)}">${u ? 'Trocar senha' : 'Criar acesso'}</button> ${u ? `<button class="btn sm" data-pm="${h(v.id)}">Permissões</button> <button class="btn sm danger" data-bl="${h(v.id)}">Bloquear</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="5" class="muted" style="text-align:center;padding:22px">Nenhum vendedor ainda. Use “+ Novo vendedor” ou a carga do Portal.</td></tr>'}
    </tbody></table></div>`;
  $('#v-novo').onclick = novoVendedor;
  $('#v-padrao').onclick = cadastraPadrao;
  $$('[data-ac]').forEach(b => b.onclick = () => acessoVendedor(b.dataset.ac));
  $$('[data-bl]').forEach(b => b.onclick = () => bloqueia(b.dataset.bl));
  $$('[data-pm]').forEach(b => b.onclick = () => permissoes(b.dataset.pm));
}
async function cadastraPadrao() {
  const btn = $('#v-padrao'); btn.disabled = true; btn.textContent = 'Cadastrando…'; const log = [];
  for (const nome of ['Fernanda', 'João', 'Marlene']) {
    const usr = usuarioDeNome(nome); let v = vendedores.find(x => usuarioDeNome(x.nome) === usr);
    try {
      if (!v) { const id = semAcento(nome).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); v = { id, nome }; await setDoc(doc(db, 'vendedores', id), { nome, comissaoPct: 5, ativo: true }, { merge: true }); }
      const uid = await criarAcessoVendedor(usr, '2026', '2026');
      await setDoc(doc(db, 'usuarios', uid), { vendedorId: v.id, nome: v.nome, usuario: usr, permPedido: true, permPreco: true, permVisita: true, permCliente: false }, { merge: true });
      await setDoc(doc(db, 'vendedores', v.id), { uid, usuario: usr, ativo: true }, { merge: true });
      log.push(nome + ': pronto (usuário ' + usr + ')');
    } catch (e) { log.push(nome + ': ' + ((e.code || '').includes('invalid-credential') ? 'o usuário já existe com outra senha. Use “Trocar senha” na tabela.' : erroMsg(e))); }
  }
  abreModal(`<h3>Acessos cadastrados</h3><div class="stack">${log.map(l => `<div>${h(l)}</div>`).join('')}</div><div class="note ok">Senha de todos: <b>2026</b>. Para liberar “Cadastrar cliente”, use o botão Permissões de cada um.</div><div class="row end"><button class="btn primary" id="pd-ok">OK</button></div>`);
  $('#pd-ok').onclick = fechaModal; btn.disabled = false; btn.textContent = 'Cadastrar Fernanda, João e Marlene (senha 2026)';
}
function novoVendedor() {
  abreModal(`<h3>Novo vendedor</h3>
    <label class="field"><span>Nome</span><input type="text" id="nv-nome"></label>
    <label class="field"><span>Comissão (%)</span><input type="number" id="nv-pct" step="0.1" value="5"></label>
    <div class="row end"><button class="btn" id="nv-x">Voltar</button><button class="btn primary" id="nv-ok">Criar</button></div>`);
  $('#nv-x').onclick = fechaModal;
  $('#nv-ok').onclick = async () => {
    const nome = $('#nv-nome').value.trim(); if (!nome) return toast('Informe o nome.');
    const id = semAcento(nome).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    try { await setDoc(doc(db, 'vendedores', id), { nome, comissaoPct: +$('#nv-pct').value || 0, ativo: true }, { merge: true }); toast('Vendedor criado.'); fechaModal(); } catch (e) { toast(erroMsg(e)); }
  };
}
function acessoVendedor(id) {
  const v = vendedores.find(x => x.id === id), u = usuarios.find(x => x.vendedorId === id);
  abreModal(`<h3>${u ? 'Trocar senha de ' : 'Criar acesso para '}${h(v.nome)}</h3>
    <label class="field"><span>Usuário (primeiro nome, sem acento)</span><input type="text" id="ac-usr" value="${h(u ? u.usuario : usuarioDeNome(v.nome))}" ${u ? 'readonly' : ''}></label>
    ${u ? '<label class="field"><span>Senha atual</span><input type="text" id="ac-old" autocomplete="off"></label>' : ''}
    <label class="field"><span>${u ? 'Nova senha' : 'Senha'} (mínimo 4 caracteres)</span><input type="text" id="ac-cod" autocomplete="off"></label>
    <div class="label">O que pode fazer no app</div>${permHtml(u)}
    <div class="note">Anote a senha e passe ao vendedor. Ela não fica visível depois.</div>
    <div class="row end"><button class="btn" id="ac-x">Voltar</button><button class="btn primary" id="ac-ok">Salvar</button></div>`);
  $('#ac-x').onclick = fechaModal;
  $('#ac-ok').onclick = async () => {
    const usr = usuarioDeNome($('#ac-usr').value), cod = $('#ac-cod').value.trim(), old = u ? $('#ac-old').value.trim() : '';
    if (!usr) return toast('Informe o usuário.'); if (cod.length < 4) return toast('A senha precisa ter pelo menos 4 caracteres.'); if (u && !old) return toast('Informe a senha atual.');
    $('#ac-ok').disabled = true;
    try {
      const uid = await criarAcessoVendedor(usr, cod, old || undefined);
      await setDoc(doc(db, 'usuarios', uid), { vendedorId: id, nome: v.nome, usuario: usr, ...permLer() });
      await setDoc(doc(db, 'vendedores', id), { uid, usuario: usr, ativo: true }, { merge: true });
      toast('Acesso salvo. Usuário: ' + usr + ' · senha: ' + cod); fechaModal();
    } catch (e) {
      $('#ac-ok').disabled = false;
      toast(e.code === 'auth/email-already-in-use' ? 'Esse usuário já existe. Use “Trocar senha” informando a senha atual.' : erroMsg(e), 5000);
    }
  };
}
function permissoes(id) {
  const u = usuarios.find(x => x.vendedorId === id); if (!u) return;
  abreModal(`<h3>O que ${h(u.nome || id)} pode fazer no app</h3>${permHtml(u)}<div class="note">Valem na hora, no próximo uso do app. Pedido já recebido pela Lazinho nunca pode ser alterado pelo vendedor.</div><div class="row end"><button class="btn" id="pm-x">Voltar</button><button class="btn primary" id="pm-ok">Salvar</button></div>`);
  $('#pm-x').onclick = fechaModal;
  $('#pm-ok').onclick = async () => { try { await updateDoc(doc(db, 'usuarios', u.uid), permLer()); toast('Permissões salvas.'); fechaModal(); } catch (e) { toast(erroMsg(e)); } };
}
async function bloqueia(id) {
  const u = usuarios.find(x => x.vendedorId === id); if (!u) return;
  if (!(await confirma('Bloquear o acesso de ' + (u.nome || id) + ' ao app?', 'Bloquear'))) return;
  try { await deleteDoc(doc(db, 'usuarios', u.uid)); toast('Acesso bloqueado. Para liberar de novo, use “Criar acesso”.'); } catch (e) { toast(erroMsg(e)); }
}

// ---------- CARGA DO PORTAL ----------
let sync = null;
async function aplicaAndamentos(lista) {
  const b = writeBatch(db); let n = 0;
  (lista || []).forEach(a => {
    const p = pedidos.find(x => x.id === a.appId); if (!p) return;
    if ((p.status === a.status) && (p.nfNumero || '') === (a.nfNumero || '') && (p.entregueEm || '') === (a.entregueEm || '') && (p.numeroPortal || '') === String(a.numeroPortal || '')) return;
    const upd = { status: a.status, nfNumero: a.nfNumero || '', entregueEm: a.entregueEm || '', numeroPortal: String(a.numeroPortal || ''), statusEm: Date.now() };
    if (['recebido', 'faturado', 'entregue'].includes(a.status) && !p.recebidoEm) upd.recebidoEm = Date.now();
    if (['faturado', 'entregue'].includes(a.status) && !p.faturadoEm) upd.faturadoEm = Date.now();
    b.update(doc(db, 'pedidos', a.appId), upd); n++;
  });
  if (n) await b.commit();
  return n;
}
async function baixaPedidos(novos, cnovos) {
  const out = novos.map(p => ({ appId: p.id, data: p.data, clienteDoc: p.clienteDoc, clienteNome: p.clienteNome, itens: p.itens, total: p.total, condicaoId: p.condicaoId, condicaoNome: p.condicaoNome, prazo: p.prazo, obs: p.obs, dataEntrega: p.dataEntrega, vendedorId: p.vendedorId, vendedorNome: p.vendedorNome, criadoMs: p.criadoMs }));
  const cl = cnovos.map(c => { const { uid, status, ...resto } = c; return resto; });
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({ gerado: new Date().toISOString(), usuarios: usuarios.map(u => ({ usuario: u.usuario || '', nome: u.nome || '', vendedorId: u.vendedorId || '', permPedido: u.permPedido !== false, permPreco: u.permPreco !== false, permVisita: u.permVisita !== false, permCliente: u.permCliente === true })), clientes: cl, pedidos: out }, null, 1)], { type: 'application/json' })); a.download = 'pedidos-app-' + ymd() + '.json'; a.click();
  if (!novos.length && !cnovos.length) return;
  const b = writeBatch(db); const t = Date.now();
  novos.forEach(p => b.update(doc(db, 'pedidos', p.id), { status: 'recebido', recebidoEm: t, statusEm: t }));
  cnovos.forEach(c => b.update(doc(db, 'clientesNovos', c.doc), { status: 'enviado', enviadoEm: t }));
  await b.commit();
}
function abaCarga() {
  const novos = pedidos.filter(p => p.status === 'novo'), cnovos = clientesNovos.filter(c => c.status === 'novo');
  main().innerHTML = `
    <h2>Atualizar tudo</h2>
    <div class="note">Um botão só. <b>1)</b> No Portal, aba App, clique em <b>Atualizar tudo</b> e guarde o arquivo. <b>2)</b> Escolha o arquivo aqui e clique em <b>Atualizar tudo</b>: o app recebe clientes, produtos, vendas e andamento dos pedidos, e baixa os pedidos novos para o Portal. <b>3)</b> No Portal, escolha o arquivo de pedidos em <b>Atualizar tudo</b>.</div>
    <div class="card stack">
      <div class="small muted">No app agora: ${nClientes} cliente(s), ${nProdutos} produto(s), ${vendedores.length} vendedor(es). Esperando o Portal: ${novos.length} pedido(s) novo(s) e ${cnovos.length} cliente(s) novo(s).</div>
      <label class="small muted">Arquivo vindo do Portal (opcional)</label>
      <input type="file" id="cg-arq" accept="application/json,.json">
      <div id="cg-prev"></div>
      <button class="btn primary" id="cg-env">Atualizar tudo</button>
      <div id="cg-res"></div>
    </div>`;
  $('#cg-arq').onchange = async e => {
    const f = e.target.files[0]; sync = null; if (!f) { $('#cg-prev').innerHTML = ''; return; }
    try { const j = JSON.parse(await f.text()); sync = j.carga ? j : { carga: j.clientes && j.produtos ? j : null, andamentos: j.andamentos || [] }; } catch (err) { $('#cg-prev').innerHTML = '<div class="note crit">Arquivo inválido.</div>'; return; }
    const c = sync.carga || {};
    $('#cg-prev').innerHTML = `<div class="note ok">Arquivo de ${h(c.gerado || sync.gerado || '—')}: ${(c.clientes || []).length} clientes, ${(c.produtos || []).length} produtos, ${(c.condicoes || []).length} condições, ${(c.vendedores || []).length} vendedores, ${(sync.andamentos || []).length} andamento(s).</div>`;
    $('#cg-env').disabled = false;
  };
  $('#cg-env').onclick = async () => {
    const btn = $('#cg-env'), r = $('#cg-res'); btn.disabled = true; btn.textContent = 'Atualizando…'; const L = [];
    try {
      if (sync && sync.carga) { const n = await enviaCarga(sync.carga, btn); L.push(n + ' registros enviados ao app (clientes, produtos, vendas).'); }
      if (sync && (sync.andamentos || []).length) { const n = await aplicaAndamentos(sync.andamentos); L.push(n + ' pedido(s) com andamento novo para os vendedores.'); }
      { await baixaPedidos(novos, cnovos); L.push(novos.length + ' pedido(s) e ' + cnovos.length + ' cliente(s) novo(s) baixados para o Portal (pedidos agora travados no app).'); }
      if (!L.length) L.push('Nada novo para atualizar.');
      r.innerHTML = '<div class="note ok">' + L.map(h).join('<br>') + '</div>'; toast('Atualizado.'); sync = null;
    } catch (e) { r.innerHTML = '<div class="note crit">' + h(erroMsg(e)) + '</div>'; toast(erroMsg(e), 5000); }
    btn.textContent = 'Atualizar tudo'; btn.disabled = false;
  };
}
async function enviaCarga(carga, btn) {
  const ops = [];
  (carga.clientes || []).forEach(c => c.doc && ops.push([doc(db, 'clientes', String(c.doc)), c]));
  (carga.produtos || []).forEach(p => p.id && ops.push([doc(db, 'produtos', String(p.id)), p]));
  (carga.condicoes || []).forEach(c => c.id && ops.push([doc(db, 'condicoes', String(c.id)), c]));
  (carga.vendedores || []).forEach(v => v.id && ops.push([doc(db, 'vendedores', String(v.id)), { nome: v.nome, comissaoPct: v.comissaoPct ?? null, ativo: v.ativo !== false }]));
  Object.entries(carga.resumo || {}).forEach(([d, r]) => ops.push([doc(db, 'resumo', d), r]));
  for (let i = 0; i < ops.length; i += 400) {
    const b = writeBatch(db); ops.slice(i, i + 400).forEach(([ref, data]) => b.set(ref, data, { merge: true })); await b.commit();
    btn.textContent = 'Enviando… ' + Math.min(i + 400, ops.length) + '/' + ops.length;
  }
  return ops.length;
}
