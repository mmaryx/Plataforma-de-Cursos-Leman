# Plataforma de Cursos Leman — Tutoriais em Funcionamento

## 1. Tema e núcleo implementado

A Plataforma de Cursos Leman é uma solução de educação online concebida para apoiar a criação e o gerenciamento de cursos, a matrícula de alunos e a disponibilização de conteúdos educacionais. No contexto completo do domínio, o sistema contempla atores como alunos, instrutores e administradores, além de funcionalidades de acompanhamento de progresso, atividades, avaliações, emissão de certificados, notificações e armazenamento de arquivos.

Para o núcleo executável desta entrega, o escopo foi delimitado ao gerenciamento completo de cursos (CRUD), ao registro, consulta e cancelamento de matrículas e à consulta consolidada dessas informações. Esse recorte integra quatro padrões e tecnologias em funcionamento: uma API REST como fonte de verdade e regras de negócio; mensageria com RabbitMQ para eventos assíncronos de publicação e matrícula; um servidor GraphQL para consultas compostas sem acoplamento direto ao banco; e um API Gateway como ponto único de entrada com autenticação, controle de taxa, circuit breaker e rota agregada.

---

## 2. Pré-requisitos

- **Node.js 22** ou superior e **npm**.
- **Docker Engine / Docker Desktop em execução** (com suporte a `docker compose`).
- **Git**.
- Portas locais disponíveis: `3000`, `3001`, `3307`, `4000`, `5672` e `15672`.

Verifique o ambiente antes de iniciar:

```bash
node --version
npm --version
docker --version
docker compose version
```

---

## 3. Como executar (passo a passo)

> Execute os comandos a partir da raiz do projeto, salvo quando o comando indicar `cd` para uma pasta específica. Não compacte nem versione `node_modules/` ou arquivos `.env`.

### 3.1. Subir a infraestrutura (MySQL e RabbitMQ)

Inicie os containers de banco de dados e mensageria com um único comando Docker Compose:

```bash
# A partir da raiz do projeto:
docker compose -f tutoriais/compose.yaml up -d

# Ou, se estiver dentro da pasta tutoriais/:
# docker compose up -d

docker ps
```

Caso os containers `leman-mysql` ou `leman-rabbitmq` já existam parados no ambiente, reutilize-os sem recriar:

```bash
docker ps -a --filter name=leman
docker start leman-mysql leman-rabbitmq
```

Serviços ativos na infraestrutura:
- **MySQL 8.4:** host `127.0.0.1`, porta `3307`, banco `leman`.
- **RabbitMQ 4 Management:** AMQP `127.0.0.1:5672`; painel web `http://127.0.0.1:15672` (usuário `guest`, senha `guest`).

Acompanhamento de logs e encerramento ao final da demonstração:

```bash
docker logs -f leman-mysql
docker logs -f leman-rabbitmq

# Encerrar containers ao finalizar:
docker compose -f tutoriais/compose.yaml down
```

### 3.2. Configurar variáveis de ambiente (`.env`)

Copie os arquivos `.env.example` para `.env` em cada serviço (nunca inclua arquivos `.env` no Git ou no ZIP final):

```bash
cp tutoriais/rest/.env.example tutoriais/rest/.env
cp tutoriais/mensageria/.env.example tutoriais/mensageria/.env
cp tutoriais/graphql/.env.example tutoriais/graphql/.env
cp tutoriais/gateway/.env.example tutoriais/gateway/.env
```

Preencha `tutoriais/rest/.env` com as credenciais locais do MySQL e a URL do RabbitMQ:

```env
HOST=127.0.0.1
PORT=3001
DB_HOST=127.0.0.1
DB_PORT=3307
DB_USER=leman_user
DB_PASSWORD=leman_dev_123
DB_NAME=leman
RABBITMQ_URL=amqp://guest:guest@127.0.0.1:5672
```

Configuração padrão dos demais serviços:

| Serviço | Arquivo | Variáveis |
|---|---|---|
| REST | `tutoriais/rest/.env` | `HOST=127.0.0.1`, `PORT=3001`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `RABBITMQ_URL` |
| Mensageria | `tutoriais/mensageria/.env` | `RABBITMQ_URL=amqp://guest:guest@127.0.0.1:5672` (credenciais MySQL lidas de `../rest/.env`) |
| GraphQL | `tutoriais/graphql/.env` | `HOST=127.0.0.1`, `PORT=4000`, `REST_API_URL=http://127.0.0.1:3001` |
| Gateway | `tutoriais/gateway/.env` | `HOST=0.0.0.0`, `PORT=3000`, `REST_API_URL=http://127.0.0.1:3001`, `GRAPHQL_URL=http://127.0.0.1:4000` |

