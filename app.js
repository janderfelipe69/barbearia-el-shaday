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
  adminUserId: null,
  adminData: new Date().toISOString().split('T')[0],
  // Cliente logado
  clienteLogado: null,   // { nome, telefone, userId }
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

// ── Validação de CPF (dígitos verificadores) ──────────────────
function validarCPF(cpf) {
  const n = cpf.replace(/\D/g, '');
  if (n.length !== 11 || /^(\d)\1{10}$/.test(n)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += Number(n[i]) * (10 - i);
  let r = (s * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  if (r !== Number(n[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += Number(n[i]) * (11 - i);
  r = (s * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  return r === Number(n[10]);
}

// ── Validação de DDD brasileiro ───────────────────────────────
const DDDS_VALIDOS = new Set([
  11,12,13,14,15,16,17,18,19,
  21,22,24,27,28,
  31,32,33,34,35,37,38,
  41,42,43,44,45,46,47,48,49,
  51,53,54,55,
  61,62,63,64,65,66,67,68,69,
  71,73,74,75,77,79,
  81,82,83,84,85,86,87,88,89,
  91,92,93,94,95,96,97,98,99
]);

function validarTelefone(tel) {
  const n = tel.replace(/\D/g, '');
  if (n.length < 10 || n.length > 11) return false;
  const ddd = Number(n.slice(0, 2));
  return DDDS_VALIDOS.has(ddd);
}

// ══════════════════════════ ROUTER (History API) ══════════════════════════

const ROTAS = {
  '/'                  : 'screen-home',
  '/entrar'            : 'screen-cliente-login',
  '/completar-perfil'  : 'screen-completar-perfil',
  '/agendar'           : 'screen-barbeiro',
  '/agendar/servico'   : 'screen-servico',
  '/agendar/horario'   : 'screen-horario',
  '/agendar/confirmar' : 'screen-dados',
  '/agendar/sucesso'   : 'screen-sucesso',
  '/barbeiro/login'    : 'screen-admin-login',
  '/barbeiro/painel'   : 'screen-admin',
};

const SCREEN_PATH = Object.fromEntries(Object.entries(ROTAS).map(([p, s]) => [s, p]));

function renderScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(screenId);
  if (el) el.classList.add('active');
  window.scrollTo(0, 0);
  if (screenId === 'screen-barbeiro') loadBarbeiros();
  if (screenId === 'screen-servico')  loadServicos();
  if (screenId === 'screen-horario')  buildHorarios();
  if (screenId === 'screen-dados')    buildResumo();
  if (screenId === 'screen-admin')    buildAdmin();
}

function goTo(screenId) {
  // Proteção de rotas privadas
  if (screenId === 'screen-admin' && !state.adminLogado) {
    goTo('screen-admin-login'); return;
  }
  if (['screen-barbeiro','screen-servico','screen-horario','screen-dados'].includes(screenId) && !state.clienteLogado) {
    goTo('screen-cliente-login'); return;
  }
  const path = SCREEN_PATH[screenId] || '/';
  if (window.location.pathname !== path) history.pushState({ screenId }, '', path);
  renderScreen(screenId);
}

// Botão voltar/avançar do navegador
window.addEventListener('popstate', (e) => {
  const screenId = e.state?.screenId || resolverRota(window.location.pathname);
  renderScreen(screenId);
});

function resolverRota(pathname) {
  return ROTAS[pathname] || 'screen-home';
}

function initRouter() {
  const screenId = resolverRota(window.location.pathname);
  history.replaceState({ screenId }, '', window.location.pathname);
  const publicas = ['screen-home', 'screen-cliente-login', 'screen-admin-login'];
  if (publicas.includes(screenId)) renderScreen(screenId);
}

// ══════════════════════════ BARBEIROS DINÂMICOS ══════════════════════════
async function loadBarbeiros() {
  const lista = document.getElementById('barbeirosList');
  lista.innerHTML = '<div class="loading">Carregando profissionais</div>';

  // Busca usuários cadastrados no auth que tenham nome_completo nos metadados
  // usando a tabela pública de barbeiros (profiles/barbeiros)
  const { data, error } = await db
    .from('barbeiros')
    .select('id, nome, ativo')
    .eq('ativo', true)
    .order('nome');

  if (error || !data || data.length === 0) {
    lista.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">✂️</div>
        <div class="empty-state-text">Nenhum profissional disponível no momento.</div>
      </div>`;
    return;
  }

  lista.innerHTML = data.map(b => {
    const iniciais = b.nome.split(' ').slice(0, 2).map(p => p[0].toUpperCase()).join('');
    return `
      <div class="barber-card" onclick="selectBarber(this, '${b.nome.replace(/'/g, "\\'")}')">
        <div class="barber-avatar">${iniciais}</div>
        <div class="barber-info">
          <div class="barber-name">${b.nome}</div>
          <div class="barber-role">Barbeiro · Especialista</div>
        </div>
        <span class="barber-arrow-icon barber-arrow" style="font-size:1rem">→</span>
        <span class="barber-check-icon">✓</span>
      </div>`;
  }).join('');
}

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

// ══════════════════════════ AGENDAMENTO: INICIAR ══════════════════════════
function iniciarAgendamento() {
  if (state.clienteLogado) {
    goTo('screen-barbeiro');
  } else {
    goTo('screen-cliente-login');
  }
}

// ══════════════════════════ AUTH CLIENTE ══════════════════════════

function switchClienteTab(tab) {
  const isEntrar = tab === 'entrar';
  document.getElementById('cli-tab-btn-entrar').classList.toggle('active', isEntrar);
  document.getElementById('cli-tab-btn-criar').classList.toggle('active', !isEntrar);
  document.getElementById('cli-painel-entrar').style.display = isEntrar ? 'flex' : 'none';
  document.getElementById('cli-painel-criar').style.display  = isEntrar ? 'none' : 'flex';
}

async function loginClienteGoogle() {
  const { error } = await db.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.href, queryParams: { prompt: 'select_account' } }
  });
  if (error) showToast('Erro ao conectar com Google.');
}

async function loginBarbeiroGoogle() {
  // localStorage persiste através do redirect OAuth (sessionStorage é apagado)
  localStorage.setItem('oauth_context', 'barbeiro');
  const { error } = await db.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.href, queryParams: { prompt: 'select_account' } }
  });
  if (error) {
    localStorage.removeItem('oauth_context');
    showToast('Erro ao conectar com Google.');
  }
}

async function loginClienteEmail() {
  const email = document.getElementById('cliLoginEmail').value.trim();
  const senha  = document.getElementById('cliLoginSenha').value;
  const erroEl = document.getElementById('cliLoginErro');
  erroEl.style.display = 'none';

  if (!email || !senha) { erroEl.textContent = 'Preencha e-mail e senha.'; erroEl.style.display = 'block'; return; }

  const btn = document.getElementById('btnCliEntrar');
  btn.disabled = true; btn.textContent = 'Entrando...';

  _loginManual = true;
  const { data, error } = await db.auth.signInWithPassword({ email, password: senha });
  btn.disabled = false; btn.textContent = 'Entrar';

  if (error) {
    _loginManual = false;
    erroEl.textContent = error.message.includes('Invalid login') || error.message.includes('invalid_credentials')
      ? 'E-mail ou senha incorretos.' : error.message;
    erroEl.style.display = 'block';
    return;
  }

  await verificarSessaoCliente(data.session);
  _loginManual = false;
}

async function cadastrarCliente() {
  const nome   = document.getElementById('cliCadNome').value.trim();
  const cpf    = document.getElementById('cliCadCpf').value.trim();
  const tel    = document.getElementById('cliCadTel').value.trim();
  const nasc   = document.getElementById('cliCadNasc').value;
  const email  = document.getElementById('cliCadEmail').value.trim();
  const senha  = document.getElementById('cliCadSenha').value;
  const senha2 = document.getElementById('cliCadSenha2').value;
  const erroEl    = document.getElementById('cliCadErro');
  const sucessoEl = document.getElementById('cliCadSucesso');
  erroEl.style.display = 'none'; sucessoEl.style.display = 'none';

  const err = (msg) => { erroEl.textContent = msg; erroEl.style.display = 'block'; };

  // Validações
  if (!nome || nome.trim().split(/\s+/).length < 2) return err('Informe seu nome completo (nome e sobrenome).');
  if (!cpf || !validarCPF(cpf))  return err('CPF inválido. Verifique os números digitados.');
  if (!tel || !validarTelefone(tel)) return err('Telefone inválido. Use um DDD válido (ex: 11, 21, 47).');
  if (!nasc) return err('Informe sua data de nascimento.');
  if (!email) return err('Informe um e-mail válido.');
  if (senha.length < 6) return err('Senha com no mínimo 6 caracteres.');
  if (senha !== senha2) return err('As senhas não coincidem.');

  // Verifica CPF duplicado antes de criar a conta
  const cpfNumeros = cpf.replace(/\D/g, '');
  const { data: cpfExistente } = await db
    .from('clientes')
    .select('id')
    .eq('cpf', cpfNumeros)
    .maybeSingle();
  if (cpfExistente) return err('Este CPF já está cadastrado. Tente entrar ou use "Esqueci a senha".');

  const btn = document.getElementById('btnCliCadastrar');
  btn.disabled = true; btn.textContent = 'Criando conta...';

  const { data, error } = await db.auth.signUp({
    email,
    password: senha,
    options: { data: { nome_completo: nome, telefone: tel } }
  });

  if (error) {
    btn.disabled = false; btn.textContent = 'Criar Conta';
    const msg = error.message.includes('already registered') || error.message.includes('User already registered')
      ? 'Este e-mail já está cadastrado. Tente entrar.' : error.message;
    err(msg); return;
  }

  // Salva na tabela clientes
  const userId = data.user?.id;
  if (userId) {
    await db.from('clientes').insert({
      user_id:         userId,
      nome,
      cpf:             cpfNumeros,
      telefone:        tel.replace(/\D/g, ''),
      data_nascimento: nasc,
      total_visitas:   0,
      total_gasto:     0
    });
  }

  btn.disabled = false; btn.textContent = 'Criar Conta';

  if (data.session) {
    await verificarSessaoCliente(data.session);
  } else {
    sucessoEl.textContent = '✓ Conta criada! Verifique seu e-mail para confirmar e depois entre.';
    sucessoEl.style.display = 'block';
  }
}

async function verificarSessaoCliente(session) {
  if (!session) return false;
  const user = session.user;

  // Verifica se é barbeiro/admin — se for, NÃO é cliente
  const { data: barbeiro } = await db
    .from('barbeiros')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (barbeiro) return false;

  const nome = user.user_metadata?.nome_completo || user.user_metadata?.full_name || user.email.split('@')[0];
  const tel  = user.user_metadata?.telefone || '';

  // Busca perfil completo na tabela clientes
  const { data: perfil } = await db
    .from('clientes')
    .select('nome, telefone, cpf, data_nascimento, total_visitas, total_gasto')
    .eq('user_id', user.id)
    .maybeSingle();

  state.clienteLogado = {
    nome:           perfil?.nome || nome,
    telefone:       perfil?.telefone || tel.replace(/\D/g,''),
    userId:         user.id,
    cpf:            perfil?.cpf || null,
    nascimento:     perfil?.data_nascimento || null,
    totalVisitas:   perfil?.total_visitas || 0,
    totalGasto:     perfil?.total_gasto || 0,
  };

  // Se não tem telefone (ex: entrou pelo Google e não completou), pede para completar perfil
  const telFinal = state.clienteLogado.telefone;
  if (!telFinal || telFinal.replace(/\D/g,'').length < 10) {
    document.getElementById('perfilNome').value = state.clienteLogado.nome;
    document.getElementById('perfilTel').value  = '';
    goTo('screen-completar-perfil');
    return true;
  }

  goTo('screen-barbeiro');
  return true;
}

async function salvarPerfilCliente() {
  const nome = document.getElementById('perfilNome').value.trim();
  const tel  = document.getElementById('perfilTel').value.trim();
  const erroEl = document.getElementById('perfilErro');
  erroEl.style.display = 'none';

  if (!nome || nome.split(/\s+/).length < 2) { erroEl.textContent = 'Informe seu nome completo.'; erroEl.style.display = 'block'; return; }
  if (!tel || !validarTelefone(tel)) { erroEl.textContent = 'Telefone inválido. Use um DDD válido (ex: 11, 21, 47).'; erroEl.style.display = 'block'; return; }

  const btn = document.getElementById('btnSalvarPerfil');
  btn.disabled = true; btn.textContent = 'Salvando...';

  const { error } = await db.auth.updateUser({
    data: { nome_completo: nome, telefone: tel }
  });

  if (error) {
    btn.disabled = false; btn.textContent = 'Salvar e Continuar';
    erroEl.textContent = 'Erro ao salvar. Tente novamente.'; erroEl.style.display = 'block'; return;
  }

  const telNumeros = tel.replace(/\D/g, '');

  // Cria ou atualiza registro na tabela clientes
  if (state.clienteLogado?.userId) {
    await db.from('clientes').upsert({
      user_id:  state.clienteLogado.userId,
      nome,
      telefone: telNumeros,
      cpf:      state.clienteLogado.cpf || '00000000000' // placeholder se veio pelo Google
    }, { onConflict: 'user_id' });
  }

  btn.disabled = false; btn.textContent = 'Salvar e Continuar';
  state.clienteLogado = { ...state.clienteLogado, nome, telefone: telNumeros };
  goTo('screen-barbeiro');
}

async function logoutCliente() {
  await db.auth.signOut();
  state.clienteLogado = null;
  goTo('screen-home');
  showToast('Sessão encerrada.');
}


function buildResumo() {
  document.getElementById('resumoBarbeiro').textContent = state.barbeiro || '—';
  document.getElementById('resumoServico').textContent  = state.servico  || '—';
  document.getElementById('resumoHorario').textContent  =
    state.dataFormatada && state.horario ? `${state.dataFormatada} às ${state.horario}` : '—';
  document.getElementById('resumoPreco').textContent    = state.preco ? `R$ ${state.preco}` : '—';

  const cli = state.clienteLogado;
  const cartao    = document.getElementById('clienteLogadoCard');
  const campoNome = document.getElementById('campoNomeManual');
  const campoTel  = document.getElementById('campoTelManual');
  const aviso     = document.getElementById('clienteNaoLogadoAviso');

  if (cli) {
    const iniciais = cli.nome.split(' ').slice(0,2).map(p=>p[0].toUpperCase()).join('');
    document.getElementById('clienteCardIniciais').textContent = iniciais;
    document.getElementById('clienteCardNome').textContent     = cli.nome;
    document.getElementById('clienteCardTel').textContent      = cli.telefone || 'Sem telefone';
    cartao.style.display    = 'flex';
    campoNome.style.display = 'none';
    campoTel.style.display  = 'none';
    aviso.style.display     = 'none';
    document.getElementById('clienteNome').value = cli.nome;
    document.getElementById('clienteTel').value  = cli.telefone;
  } else {
    cartao.style.display    = 'none';
    campoNome.style.display = 'block';
    campoTel.style.display  = 'block';
    aviso.style.display     = 'none';
  }
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

  if (error) {
    btn.disabled = false;
    btn.textContent = 'Confirmar Agendamento';
    showToast('Erro ao salvar. Tente novamente.');
    console.error(error);
    return;
  }

  // Incrementa contadores na tabela clientes (se o cliente tiver conta)
  if (state.clienteLogado?.userId) {
    const novasVisitas = (state.clienteLogado.totalVisitas || 0) + 1;
    const novoGasto    = Number(state.clienteLogado.totalGasto || 0) + Number(state.preco || 0);
    await db.from('clientes')
      .update({ total_visitas: novasVisitas, total_gasto: novoGasto })
      .eq('user_id', state.clienteLogado.userId);
    state.clienteLogado.totalVisitas = novasVisitas;
    state.clienteLogado.totalGasto   = novoGasto;
  }

  btn.disabled = false;
  btn.textContent = 'Confirmar Agendamento';

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

  // Descobre se este usuário é admin (tem role 'admin' nos metadados)
  // ou um barbeiro comum — busca o nome dele na tabela barbeiros
  let nomeBarbeiro = null;
  if (state.adminUserId) {
    const { data: perfil } = await db
      .from('barbeiros')
      .select('nome, admin')
      .eq('user_id', state.adminUserId)
      .single();

    if (perfil && !perfil.admin) {
      nomeBarbeiro = perfil.nome;
    }
  }

  let query = db.from('agendamentos').select('*').eq('data', state.adminData).order('horario');
  if (nomeBarbeiro) query = query.eq('barbeiro', nomeBarbeiro);

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

  // Lista de clientes: barbeiros só veem os próprios; admin vê todos
  let clientesQuery = db.from('agendamentos').select('*').order('created_at', { ascending: false });
  if (nomeBarbeiro) clientesQuery = clientesQuery.eq('barbeiro', nomeBarbeiro);

  const { data: todos } = await clientesQuery;
  const clientes = document.getElementById('clientesLista');

  // Título dinâmico: "Meus Clientes" para barbeiro, "Todos os Clientes" para admin
  const tituloClientes = document.getElementById('tituloClientes');
  if (tituloClientes) {
    tituloClientes.textContent = nomeBarbeiro ? 'Meus Clientes' : 'Todos os Clientes';
  }

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

// ══════════════════════════ AUTH EMAIL/SENHA ══════════════════════════

function switchAuthTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('tab-btn-login').classList.toggle('active', isLogin);
  document.getElementById('tab-btn-cadastro').classList.toggle('active', !isLogin);
  document.getElementById('painel-login').style.display    = isLogin ? 'flex' : 'none';
  document.getElementById('painel-cadastro').style.display = isLogin ? 'none' : 'flex';
}

function toggleSenha(inputId, btn) {
  const input = document.getElementById(inputId);
  const oculto = input.type === 'password';
  input.type = oculto ? 'text' : 'password';
  btn.style.opacity = oculto ? '0.9' : '0.4';
}

function mostrarErroLogin(msg) {
  const el = document.getElementById('loginErro');
  el.textContent = msg;
  el.style.display = 'block';
}

function ocultarErroLogin() {
  document.getElementById('loginErro').style.display = 'none';
}

// Flag para evitar que onAuthStateChange dispare em paralelo com login manual
let _loginManual = false;

async function loginComEmail() {
  const email = document.getElementById('loginEmail').value.trim();
  const senha  = document.getElementById('loginSenha').value;

  ocultarErroLogin();

  if (!email || !senha) { mostrarErroLogin('Preencha e-mail e senha.'); return; }

  const btn = document.getElementById('btnEntrar');
  btn.disabled = true;
  btn.textContent = 'Entrando...';

  _loginManual = true;
  const { data, error } = await db.auth.signInWithPassword({ email, password: senha });

  btn.disabled = false;
  btn.textContent = 'Entrar';

  if (error) {
    _loginManual = false;
    const msg = error.message.includes('Invalid login') || error.message.includes('invalid_credentials')
      ? 'E-mail ou senha incorretos.'
      : error.message;
    mostrarErroLogin(msg);
    return;
  }

  // Verifica se está na tabela de barbeiros autorizados (usando dados já retornados)
  const { data: barbeiro } = await db
    .from('barbeiros')
    .select('nome, admin, ativo')
    .eq('user_id', data.user.id)
    .maybeSingle();

  _loginManual = false;

  if (!barbeiro) {
    await db.auth.signOut();
    mostrarErroLogin('Acesso não autorizado. Fale com o administrador.');
    return;
  }

  if (!barbeiro.ativo) {
    await db.auth.signOut();
    mostrarErroLogin('Sua conta está desativada. Fale com o administrador.');
    return;
  }

  // Entra direto no painel sem chamar verificarSessao() novamente
  const nome = barbeiro.nome || data.user.user_metadata?.nome_completo || data.user.email.split('@')[0];
  state.adminLogado = nome;
  state.adminUserId = data.user.id;
  document.getElementById('adminNome').textContent = nome;
  goTo('screen-admin');
}

async function cadastrarComEmail() {
  const nome   = document.getElementById('cadNome').value.trim();
  const email  = document.getElementById('cadEmail').value.trim();
  const senha  = document.getElementById('cadSenha').value;
  const senha2 = document.getElementById('cadSenha2').value;

  const erroEl    = document.getElementById('cadastroErro');
  const sucessoEl = document.getElementById('cadastroSucesso');
  erroEl.style.display = 'none';
  sucessoEl.style.display = 'none';

  const mostrarErro = (msg) => { erroEl.textContent = msg; erroEl.style.display = 'block'; };

  if (!nome)              { mostrarErro('Informe seu nome.'); return; }
  if (!email)             { mostrarErro('Informe um e-mail válido.'); return; }
  if (senha.length < 6)   { mostrarErro('A senha deve ter no mínimo 6 caracteres.'); return; }
  if (senha !== senha2)   { mostrarErro('As senhas não coincidem.'); return; }

  const btn = document.getElementById('btnCadastrar');
  btn.disabled = true;
  btn.textContent = 'Criando conta...';

  const { data, error } = await db.auth.signUp({
    email,
    password: senha,
    options: { data: { nome_completo: nome } }
  });

  btn.disabled = false;
  btn.textContent = 'Criar Conta';

  if (error) {
    const msg = error.message.includes('already registered') || error.message.includes('User already registered')
      ? 'Este e-mail já está cadastrado. Tente entrar.'
      : error.message;
    mostrarErro(msg);
    return;
  }

  // Supabase pode confirmar email automaticamente ou não
  if (data.session) {
    // Verifica se está na tabela de barbeiros autorizados
    const { data: barbeiro } = await db
      .from('barbeiros')
      .select('nome, ativo')
      .eq('user_id', data.session.user.id)
      .maybeSingle();

    if (!barbeiro || !barbeiro.ativo) {
      await db.auth.signOut();
      const erroEl = document.getElementById('cadastroErro');
      erroEl.textContent = 'Conta criada, mas você não está na lista de autorizados. Fale com o administrador.';
      erroEl.style.display = 'block';
      return;
    }
    // Confirmação desativada — já está logado
    await verificarSessao();
  } else {
    // Confirmação por e-mail ativada
    sucessoEl.textContent = '✓ Conta criada! Verifique seu e-mail para confirmar o cadastro e depois entre.';
    sucessoEl.style.display = 'block';
    document.getElementById('cadNome').value = '';
    document.getElementById('cadEmail').value = '';
    document.getElementById('cadSenha').value = '';
    document.getElementById('cadSenha2').value = '';
  }
}

async function logoutAdmin() {
  await db.auth.signOut();
  state.adminLogado = null;
  document.getElementById('loginEmail').value = '';
  document.getElementById('loginSenha').value = '';
  ocultarErroLogin();
  goTo('screen-home');
  showToast('Sessão encerrada.');
}

async function verificarSessao() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) return;

  const user = session.user;

  // Verifica se é barbeiro/admin cadastrado na tabela barbeiros
  const { data: barbeiro } = await db
    .from('barbeiros')
    .select('nome, admin, ativo')
    .eq('user_id', user.id)
    .maybeSingle();

  if (barbeiro) {
    // É barbeiro — verifica se está autorizado (ativo)
    if (!barbeiro.ativo) {
      showToast('Acesso não autorizado. Conta desativada.');
      await db.auth.signOut();
      return;
    }
    const nome = barbeiro.nome || user.user_metadata?.nome_completo || user.user_metadata?.full_name || user.email.split('@')[0];
    state.adminLogado = nome;
    state.adminUserId = user.id;
    document.getElementById('adminNome').textContent = nome;
    goTo('screen-admin');
  } else {
    // Não é barbeiro — trata como cliente
    await verificarSessaoCliente(session);
  }
}

// Detecta retorno do login e monitora mudanças de sessão
db.auth.onAuthStateChange(async (event, session) => {
  // Login manual já cuida de tudo — evita processamento duplicado
  if (_loginManual) return;

  if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
    if (!session) return;

    const contexto = localStorage.getItem('oauth_context');

    if (contexto === 'barbeiro') {
      localStorage.removeItem('oauth_context');

      const { data: barbeiro } = await db
        .from('barbeiros')
        .select('nome, ativo')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (!barbeiro) {
        await db.auth.signOut();
        goTo('screen-admin-login');
        setTimeout(() => mostrarErroLogin('Conta Google não autorizada. Fale com o administrador.'), 300);
        return;
      }

      if (!barbeiro.ativo) {
        await db.auth.signOut();
        goTo('screen-admin-login');
        setTimeout(() => mostrarErroLogin('Sua conta está desativada. Fale com o administrador.'), 300);
        return;
      }

      const nome = barbeiro.nome || session.user.user_metadata?.full_name || session.user.email.split('@')[0];
      state.adminLogado = nome;
      state.adminUserId = session.user.id;
      document.getElementById('adminNome').textContent = nome;
      goTo('screen-admin');
      return;
    }

    // INITIAL_SESSION (reload de página com sessão ativa) ou Google sem contexto
    await verificarSessao();
  }

  if (event === 'SIGNED_OUT') {
    state.adminLogado   = null;
    state.adminUserId   = null;
    state.clienteLogado = null;
    goTo('screen-home');
  }

  // Se não havia sessão (INITIAL_SESSION sem usuário), inicializa o router
  if (event === 'INITIAL_SESSION' && !session) {
    initRouter();
  }
});

// Inicializa o router assim que o DOM estiver pronto
document.addEventListener('DOMContentLoaded', initRouter);

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