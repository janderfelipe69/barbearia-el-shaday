// ══════════════════════════ SUPABASE ══════════════════════════
const SUPABASE_URL = 'https://cwskaqwoxdxkywpndyzo.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3c2thcXdveGR4a3l3cG5keXpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1Mzc4OTYsImV4cCI6MjA5NDExMzg5Nn0.65IB3SUeUbxeL5zhU7vz03UCqIdebeR0p7Z8rouDbt4';
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ══════════════════════════ ESTADO GLOBAL ══════════════════════════
const state = {
  barbeiro: null,
  servico: null,
  preco: null,
  duracao: null,
  horario: null,
  data: null,
  dataFormatada: null,
  adminLogado: null,
  adminData: new Date().toISOString().split('T')[0] // inicializa com hoje
};

const horariosTodos = [
  '07:00','07:30','08:00','08:30','09:00','09:30','10:00','10:30',
  '11:00','11:30','12:00','12:30','13:00','13:30','14:00','14:30',
  '15:00','15:30','16:00','16:30','17:00','17:30','18:00','18:30',
  '19:00','19:30','20:00'
];

// ══════════════════════════ UTILITÁRIOS ══════════════════════════
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', 3000);
}

function goTo(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
  if (id === 'screen-servico') loadServicos();
  if (id === 'screen-horario') buildHorarios();
  if (id === 'screen-dados') buildResumo();
  if (id === 'screen-admin') buildAdmin();
}