### 3.3. Criar tabelas e carregar dados iniciais no MySQL

Caso o volume do MySQL ainda não tenha executado `schema.sql` e `seed.sql` na inicialização (ou caso queira resetar a base):

```bash
docker exec -i leman-mysql mysql -u leman_user -pleman_dev_123 leman < tutoriais/rest/database/schema.sql
docker exec -i leman-mysql mysql -u leman_user -pleman_dev_123 leman < tutoriais/rest/database/seed.sql
```

A tabela `eventos_processados`, utilizada para garantir a idempotência persistida dos consumidores RabbitMQ, já está incluída no `schema.sql`.

### 3.4. Instalar as dependências Node.js

```bash
(cd tutoriais/rest && npm install)
(cd tutoriais/mensageria && npm install)
(cd tutoriais/graphql && npm install)
(cd tutoriais/gateway && npm install)
```

### 3.5. Iniciar os serviços (tabela de processos e portas)

Garanta antes que não há processos Node antigos ocupando as portas (`pkill -f "tutoriais/" 2>/dev/null || true`). Abra cinco terminais separados na ordem abaixo e mantenha os processos ativos:

| Ordem / Terminal | Pasta | Comando | Endereço / Porta | Exposição |
|---|---|---|---:|---|
| 1 (T1) | `tutoriais/mensageria` | `npm run consumer:notifications` | — | Worker AMQP |
| 2 (T2) | `tutoriais/mensageria` | `npm run consumer:audit` | — | Worker AMQP |
| 3 (T3) | `tutoriais/rest` | `npm start` (ou `npm run dev`) | `127.0.0.1:3001` | Interna (`loopback`) |
| 4 (T4) | `tutoriais/graphql` | `npm start` (ou `npm run dev`) | `127.0.0.1:4000` | Interna (`loopback`) |
| 5 (T5) | `tutoriais/gateway` | `npm start` (ou `npm run dev`) | `0.0.0.0:3000` | Pública (entrada única) |

Verificações diretas de disponibilidade:
- API REST: `http://127.0.0.1:3001/saude`
- GraphQL (Apollo Sandbox): `http://127.0.0.1:4000/`
- API Gateway: `http://127.0.0.1:3000/saude`
- RabbitMQ Management: `http://127.0.0.1:15672`

### 3.6. Executar testes automatizados individuais

Com a infraestrutura e os cinco processos ativos, valide a sintaxe e execute os scripts consolidados em `tutoriais/testes/` (ou via `npm run test:*` nas pastas de cada serviço):

```bash
# Verificação de sintaxe
node --check tutoriais/testes/testar-rest.js
node --check tutoriais/testes/test-messaging.js
node --check tutoriais/testes/test-graphql.js
node --check tutoriais/testes/test-gateway.js

# Execução dos testes automatizados
(cd tutoriais/rest && npm run test:rest)
(cd tutoriais/mensageria && npm run test:messaging)
(cd tutoriais/graphql && npm run test:graphql)
(cd tutoriais/gateway && npm run test:gateway)
```

---

## 4. Chaves e usuários de teste (fictícios)

Todas as chaves, credenciais e dados de alunos abaixo são fictícios, criados exclusivamente para demonstração local:

| Perfil / Cliente | Identificador / API Key | Limite | Permissão |
|---|---|---:|---|
| Portal web | `chave-portal-leman-123` | 60 req/min | `/api/cursos`, `/api/matriculas`, `/api/graphql`, `/api/painel` |
| Aplicativo aluno | `chave-app-aluno-456` | 10 req/min | `/api/cursos`, `/api/matriculas`, `/api/graphql`, `/api/painel` |
| Parceiro catálogo | `chave-parceiro-catalogo-789` | 30 req/min | Somente `/api/cursos` |
| Healthcheck público | *(sem chave)* | — | Somente `GET /saude` |

---

## 5. Teste de integração ponta a ponta

1. Subir MySQL e RabbitMQ (`docker compose -f tutoriais/compose.yaml up -d`).
2. Iniciar os consumidores de notificações e auditoria.
3. Iniciar REST, GraphQL e Gateway.
4. Enviar uma matrícula pelo Gateway com um `X-Request-Id` rastreável (use um e-mail ainda não matriculado no curso):

