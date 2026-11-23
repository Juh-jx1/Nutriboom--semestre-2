/*
  NUTRIBOOM - JavaScript conectado ao Supabase

  Antes de usar:
  1. Configure a URL e a chave do Supabase.
  2. Adicione um campo de e-mail no HTML com id="emailUsuario".
  3. Carregue o CDN do Supabase antes deste arquivo.
  4. Remova o antigo JavaScript do index.html.
*/

const SUPABASE_URL = 'https://skhkowlyvuieirdfprlp.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_KaDCVN1eblb1gJelpab6cg_DQD8Lw-5';

if (!window.supabase) {
    alert('A biblioteca do Supabase não foi carregada. Confira o CDN no index.html.');
}

const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);

let usuarioAuth = null;

let dadosUsuario = {
    nome: '',
    peso: 0,
    altura: 0,
    imc: 0,
    classificacao: '',
    objetivo: '',
    multiplicadorProteina: 1.6
};

let aguaConsumida = 0;
let streak = 0;
let historicoPeso = [];
let logAlimentos = [];
let logTreinos = [];

let chartPesoInstance = null;
let chartMacrosInstance = null;

const hoje = new Date().toLocaleDateString('en-CA');

window.addEventListener('load', async () => {

    const { data: { session }, error } = await db.auth.getSession();

    if (error) console.error(error);

    if (session?.user) {

        usuarioAuth = session.user;

        await carregarDadosDoBanco();

        if (dadosUsuario.objetivo) {
            mostrarDashboard();
        } else {
            document.getElementById('login-section').classList.add('hidden');
            document.getElementById('onboarding-section').classList.remove('hidden');
        }
    }
});

function mostrarMensagem(mensagem) {

    const toast = document.getElementById('toast-container');

    if (!toast) {
        alert(mensagem);
        return;
    }

    toast.innerText = mensagem;
    toast.classList.remove('hidden');

    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

function obterEmail() {

    return document
        .getElementById('emailUsuario')
        ?.value.trim().toLowerCase() || '';
}

// LOGIN E CADASTRO

async function irParaOnboarding() {

    const nome = document.getElementById('nomeUsuario').value.trim();
    const senha = document.getElementById('senhaUsuario').value;
    const email = obterEmail();

    if (!nome || !senha || !email) {
        mostrarMensagem('Informe nome, e-mail e senha.');
        return;
    }

    if (!email.includes('@')) {
        mostrarMensagem('Digite um e-mail válido.');
        return;
    }

    if (senha.length < 6) {
        mostrarMensagem('A senha precisa ter pelo menos 6 caracteres.');
        return;
    }

    let resultado = await db.auth.signInWithPassword({
        email,
        password: senha
    });

    if (resultado.error) {
        resultado = await db.auth.signUp({
            email,
            password: senha
        });
    }

    if (resultado.error) {
        mostrarMensagem(
            'Não foi possível entrar/cadastrar: ' +
            resultado.error.message
        );
        return;
    }

    usuarioAuth = resultado.data.user;

    if (!resultado.data.session) {
        mostrarMensagem(
            'Confira seu e-mail para confirmar o cadastro e depois entre novamente.'
        );
        return;
    }

    dadosUsuario.nome = nome;

    const { error } = await db.from('usuarios').upsert({

        id: usuarioAuth.id,
        nome: nome,
        peso: dadosUsuario.peso || null,
        altura: dadosUsuario.altura || null,
        imc: dadosUsuario.imc || null,
        classificacao: dadosUsuario.classificacao || null,
        objetivo: dadosUsuario.objetivo || null,
        multiplicador_proteina: dadosUsuario.multiplicadorProteina || 1.6

    });

    if (error) {
        mostrarMensagem('Erro ao salvar perfil: ' + error.message);
        return;
    }

    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('onboarding-section').classList.remove('hidden');
}

// CARREGAR DADOS DO SUPABASE

async function carregarDadosDoBanco() {

    if (!usuarioAuth) return;

    const uid = usuarioAuth.id;

    const [perfil, pesos, alimentos, treinos, agua] = await Promise.all([

        db.from('usuarios')
            .select('*')
            .eq('id', uid)
            .maybeSingle(),

        db.from('historico_peso')
            .select('*')
            .eq('usuario_id', uid)
            .order('data_registro', { ascending: true }),

        db.from('alimentacoes')
            .select('*')
            .eq('usuario_id', uid)
            .order('data_refeicao', { ascending: false })
            .order('hora_refeicao', { ascending: false }),

        db.from('treinos')
            .select('*')
            .eq('usuario_id', uid)
            .order('data_treino', { ascending: false })
            .order('hora_inicio', { ascending: false }),

        db.from('consumo_agua')
            .select('*')
            .eq('usuario_id', uid)
            .eq('data_consumo', hoje)
            .maybeSingle()

    ]);

    for (const r of [perfil, pesos, alimentos, treinos, agua]) {

        if (r.error) {
            console.error(r.error);
            mostrarMensagem('Erro ao carregar dados do Supabase.');
        }
    }

    if (perfil.data) {

        const p = perfil.data;

        dadosUsuario = {
            nome: p.nome || '',
            peso: Number(p.peso) || 0,
            altura: Number(p.altura) || 0,
            imc: p.imc || 0,
            classificacao: p.classificacao || '',
            objetivo: p.objetivo || '',
            multiplicadorProteina: Number(p.multiplicador_proteina) || 1.6
        };
    }

    historicoPeso = (pesos.data || []).map(x => ({

        data: new Date(x.data_registro + 'T12:00:00')
            .toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit'
            }),

        peso: Number(x.peso)

    }));

    logAlimentos = (alimentos.data || []).map(x => ({

        data: new Date(x.data_refeicao + 'T12:00:00')
            .toLocaleDateString('pt-BR'),

        hora: (x.hora_refeicao || '').slice(0, 5),
        desc: x.descricao

    }));

    logTreinos = (treinos.data || []).map(x => ({

        data: new Date(x.data_treino + 'T12:00:00')
            .toLocaleDateString('pt-BR'),

        hora: (x.hora_inicio || '').slice(0, 5),
        desc: x.descricao,
        min: x.duracao_minutos

    }));

    aguaConsumida = agua.data?.quantidade_ml
        ? Math.floor(Number(agua.data.quantidade_ml) / 250)
        : 0;
}

