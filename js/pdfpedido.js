// PDF do pedido (gerado no celular, sem biblioteca): desenha cada página num canvas e monta o PDF com imagens JPEG.
const W = 595, H = 842, S = 2.5, M = 36;           // A4 em pontos; S = nitidez
const VINHO = '#7a1f2b', OURO = '#c9962b', CREME = '#fbf3e0', TXT = '#2b2220', SUAVE = '#7a6e66', LINHA = '#e6d6b4';
const brl = n => (+n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = d => { if (!d) return ''; const [y, m, dd] = String(d).slice(0, 10).split('-'); return dd + '/' + m + '/' + y; };
const docFmt = d => { d = String(d || '').replace(/\D/g, ''); return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : d; };
const qtdFmt = n => (+n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

const carrega = src => new Promise(res => { if (!src) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

function quebra(ctx, texto, larg) {
  const out = []; String(texto || '').split(/\n/).forEach(par => {
    let lin = ''; par.split(/\s+/).forEach(pal => { const t = lin ? lin + ' ' + pal : pal; if (ctx.measureText(t).width > larg && lin) { out.push(lin); lin = pal; } else lin = t; });
    out.push(lin);
  });
  return out;
}
function contem(ctx, img, x, y, w, h) {
  if (!img) return; const r = Math.min(w / img.width, h / img.height), dw = img.width * r, dh = img.height * r;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}
function caixa(ctx, x, y, w, h, fill, borda) {
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, 6) : ctx.rect(x, y, w, h);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (borda) { ctx.strokeStyle = borda; ctx.lineWidth = 0.8; ctx.stroke(); }
}

// d = { pedido, cliente, produtos, vendedorNome }
export async function geraPdfPedido(d, logoUrl) {
  const p = d.pedido, c = d.cliente || {}, prods = d.produtos || [];
  const logo = await carrega(logoUrl);
  const fotos = {}; await Promise.all((p.itens || []).map(async i => { if (fotos[i.prodId] !== undefined) return; const pr = prods.find(x => x.id === i.prodId); fotos[i.prodId] = await carrega(pr && pr.foto); }));
  const paginas = []; let cv, ctx, y, pg = 0;
  const nova = () => {
    cv = document.createElement('canvas'); cv.width = W * S; cv.height = H * S; ctx = cv.getContext('2d'); ctx.scale(S, S);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.textBaseline = 'alphabetic'; paginas.push(cv); pg++;
    if (pg === 1) cabecalho(); else { ctx.fillStyle = VINHO; ctx.fillRect(0, 0, W, 34); ctx.fillStyle = '#fff'; ctx.font = 'bold 11px Helvetica, Arial, sans-serif'; ctx.fillText('Pão de Queijo Lazinho — Pedido ' + (p.numeroPortal ? 'nº ' + p.numeroPortal + ' · ' : '') + (p.clienteNome || ''), M, 21); y = 52; }
  };
  const T = (t, x, yy, fonte, cor, al) => { ctx.font = fonte; ctx.fillStyle = cor || TXT; ctx.textAlign = al || 'left'; ctx.fillText(t, x, yy); ctx.textAlign = 'left'; };
  function cabecalho() {
    ctx.fillStyle = VINHO; ctx.fillRect(0, 0, W, 112); ctx.fillStyle = OURO; ctx.fillRect(0, 112, W, 4);
    if (logo) { const hh = 84, ww = logo.width / logo.height * hh; caixa(ctx, M - 6, 8, ww + 12, hh + 12, '#fff'); contem(ctx, logo, M, 14, ww, hh); }
    T('PEDIDO DE VENDA', W - M, 40, 'bold 20px Helvetica, Arial, sans-serif', '#fff', 'right');
    T('Pedido ' + (p.numeroPortal ? 'nº ' + p.numeroPortal : 'de ' + dataBR(p.data)), W - M, 60, '12px Helvetica, Arial, sans-serif', '#f3dfae', 'right');
    T('Pedaço de Minas Alimentos LTDA · CNPJ 68.154.480/0001-89', W - M, 80, '9px Helvetica, Arial, sans-serif', '#f3dfae', 'right');
    T('(24) 97405-7152 · www.lazinho.ind.br · @lazinho.pão', W - M, 94, '9px Helvetica, Arial, sans-serif', '#f3dfae', 'right');
    y = 134;
  }
  nova();
  // dados do cliente e do pedido
  const end = [c.logradouro && (c.logradouro + (c.numero ? ', ' + c.numero : '')), c.bairro, c.municipio && (c.municipio + (c.uf ? '/' + c.uf : '')), c.cep && ('CEP ' + c.cep)].filter(Boolean).join(' — ');
  ctx.font = '10px Helvetica, Arial, sans-serif'; const lEnd = end ? quebra(ctx, end, W - 2 * M - 24) : [];
  const hCli = 56 + lEnd.length * 13 + (c.fone ? 13 : 0);
  caixa(ctx, M, y, W - 2 * M, hCli, CREME, LINHA);
  T('CLIENTE', M + 12, y + 16, 'bold 8px Helvetica, Arial, sans-serif', OURO);
  T(p.clienteNome || c.nome || '', M + 12, y + 33, 'bold 14px Helvetica, Arial, sans-serif', VINHO);
  T('CNPJ/CPF ' + docFmt(p.clienteDoc), M + 12, y + 47, '10px Helvetica, Arial, sans-serif', SUAVE);
  let yy = y + 61; lEnd.forEach(l => { T(l, M + 12, yy, '10px Helvetica, Arial, sans-serif', TXT); yy += 13; });
  if (c.fone) T('Tel. ' + c.fone, M + 12, yy, '10px Helvetica, Arial, sans-serif', TXT);
  y += hCli + 10;
  const info = [['Data do pedido', dataBR(p.data)], ['Pagamento', p.condicaoNome || '—'], ['Vendedor', d.vendedorNome || p.vendedorNome || '—'], ['Entrega desejada', p.dataEntrega ? dataBR(p.dataEntrega) : 'a combinar']];
  const cw = (W - 2 * M - 9 * 3) / 4;
  info.forEach((k, i) => { const x = M + i * (cw + 9); caixa(ctx, x, y, cw, 38, '#fff', LINHA); T(k[0].toUpperCase(), x + 8, y + 13, 'bold 7px Helvetica, Arial, sans-serif', OURO); ctx.font = 'bold 10.5px Helvetica, Arial, sans-serif'; const l = quebra(ctx, k[1], cw - 16)[0] || ''; T(l, x + 8, y + 29, 'bold 10.5px Helvetica, Arial, sans-serif', TXT); });
  y += 52;
  // itens
  const cabItens = () => { ctx.fillStyle = VINHO; ctx.fillRect(M, y, W - 2 * M, 20); const f = 'bold 8.5px Helvetica, Arial, sans-serif'; T('PRODUTO', M + 8, y + 13.5, f, '#fff'); T('QTD', 370, y + 13.5, f, '#fff', 'right'); T('PREÇO UN.', 445, y + 13.5, f, '#fff', 'right'); T('SUBTOTAL', W - M - 8, y + 13.5, f, '#fff', 'right'); y += 20; };
  cabItens();
  (p.itens || []).forEach((i, k) => {
    const RH = 60;
    if (y + RH > H - 150) { nova(); cabItens(); }
    if (k % 2) { ctx.fillStyle = '#fffaf0'; ctx.fillRect(M, y, W - 2 * M, RH); }
    ctx.strokeStyle = LINHA; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(M, y + RH); ctx.lineTo(W - M, y + RH); ctx.stroke();
    caixa(ctx, M + 6, y + 6, 48, 48, '#fff', LINHA); const im = fotos[i.prodId]; if (im) contem(ctx, im, M + 8, y + 8, 44, 44); else T((i.nome || '?')[0], M + 30, y + 38, 'bold 20px Helvetica, Arial, sans-serif', OURO, 'center');
    ctx.font = 'bold 10.5px Helvetica, Arial, sans-serif'; const ln = quebra(ctx, i.nome || '', 240).slice(0, 2);
    ln.forEach((l, j) => T(l, M + 64, y + 24 + j * 13, 'bold 10.5px Helvetica, Arial, sans-serif', TXT));
    T((i.un || '') + (i.codigo ? ' · cód. ' + i.codigo : ''), M + 64, y + 24 + ln.length * 13, '9px Helvetica, Arial, sans-serif', SUAVE);
    T(qtdFmt(i.qtd) + ' ' + (i.un || ''), 370, y + 34, '10.5px Helvetica, Arial, sans-serif', TXT, 'right');
    T(brl(i.preco), 445, y + 34, '10.5px Helvetica, Arial, sans-serif', TXT, 'right');
    T(brl(i.subtotal), W - M - 8, y + 34, 'bold 10.5px Helvetica, Arial, sans-serif', TXT, 'right');
    y += RH;
  });
  // total
  if (y + 120 > H - 70) { nova(); }
  y += 10; caixa(ctx, W - M - 200, y, 200, 34, VINHO); T('TOTAL DO PEDIDO', W - M - 190, y + 21, 'bold 8.5px Helvetica, Arial, sans-serif', '#f3dfae'); T(brl(p.total), W - M - 10, y + 22, 'bold 15px Helvetica, Arial, sans-serif', '#fff', 'right');
  T((p.itens || []).length + ' item(ns)', M, y + 21, '10px Helvetica, Arial, sans-serif', SUAVE);
  y += 50;
  if (p.obs) {
    ctx.font = '10.5px Helvetica, Arial, sans-serif'; const lo = quebra(ctx, p.obs, W - 2 * M - 24).slice(0, 8), ho = 30 + lo.length * 14;
    if (y + ho > H - 60) nova();
    caixa(ctx, M, y, W - 2 * M, ho, CREME, LINHA); T('OBSERVAÇÕES', M + 12, y + 16, 'bold 8px Helvetica, Arial, sans-serif', OURO);
    lo.forEach((l, j) => T(l, M + 12, y + 32 + j * 14, '10.5px Helvetica, Arial, sans-serif', TXT)); y += ho + 10;
  }
  // rodapé em todas as páginas
  paginas.forEach((pc, n) => { const x = pc.getContext('2d'); x.setTransform(S, 0, 0, S, 0, 0); x.fillStyle = OURO; x.fillRect(M, H - 46, W - 2 * M, 1.2); x.fillStyle = SUAVE; x.font = '8.5px Helvetica, Arial, sans-serif'; x.textAlign = 'left'; x.fillText('Pedido sujeito a confirmação e faturamento pela Pão de Queijo Lazinho. Valores e condições conforme este documento.', M, H - 32); x.fillText('Gerado em ' + new Date().toLocaleDateString('pt-BR') + ' · Pão de Queijo Lazinho · @lazinho.pão', M, H - 20); x.textAlign = 'right'; x.fillText('Página ' + (n + 1) + ' de ' + paginas.length, W - M, H - 20); });
  const jpgs = await Promise.all(paginas.map(pc => new Promise(r => pc.toBlob(b => b.arrayBuffer().then(a => r({ b: new Uint8Array(a), w: pc.width, h: pc.height })), 'image/jpeg', 0.9))));
  return montaPdf(jpgs);
}

function montaPdf(pgs) {
  const enc = new TextEncoder(), partes = [], off = []; let tam = 0;
  const add = x => { const u = typeof x === 'string' ? enc.encode(x) : x; partes.push(u); tam += u.length; };
  const obj = (n, corpo) => { off[n] = tam; add(n + ' 0 obj\n'); corpo.forEach(add); add('\nendobj\n'); };
  const N = pgs.length; add('%PDF-1.4\n');
  obj(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
  obj(2, ['<< /Type /Pages /Kids [' + pgs.map((_, i) => (3 + i * 3) + ' 0 R').join(' ') + '] /Count ' + N + ' >>']);
  pgs.forEach((g, i) => {
    const pn = 3 + i * 3, im = pn + 1, ct = pn + 2, cont = 'q ' + W + ' 0 0 ' + H + ' 0 0 cm /Im0 Do Q';
    obj(pn, ['<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] /Resources << /XObject << /Im0 ' + im + ' 0 R >> >> /Contents ' + ct + ' 0 R >>']);
    obj(im, ['<< /Type /XObject /Subtype /Image /Width ' + g.w + ' /Height ' + g.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + g.b.length + ' >>\nstream\n', g.b, '\nendstream']);
    obj(ct, ['<< /Length ' + cont.length + ' >>\nstream\n' + cont + '\nendstream']);
  });
  const xr = tam, total = 3 + N * 3;
  add('xref\n0 ' + total + '\n0000000000 65535 f \n'); for (let n = 1; n < total; n++) add(String(off[n]).padStart(10, '0') + ' 00000 n \n');
  add('trailer\n<< /Size ' + total + ' /Root 1 0 R >>\nstartxref\n' + xr + '\n%%EOF');
  return new Blob(partes, { type: 'application/pdf' });
}
