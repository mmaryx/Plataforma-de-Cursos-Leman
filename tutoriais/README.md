
# Manual de execução e demonstração — Plataforma de Cursos Leman

Este manual descreve como configurar, iniciar e testar os quatro componentes implementados pelo Grupo 02: API REST, mensageria RabbitMQ, GraphQL e API Gateway.

> Execute os comandos a partir da raiz do repositório, salvo quando o comando indicar `cd` para uma pasta específica. Não compacte nem versione `node_modules/` ou arquivos `.env`.

## 1. Pré-requisitos

- Node.js 22 ou superior e npm.
- Docker Desktop em execução.
- Git.
- Portas locais disponíveis: 3000, 3001, 3307, 4000, 5672 e 15672.

Verifique:

```bash
node --version
npm --version
docker --version
docker compose version
```

## 2. Infraestrutura: MySQL e RabbitMQ

O `docker-compose.yml` da raiz inicia o MySQL. O arquivo `tutoriais/compose.yaml` inicia o RabbitMQ. Execute:

```bash
# Na raiz do repositório: MySQL
docker compose up -d

# Na raiz do repositório: RabbitMQ
docker compose -f tutoriais/compose.yaml up -d

docker ps
```

Se o RabbitMQ já existir com o nome `leman-rabbitmq`, não tente criar outro container com o mesmo nome. Confira e reutilize o existente:

```bash
docker ps -a --filter name=leman-rabbitmq
# Se estiver parado:
docker start leman-rabbitmq
```

Serviços:
- MySQL 8.4: host `127.0.0.1`, porta `3307`, banco `leman`.
- RabbitMQ 4 Management: AMQP `5672`; painel `http://localhost:15672`.
- Painel RabbitMQ: usuário `guest`, senha `guest` (ambiente local de demonstração).

Para acompanhar o RabbitMQ:

```bash
docker logs -f leman-rabbitmq
```

Para encerrar os serviços ao final da demonstração:

```bash
docker compose down
docker compose -f tutoriais/compose.yaml down
```

Para acompanhar o MySQL:

```bash
docker logs -f leman-mysql
```

### 2.1. Banco de dados

Crie `tutoriais/rest/.env` a partir do exemplo:

```bash
cp tutoriais/rest/.env.example tutoriais/rest/.env
```

No `.env`, configure as credenciais locais do MySQL. O exemplo de desenvolvimento usa:

```env
DB_HOST=127.0.0.1
DB_PORT=3307
DB_USER=leman_user
DB_PASSWORD=leman_dev_123
DB_NAME=leman
```

Crie as tabelas e carregue os dados iniciais:

```bash
docker exec -i leman-mysql mysql -u leman_user -pleman_dev_123 leman < tutoriais/rest/database/schema.sql
docker exec -i leman-mysql mysql -u leman_user -pleman_dev_123 leman < tutoriais/rest/database/seed.sql
```

A tabela `eventos_processados`, utilizada pela idempotência dos consumidores, está incluída no `schema.sql`. Se o banco já existia antes da inclusão dessa tabela, execute novamente o trecho `CREATE TABLE IF NOT EXISTS` ou rode o schema atualizado.

> O comando usa a senha ilustrativa do ambiente local. Se ela for alterada no `.env`, ajuste também o comando de acesso ao MySQL.

## 3. Variáveis de ambiente

Os arquivos `.env.example` devem ser copiados para `.env` nas pastas indicadas. Nunca inclua `.env` no ZIP final nem no Git.

| Serviço | Arquivo | Variáveis |
|---|---|---|
| REST | `tutoriais/rest/.env` | `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` |
| Mensageria | `tutoriais/mensageria/.env` | `RABBITMQ_URL` (a conexão MySQL é lida de `../rest/.env`) |
| GraphQL | `tutoriais/graphql/.env` | `HOST`, `PORT`, `REST_API_URL` |
| Gateway | `tutoriais/gateway/.env` | `HOST`, `PORT`, `REST_API_URL`, `GRAPHQL_URL` |

Exemplos de endereços locais:

```env
# mensageria/.env
RABBITMQ_URL=amqp://guest:guest@127.0.0.1:5672
```

```env
# graphql/.env
HOST=127.0.0.1
PORT=4000
REST_API_URL=http://127.0.0.1:3001
```

```env
# gateway/.env
HOST=0.0.0.0
PORT=3000
REST_API_URL=http://127.0.0.1:3001
GRAPHQL_URL=http://127.0.0.1:4000
```

