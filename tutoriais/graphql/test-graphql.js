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

async function rodarDemonstracao() {
    console.log('\n=== TESTE DO SERVIDOR GRAPHQL - PLATAFORMA LEMAN ===\n');

    // 1. Tela real: Painel do Catálogo (1 requisição GraphQL substituindo N+2 chamadas REST)
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
              curso {
                titulo
              }
            }
          }
        }
      }
    `;

    const resPainel = await executarGraphQL(queryPainel);
    if (resPainel.errors) {
        throw new Error(`Falha na consulta do painel: ${JSON.stringify(resPainel.errors)}`);
    }

    const painel = resPainel.data.painelCatalogo;
    const chamadasRestEvitadas = 2 + painel.cursosPublicados.length;

    console.log('1. Consulta TelaPainelCoordenacao (X-Request-Id:', resPainel.requestId, ')');
    console.log(`   - Cursos publicados: ${painel.totalCursosPublicados}`);
    console.log(`   - Matrículas ativas: ${painel.totalMatriculasAtivas}`);
    console.log(
        `   - Economia de rede: 1 requisição GraphQL substituiu ${chamadasRestEvitadas} chamadas REST individuais!`
    );
    console.log(JSON.stringify(painel, null, 2));

    // 2. Consulta com argumentos (filtro)
    const queryFiltro = `
      query CursosPorCategoria($categoria: String) {
        cursos(categoria: $categoria, status: publicado) {
          id
          titulo
          categoria
          cargaHoraria
        }
      }
    `;

    const resFiltro = await executarGraphQL(queryFiltro, { categoria: 'Programação' });
    console.log('\n2. Consulta com filtro (categoria="Programação"):', resFiltro.data.cursos.length, 'curso(s)');

    // 3. Mutation: realizar matrícula válida
    const mutationMatricula = `
      mutation MatricularAluno($dados: NovaMatriculaInput!) {
        realizarMatricula(dados: $dados) {
          id
          aluno
          email
          status
          pagamentoId
          curso {
            titulo
            instrutor
          }
        }
      }
    `;

    const emailUnico = `aluno.${Date.now()}@leman.edu.br`;
    const resMutation = await executarGraphQL(mutationMatricula, {
        dados: {
            cursoId: 1,
            aluno: 'Lucas Jerônimo',
            email: emailUnico
        }
    });

    if (resMutation.errors) {
        throw new Error(`Erro inesperado na mutation: ${JSON.stringify(resMutation.errors)}`);
    }

    console.log('\n3. Mutation realizarMatricula concluída:');
    console.log(JSON.stringify(resMutation.data.realizarMatricula, null, 2));

    // 4. Provocar erro de negócio via GraphQL (matrícula duplicada -> CONFLICT)
    const resDuplicada = await executarGraphQL(mutationMatricula, {
        dados: {
            cursoId: 1,
            aluno: 'Lucas Jerônimo',
            email: emailUnico
        }
    });

    console.log('\n4. Erro de negócio capturado em errors[] (matrícula duplicada):');
    console.log(JSON.stringify(resDuplicada.errors, null, 2));

    console.log('\n=== TESTES GRAPHQL CONCLUÍDOS COM SUCESSO ===\n');
}

rodarDemonstracao().catch((erro) => {
    console.error('\n✗ FALHA NO TESTE GRAPHQL:', erro.message);
    process.exitCode = 1;
});