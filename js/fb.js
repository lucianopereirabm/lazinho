// Firebase + utilidades comuns (app do vendedor e Gestão) — Lazinho
import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  createUserWithEmailAndPassword, updatePassword, deleteUser, sendPasswordResetEmail, setPersistence, browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, persistentSingleTabManager, serverTimestamp,
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where, orderBy, limit,
  onSnapshot, writeBatch, deleteField, waitForPendingWrites, enableNetwork
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export const firebaseConfig = {
  apiKey: "AIzaSyAJw1BbQwHLPr9L9vVDkjdxr9DNfhNN2e0",
  authDomain: "lazinho-b8db6.firebaseapp.com",
  projectId: "lazinho-b8db6",
  storageBucket: "lazinho-b8db6.firebasestorage.app",
  messagingSenderId: "704082318801",
  appId: "1:704082318801:web:d33a1ce7c1a579888b7cf0"
};
export const VERSAO = 'v13';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(() => {});
let _db;
// Banco guardado no celular: o que for registrado sem sinal fica salvo e sobe sozinho quando a internet voltar.
try {
  _db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
} catch (e) {
  try { _db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() }) }); }
  catch (e2) { _db = initializeFirestore(app, {}); }
}
try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
export const db = _db;
export {
  sendPasswordResetEmail, signInWithEmailAndPassword, signOut, onAuthStateChanged, doc, getDoc, getDocs, setDoc, updateDoc,
  deleteDoc, collection, query, where, orderBy, limit, onSnapshot, writeBatch, deleteField, serverTimestamp
};

// ---------- login dos vendedores: usuário (primeiro nome) + senha ----------
export const DOMINIO_VENDEDOR = 'vendedor.lazinho.app';
export const emailVendedor = usuario => `${usuario}@${DOMINIO_VENDEDOR}`;
export const senhaVendedor = senha => `lz-${senha}-app`;   // prefixo interno: o Firebase exige 6+ caracteres, então senhas curtas (ex.: 2026) funcionam

// Cria (ou troca o código de) um login de vendedor sem derrubar a sessão do administrador
export async function criarAcessoVendedor(usuario, codigo, codigoAntigo) {
  const sec = initializeApp(firebaseConfig, 'sec-' + Date.now());
  const sa = getAuth(sec);
  try {
    let cred;
    try {
      cred = await createUserWithEmailAndPassword(sa, emailVendedor(usuario), senhaVendedor(codigo));
    } catch (e) {
      if (e.code === 'auth/email-already-in-use' && codigoAntigo) {
        cred = await signInWithEmailAndPassword(sa, emailVendedor(usuario), senhaVendedor(codigoAntigo));
        if (codigoAntigo !== codigo) await updatePassword(cred.user, senhaVendedor(codigo));
      } else throw e;
    }
    return cred.user.uid;
  } finally {
    try { await signOut(sa); } catch (e) {}
    try { await deleteApp(sec); } catch (e) {}
  }
}
export async function apagarContaVendedor(usuario, codigo) {
  const sec = initializeApp(firebaseConfig, 'del-' + Date.now());
  const sa = getAuth(sec);
  try { const cred = await signInWithEmailAndPassword(sa, emailVendedor(usuario), senhaVendedor(codigo)); await deleteUser(cred.user); return true; }
  catch (e) { return false; }
  finally { try { await signOut(sa); } catch (e) {} try { await deleteApp(sec); } catch (e) {} }
}

