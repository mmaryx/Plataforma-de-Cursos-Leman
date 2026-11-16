
import { randomUUID } from 'node:crypto';

const GRAPHQL_URL = process.env.GRAPHQL_URL || 'http://127.0.0.1:4000/';

async function executarGraphQL(query, variables = {}, requestId = randomUUID()) {
    const resposta = await fetch(GRAPHQL_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Request-Id': requestId
        },
        body: JSON.stringify({ query, variables })
    });

    const json = await resposta.json();
    return { status: resposta.status, requestId, ...json };
}

function afirmar(condicao, mensagem) {
    if (!condicao) throw new Error(mensagem);
}

async function rodarDemonstracao() {
    console.log('\n=== TESTES GRAPHQL - PLATAFORMA LEMAN ===\n');

    const queryPainel = `
      query TelaPainelCoordenacao {
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
              curso { titulo }
            }
          }
        }
      }
    `;

    const resPainel = await executarGraphQL(queryPainel);

    afirmar(resPainel.status === 200, `Painel: HTTP ${resPainel.status}`);
    afirmar(!resPainel.errors, `Erro no painel: ${JSON.stringify(resPainel.errors)}`);

    const painel = resPainel.data.painelCatalogo;

    console.log(`✓ Painel: ${painel.totalCursosPublicados} cursos publicados; ${painel.totalMatriculasAtivas} matrículas ativas.`);
    console.log(`X-Request-Id: ${resPainel.requestId}`);

    const filtro = await executarGraphQL(`
      query CursosPorCategoria($categoria: String) {
        cursos(categoria: $categoria, status: publicado) {
          id titulo categoria
        }
      }
    `, { categoria: 'Programação' });

    afirmar(filtro.status === 200 && !filtro.errors, `Falha no filtro: ${JSON.stringify(filtro.errors)}`);
    afirmar(Array.isArray(filtro.data.cursos), 'A query não retornou uma lista.');

    console.log(`✓ Filtro por categoria: ${filtro.data.cursos.length} curso(s).`);

    const cursos = await executarGraphQL(`
      query {
        cursos(status: publicado) {
          id titulo instrutor
        }
      }
    `);

    afirmar(!cursos.errors, `Falha ao buscar cursos: ${JSON.stringify(cursos.errors)}`);

    const curso = cursos.data.cursos[0];

    afirmar(curso, 'Não há curso publicado. Cadastre um curso antes do teste.');

    const mutation = `
      mutation MatricularAluno($dados: NovaMatriculaInput!) {
        realizarMatricula(dados: $dados) {
          id aluno email status pagamentoId curso {
            titulo instrutor
          }
        }
      }
    `;

    const emailUnico = `teste.graphql.${Date.now()}@leman.edu.br`;
    const requestIdMutation = randomUUID();

    const criada = await executarGraphQL(mutation, {
        dados: {
            cursoId: Number(curso.id),
            aluno: 'Aluno Teste GraphQL',
            email: emailUnico
        }
    }, requestIdMutation);

    afirmar(!criada.errors, `Mutation falhou: ${JSON.stringify(criada.errors)}`);
    afirmar(criada.data?.realizarMatricula?.id, 'Mutation não retornou matrícula.');

    console.log(`✓ Mutation realizarMatricula: matrícula ${criada.data.realizarMatricula.id}.`);
    console.log(`X-Request-Id para rastrear: ${requestIdMutation}`);

    const duplicada = await executarGraphQL(mutation, {
        dados: {
            cursoId: Number(curso.id),
            aluno: 'Aluno Teste GraphQL',
            email: emailUnico
        }
    });

    afirmar(
        Array.isArray(duplicada.errors) && duplicada.errors.length > 0,
        'A matrícula duplicada deveria retornar um erro.'
    );

    afirmar(
        duplicada.errors[0].extensions?.code === 'CONFLICT',
        `Código esperado CONFLICT, recebido ${duplicada.errors[0].extensions?.code}`
    );

    console.log('✓ Matrícula duplicada retornou GraphQLError com código CONFLICT.');

    console.log('\n=== TODOS OS TESTES GRAPHQL PASSARAM ===\n');
}

rodarDemonstracao().catch((erro) => {
    console.error('\n✗ FALHA NOS TESTES GRAPHQL:', erro);
    process.exitCode = 1;
});