```bash
curl -i -X POST [http://127.0.0.1:3000/api/matriculas](http://127.0.0.1:3000/api/matriculas) \
  -H 'X-API-Key: chave-portal-leman-123' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-Id: integracao-leman-001' \
  -d '{"cursoId":1,"aluno":"Aluno Integração","email":"integracao.unico@leman.edu.br"}'
```

5. Confirmar resposta `201 Created` com cabeçalho `Location: /api/matriculas/:id` e gravação no MySQL.
6. Confirmar a publicação de `matricula.confirmada` na exchange `leman.eventos`, o processamento independente nos logs dos dois consumidores com `X-Request-Id: integracao-leman-001` e a gravação na tabela `eventos_processados`.
7. Consultar o painel GraphQL (`/api/graphql`) ou a rota agregada (`/api/painel/cursos/1`) e verificar a matrícula refletida.

---

## 6. Roteiro de demonstração (passo a passo)

Deixe abertos os 5 terminais dos serviços (`T1` a `T5`), um terminal livre (`T6`) na raiz do repositório para os comandos e o navegador no painel RabbitMQ (`http://127.0.0.1:15672/#/queues`) e Apollo Sandbox (`http://127.0.0.1:4000/`).

### Cena 1 — Ambiente e ponto de entrada único

1. Verificar os containers de infraestrutura ativos e o mapeamento de portas locais:
```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
ss -tlnp | grep -E "3000|3001|4000"
```
2. Testar a rota pública de saúde do API Gateway (sem exigir `X-API-Key`):
```bash
curl -i [http://127.0.0.1:3000/saude](http://127.0.0.1:3000/saude)
```
* **Resultado esperado:** `HTTP/1.1 200 OK`, confirmando que o Gateway (`0.0.0.0:3000`) é a única entrada externa enquanto REST (`127.0.0.1:3001`) e GraphQL (`127.0.0.1:4000`) permanecem internos.

### Cena 2 — REST pelo Gateway (Autenticação, GET e POST com `Location` reescrito)

1. Enviar requisição sem credencial (deve bloquear com `401 Unauthorized` no formato RFC 9457 `application/problem+json`):
```bash
curl -i [http://127.0.0.1:3000/api/cursos](http://127.0.0.1:3000/api/cursos)
```
2. Enviar requisição autenticada com a chave do Portal (deve retornar `200 OK` com a lista de cursos):
```bash
curl -i [http://127.0.0.1:3000/api/cursos](http://127.0.0.1:3000/api/cursos) \
  -H 'X-API-Key: chave-portal-leman-123'
```
3. Criar um curso publicado passando `X-Request-Id` explícito:
```bash
curl -i -X POST [http://127.0.0.1:3000/api/cursos](http://127.0.0.1:3000/api/cursos) \
  -H 'X-API-Key: chave-portal-leman-123' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-Id: demo-curso-001' \
  -d "{\"titulo\":\"Curso Demo $(date +%H%M%S)\",\"descricao\":\"Curso publicado na demonstração\",\"instrutor\":\"Equipe Leman\",\"categoria\":\"Arquitetura\",\"cargaHoraria\":20,\"status\":\"publicado\"}"
```
* **Resultado esperado:** `201 Created`, cabeçalho `Location` reescrito pelo Gateway para `/api/cursos/:id` e log `[AUDITORIA]` no terminal **T2** recebendo o evento `curso.publicado` com `X-Request-Id=demo-curso-001`.

### Cena 3 — Matrícula e evento RabbitMQ

1. Registrar uma matrícula em curso publicado pelo Gateway:
```bash
curl -i -X POST [http://127.0.0.1:3000/api/matriculas](http://127.0.0.1:3000/api/matriculas) \
  -H 'X-API-Key: chave-portal-leman-123' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-Id: demo-matricula-001' \
  -d "{\"cursoId\":1,\"aluno\":\"Aluno Demonstração\",\"email\":\"demo.$(date +%s)@leman.edu.br\"}"
```
2. Conferir no MySQL a gravação dos registros de idempotência na tabela `eventos_processados`:
```bash
docker exec -i leman-mysql mysql -u leman_user -pleman_dev_123 leman \
  -e "SELECT * FROM eventos_processados ORDER BY processado_em DESC LIMIT 4;"
```
* **Resultado esperado:** Resposta `201 Created` (com pagamento simulado `MOCK-...`) e os terminais **T1 (Notificações)** e **T2 (Auditoria)** processando `matricula.confirmada` de forma independente com o mesmo `X-Request-Id=demo-matricula-001`.