// SALVAR PERFIL

async function salvarPerfil() {

    const { error } = await db.from('usuarios').upsert({

        id: usuarioAuth.id,
        nome: dadosUsuario.nome,
        peso: dadosUsuario.peso,
        altura: dadosUsuario.altura,
        imc: dadosUsuario.imc,
        classificacao: dadosUsuario.classificacao,
        objetivo: dadosUsuario.objetivo,
        multiplicador_proteina: dadosUsuario.multiplicadorProteina

    });

    if (error) {
        mostrarMensagem('Erro ao salvar perfil: ' + error.message);
        return false;
    }

    return true;
}

// CONFIGURAÇÃO INICIAL

async function calcularConfiguracaoInicial() {

    const peso = parseFloat(
        document.getElementById('pesoInicial').value.replace(',', '.')
    );

    let altura = parseFloat(
        document.getElementById('alturaInicial').value.replace(',', '.')
    );

    if (!Number.isFinite(peso) || !Number.isFinite(altura) || peso <= 0 || altura <= 0) {
        mostrarMensagem('Preencha peso e altura com valores válidos.');
        return;
    }

    if (altura > 3) altura /= 100;

    dadosUsuario.peso = peso;
    dadosUsuario.altura = altura;
    dadosUsuario.imc = (peso / (altura * altura)).toFixed(1);

    dadosUsuario.classificacao = 'IMC registrado';

    document.getElementById('mensagem-imc').innerText =
        `Seu IMC registrado é ${dadosUsuario.imc}. A interpretação depende da idade e de outros fatores.`;

    document.getElementById('resultado-analise').classList.remove('hidden');
    document.getElementById('alerta-medico').classList.remove('hidden');

    const select = document.getElementById('objetivoPrincipal');

    select.innerHTML = `
        <option value="bem-estar">Bem-estar e hábitos saudáveis</option>
        <option value="manter">Acompanhar meus hábitos</option>
    `;

    await salvarPerfil();
}