// ══════════════════════════ SELEÇÃO DE BARBEIRO / SERVIÇO ══════════════════════════
function selectBarber(el, nome) {
  document.querySelectorAll('#screen-barbeiro .barber-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  state.barbeiro = nome;
}

function selectService(el, nome, preco, duracao) {
  document.querySelectorAll('.service-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  state.servico = nome;
  state.preco = preco;
  state.duracao = duracao;
}

function nextStep(tipo, destino) {
  if (tipo === 'barbeiro' && !state.barbeiro) { showToast('Selecione um profissional'); return; }
  if (tipo === 'servico'  && !state.servico)  { showToast('Selecione um serviço');       return; }
  if (tipo === 'horario'  && !state.horario)  { showToast('Selecione um horário');        return; }
  goTo(destino);
}

// ══════════════════════════ HORÁRIOS ══════════════════════════

// ── LÓGICA DE CONFLITO ──────────────────────────────────────────────────
//
// Regras:
//  • Cada agendamento existente ocupa [inicio, inicio + duracao)
//  • Um novo slot H com duração D_novo está BLOQUEADO se seu intervalo
//    [H, H + D_novo) se sobrepõe com qualquer agendamento existente,
//    descontando a tolerância de 15min de transição entre atendimentos.
//
//  Sobreposição real (sem tolerância):
//    H < (A + D_existente)  &&  (H + D_novo) > A
//
//  Com tolerância de 15min:
//    H < (A + D_existente - TOLERANCIA)  &&  (H + D_novo - TOLERANCIA) > A
//
//  Exemplo: serviço de 2h agendado às 16h → ocupa [960, 1080)
//    • Slot 14:00 (com serviço de 30min): [840,870) — não conflita ✓
//    • Slot 15:00 (com serviço de 30min): [900,930) — não conflita ✓
//    • Slot 15:30 (com serviço de 30min): [930,960) — termina exatamente
//       quando começa o próximo, dentro da tolerância ✓
//    • Slot 15:45 (com serviço de 30min): conflita ✗ (bloqueado)
//    • Slot 16:00 — ocupado ✗
//    • Slot 17:00 — dentro do serviço de 2h ✗ (bloqueado)
//    • Slot 18:00 — livre ✓ (após o fim às 18h + tolerância ok)

const TOLERANCIA = 15; // minutos de buffer entre atendimentos

function horaParaMin(h) {
  const [hh, mm] = h.split(':').map(Number);
  return hh * 60 + mm;
}

function calcularSlotsOcupados(agendamentos, duracaoNovoServico) {
  const D_novo = duracaoNovoServico || state.duracao || 60;

  return horariosTodos.filter(slot => {
    const H = horaParaMin(slot);

    return agendamentos.some(ag => {
      const A    = horaParaMin(ag.horario);
      const D_ag = Number(ag.duracao) || 60;

      const novoComeca  = H;
      const novoTermina = H + D_novo;
      const agComeca    = A;
      const agTermina   = A + D_ag;

      return novoComeca < (agTermina - TOLERANCIA) && (novoTermina - TOLERANCIA) > agComeca;
    });
  });
}

async function buildHorarios() {
  const dc = document.getElementById('dateSelector');
  dc.innerHTML = '';
  const dias = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const hoje = new Date();

  for (let i = 0; i < 7; i++) {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() + i);
    const btn = document.createElement('button');
    btn.className = 'date-pill' + (i === 0 ? ' selected' : '');
    btn.innerHTML = `<span class="date-num">${d.getDate()}</span>${dias[d.getDay()]}`;
    const dataStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const dataFmt = `${d.getDate()}/${d.getMonth()+1}`;
    btn.onclick = function() {
      document.querySelectorAll('.date-pill').forEach(b => b.classList.remove('selected'));
      this.classList.add('selected');
      state.data = dataStr;
      state.dataFormatada = dataFmt;
      loadHorarios();
    };
    if (i === 0) { state.data = dataStr; state.dataFormatada = dataFmt; }
    dc.appendChild(btn);
  }
  loadHorarios();
}

async function loadHorarios() {
  const grid = document.getElementById('horariosGrid');
  grid.innerHTML = '<div class="loading" style="grid-column:span 3">Verificando</div>';
  state.horario = null;

  const { data: agendamentos } = await db
    .from('agendamentos')
    .select('horario, duracao, servico')
    .eq('barbeiro', state.barbeiro)
    .eq('data', state.data)
    .eq('status', 'confirmado');

  const slotsOcupados = calcularSlotsOcupados(agendamentos || [], state.duracao);

  grid.innerHTML = '';
  horariosTodos.forEach(h => {
    const btn = document.createElement('button');
    const ocupado = slotsOcupados.includes(h);
    btn.className = 'time-btn' + (ocupado ? ' unavailable' : '');
    btn.textContent = h;
    if (!ocupado) {
      btn.onclick = function() {
        document.querySelectorAll('.time-btn:not(.unavailable)').forEach(b => b.classList.remove('selected'));
        this.classList.add('selected');
        state.horario = h;
      };
    }
    grid.appendChild(btn);
  });
}

// ══════════════════════════ RESUMO & CONFIRMAÇÃO ══════════════════════════
function buildResumo() {
  document.getElementById('resumoBarbeiro').textContent = state.barbeiro || '—';
  document.getElementById('resumoServico').textContent  = state.servico  || '—';
  document.getElementById('resumoHorario').textContent  =
    state.dataFormatada && state.horario ? `${state.dataFormatada} às ${state.horario}` : '—';
  document.getElementById('resumoPreco').textContent    = state.preco ? `R$ ${state.preco}` : '—';
}

async function confirmarAgendamento() {
  const nome = document.getElementById('clienteNome').value.trim();
  const tel  = document.getElementById('clienteTel').value.trim();
  if (!nome || !tel) { showToast('Preencha seu nome e WhatsApp'); return; }

  const btn = document.getElementById('btnConfirmar');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  const { error } = await db.from('agendamentos').insert({
    cliente:  nome,
    telefone: tel,
    barbeiro: state.barbeiro,
    servico:  state.servico,
    preco:    state.preco,
    duracao:  state.duracao,
    data:     state.data,
    horario:  state.horario,
    status:   'confirmado'
  });

  btn.disabled = false;
  btn.textContent = 'Confirmar Agendamento';

  if (error) {
    showToast('Erro ao salvar. Tente novamente.');
    console.error(error);
    return;
  }

  document.getElementById('successMsg').innerHTML =
    `✂️ ${state.servico} com ${state.barbeiro}<br>📅 ${state.dataFormatada} às ${state.horario}<br>💰 R$ ${state.preco}`;
  goTo('screen-sucesso');
}

// ══════════════════════════ PAINEL ADMIN ══════════════════════════
async function buildAdmin() {
  buildAdminDates();
  loadAdminAgendamentos();
}

function buildAdminDates() {
  const dc = document.getElementById('adminDateSelector');
  dc.innerHTML = '';
  const dias = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const hoje = new Date();

  for (let i = -3; i <= 7; i++) {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() + i);
    const btn = document.createElement('button');
    const dataStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    btn.className = 'date-pill' + (i === 0 ? ' selected' : '');
    btn.innerHTML = `<span class="date-num">${d.getDate()}</span>${dias[d.getDay()]}`;
    btn.onclick = function() {
      document.querySelectorAll('#adminDateSelector .date-pill').forEach(b => b.classList.remove('selected'));
      this.classList.add('selected');
      state.adminData = dataStr;
      const label = i === 0 ? 'hoje' : `${d.getDate()}/${d.getMonth()+1}`;
      document.getElementById('adminDiaTitulo').textContent = `Agendamentos de ${label}`;
      loadAdminAgendamentos();
    };
    if (i === 0) state.adminData = dataStr;
    dc.appendChild(btn);
  }
  setTimeout(() => {
    const sel = dc.querySelector('.selected');
    if (sel) sel.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, 100);
}

async function loadAdminAgendamentos() {
  const lista = document.getElementById('agendamentosLista');
  lista.innerHTML = '<div class="loading">Carregando</div>';

  let query = db.from('agendamentos').select('*').eq('data', state.adminData).order('horario');
  if (state.adminLogado !== 'Admin') query = query.eq('barbeiro', state.adminLogado);

  const { data, error } = await query;
  if (error) { lista.innerHTML = '<div class="loading">Erro ao carregar.</div>'; return; }

  if (!data || data.length === 0) {
    lista.innerHTML = '<p style="color:var(--text-dim); font-size:0.82rem; text-align:center; padding:2.5rem 0; letter-spacing:0.05em;">Nenhum agendamento para este dia</p>';
  } else {
    lista.innerHTML = data.map(a => `
      <div class="appt-card ${a.status === 'cancelado' ? 'appt-cancelled' : ''}" id="appt-${a.id}">
        <div class="appt-header" style="cursor:pointer" onclick="abrirPerfil('${a.telefone.replace(/'/g,"\\'")}', '${a.cliente.replace(/'/g,"\\'")}')">
          <span class="appt-client">${a.cliente}</span>
          <span class="badge ${a.status === 'confirmado' ? 'badge-confirmed' : a.status === 'cancelado' ? 'badge-cancelled' : 'badge-pending'}">${a.status}</span>
        </div>
        <div class="appt-meta" style="cursor:pointer" onclick="abrirPerfil('${a.telefone.replace(/'/g,"\\'")}', '${a.cliente.replace(/'/g,"\\'")}')">✂️ ${a.servico} · R$ ${a.preco}</div>
        <div class="appt-meta" style="margin-top:2px; cursor:pointer" onclick="abrirPerfil('${a.telefone.replace(/'/g,"\\'")}', '${a.cliente.replace(/'/g,"\\'")}')">👤 ${a.barbeiro}</div>
        <div class="appt-meta" style="margin-top:2px; cursor:pointer" onclick="abrirPerfil('${a.telefone.replace(/'/g,"\\'")}', '${a.cliente.replace(/'/g,"\\'")}')">📱 ${a.telefone}</div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.6rem; gap:0.5rem;">
          <span class="appt-time" style="margin-top:0">🕐 ${a.horario}</span>
          ${a.status !== 'cancelado' ? `
          <button class="btn-cancelar-appt" onclick="cancelarAgendamento(${a.id}, '${a.cliente.replace(/'/g,"\\'")}', event)">
            Desmarcar
          </button>` : `<span style="font-size:0.65rem; color:var(--text-dim); letter-spacing:0.08em;">CANCELADO</span>`}
        </div>
      </div>`).join('');
  }

  const { data: todos } = await db.from('agendamentos').select('*').order('created_at', { ascending: false });
  const clientes = document.getElementById('clientesLista');
  if (!todos || todos.length === 0) {
    clientes.innerHTML = '<p style="color:var(--text-dim); font-size:0.82rem; text-align:center; padding:2.5rem 0;">Nenhum cliente ainda</p>';
  } else {
    const unicos = [...new Map(todos.map(a => [a.telefone, a])).values()];
    clientes.innerHTML = unicos.map(a => `
      <div class="appt-card" style="cursor:pointer; display:flex; align-items:center; justify-content:space-between;"
           onclick="abrirPerfil('${a.telefone.replace(/'/g,"\\'")}', '${a.cliente.replace(/'/g,"\\'")}')">
        <div style="flex:1">
          <div class="appt-header" style="margin-bottom:0">
            <span class="appt-client">${a.cliente}</span>
          </div>
          <div class="appt-meta" style="margin-top:3px">${a.telefone}</div>
          <div class="appt-meta" style="margin-top:2px">Último: ${a.servico} · ${a.barbeiro}</div>
        </div>
        <span style="color:var(--gold-dim); font-size:1rem; padding-left:0.75rem">›</span>
      </div>`).join('');
  }
}

