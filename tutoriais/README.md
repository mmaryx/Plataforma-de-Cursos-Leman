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

Abra cinco terminais separados na ordem abaixo e mantenha os processos ativos:

| Ordem / Terminal | Pasta | Comando | Endereço / Porta | Exposição |
|---|---|---|---:|---|
| 1 | `tutoriais/mensageria` | `npm run consumer:notifications` | — | Worker AMQP |
| 2 | `tutoriais/mensageria` | `npm run consumer:audit` | — | Worker AMQP |
| 3 | `tutoriais/rest` | `npm start` (ou `npm run dev`) | `127.0.0.1:3001` | Interna (`loopback`) |
| 4 | `tutoriais/graphql` | `npm start` (ou `npm run dev`) | `127.0.0.1:4000` | Interna (`loopback`) |
| 5 | `tutoriais/gateway` | `npm start` (ou `npm run dev`) | `0.0.0.0:3000` | Pública (entrada única) |

Verificações diretas de disponibilidade:
- API REST: `http://127.0.0.1:3001/saude`
- GraphQL: `http://127.0.0.1:4000/`
- API Gateway: `http://127.0.0.1:3000/saude`
- RabbitMQ Management: `http://127.0.0.1:15672`

### 3.6. Executar testes automatizados individuais

Com a infraestrutura e os cinco processos ativos:

```bash
node --check tutoriais/rest/testes/testar-rest.js
node --check tutoriais/rest/testes/routes.test.js
node --check tutoriais/mensageria/test-messaging.js
node --check tutoriais/graphql/test-graphql.js
node --check tutoriais/gateway/test-gateway.js
```

```bash
(cd tutoriais/rest && npm test && npm run test:rest)
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
6. Confirmar a publicação de `matricula.confirmada` na exchange `leman.eventos` e o processamento independente nos logs dos dois consumidores com `X-Request-Id: integracao-leman-001` e registro na tabela `eventos_processados`.
7. Consultar o painel GraphQL (`/api/graphql`) ou a rota agregada (`/api/painel/cursos/1`) e verificar a matrícula refletida.

---

## 6. Roteiro de demonstração

### Cena 1 — Ambiente e ponto de entrada

- Mostrar MySQL e RabbitMQ ativos (`docker ps`).
- Mostrar REST (`127.0.0.1:3001`) e GraphQL (`127.0.0.1:4000`) restritos localmente (`loopback`).
- Mostrar o API Gateway na porta `3000` como único ponto de entrada externo.

### Cena 2 — REST pelo Gateway

Sem chave (esperado `401 Unauthorized` em `application/problem+json`):

```bash
curl -i [http://127.0.0.1:3000/api/cursos](http://127.0.0.1:3000/api/cursos)
```

Com chave (esperado `200 OK`):

```bash
curl -i [http://127.0.0.1:3000/api/cursos](http://127.0.0.1:3000/api/cursos) \
  -H 'X-API-Key: chave-portal-leman-123'
```

Criar curso publicado (esperado `201 Created`, cabeçalho `Location` reescrito para `/api/cursos/:id` e publicação de `curso.publicado` para auditoria):

```bash
curl -i -X POST [http://127.0.0.1:3000/api/cursos](http://127.0.0.1:3000/api/cursos) \
  -H 'X-API-Key: chave-portal-leman-123' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-Id: demo-curso-001' \
  -d '{"titulo":"Curso Demo Gateway","descricao":"Curso para demonstração","instrutor":"Equipe Leman","categoria":"Tecnologia","cargaHoraria":20,"status":"publicado"}'
```

### Cena 3 — Matrícula e evento RabbitMQ

```bash
curl -i -X POST [http://127.0.0.1:3000/api/matriculas](http://127.0.0.1:3000/api/matriculas) \
  -H 'X-API-Key: chave-portal-leman-123' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-Id: demo-matricula-001' \
  -d '{"cursoId":1,"aluno":"Aluno Demonstração","email":"demo.unico@leman.edu.br"}'
```

Esperado: `201 Created` e o mesmo `X-Request-Id` registrado nos logs do Gateway, da API REST e dos consumidores de notificações e auditoria.

### Cena 4 — Retry, DLQ e duplicidade

```bash
(cd tutoriais/mensageria && npm run test:messaging)
```

Mostrar nos terminais dos consumidores e no painel RabbitMQ (`http://127.0.0.1:15672/#/queues`) o descarte de evento duplicado (`eventos_processados`) e a fila `leman.dlq` recebendo mensagens após falha simulada ou payload inválido.

### Cena 5 — GraphQL

```bash
(cd tutoriais/graphql && npm run test:graphql)
```

Demonstrar a consulta aninhada `painelCatalogo` (com `DataLoader` evitando N+1), a mutation `realizarMatricula` via REST e o mapeamento de erro de negócio para `GraphQLError`.

### Cena 6 — Autenticação, autorização e rate limit do Gateway

```bash
(cd tutoriais/gateway && npm run test:gateway)
```

Demonstrar `401` (sem chave), `403` (parceiro tentando acessar `/api/matriculas`), reescrita de `Location` e `429 Too Many Requests` com cabeçalho `Retry-After` ao exceder 10 req/min na chave `chave-app-aluno-456`.

### Cena 7 — Falhas e resiliência

- **502 e 503 (Circuit Breaker):** parar temporariamente a API REST (`Ctrl+C` no terminal da REST) e enviar chamadas autenticadas a `/api/cursos`. As primeiras falhas retornam `502 Bad Gateway`; após abrir o disjuntor, novas chamadas retornam `503 Service Unavailable` com `Retry-After`. Reiniciar a REST e aguardar 10 segundos para recuperação.
- **504 (Gateway Timeout):** ocorre quando o serviço interno aceita conexão, mas excede o timeout configurado (2500 ms para REST e 3000 ms para GraphQL).
- **Rota agregada e degradação parcial:**

```bash
curl -i [http://127.0.0.1:3000/api/painel/cursos/1](http://127.0.0.1:3000/api/painel/cursos/1) \
  -H 'X-API-Key: chave-portal-leman-123'
```

Com REST e GraphQL ativos, retorna `parcial: false`. Com GraphQL indisponível e REST ativa, retorna `200 OK` com `parcial: true`, `matriculas: null` e aviso.

### Cena 8 — Correlação e decisões

- Rastrear um `X-Request-Id` nos logs do Gateway, REST, GraphQL e consumidores RabbitMQ.
- Apresentar a arquitetura, decisões e evidências documentadas em `relatorio-tutoriais.pdf` e nos diagramas de `documentacao/`.

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