### Cena 4 — Retry, Dead Letter Queue (DLQ) e duplicidade

1. Executar a suíte de testes de mensageria:
```bash
(cd tutoriais/mensageria && npm run test:messaging)
```
* **Resultado esperado:** Nos terminais **T1** e **T2**, observar o descarte de evento com `eventId` duplicado (`já processado — ignorando duplicata`), as 3 tentativas de retry em falha simulada e o descarte de JSON inválido; no painel RabbitMQ (`http://127.0.0.1:15672/#/queues`), mostrar a fila **`leman.dlq`** com as mensagens mortas retidas.

### Cena 5 — GraphQL (Apollo Sandbox e suíte automatizada)

1. No **Apollo Sandbox** (`http://127.0.0.1:4000/`), executar a query aninhada `painelCatalogo` (consolida cursos e matrículas em uma chamada usando `DataLoader` para evitar $N+1$):
```graphql
query PainelCompleto {
  painelCatalogo {
    totalCursosPublicados
    totalMatriculasAtivas
    cursosPublicados {
      id
      titulo
      instrutor
      cargaHoraria
      totalMatriculasAtivas
      matriculas {
        id
        aluno
        email
        status
      }
    }
  }
}
```
2. Executar a mutation `realizarMatricula` no Apollo Sandbox (ao rodar duas vezes com o mesmo e-mail, demonstra o erro de conflito mapeado para `GraphQLError` com `extensions.code: "CONFLICT"`):
```graphql
mutation MatricularPeloGraphQL {
  realizarMatricula(
    input: {
      cursoId: "1"
      aluno: "Aluno Apollo Sandbox"
      email: "apollo.sandbox@leman.edu.br"
    }
  ) {
    id
    cursoId
    aluno
    email
    status
    pagamentoId
  }
}
```
3. Executar também o script automatizado via Gateway:
```bash
(cd tutoriais/graphql && npm run test:graphql)
```

### Cena 6 — Autenticação, autorização e rate limit do Gateway

1. Executar o script de validação das políticas transversais do Gateway (aguardar 60s se a chave do aplicativo tiver sido usada recentemente):
```bash
(cd tutoriais/gateway && npm run test:gateway)
```
* **Resultado esperado:** Demonstração automatizada de `401 Unauthorized` (sem chave), `403 Forbidden` (chave de parceiro restrita a `/api/cursos` tentando acessar `/api/matriculas`), reescrita de `Location` e `429 Too Many Requests` com `Retry-After: 60` após exceder 10 req/min na chave `chave-app-aluno-456`.

### Cena 7 — Falhas e resiliência (`502`, `503` e degradação parcial)

1. **Circuit Breaker (`502` → `503`):** vá ao terminal **T3 (API REST)**, pare o serviço com **`Ctrl + C`** e dispare 3 chamadas seguidas:
```bash
for i in 1 2 3; do
  echo "=== Chamada $i ==="
  curl -s -i [http://127.0.0.1:3000/api/cursos](http://127.0.0.1:3000/api/cursos) -H 'X-API-Key: chave-portal-leman-123' | head -n 8
done
```
* As chamadas 1 e 2 retornam `502 Bad Gateway`; a chamada 3 abre o disjuntor e retorna `503 Service Unavailable` com `Retry-After: 10`. Religue a REST no **T3** (`npm start`) e aguarde **10 segundos**.
2. **Rota agregada e degradação parcial:** teste primeiro com todos os serviços ativos (`"parcial": false`):
```bash
curl -s [http://127.0.0.1:3000/api/painel/cursos/1](http://127.0.0.1:3000/api/painel/cursos/1) -H 'X-API-Key: chave-portal-leman-123'
```
* Vá ao terminal **T4 (GraphQL)**, pare o serviço com **`Ctrl + C`** e rode o comando novamente: o Gateway devolve `200 OK` com `"parcial": true`, `"matriculas": null` e aviso de degradação graciosa. Religue o GraphQL no **T4** (`npm start`).

### Cena 8 — Correlação e decisões