async function cancelarAgendamento(id, nomeCliente, event) {
  event.stopPropagation();
  const confirmado = confirm(`Desmarcar o agendamento de ${nomeCliente}?\nEsta ação não pode ser desfeita.`);
  if (!confirmado) return;

  const btn = event.target;
  btn.disabled = true;
  btn.textContent = 'Cancelando...';

  const { error } = await db
    .from('agendamentos')
    .update({ status: 'cancelado' })
    .eq('id', id);

  if (error) {
    showToast('Erro ao cancelar. Tente novamente.');
    console.error(error);
    btn.disabled = false;
    btn.textContent = 'Desmarcar';
    return;
  }

  showToast('Agendamento desmarcado.');
  loadAdminAgendamentos();
}

// ══════════════════════════ AUTH GOOGLE ══════════════════════════

// Emails autorizados a acessar o painel admin
const EMAILS_AUTORIZADOS = [
  'janderfeelipe@gmail.com',   
  // adicione mais emails aqui se precisar
];

// Mapa email → nome do barbeiro no sistema
const EMAIL_PARA_NOME = {
  'janderfeelipe@gmail.com': 'Rafael Henrique',
};

async function loginComGoogle() {
  const btn = document.getElementById('btnGoogle');
  btn.disabled = true;
  btn.textContent = 'Aguarde...';

  const { error } = await db.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.href
    }
  });

  if (error) {
    btn.disabled = false;
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/><path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z" fill="#EA4335"/></svg> Entrar com Google`;
    mostrarErroLogin('Erro ao iniciar login. Tente novamente.');
  }
}