async function finalizarOnboarding() {

    dadosUsuario.objetivo =
        document.getElementById('objetivoPrincipal').value;

    dadosUsuario.multiplicadorProteina = 1.6;

    if (!await salvarPerfil()) return;

    if (historicoPeso.length === 0 && dadosUsuario.peso) {

        const { error } = await db.from('historico_peso').insert({

            usuario_id: usuarioAuth.id,
            peso: dadosUsuario.peso,
            data_registro: hoje

        });

        if (error) {
            mostrarMensagem('Erro ao registrar histórico: ' + error.message);
        } else {

            historicoPeso.push({

                data: new Date().toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit'
                }),

                peso: dadosUsuario.peso

            });
        }
    }

    mostrarDashboard();
}

// DASHBOARD

function mostrarDashboard() {

    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('onboarding-section').classList.add('hidden');
    document.getElementById('dashboard-section').classList.remove('hidden');

    prepararDashboard();
}

function prepararDashboard() {

    document.getElementById('msgBoasVindas').innerText =
        `Olá, ${dadosUsuario.nome}! 👋`;

    document.getElementById('dash-peso').innerText =
        dadosUsuario.peso || '--';

    document.getElementById('dash-imc').innerText =
        dadosUsuario.imc || '--';

    document.getElementById('dash-classificacao').innerText =
        dadosUsuario.classificacao || '--';

    document.getElementById('dash-objetivo').innerText =
        (dadosUsuario.objetivo || '--').toUpperCase();

    document.getElementById('resultado-proteina-calc').innerText = '—';

    configurarAgua();
    renderizarGraficoPeso();
    renderizarGraficoMacros();
    carregarTabelasSalvas();

    document.getElementById('rec-objetivo').innerText =
        dadosUsuario.objetivo;

    const lista = document.getElementById('lista-receitas');

    lista.innerHTML = `
        <li>
            Priorize refeições variadas e hábitos equilibrados.
            Para orientações individuais, procure um nutricionista.
        </li>
    `;

    document.getElementById('data-alimento').value = hoje;
    document.getElementById('data-treino').value = hoje;
}

// HISTÓRICO DE ALIMENTOS E TREINOS

function carregarTabelasSalvas() {

    const tbodyA = document.getElementById('log-alimentos-body');

    tbodyA.innerHTML = '';

    logAlimentos.forEach(item => {

        const tr = document.createElement('tr');

        const td1 = document.createElement('td');

        td1.innerHTML =
            `<strong>${item.data}</strong><br><small>${item.hora || '--:--'}</small>`;

        const td2 = document.createElement('td');

        td2.textContent = item.desc;

        tr.append(td1, td2);

        tbodyA.appendChild(tr);
    });

    const tbodyT = document.getElementById('log-treinos-body');

    tbodyT.innerHTML = '';

    logTreinos.forEach(item => {

        const tr = document.createElement('tr');

        const td1 = document.createElement('td');

        td1.innerHTML =
            `<strong>${item.data}</strong><br><small>${item.hora || '--:--'}</small>`;

        const td2 = document.createElement('td');

        td2.textContent = item.desc;

        const td3 = document.createElement('td');

        td3.textContent = `${item.min} min`;

        tr.append(td1, td2, td3);

        tbodyT.appendChild(tr);
    });
}

// CÁLCULO NUTRICIONAL

function calcularMacrosCompletos() {

    mostrarMensagem(
        'O cálculo de metas nutricionais foi desativado. Procure orientação profissional para metas individuais.'
    );
}

// GRÁFICO DE PESO

