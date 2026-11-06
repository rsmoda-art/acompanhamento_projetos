const API_URL = 'https://script.google.com/macros/s/AKfycbyaQ1ZEtGFO_XgI1wprpnnQ6PLObn1irw40CaCAnYUu4Q66V4-4iWxC4bUQjyVRIpiW/exec';

let projetos = [];
let projetoAtual = null;
const $ = id => document.getElementById(id);

// ---------- Cálculos ----------
const isSub = id => id.includes('.');
const parentId = id => id.split('.')[0];

function calcularProgresso(rows) {
  const pais = rows.filter(r => !String(r.id).includes('.'));

  const resumo = pais.map(pai => {
    const filhos = rows.filter(r => String(r.id).startsWith(pai.id + '.'));
    if (!filhos.length) {
      return { pct: Number(pai.pct) || 0, peso: Number(pai.prazo) || 0 };
    }
    const somaPrazo = filhos.reduce((s, f) => s + (Number(f.prazo) || 0), 0);
    const pct = somaPrazo > 0
      ? filhos.reduce((s, f) => s + (Number(f.pct) || 0) * (Number(f.prazo) || 0), 0) / somaPrazo
      : filhos.reduce((s, f) => s + (Number(f.pct) || 0), 0) / filhos.length;
    return { pct, peso: somaPrazo || Number(pai.prazo) || 0 };
  });

  const somaPesos = resumo.reduce((s, r) => s + r.peso, 0);
  const total = somaPesos > 0
    ? resumo.reduce((s, r) => s + r.pct * r.peso, 0) / somaPesos
    : resumo.reduce((s, r) => s + r.pct, 0) / (resumo.length || 1);

  return { total, resumo };
}

const fmt = n => `${(Math.round(n * 10) / 10).toLocaleString('pt-BR')}%`;
const bar = pct => `<div class="bar ${pct >= 100 ? 'done' : ''}"><div style="width:${Math.min(pct,100)}%"></div></div>`;

// ---------- API ----------
async function carregar() {
  $('loading').classList.remove('hidden');
  try {
    const res = await fetch(`${API_URL}?action=all`);
    projetos = await res.json();
    projetoAtual ? abrirProjeto(projetoAtual) : renderLista();
  } catch (e) {
    toast('Erro ao carregar dados');
  }
  $('loading').classList.add('hidden');
}

async function salvar(id, pct) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // evita preflight CORS
    body: JSON.stringify({ project: projetoAtual, id, pct })
  });
  return res.json();
}

// ---------- Telas ----------
function renderLista() {
  projetoAtual = null;
  $('titulo').textContent = 'Projetos';
  $('btnVoltar').classList.add('hidden');
  $('telaProjeto').classList.add('hidden');
  $('telaLista').classList.remove('hidden');
  $('telaLista').innerHTML = projetos.map(p => {
    const { total } = calcular(p.rows);
    return `<div class="card" data-nome="${encodeURIComponent(p.nome)}">
      <h2><span>${p.nome}</span><span>${fmt(total)}</span></h2>${bar(total)}</div>`;
  }).join('') || '<p>Nenhum projeto encontrado.</p>';
  document.querySelectorAll('.card').forEach(c =>
    c.onclick = () => abrirProjeto(decodeURIComponent(c.dataset.nome)));
}

function abrirProjeto(nome) {
  const proj = projetos.find(p => p.nome === nome);
  if (!proj) return renderLista();
  projetoAtual = nome;
  $('titulo').textContent = nome;
  $('btnVoltar').classList.remove('hidden');
  $('telaLista').classList.add('hidden');
  $('telaProjeto').classList.remove('hidden');

  const { itens, total } = calcular(proj.rows);
  $('totalProjeto').innerHTML = `<strong>Total geral: ${fmt(total)}</strong>${bar(total)}`;

  const linha = (r, tipo, editavel) => `
    <tr class="${tipo} ${r.pct >= 100 ? 'concluido' : ''}">
      <td>${r.id}</td><td>${r.descricao}</td><td>${r.prazo}</td>
      <td><div class="pct-cell">
        ${editavel
          ? `<input type="number" min="0" max="100" value="${Math.round(r.pct)}" data-id="${r.id}">`
          : `<span>${fmt(r.pct)}</span>`}
        ${bar(r.pct)}
      </div></td>
    </tr>`;

  $('tabela').innerHTML = itens.map(i =>
    linha(i, 'item', !i.calculado) + i.subs.map(s => linha(s, 'sub', true)).join('')
  ).join('');

  document.querySelectorAll('#tabela input').forEach(inp =>
    inp.onchange = async () => {
      const pct = Math.max(0, Math.min(100, Number(inp.value) || 0));
      const row = proj.rows.find(r => r.id === inp.dataset.id);
      const antigo = row.pct;
      row.pct = pct;
      abrirProjeto(nome); // atualização otimista
      try {
        const r = await salvar(inp.dataset.id, pct);
        if (!r.ok) throw new Error(r.error);
        toast('Salvo ✔');
      } catch (e) {
        row.pct = antigo;
        abrirProjeto(nome);
        toast('Erro ao salvar: ' + e.message);
      }
    });
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.add('hidden'), 2500);
}

$('btnVoltar').onclick = renderLista;
$('btnAtualizar').onclick = carregar;

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
carregar();