function mostrarErroLogin(msg) {
  const el = document.getElementById('loginErro');
  el.textContent = msg;
  el.style.display = 'block';
}

async function verificarSessao() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) return;

  const email = session.user.email;

  if (!EMAILS_AUTORIZADOS.includes(email)) {
    await db.auth.signOut();
    goTo('screen-admin-login');
    mostrarErroLogin(`Acesso negado. O email "${email}" não está autorizado.`);
    return;
  }

  const nome = EMAIL_PARA_NOME[email] || 'Admin';
  state.adminLogado = nome;
  document.getElementById('adminNome').textContent = nome;
  goTo('screen-admin');
}

// Detecta retorno do login Google e monitora mudanças de sessão
db.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN') {
    verificarSessao();
  }
});

// Verifica sessão ao carregar a página (caso já esteja logado)
verificarSessao();

function loginAdmin(nome) {
  state.adminLogado = nome;
  document.getElementById('adminNome').textContent = nome === 'Admin' ? 'Administrador' : nome;
  goTo('screen-admin');
}

// ══════════════════════════ PERFIL DO CLIENTE ══════════════════════════
function fecharPerfil() {
  document.getElementById('clienteSheet').classList.remove('open');
  document.getElementById('clienteOverlay').classList.remove('open');
}

async function abrirPerfil(telefone, nome) {
  const initials = nome.split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase();
  document.getElementById('modalAvatar').textContent  = initials;
  document.getElementById('modalNome').textContent    = nome;
  document.getElementById('modalTel').textContent     = telefone;
  document.getElementById('statTotal').textContent    = '—';
  document.getElementById('statGasto').textContent    = '—';
  document.getElementById('statServico').textContent  = '—';
  document.getElementById('proximoCard').innerHTML    = '<div class="loading" style="padding:0.5rem 0">Carregando</div>';
  document.getElementById('modalHistorico').innerHTML = '<div class="loading">Carregando</div>';

  document.getElementById('clienteSheet').classList.add('open');
  document.getElementById('clienteOverlay').classList.add('open');

  const { data: todos } = await db
    .from('agendamentos')
    .select('*')
    .eq('telefone', telefone)
    .order('data', { ascending: false });

  if (!todos || todos.length === 0) {
    document.getElementById('modalHistorico').innerHTML =
      '<p style="color:var(--text-dim);font-size:0.8rem;padding:1rem 0">Nenhum histórico encontrado.</p>';
    return;
  }

  const hoje = new Date().toISOString().split('T')[0];
  const passados = todos.filter(a => a.data <= hoje).sort((a, b) => b.data.localeCompare(a.data) || b.horario.localeCompare(a.horario));
  const futuros  = todos.filter(a => a.data > hoje).sort((a, b) => a.data.localeCompare(b.data) || a.horario.localeCompare(b.horario));

  // Stats
  const totalVisitas = passados.length;
  const totalGasto   = passados.reduce((s, a) => s + Number(a.preco || 0), 0);
  const freq = {};
  passados.forEach(a => { freq[a.servico] = (freq[a.servico] || 0) + 1; });
  const favorito = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
  const favAbrev = favorito ? favorito[0].split(' ')[0] : '—';

  document.getElementById('statTotal').textContent   = totalVisitas;
  document.getElementById('statGasto').textContent   = totalGasto > 0 ? `R$${totalGasto}` : '—';
  document.getElementById('statServico').textContent = favAbrev;

  // Próximo agendamento
  const proximo = futuros[0];
  if (proximo) {
    const [ano, mes, dia] = proximo.data.split('-');
    document.getElementById('proximoCard').innerHTML = `
      <div class="next-appt-row">
        <div>
          <div class="next-appt-service">${proximo.servico}</div>
          <div class="next-appt-meta">✂️ ${proximo.barbeiro} · 🕐 ${proximo.horario}</div>
        </div>
        <div class="next-appt-date">${dia}/${mes}/${ano}</div>
      </div>`;
  } else {
    document.getElementById('proximoWrap').style.display = 'none';
  }

  // Histórico
  if (passados.length === 0) {
    document.getElementById('modalHistorico').innerHTML =
      '<p style="color:var(--text-dim);font-size:0.8rem;padding:0.5rem 0">Sem visitas anteriores.</p>';
    return;
  }

  document.getElementById('modalHistorico').innerHTML = passados.map((a, i) => {
    const [ano, mes, dia] = a.data.split('-');
    return `
      <div class="history-item">
        <div class="history-dot ${i === 0 ? 'latest' : ''}"></div>
        <div class="history-info">
          <div class="history-service">${a.servico}</div>
          <div class="history-meta">${dia}/${mes}/${ano} às ${a.horario} · ${a.barbeiro}</div>
        </div>
        <div class="history-price">R$ ${a.preco}</div>
      </div>`;
  }).join('');
}