## 4. Instalação das dependências

Execute `npm install` em cada pasta Node.js:

```bash
cd tutoriais/rest && npm install
cd ../mensageria && npm install
cd ../graphql && npm install
cd ../gateway && npm install
```

Se estiver usando um único terminal, volte à raiz do repositório entre os comandos ou abra um terminal separado por serviço.

Os arquivos `package.json` e `package-lock.json` devem acompanhar cada serviço. `node_modules/` não deve ser enviado; ele é recriado por `npm install`.

## 5. Inicialização dos serviços

Abra terminais separados e mantenha os processos ativos.

| Terminal | Pasta | Comando | Porta |
|---|---|---|---:|
| 1 | `tutoriais/mensageria` | `npm run consumer:notifications` | — |
| 2 | `tutoriais/mensageria` | `npm run consumer:audit` | — |
| 3 | `tutoriais/rest` | `npm run dev` | 3001 |
| 4 | `tutoriais/graphql` | `npm run dev` | 4000 |
| 5 | `tutoriais/gateway` | `npm run dev` | 3000 |

A API REST e o GraphQL devem escutar em `127.0.0.1`. O Gateway é a entrada pública da aplicação. O MySQL e RabbitMQ rodam em containers.

Verificações diretas locais:

- REST: `http://127.0.0.1:3001/saude`
- GraphQL: `http://127.0.0.1:4000/`
- Gateway: `http://127.0.0.1:3000/saude`
- RabbitMQ Management: `http://127.0.0.1:15672`

## 6. API Keys fictícias do Gateway

As chaves abaixo são valores de demonstração definidos no código do Gateway. Não são segredos de produção.

| Cliente | API Key | Limite | Permissão |
|---|---|---:|---|
| Portal web | `chave-portal-leman-123` | 60 req/min | Rotas disponíveis ao portal |
| Aplicativo | `chave-app-aluno-456` | 10 req/min | Rotas disponíveis ao aplicativo |
| Parceiro catálogo | `chave-parceiro-catalogo-789` | 30 req/min | Somente `/api/cursos` |

O Gateway expõe:
- `GET /saude` sem API Key.
- `/api/cursos` e `/api/matriculas` para clientes autorizados.
- `/api/graphql` para encaminhar operações GraphQL.
- `GET /api/painel/cursos/:id` como rota agregada REST + GraphQL.

## 7. Testes automatizados individuais

Os testes individuais verificam cada componente separadamente. Antes de executá-los, confirme que os serviços dependentes estão ativos e que os scripts existem no `package.json` correspondente.

Verifique a sintaxe dos arquivos de teste a partir da raiz:

```bash
node --check tutoriais/rest/testes/testar-rest.js
node --check tutoriais/mensageria/test-messaging.js
node --check tutoriais/graphql/test-graphql.js
node --check tutoriais/gateway/test-gateway.js
```

Execute cada teste:

```bash
cd tutoriais/rest
npm run test:rest
```

```bash
cd tutoriais/mensageria
npm run test:messaging
```

```bash
cd tutoriais/graphql
npm run test:graphql
```

```bash
cd tutoriais/gateway
npm run test:gateway
```

Se `npm` informar `Missing script`, confira o `package.json` da pasta e adicione o script correspondente apontando para o arquivo de teste. No REST, por exemplo:

```json
"test:rest": "node testes/testar-rest.js"
```

Os scripts de mensageria publicam mensagens de demonstração; observe os logs dos consumidores e a fila `leman.dlq` no painel RabbitMQ. A execução dos testes GraphQL cria uma matrícula de teste. O script REST cria e remove um curso de teste. O script do Gateway cria um curso de teste publicado; ele permanece no banco para que o evento de publicação e a rota agregada possam ser demonstrados. Remova-o manualmente somente depois da demonstração, se desejar.

## 8. Teste de integração e demonstração do fluxo completo

Os testes individuais não substituem o teste de integração. O grupo deve executar e registrar um cenário ponta a ponta, passando pelo Gateway e verificando a comunicação entre Gateway, REST, MySQL, RabbitMQ, consumidores e GraphQL quando aplicável.

### Cenário sugerido

1. Iniciar MySQL e RabbitMQ.
2. Iniciar os consumidores de notificações e auditoria.
3. Iniciar REST, GraphQL e Gateway.
4. Criar ou selecionar um curso publicado.
5. Enviar uma matrícula pelo Gateway com um `X-Request-Id` identificável.
6. Confirmar a matrícula na resposta e no MySQL.
7. Confirmar a publicação de `matricula.confirmada` no RabbitMQ.
8. Conferir que os dois consumidores processaram o evento e registraram idempotência.
9. Consultar o painel GraphQL/agregado e verificar os dados da matrícula.
10. Conferir o mesmo `X-Request-Id` nos logs dos componentes envolvidos.

