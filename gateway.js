import express from 'express';
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { STATUS_CODES } from 'node:http';

dotenv.config();

const app = express();
app.disable('x-powered-by');
app.use(express.json());

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 3000);
const REST_API_URL = process.env.REST_API_URL || 'http://127.0.0.1:3001';
const GRAPHQL_URL = process.env.GRAPHQL_URL || 'http://127.0.0.1:4000';

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================================================
// Clientes cadastrados (Map evita prototype pollution como X-API-Key: constructor)
// ============================================================================
const CLIENTES = new Map([
    [
        'chave-portal-leman-123',
        { id: 'portal-web-leman', limitePorMinuto: 60 }
    ],
    [
        'chave-app-aluno-456',
        { id: 'app-mobile-leman', limitePorMinuto: 10 }
    ],
    [
        'chave-parceiro-catalogo-789',
        { id: 'parceiro-catalogo', limitePorMinuto: 30, rotas: ['/api/cursos'] }
    ]
]);

// ============================================================================
// Disjuntor (Circuit Breaker) por rota de destino
// ============================================================================
class Disjuntor {
    constructor({ limiteFalhas = 3, esperaMs = 10_000 } = {}) {
        this.limiteFalhas = limiteFalhas;
        this.esperaMs = esperaMs;
        this.falhas = 0;
        this.abertoAte = 0;
    }

    permite() {
        return Date.now() >= this.abertoAte;
    }

    sucesso() {
        this.falhas = 0;
    }

    falha() {
        this.falhas++;
        if (this.falhas >= this.limiteFalhas) {
            this.abertoAte = Date.now() + this.esperaMs;
        }
    }

    segundosRestantes() {
        return Math.max(1, Math.ceil((this.abertoAte - Date.now()) / 1000));
    }
}

const disjuntorRest = new Disjuntor();
const disjuntorGraphql = new Disjuntor();

const ROTAS = [
    {
        prefixo: '/api/cursos',
        destino: REST_API_URL,
        interno: '/cursos',
        timeoutMs: 2500,
        disjuntor: disjuntorRest
    },
    {
        prefixo: '/api/matriculas',
        destino: REST_API_URL,
        interno: '/matriculas',
        timeoutMs: 2500,
        disjuntor: disjuntorRest
    },
    {
        prefixo: '/api/graphql',
        destino: GRAPHQL_URL,
        interno: '/',
        timeoutMs: 3000,
        disjuntor: disjuntorGraphql
    }
];

// ============================================================================
// Respostas de erro padronizadas (RFC 9457 - Problem Details)
// ============================================================================
function problema(req, res, status, detalhe, cabecalhos = {}) {
    return res
        .status(status)
        .set(cabecalhos)
        .type('application/problem+json')
        .json({
            type: 'about:blank',
            title: STATUS_CODES[status] || 'Error',
            status,
            detail: detalhe,
            instance: req.originalUrl,
            requestId: req.id
        });
}

// ============================================================================
// Filtro 1: Correlação (X-Request-Id) e Log Estruturado
// ============================================================================
app.use((req, res, next) => {
    req.id = randomUUID();
    res.set('X-Request-Id', req.id);

    const inicio = performance.now();
    res.on('finish', () => {
        const ms = Math.round(performance.now() - inicio);
        const clienteLog = req.cliente ? req.cliente.id : 'anonimo';
        console.log(
            `[GATEWAY] ${req.id} [${clienteLog}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms} ms)`
        );
    });

    next();
});

// Verificação de saúde do próprio gateway (sem exigir X-API-Key)
app.get('/saude', (req, res) => {
    res.json({
        status: 'ok',
        servico: 'gateway-plataforma-leman',
        requestId: req.id
    });
});

// ============================================================================
// Filtro 2: Autenticação por X-API-Key (401)
// ============================================================================
function autenticar(req, res, next) {
    const chave = req.get('x-api-key');
    const cliente = chave ? CLIENTES.get(chave) : undefined;

    if (!cliente) {
        return problema(
            req,
            res,
            401,
            'Informe uma chave válida no cabeçalho X-API-Key.'
        );
    }

    req.cliente = cliente;
    next();
}