// ══════════════════════════ NAVEGAÇÃO DO PAINEL ══════════════════════════
function bottomNavClick(tab) {
  ['agenda', 'servicos', 'clientes'].forEach(t => {
    const bn = document.getElementById('bnav-' + t);
    if (bn) bn.classList.toggle('active', t === tab);
    const at = document.getElementById('atab-' + t);
    if (at) at.classList.toggle('active', t === tab);
  });
  document.getElementById('tab-agenda').style.display   = tab === 'agenda'   ? 'block' : 'none';
  document.getElementById('tab-clientes').style.display = tab === 'clientes' ? 'block' : 'none';
  document.getElementById('tab-servicos').style.display = tab === 'servicos' ? 'block' : 'none';
  if (tab === 'servicos') loadAdminServicos();
}

// Legado – mantido para compatibilidade
function switchTab(el, tabId) { /* legado */ }
function switchTabServicos(el) { bottomNavClick('servicos'); }

// ══════════════════════════ SERVIÇOS DINÂMICOS (agendamento) ══════════════════════════
async function loadServicos() {
  const lista = document.getElementById('servicosList');
  lista.innerHTML = '<div class="loading">Carregando serviços</div>';

  const { data, error } = await db
    .from('servicos')
    .select('id, nome, preco, duracao, ativo')
    .order('nome');

  if (error) {
    console.error('loadServicos error:', error);
    lista.innerHTML = '<div class="loading">Erro ao carregar serviços</div>';
    return;
  }

  const ativos = (data || []).filter(s => s.ativo !== false);

  if (ativos.length === 0) {
    lista.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">✂️</div>
        <div class="empty-state-text">Nenhum serviço disponível no momento.<br>Aguarde a atualização pelo painel.</div>
      </div>`;
    return;
  }

  lista.innerHTML = ativos.map(s => `
    <div class="service-card" onclick="selectService(this, '${s.nome.replace(/'/g,"\\'")}', ${s.preco}, ${s.duracao})">
      <div class="service-left">
        <div class="service-name">${s.nome}</div>
        ${s.descricao ? `<div class="service-desc">${s.descricao}</div>` : ''}
      </div>
      <div class="service-right">
        <div class="service-price">R$ ${s.preco}</div>
        <div class="service-dur">${s.duracao} min</div>
      </div>
    </div>`).join('');
}

// ══════════════════════════ ADMIN: GERENCIAR SERVIÇOS ══════════════════════════
async function loadAdminServicos() {
  const lista = document.getElementById('adminServicosLista');
  lista.innerHTML = '<div class="loading">Carregando</div>';

  const { data, error } = await db
    .from('servicos')
    .select('id, nome, preco, duracao, ativo')
    .order('nome');

  if (error) {
    console.error('loadAdminServicos error:', error);
    lista.innerHTML = `<div style="color:var(--text-dim);font-size:0.8rem;padding:2rem;text-align:center;line-height:1.9;">
      Erro ao carregar.<br><span style="font-size:0.7rem;opacity:0.6">${error.message}</span>
    </div>`;
    return;
  }

  if (!data || data.length === 0) {
    lista.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">✂️</div>
        <div class="empty-state-text">Nenhum serviço cadastrado.<br>Clique em "+ Novo" para adicionar.</div>
      </div>`;
    return;
  }

  lista.innerHTML = data.map(s => {
    const ativo = s.ativo !== false;
    return `
    <div class="servico-admin-card" id="scard-${s.id}">
      <div class="servico-admin-info">
        <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
          <div class="servico-admin-nome">${s.nome}</div>
          <span class="servico-status-badge ${ativo ? '' : 'inativo'}">${ativo ? 'ativo' : 'inativo'}</span>
        </div>
        ${s.descricao ? `<div class="servico-admin-desc">${s.descricao}</div>` : ''}
        <div class="servico-admin-meta">
          <span class="servico-admin-preco">R$ ${s.preco}</span>
          <span class="servico-admin-dur">· ${s.duracao} min</span>
        </div>
      </div>
      <div style="display:flex; flex-direction:column; gap:0.4rem; align-items:center;">
        <button class="btn-delete-servico" onclick="toggleServicoAtivo(${s.id}, ${ativo})" title="${ativo ? 'Desativar' : 'Ativar'}">
          ${ativo ? '⏸' : '▶'}
        </button>
        <button class="btn-delete-servico" onclick="confirmarExclusao(${s.id}, '${s.nome.replace(/'/g,"\\'")}')">🗑</button>
      </div>
    </div>`;
  }).join('');
}