// ---------- utilidades ----------
export const $ = s => document.querySelector(s);
export const $$ = s => [...document.querySelectorAll(s)];
export const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const usuarioDeNome = nome => semAcento(String(nome || '').trim().split(/\s+/)[0]).replace(/[^a-z0-9]/g, '');
export const porNome = (a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR', { sensitivity: 'base' });
export function ymd(d = new Date()) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
export const mesDe = d => String(d || '').slice(0, 7);
export const dataBR = d => { if (!d) return '—'; const [y, m, dd] = String(d).slice(0, 10).split('-'); return dd + '/' + m + '/' + y; };
export const hm = ms => ms ? new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
export const dataHoraBR = ms => ms ? new Date(ms).toLocaleDateString('pt-BR') + ' ' + hm(ms) : '—';
export const brl = n => (+n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const r2 = n => Math.round((+n || 0) * 100) / 100;
export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const mesNome = m => { const [y, mm] = String(m).split('-'); return MESES[+mm - 1] + '/' + y; };
export const docFmt = d => { d = String(d || '').replace(/\D/g, ''); return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : d; };
export function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
export function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

export const STATUS = {
  novo: { t: 'Enviado', c: 'live', d: 'Pedido enviado, aguardando a Lazinho receber' },
  recebido: { t: 'Recebido', c: 'extra', d: 'A Lazinho recebeu e vai faturar' },
  faturado: { t: 'Faturado', c: 'extra', d: 'Nota emitida, aguardando entrega' },
  entregue: { t: 'Entregue', c: 'ok', d: 'Entregue ao cliente' },
  cancelado: { t: 'Cancelado', c: 'no', d: 'Pedido cancelado' }
};
export const statusInfo = s => STATUS[s] || { t: s || '—', c: 'pend', d: '' };

export function toast(msg, ms = 3200) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, ms);
}
export function abreModal(html) {
  let m = $('#modal');
  if (!m) {
    m = document.createElement('div'); m.id = 'modal'; m.className = 'modal';
    m.innerHTML = '<div class="modal-box" id="modal-box"></div>'; document.body.appendChild(m);
    m.addEventListener('click', e => { if (e.target.id === 'modal') fechaModal(); });
  }
  $('#modal-box').innerHTML = html; m.hidden = false;
}
export function fechaModal() { const m = $('#modal'); if (m) { m.hidden = true; $('#modal-box').innerHTML = ''; } }
export function confirma(texto, botao) {
  return new Promise(res => {
    abreModal(`<h3>${h(texto)}</h3><div class="row end"><button class="btn" id="cf-n">Voltar</button><button class="btn primary" id="cf-s">${h(botao)}</button></div>`);
    $('#cf-n').onclick = () => { fechaModal(); res(false); };
    $('#cf-s').onclick = () => { fechaModal(); res(true); };
  });
}
export function erroMsg(e) {
  const c = e && e.code || '';
  if (c.includes('permission-denied')) return 'Sem permissão para essa ação.';
  if (c.includes('unavailable') || c.includes('network')) return 'Sem internet. O registro será enviado quando a conexão voltar.';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found') || c.includes('invalid-login')) return 'Usuário ou senha incorretos.';
  if (c.includes('too-many-requests')) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
  return 'Não deu certo: ' + (e && e.message || 'erro desconhecido');
}
export function pegaGPS(timeout = 15000) {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('GPS indisponível neste aparelho.'));
    navigator.geolocation.getCurrentPosition(
      p => res({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) }),
      e => rej(new Error(e.code === 1 ? 'Permita a localização para marcar o local.' : 'Não consegui pegar a localização.')),
      { enableHighAccuracy: true, timeout, maximumAge: 30000 });
  });
}
// Reduz a foto (celular) para caber no banco: lado maior 1000 px, JPEG
export function reduzFoto(file, lado = 1000, q = 0.65) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, lado / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Não consegui ler a foto.')); };
    img.src = url;
  });
}
// aviso de sem sinal
export function avisoRede() {
  let b = $('#rede');
  if (!b) { b = document.createElement('div'); b.id = 'rede'; b.className = 'rede off'; b.hidden = true; document.body.appendChild(b); }
  const att = () => { if (navigator.onLine) { b.hidden = true; } else { b.hidden = false; b.textContent = 'Sem internet — o que você registrar fica salvo e sobe sozinho quando o sinal voltar.'; } };
  addEventListener('online', att); addEventListener('offline', att); att();
}

// Botão "Atualizar": envia o que está esperando sinal e relê tudo do servidor.
// confere se existe versão nova do app no servidor (compara o número da versão)
export async function versaoNova() {
  try {
    const r = await fetch('js/fb.js?x=' + Date.now(), { cache: 'no-store' }); if (!r.ok) return null;
    const m = /VERSAO = '([^']+)'/.exec(await r.text());
    return m && m[1] !== VERSAO ? m[1] : null;
  } catch (e) { return null; }
}
async function recarregaApp() {
  try { const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration(); if (reg) await reg.update(); } catch (e) {}
  try { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } catch (e) {}
  location.reload();
}
let avisouVersao = false;
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || avisouVersao || !navigator.onLine) return;
  const v = await versaoNova(); if (v) { avisouVersao = true; toast('Nova versão ' + v + ' disponível. Toque em ↻ Atualizar.'); }
});
export async function atualizaAgora(btn, recarrega) {
  if (btn) { btn.disabled = true; btn.classList.add('girando'); }
  try {
    if (!navigator.onLine) { toast('Sem internet agora. Tente de novo quando o sinal voltar.'); return; }
    const nv = await versaoNova();
    if (nv) { toast('Nova versão ' + nv + '! Atualizando o app…'); setTimeout(recarregaApp, 900); return; }
    try { await enableNetwork(db); } catch (e) {}
    await Promise.race([waitForPendingWrites(db), new Promise((_, r) => setTimeout(() => r(new Error('demorou')), 8000))]);
    if (recarrega) recarrega();
    toast('Atualizado às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
  } catch (e) {
    toast(e && e.message === 'demorou' ? 'Sinal fraco: o que está pendente sobe assim que o sinal melhorar.' : 'Não consegui atualizar: ' + erroMsg(e));
  } finally { if (btn) { btn.disabled = false; btn.classList.remove('girando'); } }
}