// ============================================================================
// Filtro 3: Autorização grossa por rota (403 - Ponto Extra)
// ============================================================================
function autorizarRota(req, res, next) {
    const { rotas } = req.cliente;
    if (!rotas) return next();

    const caminho = req.baseUrl + req.path;
    const permitido = rotas.some(
        (prefixo) => caminho === prefixo || caminho.startsWith(`${prefixo}/`)
    );

    if (!permitido) {
        return problema(
            req,
            res,
            403,
            `O perfil "${req.cliente.id}" não possui permissão para acessar ${caminho}.`
        );
    }

    next();
}

// ============================================================================
// Filtro 4: Limite de uso por cliente - Janela fixa de 1 min (429)
// ============================================================================
const janelas = new Map();

function limitarUso(req, res, next) {
    const { id, limitePorMinuto } = req.cliente;
    const agora = Date.now();
    let janela = janelas.get(id);

    if (!janela || agora - janela.inicio >= 60_000) {
        janela = { inicio: agora, contagem: 0 };
        janelas.set(id, janela);
    }

    janela.contagem++;

    res.set({
        'X-RateLimit-Limit': String(limitePorMinuto),
        'X-RateLimit-Remaining': String(Math.max(0, limitePorMinuto - janela.contagem))
    });

    if (janela.contagem > limitePorMinuto) {
        const espera = Math.ceil((janela.inicio + 60_000 - agora) / 1000);
        return problema(
            req,
            res,
            429,
            `Limite de ${limitePorMinuto} requisições por minuto excedido para ${id}.`,
            { 'Retry-After': String(espera) }
        );
    }

    next();
}

app.use('/api', autenticar, autorizarRota, limitarUso);

// ============================================================================
// Encaminhamento (Proxy Reverso) com Allowlist, Circuit Breaker e Retry GET
// ============================================================================
const CABECALHOS_DO_CLIENTE = ['content-type', 'accept', 'accept-language', 'if-none-match'];
const CABECALHOS_DO_SERVICO = ['content-type', 'etag', 'cache-control', 'retry-after'];

function cabecalhosInternos(req) {
    const cabecalhos = {
        'x-request-id': req.id
    };
    if (req.cliente) {
        cabecalhos['x-cliente-id'] = req.cliente.id;
    }
    return cabecalhos;
}

async function encaminhar(req, res, rota) {
    if (!rota.disjuntor.permite()) {
        return problema(
            req,
            res,
            503,
            'Serviço temporariamente indisponível (circuit breaker aberto). Tente novamente em instantes.',
            { 'Retry-After': String(rota.disjuntor.segundosRestantes()) }
        );
    }

    const sufixo = req.originalUrl.slice(rota.prefixo.length);
    const url = rota.destino + rota.interno + sufixo;
    const cabecalhos = cabecalhosInternos(req);

    for (const nome of CABECALHOS_DO_CLIENTE) {
        const valor = req.get(nome);
        if (valor) cabecalhos[nome] = valor;
    }
    cabecalhos['x-forwarded-for'] = req.ip;

    const temCorpo = !['GET', 'HEAD'].includes(req.method) && req.body !== undefined;
    // Ponto extra: retry seguro apenas em métodos idempotentes de leitura
    const maxTentativas = ['GET', 'HEAD'].includes(req.method) ? 2 : 1;

    let resposta;
    let corpo;

    for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
        try {
            resposta = await fetch(url, {
                method: req.method,
                headers: cabecalhos,
                body: temCorpo ? JSON.stringify(req.body) : undefined,
                signal: AbortSignal.timeout(rota.timeoutMs)
            });
            corpo = await resposta.text();
            break;
        } catch (erro) {
            rota.disjuntor.falha();

            if (tentativa === maxTentativas || !rota.disjuntor.permite()) {
                if (erro.name === 'TimeoutError') {
                    return problema(
                        req,
                        res,
                        504,
                        `O serviço de destino não respondeu dentro de ${rota.timeoutMs} ms.`
                    );
                }
                return problema(
                    req,
                    res,
                    502,
                    'Não foi possível obter resposta do serviço interno.'
                );
            }

            // Backoff exponencial com jitter
            await esperar(100 * 2 ** tentativa + Math.random() * 100);
        }
    }

    if (resposta.status >= 500) {
        rota.disjuntor.falha();
    } else {
        rota.disjuntor.sucesso();
    }

    for (const nome of CABECALHOS_DO_SERVICO) {
        const valor = resposta.headers.get(nome);
        if (valor) res.set(nome, valor);
    }

    // Reescreve o cabeçalho Location do caminho interno para o caminho público do gateway
    const local = resposta.headers.get('location');
    if (local?.startsWith(rota.interno)) {
        res.set('Location', rota.prefixo + local.slice(rota.interno.length));
    }

    return res.status(resposta.status).send(corpo);
}