- Apontar o mesmo identificador (`demo-matricula-001`) nos logs dos terminais **T5 (Gateway)**, **T3 (REST)**, **T1 (Notificações)** e **T2 (Auditoria)**.
- Apresentar a arquitetura, as decisões e as evidências documentadas em `relatorio-tutoriais.pdf` e nos diagramas C4/ADRs de `documentacao/`.

---

## 7. Decisões e limitações (resumo)

| Decisão | Justificativa | Limitação conhecida |
|---|---|---|
| MySQL 8.4 como persistência | Integridade relacional para cursos, matrículas e idempotência | Ambiente local de demonstração |
| RabbitMQ `topic` (`leman.eventos`) | Desacopla notificações e auditoria por chave de roteamento | Publicação direta sem padrão Outbox transacional |
| Idempotência no MySQL | Evita reprocessamento de eventos após reinício dos consumidores | Efeito externo simulado e registro no banco não compartilham transação |
| GraphQL sobre REST + `DataLoader` | Mantém a REST como única fonte de verdade e elimina N+1 | Depende da disponibilidade da API REST |
| API Gateway centralizado | Unifica autenticação, rate limit, circuit breaker e agregação | Contadores de rate limit e estado do disjuntor em memória local |
| Pagamento e e-mail simulados | Valida regras de negócio sem dependências financeiras externas | Não realiza cobrança nem envio real de mensagens |

---

## 8. Divisão de responsabilidades

| Integrante | Responsabilidades principais |
|---|---|
| **Marianna Ghiraldelli** | Implementação da API REST; `README.md` e manual de execução; índice da entrega (`00-indice.pdf`); preparação dos testes individuais e organização do pacote ZIP. |
| **Antônio José Campello Neto** | Implementação de GraphQL e mensageria RabbitMQ; apoio, revisão e execução dos testes individuais e ponta a ponta; implantação e validação em nuvem AWS (EC2, Amazon RDS e Amazon MQ). |
| **Eduardo Galvão** | Documentação do projeto Fio-Condutor (oficinas e checkpoints); elaboração do relatório técnico (`relatorio-tutoriais`) e dos slides de apresentação (`apresentacao.pdf`). |
| **João Napoleone** | Implementação do API Gateway (autenticação, autorização, rate limit, proxy reverso, circuit breaker e rota agregada). |
| **Lucas Jerônimo** | Integração entre mensageria RabbitMQ e API REST; configuração do Docker Compose e instruções de execução. |

---

## 9. Uso de ferramentas de Inteligência Artificial

Ferramentas de Inteligência Artificial (**Google Gemini**, **OpenAI ChatGPT** e **Anthropic Claude**) foram utilizadas pelo grupo como apoio técnico para esclarecer especificações (RFC 9457, protocolo AMQP 0-9-1, Apollo Server 5 e DataLoader), revisar e depurar código, estruturar casos de teste e organizar a documentação. Todo o código-fonte, os comandos deste manual e as evidências de execução foram revisados e validados diretamente pelos integrantes no ambiente do projeto.

---

## 10. Repositório, vídeo de reserva e referências

- **Repositório Git:** `[INSERIR LINK DO REPOSITÓRIO GIT]`
- **Vídeo de demonstração (reserva):** `[INSERIR LINK DO VÍDEO DE RESERVA]`

### Referências

- APOLLO GRAPHQL. Apollo Server documentation. Disponível em: https://www.apollographql.com/docs/apollo-server/. Acesso em: 16 nov. 2026.
- EXPRESS. Express 5.x API reference. Disponível em: https://expressjs.com/. Acesso em: 16 nov. 2026.
- GRAPHQL. GraphQL specification and documentation. Disponível em: https://graphql.org/. Acesso em: 16 nov. 2026.
- IETF. RFC 9457: Problem Details for HTTP APIs. Disponível em: https://www.rfc-editor.org/rfc/rfc9457. Acesso em: 16 nov. 2026.
- MYSQL. MySQL 8.4 Reference Manual. Disponível em: https://dev.mysql.com/doc/. Acesso em: 16 nov. 2026.
- NODE.JS. Node.js v22 documentation. Disponível em: https://nodejs.org/docs/latest/api/. Acesso em: 16 nov. 2026.
- OPENAPI INITIATIVE. OpenAPI Specification 3.1.0. Disponível em: https://spec.openapis.org/oas/v3.1.0. Acesso em: 16 nov. 2026.
- RABBITMQ. RabbitMQ 4 documentation. Disponível em: https://www.rabbitmq.com/docs. Acesso em: 16 nov. 2026.