Exemplo de chamada para matrícula (substitua `cursoId` por um curso publicado e use e-mail ainda não matriculado):

```bash
curl -i -X POST http://127.0.0.1:3000/api/matriculas \
  -H 'X-API-Key: chave-portal-leman-123' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-Id: integracao-leman-001' \
  -d '{"cursoId":1,"aluno":"Aluno Integração","email":"integracao.unico@leman.edu.br"}'
```

**Responsáveis:** Lucas conduz a validação técnica da integração REST + mensageria; Marianna e Antônio apoiam a validação dos testes individuais; Napoleone valida o Gateway; Eduardo registra o cenário no relatório/apresentação. A execução ponta a ponta e o ensaio devem envolver todos os integrantes.

## 9. Roteiro de demonstração

### Cena 1 — Ambiente e ponto de entrada

- Mostrar MySQL e RabbitMQ ativos (`docker ps`).
- Mostrar REST em `127.0.0.1:3001` e GraphQL em `127.0.0.1:4000`.
- Mostrar Gateway na porta `3000`.
- Explicar que o Gateway é o ponto de entrada previsto para clientes.

### Cena 2 — REST pelo Gateway

Sem chave:

```bash
curl -i http://127.0.0.1:3000/api/cursos
```

Esperado: `401` com Problem Details.

Com chave:

```bash
curl -i http://127.0.0.1:3000/api/cursos \
  -H 'X-API-Key: chave-portal-leman-123'
```

Esperado: `200`.

Criar curso publicado:

```bash
curl -i -X POST http://127.0.0.1:3000/api/cursos \
  -H 'X-API-Key: chave-portal-leman-123' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-Id: demo-curso-001' \
  -d '{"titulo":"Curso Demo Gateway","descricao":"Curso para demonstração","instrutor":"Equipe Leman","categoria":"Tecnologia","cargaHoraria":20,"status":"publicado"}'
```

Esperado: `201`, cabeçalho `Location` reescrito para `/api/cursos/:id` e publicação de `curso.publicado` para auditoria.

### Cena 3 — Matrícula e evento RabbitMQ

Use um `cursoId` existente e publicado:

```bash
curl -i -X POST http://127.0.0.1:3000/api/matriculas \
  -H 'X-API-Key: chave-portal-leman-123' \
  -H 'Content-Type: application/json' \
  -H 'X-Request-Id: demo-matricula-001' \
  -d '{"cursoId":1,"aluno":"Aluno Demonstração","email":"demo.unico@leman.edu.br"}'
```

Esperado: `201`; os consumidores de notificações e auditoria devem mostrar o mesmo `X-Request-Id`. Use um e-mail novo para evitar a regra de matrícula ativa duplicada.

### Cena 4 — Retry, DLQ e duplicidade

```bash
cd tutoriais/mensageria
npm run test:messaging
```

Observe o evento de falha simulada, as tentativas e a mensagem na DLQ. O teste também publica o mesmo `eventId` duas vezes para demonstrar idempotência. A tabela `eventos_processados` separa os registros por consumidor.

### Cena 5 — GraphQL

```bash
cd tutoriais/graphql
npm run test:graphql
```

O script executa painel agregado, filtro, mutation de matrícula e erro de negócio. A mutation chama a REST; a REST grava no MySQL e publica `matricula.confirmada`.

### Cena 6 — Autenticação, autorização e rate limit do Gateway

```bash
cd tutoriais/gateway
npm run test:gateway
```

O script verifica `401`, `403`, roteamento, GraphQL, agregação e `429` com `Retry-After`. O limite do aplicativo é 10 requisições por minuto; execute o teste com uma instância recém-iniciada do Gateway ou aguarde a janela de 60 segundos para repetir.

### Cena 7 — Falhas e resiliência

Para demonstrar `502` e `503`, pare temporariamente o serviço REST (Ctrl+C no terminal da REST) e faça chamadas autenticadas a `/api/cursos`. A primeira falha de upstream retorna `502`; após o limite de falhas do disjuntor, novas chamadas durante a janela aberta retornam `503` com `Retry-After`. Reinicie a REST e aguarde o período do disjuntor (10 segundos) para recuperação.

