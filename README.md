# Plataforma de Cursos Leman

Projeto acadêmico do Grupo 02 da Fatec Bauru, desenvolvido na disciplina **Modelagem de Padrões de Projeto**, como parte do projeto Fio-Condutor.

A Plataforma de Cursos Leman é uma solução de educação online. O núcleo implementado nesta entrega contempla o gerenciamento de cursos, o registro de matrículas e a consulta de informações por meio de quatro tecnologias: API REST, mensageria com RabbitMQ, GraphQL e API Gateway.

## 1. Escopo implementado

- Cadastro, consulta, atualização e exclusão de cursos.
- Consulta e registro de matrículas.
- Persistência relacional em MySQL.
- Publicação assíncrona de eventos de negócio.
- Consumidores independentes para notificações e auditoria.
- Consultas agregadas por GraphQL, com dados obtidos da API REST.
- API Gateway como ponto de entrada para REST e GraphQL, com autenticação, limitação de uso e mecanismos de resiliência.

O acompanhamento de progresso e a disponibilização de aulas/conteúdos fazem parte do contexto amplo da plataforma, mas não integram o núcleo implementado nesta entrega.

## 2. Tecnologias

| Tecnologia | Uso |
|---|---|
| Node.js 22+ | Execução dos serviços |
| Express 5 | API REST e API Gateway |
| MySQL 8.4 | Persistência |
| mysql2 | Acesso ao MySQL |
| RabbitMQ 4 | Mensageria |
| amqplib | Cliente RabbitMQ |
| Apollo Server 5 | Servidor GraphQL |
| GraphQL | Consultas e mutations |
| DataLoader | Agrupamento/cache por requisição |
| Docker Compose | Infraestrutura local |

## 3. Estrutura da entrega

```text
Plataforma-de-Cursos-Leman/
├── documentacao/
│   ├── oficina-1/
│   ├── oficina-2/
│   ├── oficina-c4-adr/
│   └── oficina-desenho-decisao/
├── tutoriais/
│   ├── README.md
│   ├── compose.yaml
│   ├── openapi.yaml
│   ├── rest/
│   ├── mensageria/
│   ├── graphql/
│   ├── gateway/
│   └── testes/
├── 00-indice.pdf
├── relatorio-tutoriais.pdf
├── apresentacao.pdf
├── README.md
└── .gitignore
```

Os arquivos de cada serviço, seus scripts, chaves fictícias e instruções de execução estão descritos em [`tutoriais/README.md`](tutoriais/README.md).

## 4. Portas

| Serviço | Endereço/porta | Exposição |
|---|---|---|
| API Gateway | `http://127.0.0.1:3000` | Entrada pública da aplicação |
| API REST | `http://127.0.0.1:3001` | Interna; bind em `127.0.0.1` |
| GraphQL | `http://127.0.0.1:4000` | Interna; bind em `127.0.0.1` |
| MySQL | `127.0.0.1:3307` | Infraestrutura local |
| RabbitMQ AMQP | `127.0.0.1:5672` | Infraestrutura local |
| RabbitMQ Management | `http://127.0.0.1:15672` | Administração local |

## 5. Fluxos principais

### Matrícula

1. O cliente chama `POST /api/matriculas` pelo Gateway, ou executa a mutation GraphQL `realizarMatricula`.
2. O GraphQL, quando utilizado, chama a API REST por HTTP.
3. A REST valida o curso, simula a autorização de pagamento e grava a matrícula no MySQL.
4. Após a gravação, a REST publica `matricula.confirmada` na exchange `topic` `leman.eventos`.
5. Os consumidores de notificações e auditoria processam o evento.
6. Cada consumidor mantém sua própria idempotência persistida no MySQL.

### Publicação de curso

Ao criar um curso diretamente com status `publicado`, a REST publica `curso.publicado`. A fila de auditoria recebe todos os eventos; a fila de notificações recebe somente eventos `matricula.*`.

**Limitação conhecida:** a publicação de `curso.publicado` está ligada ao cadastro já publicado (`POST /cursos`). A transição de `rascunho` para `publicado` por `PUT` ou `PATCH` ainda não publica esse evento.

## 6. Regras de negócio principais

- O título de um curso deve ser único.
- A carga horária deve ser um inteiro positivo.
- Um curso publicado deve ter descrição, instrutor e categoria preenchidos.
- Matrículas só podem ser realizadas em cursos publicados.
- Não pode existir matrícula ativa duplicada para o mesmo e-mail e curso.
- Um curso com matrículas associadas não pode ser excluído.
- A matrícula só é gravada após a autorização simulada de pagamento.

## 7. Documentação e execução

Consulte [`tutoriais/README.md`](tutoriais/README.md) para pré-requisitos, variáveis de ambiente, instalação, inicialização, chaves fictícias, testes e roteiro de demonstração.

## 8. Grupo e responsabilidades

| Integrante | Responsabilidades |
|---|---|
| **Marianna Ghiraldelli** | API REST; `README.md` geral; `tutoriais/README.md`; `00-indice.pdf`; preparação dos testes individuais de REST, mensageria, GraphQL e Gateway; organização final das pastas e ZIP de entrega. |
| **Antônio Campello** | GraphQL; RabbitMQ; revisão e execução dos testes ponta a ponta das quatro etapas; hospedagem e validação em nuvem (AWS). |
| **Eduardo Galvão** | Documentação do projeto Fio-Condutor; `relatorio-tutoriais.pdf`; `apresentacao.pdf`. |
| **João Napoleone** | API Gateway. |
| **Lucas Jerônimo** | Integração entre mensageria e API REST; `compose.yaml`; instruções de execução. |

## 9. Uso de Inteligência Artificial

Ferramentas de Inteligência Artificial (**Google Gemini** e **OpenAI ChatGPT**) foram utilizadas como apoio à compreensão de conceitos técnicos (RFC 9457, AMQP 0-9-1, Apollo Server 5), revisão e depuração de código, estruturação de testes automatizados e revisão da documentação. Todo o código e os resultados foram validados pelos integrantes do grupo no ambiente de execução.

## 10. Repositório e vídeo

- **Repositório Git:** https://github.com/mmaryx/Plataforma-de-Cursos-Leman
- **Vídeo de demonstração (Plano B):** *[Inserir link após a gravação do ensaio]*

## 11. Referências

- Node.js. Documentação oficial: https://nodejs.org/docs/latest/api/
- Express. Documentação oficial: https://expressjs.com/
- MySQL. Documentação oficial: https://dev.mysql.com/doc/
- RabbitMQ. Documentação oficial: https://www.rabbitmq.com/docs
- Apollo Server. Documentação oficial: https://www.apollographql.com/docs/apollo-server/
- GraphQL. Especificação e documentação: https://graphql.org/
- OpenAPI Initiative. OpenAPI Specification 3.1: https://spec.openapis.org/oas/v3.1.0
- IETF. RFC 9457 — Problem Details for HTTP APIs: https://www.rfc-editor.org/rfc/rfc9457
