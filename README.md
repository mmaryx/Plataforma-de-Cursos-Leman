# Plataforma de Cursos Leman

Projeto acadêmico desenvolvido pelo Grupo 02 da Fatec Bauru, na disciplina de Modelagem de Padrões de Projeto, como parte do projeto Fio-Condutor.

A Plataforma de Cursos Leman é um sistema de educação online que permite o gerenciamento e a disponibilização de cursos e conteúdos educacionais. A plataforma contempla estudantes, instrutores e administradores, oferecendo funcionalidades para matrícula, acesso aos cursos, acompanhamento de progresso e gerenciamento de conteúdos.

## 1. Escopo do projeto

O projeto tem como objetivo implementar uma solução baseada em serviços que permita:

- Gerenciar cursos e seus conteúdos;
- Realizar e consultar matrículas de estudantes;
- Acompanhar o progresso dos estudantes;
- Disponibilizar informações dos cursos;
- Processar eventos relacionados às operações da plataforma.

A implementação será dividida em quatro partes:

- **API REST:** gerenciamento dos recursos e regras de negócio.
- **Mensageria:** comunicação assíncrona utilizando RabbitMQ.
- **GraphQL:** consultas agregadas de informações da plataforma.
- **API Gateway:** ponto único de entrada, autenticação e controle de requisições.

## 2. Tecnologias utilizadas

| Tecnologia | Finalidade |
|---|---|
| Node.js 22+ | Ambiente de execução |
| Express 5 | API REST e API Gateway |
| MySQL 8.4 | Banco de dados relacional |
| mysql2 | Conexão entre Node.js e MySQL |
| dotenv | Gerenciamento de variáveis de ambiente |
| Apollo Server 5 | Servidor GraphQL |
| RabbitMQ 4 | Mensageria |
| amqplib | Comunicação com RabbitMQ |
| Docker | Execução dos serviços em contêineres |

## 3. Estrutura do projeto

```text
plataforma-cursos-leman/
├── documentacao/
├── tutoriais/
│   ├── rest/
│   │   ├── database/
│   │   │   ├── schema.sql
│   │   │   └── seed.sql
│   │   ├── src/
│   │   │   ├── database.js
│   │   │   └── server.js
│   │   ├── .env.example
│   │   ├── package.json
│   │   └── openapi.yaml
│   ├── mensageria/
│   ├── graphql/
│   ├── gateway/
│   └── testes/
├── 00-indice.pdf
├── README.md
└── .gitignore
```

*Estrutura sujeita a alterações conforme o desenvolvimento das próximas etapas.*

## 4. Como executar

### Pré-requisitos

- Node.js 22 ou superior;
- npm;
- Docker Desktop em execução;
- Git.

### API REST

Diretório: `tutoriais/rest/`

#### 1. Configuração do banco de dados

A API utiliza MySQL 8.4, executado por meio do Docker.

O contêiner utiliza as seguintes configurações de desenvolvimento:

| Configuração | Valor |
|---|---|
| Contêiner | `leman-mysql` |
| Banco de dados | `leman` |
| Usuário | `leman_user` |
| Porta no computador | `3307` |
| Porta no contêiner | `3306` |

Para iniciar o banco de dados, execute o Docker Compose no diretório em que está localizado o arquivo de configuração:

```bash
docker compose up -d
```

#### 2. Configuração das variáveis de ambiente

Dentro de `tutoriais/rest/`, crie um arquivo `.env` com as configurações de conexão:

```env
DB_HOST=127.0.0.1
DB_PORT=3307
DB_USER=leman_user
DB_PASSWORD=leman_dev_123
DB_NAME=leman
```

O arquivo `.env.example` contém o modelo das variáveis necessárias. Não compartilhe credenciais reais nem envie o arquivo `.env` ao repositório.

#### 3. Criação das tabelas e dados iniciais

Com o contêiner em execução, acesse o diretório `tutoriais/rest/` e execute:

```bash
docker exec -i leman-mysql mysql -u leman_user -pleman_dev_123 leman < database/schema.sql
```

Para inserir os dados iniciais de teste:

```bash
docker exec -i leman-mysql mysql -u leman_user -pleman_dev_123 leman < database/seed.sql
```

#### 4. Instalação das dependências

```bash
cd tutoriais/rest
npm install
```

#### 5. Inicialização do servidor

Para iniciar em modo de desenvolvimento:

```bash
npm run dev
```

A API REST estará disponível em:

`http://127.0.0.1:3001`

Rota de verificação:

`GET /saude`

### Endpoints implementados — API REST

#### Cursos

| Método | Endpoint | Descrição | Status esperado |
|---|---|---|---|
| GET | `/cursos` | Lista os cursos cadastrados | 200 |
| GET | `/cursos/:id` | Consulta um curso pelo ID | 200 |
| POST | `/cursos` | Cadastra um novo curso | 201 |
| PUT | `/cursos/:id` | Atualiza todos os dados de um curso | 200 |
| PATCH | `/cursos/:id` | Atualiza parcialmente um curso | 200 |
| DELETE | `/cursos/:id` | Exclui um curso | 204 |

**Regras de negócio:**

- O título do curso deve ser único.
- A carga horária deve ser um número inteiro positivo.
- O status deve ser `rascunho` ou `publicado`.
- Cursos publicados devem possuir descrição, instrutor e categoria preenchidos.
- O PUT exige o envio de todos os campos obrigatórios.
- O PATCH permite alterar campos individualmente.
- Um curso associado a matrículas não pode ser excluído.