// ============================================================================
// Rota Agregada: GET /api/painel/cursos/:id (REST + GraphQL com degradação graciosa)
// ============================================================================
app.get('/api/painel/cursos/:id', async (req, res) => {
    const cursoId = encodeURIComponent(req.params.id);

    // 1. Fonte indispensável: detalhes do curso via API REST
    let curso;
    try {
        const respRest = await fetch(`${REST_API_URL}/cursos/${cursoId}`, {
            headers: {
                ...cabecalhosInternos(req),
                Accept: 'application/json'
            },
            signal: AbortSignal.timeout(2500)
        });

        if (respRest.status === 404) {
            return problema(req, res, 404, `Curso ${req.params.id} não encontrado.`);
        }
        if (!respRest.ok) {
            return problema(req, res, 502, 'Erro ao consultar o serviço de cursos.');
        }

        curso = await respRest.json();
    } catch (erro) {
        const status = erro.name === 'TimeoutError' ? 504 : 502;
        return problema(req, res, status, 'O serviço de cursos não respondeu a tempo.');
    }

    // 2. Fonte complementar: matrículas do curso via Servidor GraphQL (aceita falha parcial)
    const queryMatriculas = `
      query MatriculasDoCurso($cursoId: Int) {
        matriculas(cursoId: $cursoId) {
          id
          aluno
          email
          dataMatricula
          status
        }
      }
    `;

    const [resultadoGraphql] = await Promise.allSettled([
        fetch(`${GRAPHQL_URL}/`, {
            method: 'POST',
            headers: {
                ...cabecalhosInternos(req),
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            body: JSON.stringify({
                query: queryMatriculas,
                variables: { cursoId: Number(req.params.id) }
            }),
            signal: AbortSignal.timeout(2500)
        }).then(async (r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const json = await r.json();
            if (json.errors) throw new Error(json.errors[0].message);
            return json.data.matriculas;
        })
    ]);

    const graphqlOk = resultadoGraphql.status === 'fulfilled';

    return res.status(200).json({
        curso,
        matriculas: graphqlOk ? resultadoGraphql.value : null,
        totalMatriculas: graphqlOk ? resultadoGraphql.value.length : null,
        parcial: !graphqlOk,
        aviso: graphqlOk
            ? null
            : 'Serviço GraphQL indisponível no momento; exibindo apenas os dados principais do curso.'
    });
});

// ============================================================================
// Registro das rotas encaminhadas e tratadores finais
// ============================================================================
for (const rota of ROTAS) {
    app.use(rota.prefixo, (req, res) => encaminhar(req, res, rota));
}

app.use((req, res) => {
    return problema(
        req,
        res,
        404,
        `Nenhuma rota atende ${req.method} ${req.path} no API Gateway.`
    );
});

app.use((err, req, res, next) => {
    const status = err.status ?? 500;
    if (status >= 500) console.error(`[GATEWAY][ERRO] ${req.id}`, err);
    return problema(
        req,
        res,
        status,
        status >= 500 ? 'Erro inesperado no API Gateway.' : err.message
    );
});

app.listen(PORT, HOST, () => {
    console.log(`API Gateway Leman escutando em http://${HOST}:${PORT}`);
    console.log(` -> REST upstream:    ${REST_API_URL}`);
    console.log(` -> GraphQL upstream: ${GRAPHQL_URL}`);
});