function renderizarGraficoPeso() {

    const canvas = document.getElementById('graficoPeso');

    if (!canvas || !window.Chart) return;

    if (chartPesoInstance) {
        chartPesoInstance.destroy();
    }

    chartPesoInstance = new Chart(canvas.getContext('2d'), {

        type: 'line',

        data: {

            labels: historicoPeso.map(x => x.data),

            datasets: [{

                label: 'Registros de peso',
                data: historicoPeso.map(x => x.peso),
                borderColor: '#EB7F7F',
                backgroundColor: 'rgba(235,127,127,.15)',
                borderWidth: 3,
                fill: true,
                tension: .35

            }]

        },

        options: {

            responsive: true,
            maintainAspectRatio: false,

            plugins: {
                legend: {
                    display: false
                }
            }

        }

    });
}

// GRÁFICO DE MACROS

function renderizarGraficoMacros() {

    const canvas = document.getElementById('graficoMacros');

    if (!canvas || !window.Chart) return;

    if (chartMacrosInstance) {
        chartMacrosInstance.destroy();
    }

    chartMacrosInstance = new Chart(canvas.getContext('2d'), {

        type: 'doughnut',

        data: {

            labels: [
                'Proteínas',
                'Carboidratos',
                'Gorduras'
            ],

            datasets: [{

                data: [30, 40, 30],

                backgroundColor: [
                    '#EB7F7F',
                    '#EAB57F',
                    '#ECEB7F'
                ]

            }]

        },

        options: {

            responsive: true,

            plugins: {
                legend: {
                    position: 'bottom'
                }
            },

            cutout: '65%'

        }

    });
}

// REGISTRAR PESO

async function registrarNovoPeso() {

    const input = document.getElementById('novo-peso-input');

    const peso = parseFloat(input.value.replace(',', '.'));

    if (!Number.isFinite(peso) || peso <= 0) {
        mostrarMensagem('Informe um valor válido.');
        return;
    }

    const { error } = await db.from('historico_peso').insert({

        usuario_id: usuarioAuth.id,
        peso: peso,
        data_registro: hoje

    });

    if (error) {
        mostrarMensagem('Erro ao salvar registro: ' + error.message);
        return;
    }

    dadosUsuario.peso = peso;

    if (dadosUsuario.altura) {
        dadosUsuario.imc =
            (peso / (dadosUsuario.altura ** 2)).toFixed(1);
    }

    if (!await salvarPerfil()) return;

    historicoPeso.push({

        data: new Date().toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit'
        }),

        peso: peso

    });

    document.getElementById('dash-peso').innerText = peso;
    document.getElementById('dash-imc').innerText =
        dadosUsuario.imc || '--';

    document.getElementById('dash-classificacao').innerText =
        'IMC registrado';

    renderizarGraficoPeso();

    input.value = '';

    mostrarMensagem('Registro salvo no Supabase!');
}

// CONTROLE DE ÁGUA

const svgCopinho = `
<svg viewBox="0 0 100 150" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 20 L80 20 L70 130 L30 130 Z"
    fill="#6bc5ff" stroke="#333" stroke-width="4"/>
    <rect x="25" y="40" width="50" height="10"
    fill="rgba(255,255,255,0.4)"/>
</svg>
`;

function configurarAgua() {

    const metaMl = Math.max(
        250,
        Math.round((dadosUsuario.peso || 0) * 35)
    );

    document.getElementById('streak-count').innerText = streak;
    document.getElementById('meta-agua-ml').innerText = metaMl;

    const totalCopos = Math.ceil(metaMl / 250);

    const grid = document.getElementById('grid-copinhos');

    grid.innerHTML = '';

    for (let i = 1; i <= totalCopos; i++) {

        const div = document.createElement('div');

        div.className =
            'copinho' + (i <= aguaConsumida ? ' cheio' : '');

        div.innerHTML = svgCopinho;
        div.id = `copo-${i}`;

        div.onclick = () => alternarCopo(i, totalCopos);

        grid.appendChild(div);
    }

    atualizarBarraAgua(aguaConsumida, totalCopos);
}

function atualizarBarraAgua(cheios, total) {

    const pct = Math.round((cheios / total) * 100) || 0;

    document.getElementById('barra-progresso-agua').style.width =
        `${pct}%`;

    document.getElementById('porcentagem-agua').innerText =
        `${pct}%`;
}