async function toggleServicoAtivo(id, ativoAtual) {
  const { error } = await db
    .from('servicos')
    .update({ ativo: !ativoAtual })
    .eq('id', id);

  if (error) { showToast('Erro ao atualizar serviço'); return; }
  showToast(ativoAtual ? 'Serviço desativado' : 'Serviço ativado');
  loadAdminServicos();
}

async function confirmarExclusao(id, nome) {
  if (!confirm(`Remover o serviço "${nome}"? Esta ação não pode ser desfeita.`)) return;
  const { error } = await db.from('servicos').delete().eq('id', id);
  if (error) { showToast('Erro ao remover serviço'); return; }
  showToast('Serviço removido');
  loadAdminServicos();
}

function abrirModalServico() {
  document.getElementById('novoServicoNome').value    = '';
  document.getElementById('novoServicoDesc').value    = '';
  document.getElementById('novoServicoPreco').value   = '';
  document.getElementById('novoServicoDuracao').value = '';
  document.getElementById('servicoSheet').classList.add('open');
  document.getElementById('servicoOverlay').classList.add('open');
  setTimeout(() => document.getElementById('novoServicoNome').focus(), 350);
}

function fecharModalServico() {
  document.getElementById('servicoSheet').classList.remove('open');
  document.getElementById('servicoOverlay').classList.remove('open');
}

async function salvarServico() {
  const nome    = document.getElementById('novoServicoNome').value.trim();
  const desc    = document.getElementById('novoServicoDesc').value.trim();
  const preco   = parseInt(document.getElementById('novoServicoPreco').value);
  const duracao = parseInt(document.getElementById('novoServicoDuracao').value);

  if (!nome)                    { showToast('Informe o nome do serviço');       return; }
  if (!preco || preco < 1)      { showToast('Informe um preço válido');         return; }
  if (!duracao || duracao < 5)  { showToast('Informe a duração em minutos');    return; }

  const btn = document.getElementById('btnSalvarServico');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  const payload = { nome, preco, duracao, ativo: true };
  if (desc) payload.descricao = desc;

  const { error } = await db.from('servicos').insert(payload);

  btn.disabled = false;
  btn.textContent = 'Adicionar Serviço';

  if (error) {
    showToast('Erro ao salvar. Verifique o console.');
    console.error(error);
    return;
  }

  showToast('Serviço adicionado com sucesso!');
  fecharModalServico();
  loadAdminServicos();
}