Para demonstrar `504`, é necessário que o serviço de destino aceite a conexão, mas demore mais que o timeout configurado. O timeout da rota REST no Gateway é 2500 ms e o de GraphQL é 3000 ms. Não confunda serviço sem conexão (normalmente `502`) com serviço que excedeu o tempo (`504`).

A rota agregada:

```bash
curl -i http://127.0.0.1:3000/api/painel/cursos/1 \
  -H 'X-API-Key: chave-portal-leman-123'
```

Com REST e GraphQL disponíveis, deve retornar `parcial: false`. Com GraphQL indisponível, mas REST disponível, deve retornar `200` com `parcial: true`, `matriculas: null` e aviso. Se a REST estiver indisponível, a rota agregada não consegue fornecer os dados principais e retorna erro.

### Cena 8 — Correlação e decisões

- Escolher um `X-Request-Id` conhecido e mostrar o mesmo identificador nos logs do Gateway, REST, GraphQL (quando usado) e consumidores (quando houver evento).
- Explicar por que REST é responsável pelas regras e persistência, GraphQL agrega consultas, RabbitMQ desacopla efeitos assíncronos e Gateway centraliza entrada e políticas.
- Mostrar o diagrama C4 e as decisões documentadas no diretório `documentacao/`.

## 10. Decisões e limitações conhecidas

| Decisão | Justificativa | Limitação |
|---|---|---|
| MySQL como persistência | Dados relacionais de cursos e matrículas | Ambiente local de demonstração |
| RabbitMQ `topic` | Roteamento por chaves de evento | Sem Outbox transacional |
| Filas independentes | Consumidores com responsabilidades distintas | Efeitos externos são simulados |
| Idempotência no MySQL | Sobrevive ao reinício do consumidor | Efeito externo e registro não formam uma transação única |
| GraphQL consulta REST | Mantém REST como fonte de verdade | Consultas podem gerar múltiplas chamadas HTTP |
| Gateway como entrada | Centraliza autenticação, limites e resiliência | Rate limit em memória, não distribuído |
| Pagamento simulado | Demonstra regra de matrícula sem integração financeira | Não processa pagamentos reais |

## 11. Integrantes e responsabilidades

| Integrante | Responsabilidades |
|---|---|
| **Marianna Ghiraldelli** | API REST; README geral e manual; índice PDF; preparação dos testes individuais das quatro etapas; organização final das pastas e ZIP. |
| **Antônio Campello** | GraphQL; RabbitMQ; apoio/revisão e execução dos testes individuais das quatro etapas; hospedagem em nuvem (extra). |
| **Eduardo Galvão** | Documentação do projeto Fio-Condutor; relatório dos tutoriais; apresentação. |
| **João Napoleone** | API Gateway. |
| **Lucas Jerônimo** | Integração entre mensageria e API REST; compose do RabbitMQ; instruções de execução. |

### Pendências compartilhadas antes da entrega

- **Teste de integração e demonstração ponta a ponta:** ainda precisam ser executados, revisados e registrados pelo grupo.
- **Git:** revisar os commits de todos e criar/conferir as tags `etapa-1-rest`, `etapa-2-mensageria`, `etapa-3-graphql` e `etapa-4-gateway`.
- **OpenAPI:** definir quem fará a revisão final do `openapi.yaml`, garantindo que descreva os endpoints e modelos reais da API REST.
- **Documentação:** confirmar que os diagramas, decisões, riscos/mitigações e referências ABNT estão no relatório e na apresentação.
- **Ensaio:** todos os integrantes devem participar e conseguir explicar o fluxo completo.

## 12. Uso de IA

Ferramentas de IA foram utilizadas como apoio para esclarecer conceitos, revisar e depurar código, sugerir testes e organizar a documentação. O grupo deve descrever o uso real, revisar o conteúdo e validar os resultados no ambiente do projeto.

## 13. Repositório, vídeo e referências

- Repositório Git: **inserir URL real**.
- Vídeo de demonstração: **inserir URL real, se solicitado/disponível**.

Referências:
- Node.js: https://nodejs.org/docs/latest/api/
- Express: https://expressjs.com/
- MySQL: https://dev.mysql.com/doc/
- RabbitMQ: https://www.rabbitmq.com/docs
- Apollo Server: https://www.apollographql.com/docs/apollo-server/
- GraphQL: https://graphql.org/
- OpenAPI 3.1: https://spec.openapis.org/oas/v3.1.0
- RFC 9457: https://www.rfc-editor.org/rfc/rfc9457