**Filtros, ordenação e paginação:**

A listagem de cursos permite filtrar por:

- `categoria`
- `status`
- `instrutor`

Também permite ordenar por ID, título ou carga horária, utilizando os parâmetros `ordenarPor` e `ordem`.

A paginação utiliza os parâmetros:

- `pagina`: número da página;
- `limite`: quantidade de registros por página, com máximo de 50.

**Tratamento de erros:**

- `400 Bad Request`: identificador ou parâmetros inválidos.
- `404 Not Found`: curso inexistente.
- `409 Conflict`: título duplicado ou tentativa de exclusão de curso associado a matrículas.
- `422 Unprocessable Content`: dados inválidos ou informações obrigatórias ausentes.
- `500 Internal Server Error`: erro interno durante o processamento da requisição.

A exclusão bem-sucedida retorna `204 No Content`, sem corpo na resposta.

#### Matrículas

| Método | Endpoint | Descrição | Status esperado |
|---|---|---|---|
| GET | `/matriculas` | Lista as matrículas cadastradas | 200 |
| GET | `/matriculas/:id` | Consulta uma matrícula pelo ID | 200 |
| POST | `/matriculas` | Registra uma nova matrícula | 201 |

**Regras de negócio:**

- A matrícula deve estar associada a um curso existente.
- Não é permitido realizar matrícula em cursos que ainda não foram publicados.
- Não é permitido cadastrar uma matrícula ativa duplicada para o mesmo estudante e curso.
- A matrícula é registrada somente após a autorização do pagamento simulado.

**Filtros disponíveis:**

- `cursoId`
- `status`
- `email`

**Tratamento de erros:**

- `400 Bad Request`: identificador inválido.
- `404 Not Found`: curso ou matrícula inexistente.
- `409 Conflict`: matrícula ativa duplicada.
- `422 Unprocessable Content`: dados inválidos, curso não publicado ou pagamento não autorizado.
- `500 Internal Server Error`: erro interno durante o processamento da requisição.

**Observação:** a integração com pagamento é simulada nesta etapa. A função de pagamento retorna uma autorização fictícia, identificada por um código de transação iniciado por `MOCK-`.

### Documentação da API

A especificação dos endpoints está disponível no arquivo:

` tutoriais/rest/openapi.yaml `

O arquivo utiliza o padrão OpenAPI 3.1.0 e descreve os endpoints, parâmetros, modelos de dados e respostas da API.

## 5. Portas e processos

| Serviço | Porta | Status |
|---|---:|---|
| API REST | 3001 | Implementado e testado |
| MySQL | 3307 | Implementado e testado |
| GraphQL | A definir | Pendente |
| API Gateway | A definir | Pendente |
| RabbitMQ | 5672 | Pendente |
| RabbitMQ Management | 15672 | Pendente |

## 6. Chaves e usuários de teste

A definir durante a implementação do API Gateway.

As credenciais utilizadas na demonstração serão fictícias e destinadas exclusivamente ao ambiente de desenvolvimento.

## 7. Roteiro de demonstração

O roteiro de demonstração será atualizado após a implementação e integração dos serviços.

Para a etapa da API REST, a demonstração contempla:

1. Verificação da disponibilidade da API.
2. Cadastro e consulta de cursos.
3. Atualização completa e parcial de cursos.
4. Aplicação de filtros, ordenação e paginação.
5. Exclusão de cursos e validação das regras de negócio.
6. Cadastro e consulta de matrículas.
7. Validação das regras de matrícula e simulação de pagamento.
8. Verificação da persistência dos dados no MySQL.

## 8. Decisões e limitações

- O MySQL foi escolhido como banco de dados relacional da aplicação.
- O banco de dados é executado em contêiner Docker para facilitar a configuração do ambiente.
- A API REST utiliza consultas parametrizadas para interação com o banco de dados.
- A exclusão de cursos associados a matrículas é impedida para preservar a integridade referencial.
- O pagamento é simulado, não existindo integração com um serviço financeiro real.
- As demais decisões arquiteturais e limitações serão documentadas conforme as próximas etapas forem implementadas.

## 9. Divisão de responsabilidades

| Integrante | Responsabilidade |
|---|---|
| Marianna Ghiraldelli | A definir |
| Antônio Campello | A definir |
| Eduardo Galvão | Documentação do Fio-Condutor |
| Lucas Jerônimo | A definir |
| João Napoleone | A definir |

## 10. Uso de ferramentas de Inteligência Artificial

Ferramentas de Inteligência Artificial foram utilizadas como apoio ao desenvolvimento, incluindo orientação técnica, esclarecimento de conceitos, revisão de código, identificação de possíveis problemas e auxílio na documentação.

As ferramentas utilizadas e suas respectivas finalidades serão detalhadas na versão final deste documento.

## 11. Repositório e demonstração

- **Repositório Git:** inserir link do repositório.
- **Vídeo de demonstração:** inserir link após a gravação.

## 12. Referências

- Materiais e tutoriais disponibilizados na disciplina.
- [Documentação oficial do Node.js](https://nodejs.org/docs/latest/api/).
- [Documentação oficial do Express](https://expressjs.com/).
- [Documentação oficial do MySQL](https://dev.mysql.com/doc/).
- [Documentação oficial do Apollo Server](https://www.apollographql.com/docs/apollo-server/).
- [Documentação oficial do RabbitMQ](https://www.rabbitmq.com/docs).
- [Especificação OpenAPI](https://spec.openapis.org/oas/v3.1.0).