async function alternarCopo(index, total) {

    const novoTotalCopos =
        document.querySelectorAll('.copinho.cheio').length;

    const vaiEncher =
        !document.getElementById(`copo-${index}`)
            .classList.contains('cheio');

    for (let i = 1; i <= total; i++) {

        const el = document.getElementById(`copo-${i}`);

        if (vaiEncher ? i <= index : i < index) {
            el.classList.add('cheio');
        } else {
            el.classList.remove('cheio');
        }
    }

    aguaConsumida =
        document.querySelectorAll('.copinho.cheio').length;

    atualizarBarraAgua(aguaConsumida, total);

    const quantidade = aguaConsumida * 250;
    const meta = total * 250;

    const { error } = await db.from('consumo_agua').upsert({

        usuario_id: usuarioAuth.id,
        data_consumo: hoje,
        quantidade_ml: quantidade,
        meta_ml: meta

    }, {
        onConflict: 'usuario_id,data_consumo'
    });

    if (error) {
        mostrarMensagem('Erro ao salvar água: ' + error.message);
    }

    if (aguaConsumida === total && novoTotalCopos < total) {
        mostrarMensagem('Meta de hidratação registrada!');
    }
}

// REGISTRAR ALIMENTAÇÃO

async function registrarAlimentacao() {

    const desc =
        document.getElementById('desc-alimento').value.trim();

    const data =
        document.getElementById('data-alimento').value;

    const hora =
        document.getElementById('hora-alimento').value;

    if (!desc || !data || !hora) {
        mostrarMensagem('Preencha descrição, data e hora.');
        return;
    }

    const { error } = await db.from('alimentacoes').insert({

        usuario_id: usuarioAuth.id,
        descricao: desc,
        data_refeicao: data,
        hora_refeicao: hora

    });

    if (error) {
        mostrarMensagem('Erro ao salvar refeição: ' + error.message);
        return;
    }

    logAlimentos.unshift({

        data: new Date(data + 'T12:00:00')
            .toLocaleDateString('pt-BR'),

        hora: hora,
        desc: desc

    });

    carregarTabelasSalvas();

    document.getElementById('desc-alimento').value = '';

    mostrarMensagem('Refeição salva no Supabase!');
}

// REGISTRAR TREINO

async function registrarTreino() {

    const desc =
        document.getElementById('desc-treino').value.trim();

    const data =
        document.getElementById('data-treino').value;

    const hora =
        document.getElementById('hora-treino').value;

    const min = parseInt(
        document.getElementById('minutos-treino').value,
        10
    );

    if (!desc || !data || !Number.isFinite(min) || min <= 0) {
        mostrarMensagem('Preencha descrição, data e duração.');
        return;
    }

    const { error } = await db.from('treinos').insert({

        usuario_id: usuarioAuth.id,
        descricao: desc,
        data_treino: data,
        hora_inicio: hora || null,
        duracao_minutos: min

    });

    if (error) {
        mostrarMensagem('Erro ao salvar atividade: ' + error.message);
        return;
    }

    logTreinos.unshift({

        data: new Date(data + 'T12:00:00')
            .toLocaleDateString('pt-BR'),

        hora: hora,
        desc: desc,
        min: min

    });

    carregarTabelasSalvas();

    document.getElementById('desc-treino').value = '';
    document.getElementById('minutos-treino').value = '';

    mostrarMensagem('Atividade salva no Supabase!');
}

// ABAS DO SISTEMA

function abrirAba(idAba, botao) {

    document.querySelectorAll('.conteudo-secao')
        .forEach(x => x.classList.add('hidden'));

    document.querySelectorAll('.btn-menu')
        .forEach(x => x.classList.remove('ativo'));

    document.getElementById(idAba).classList.remove('hidden');

    botao.classList.add('ativo');
}

// SAIR DA CONTA

async function sairDaConta() {

    const { error } = await db.auth.signOut();

    if (error) {
        mostrarMensagem('Erro ao sair: ' + error.message);
        return;
    }

    location.reload();
}