export const typeDefs = `#graphql
  "Status editorial de um curso na Plataforma Leman"
  enum StatusCurso {
    rascunho
    publicado
  }

  "Status de vínculo do aluno em um curso"
  enum StatusMatricula {
    ativa
    cancelada
  }

  "Curso ofertado na Plataforma de Cursos Leman"
  type Curso {
    id: ID!
    titulo: String!
    descricao: String!
    instrutor: String!
    categoria: String!
    cargaHoraria: Int!
    status: StatusCurso!
    "Lista de matrículas vinculadas a este curso (resolvida via DataLoader)"
    matriculas: [Matricula!]!
    "Quantidade de alunos com matrícula ativa"
    totalMatriculasAtivas: Int!
  }

  "Matrícula de um aluno em um curso"
  type Matricula {
    id: ID!
    cursoId: ID!
    aluno: String!
    email: String!
    dataMatricula: String!
    status: StatusMatricula!
    pagamentoId: String
    "Dados completos do curso matriculado (aninhamento de 2º nível)"
    curso: Curso
  }

  "Visão consolidada para a tela inicial do Portal da Coordenação Leman"
  type PainelCatalogo {
    totalCursosPublicados: Int!
    totalMatriculasAtivas: Int!
    cursosPublicados: [Curso!]!
  }

  input NovoCursoInput {
    titulo: String!
    descricao: String
    instrutor: String
    categoria: String
    cargaHoraria: Int!
    status: StatusCurso = rascunho
  }

  input NovaMatriculaInput {
    cursoId: Int!
    aluno: String!
    email: String!
  }

  type Query {
    "Lista cursos com filtros opcionais por categoria, status ou instrutor"
    cursos(categoria: String, status: StatusCurso, instrutor: String): [Curso!]!

    "Busca um curso específico pelo identificador"
    curso(id: ID!): Curso

    "Lista matrículas com filtros opcionais"
    matriculas(cursoId: Int, status: StatusMatricula, email: String): [Matricula!]!

    "Consulta única que alimenta o Painel da Plataforma (substitui múltiplas chamadas REST)"
    painelCatalogo(categoria: String): PainelCatalogo!
  }

  type Mutation {
    "Cadastra um novo curso na API REST"
    criarCurso(dados: NovoCursoInput!): Curso!

    "Realiza a matrícula de um aluno em um curso publicado"
    realizarMatricula(dados: NovaMatriculaInput!): Matricula!
  }
`;