
import express from 'express';
import pool from './database.js';

const app = express();
const PORT = 3001;

app.use(express.json());

// Simulação temporária do Gateway de Pagamento
async function autorizarPagamentoMock(aluno, curso) {
    console.log(`Simulando pagamento de ${aluno} para o curso ${curso.titulo}`);

    // Simula uma autorização aprovada
    return {
        aprovado: true,
        transacaoId: `MOCK-${Date.now()}`
    };
}

// Formato padronizado para erros (RFC 9457)
function problema(req, res, status, detalhe) {
    const titulos = {
        400: 'Requisição inválida',
        404: 'Recurso não encontrado',
        409: 'Conflito',
        422: 'Entidade não processável',
        500: 'Erro interno do servidor'
    };

    return res.status(status)
        .type('application/problem+json')
        .json({
            type: 'about:blank',
            title: titulos[status],
            status,
            detail: detalhe,
            instance: req.originalUrl
        });
}

// Rota de saúde
app.get('/saude', (req, res) => {
    res.status(200).json({
        status: 'ok',
        message: 'API da Plataforma de Cursos Leman funcionando!'
    });
});

// POST /cursos - Cadastrar novo curso
app.post('/cursos', async (req, res) => {
    const {
        titulo,
        descricao,
        instrutor,
        categoria,
        cargaHoraria,
        status = 'rascunho'
    } = req.body;

    // Validar título
    if (typeof titulo !== 'string' || !titulo.trim()) {
        return problema(req, res, 422, 'O título do curso é obrigatório.');
    }

    // Validar carga horária
    if (!Number.isInteger(cargaHoraria) || cargaHoraria <= 0) {
        return problema(req, res, 422, 'A carga horária deve ser um número inteiro maior que zero.');
    }

    // Validar status
    if (!['rascunho', 'publicado'].includes(status)) {
        return problema(req, res, 422, 'O status deve ser rascunho ou publicado.');
    }

    // Curso publicado precisa estar completo
    if (status === 'publicado') {
        const camposObrigatorios = {
            descricao,
            instrutor,
            categoria
        };

        const camposAusentes = Object.entries(camposObrigatorios)
            .filter(([, valor]) => typeof valor !== 'string' || !valor.trim())
            .map(([campo]) => campo);

        if (camposAusentes.length > 0) {
            return problema(
                req,
                res,
                422,
                `Para publicar um curso, preencha: ${camposAusentes.join(', ')}.`
            );
        }
    }

    try {
        // Verificar se já existe um curso com o mesmo título
        const [cursosExistentes] = await pool.execute(
            `SELECT id FROM cursos WHERE LOWER(titulo) = LOWER(?)`,
            [titulo.trim()]
        );

        if (cursosExistentes.length > 0) {
            return problema(req, res, 409, 'Já existe um curso com esse título.');
        }

        // Inserir curso no banco
        const [resultado] = await pool.execute(
            `INSERT INTO cursos
                (titulo, descricao, instrutor, categoria, carga_horaria, status)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                titulo.trim(),
                typeof descricao === 'string' ? descricao.trim() : '',
                typeof instrutor === 'string' ? instrutor.trim() : '',
                typeof categoria === 'string' ? categoria.trim() : '',
                cargaHoraria,
                status
            ]
        );

        const novoCurso = {
            id: resultado.insertId,
            titulo: titulo.trim(),
            descricao: typeof descricao === 'string' ? descricao.trim() : '',
            instrutor: typeof instrutor === 'string' ? instrutor.trim() : '',
            categoria: typeof categoria === 'string' ? categoria.trim() : '',
            cargaHoraria,
            status
        };

        return res
            .status(201)
            .location(`/cursos/${novoCurso.id}`)
            .json(novoCurso);

    } catch (erro) {
        if (erro.code === 'ER_DUP_ENTRY') {
            return problema(req, res, 409, 'Já existe um curso com esse título.');
        }

        console.error('Erro ao cadastrar curso:', erro);

        return res.status(500).type('application/problem+json').json({
            type: 'about:blank',
            title: 'Erro interno do servidor',
            status: 500,
            detail: 'Não foi possível cadastrar o curso.',
            instance: req.originalUrl
        });
    }
});

// GET /cursos - Listar cursos
app.get('/cursos', async (req, res) => {
    try {
        const {
            categoria,
            status,
            instrutor,
            ordenarPor = 'id',
            ordem = 'asc'
        } = req.query;

        const pagina = Number(req.query.pagina ?? 1);
        const limite = Number(req.query.limite ?? 10);

        // Validar paginação
        if (
            !Number.isInteger(pagina) ||
            !Number.isInteger(limite) ||
            pagina < 1 ||
            limite < 1
        ) {
            return problema(req, res, 400,
                'Página e limite devem ser números inteiros positivos.');
        }

        if (limite > 50) {
            return problema(req, res, 400,
                'O limite máximo por página é 50.');
        }

        // Validar ordenação
        const camposOrdenacao = {
            id: 'id',
            titulo: 'titulo',
            cargaHoraria: 'carga_horaria'
        };

        if (!camposOrdenacao[ordenarPor]) {
            return problema(req, res, 400,
                'Campo de ordenação inválido.');
        }

        if (!['asc', 'desc'].includes(ordem)) {
            return problema(req, res, 400,
                'A ordem deve ser asc ou desc.');
        }

        // Construir filtros
        const filtros = [];
        const valores = [];

        if (categoria) {
            filtros.push('categoria = ?');
            valores.push(categoria);
        }

        if (status) {
            filtros.push('status = ?');
            valores.push(status);
        }

        if (instrutor) {
            filtros.push('instrutor LIKE ?');
            valores.push(`%${instrutor}%`);
        }

        const where = filtros.length
            ? `WHERE ${filtros.join(' AND ')}`
            : '';

        // Consultar quantidade total de cursos
        const [contagem] = await pool.query(
            `SELECT COUNT(*) AS total FROM cursos ${where}`,
            valores
        );

        const total = contagem[0].total;
        const inicio = (pagina - 1) * limite;

        // Consultar cursos com filtros, ordenação e paginação
        const [dados] = await pool.query(
            `SELECT
                id,
                titulo,
                descricao,
                instrutor,
                categoria,
                carga_horaria AS cargaHoraria,
                status
             FROM cursos
             ${where}
             ORDER BY ${camposOrdenacao[ordenarPor]} ${ordem.toUpperCase()}
             LIMIT ? OFFSET ?`,
            [...valores, limite, inicio]
        );

        return res.status(200).json({
            dados,
            paginacao: {
                pagina,
                limite,
                total,
                totalPaginas: Math.ceil(total / limite)
            }
        });

    } catch (erro) {
        console.error('Erro ao listar cursos:', erro);

        return res.status(500).type('application/problem+json').json({
            type: 'about:blank',
            title: 'Erro interno do servidor',
            status: 500,
            detail: 'Não foi possível consultar os cursos.',
            instance: req.originalUrl
        });
    }
});

// GET /cursos/:id - Consultar curso específico
app.get('/cursos/:id', async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
        return problema(req, res, 400, 'O ID do curso deve ser um número inteiro positivo.');
    }

    try {
        const [resultado] = await pool.execute(
            `SELECT
                id,
                titulo,
                descricao,
                instrutor,
                categoria,
                carga_horaria AS cargaHoraria,
                status
             FROM cursos
             WHERE id = ?`,
            [id]
        );

        if (resultado.length === 0) {
            return problema(req, res, 404, 'Curso não encontrado.');
        }

        return res.status(200).json(resultado[0]);

    } catch (erro) {
        console.error('Erro ao consultar curso:', erro);
        return problema(req, res, 500, 'Não foi possível consultar o curso.');
    }
});

// PUT /cursos/:id - Atualizar curso completamente
app.put('/cursos/:id', async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
        return problema(req, res, 400, 'ID inválido.');
    }

    const {
        titulo,
        descricao,
        instrutor,
        categoria,
        cargaHoraria,
        status
    } = req.body;

    if (
        typeof titulo !== 'string' || !titulo.trim() ||
        typeof descricao !== 'string' || !descricao.trim() ||
        typeof instrutor !== 'string' || !instrutor.trim() ||
        typeof categoria !== 'string' || !categoria.trim() ||
        !Number.isInteger(cargaHoraria) || cargaHoraria <= 0 ||
        !['rascunho', 'publicado'].includes(status)
    ) {
        return problema(req, res, 422, 'Todos os campos devem ser preenchidos corretamente.');
    }

    try {
        const [cursosEncontrados] = await pool.execute(
            'SELECT id FROM cursos WHERE id = ?',
            [id]
        );

        if (cursosEncontrados.length === 0) {
            return problema(req, res, 404, 'Curso não encontrado.');
        }

        const [titulosExistentes] = await pool.execute(
            `SELECT id FROM cursos
             WHERE LOWER(titulo) = LOWER(?) AND id <> ?`,
            [titulo.trim(), id]
        );

        if (titulosExistentes.length > 0) {
            return problema(req, res, 409, 'Já existe outro curso com esse título.');
        }

        await pool.execute(
            `UPDATE cursos
             SET titulo = ?,
                 descricao = ?,
                 instrutor = ?,
                 categoria = ?,
                 carga_horaria = ?,
                 status = ?
             WHERE id = ?`,
            [
                titulo.trim(),
                descricao.trim(),
                instrutor.trim(),
                categoria.trim(),
                cargaHoraria,
                status,
                id
            ]
        );

        const cursoAtualizado = {
            id,
            titulo: titulo.trim(),
            descricao: descricao.trim(),
            instrutor: instrutor.trim(),
            categoria: categoria.trim(),
            cargaHoraria,
            status
        };

        return res.status(200).json(cursoAtualizado);

    } catch (erro) {
        console.error('Erro ao atualizar curso:', erro);

        if (erro.code === 'ER_DUP_ENTRY') {
            return problema(req, res, 409, 'Já existe outro curso com esse título.');
        }

        return problema(req, res, 500, 'Não foi possível atualizar o curso.');
    }
});

// PATCH /cursos/:id - Atualizar parcialmente
app.patch('/cursos/:id', async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
        return problema(req, res, 400, 'ID inválido.');
    }

    const camposPermitidos = [
        'titulo',
        'descricao',
        'instrutor',
        'categoria',
        'cargaHoraria',
        'status'
    ];

    const camposRecebidos = Object.keys(req.body);

    if (camposRecebidos.length === 0) {
        return problema(req, res, 422, 'Informe pelo menos um campo para atualizar.');
    }

    const campoInvalido = camposRecebidos.find(
        campo => !camposPermitidos.includes(campo)
    );

    if (campoInvalido) {
        return problema(req, res, 422, `Campo não permitido: ${campoInvalido}.`);
    }

    try {
        const [resultado] = await pool.execute(
            `SELECT
                id,
                titulo,
                descricao,
                instrutor,
                categoria,
                carga_horaria AS cargaHoraria,
                status
             FROM cursos
             WHERE id = ?`,
            [id]
        );

        if (resultado.length === 0) {
            return problema(req, res, 404, 'Curso não encontrado.');
        }

        const cursoAtualizado = {
            ...resultado[0],
            ...req.body
        };

        // Validar título
        if (
            typeof cursoAtualizado.titulo !== 'string' ||
            !cursoAtualizado.titulo.trim()
        ) {
            return problema(req, res, 422, 'O título deve ser preenchido.');
        }

        cursoAtualizado.titulo = cursoAtualizado.titulo.trim();

        // Validar campos de texto
        for (const campo of ['descricao', 'instrutor', 'categoria']) {
            if (typeof cursoAtualizado[campo] !== 'string') {
                return problema(req, res, 422, `O campo ${campo} deve ser um texto.`);
            }

            cursoAtualizado[campo] = cursoAtualizado[campo].trim();
        }

        // Cursos publicados precisam estar completos
        if (
            cursoAtualizado.status === 'publicado' &&
            ['descricao', 'instrutor', 'categoria'].some(
                campo => !cursoAtualizado[campo]
            )
        ) {
            return problema(
                req,
                res,
                422,
                'Para publicar um curso, preencha descrição, instrutor e categoria.'
            );
        }

        // Validar carga horária
        if (
            !Number.isInteger(cursoAtualizado.cargaHoraria) ||
            cursoAtualizado.cargaHoraria <= 0
        ) {
            return problema(req, res, 422, 'A carga horária deve ser um número inteiro positivo.');
        }

        // Validar status
        if (!['rascunho', 'publicado'].includes(cursoAtualizado.status)) {
            return problema(req, res, 422, 'Status inválido.');
        }

        // Verificar título duplicado
        const [titulosExistentes] = await pool.execute(
            `SELECT id FROM cursos
             WHERE LOWER(titulo) = LOWER(?) AND id <> ?`,
            [cursoAtualizado.titulo, id]
        );

        if (titulosExistentes.length > 0) {
            return problema(req, res, 409, 'Já existe outro curso com esse título.');
        }

        // Atualizar no banco
        await pool.execute(
            `UPDATE cursos
             SET titulo = ?,
                 descricao = ?,
                 instrutor = ?,
                 categoria = ?,
                 carga_horaria = ?,
                 status = ?
             WHERE id = ?`,
            [
                cursoAtualizado.titulo,
                cursoAtualizado.descricao,
                cursoAtualizado.instrutor,
                cursoAtualizado.categoria,
                cursoAtualizado.cargaHoraria,
                cursoAtualizado.status,
                id
            ]
        );

        return res.status(200).json(cursoAtualizado);

    } catch (erro) {
        console.error('Erro ao atualizar curso:', erro);

        if (erro.code === 'ER_DUP_ENTRY') {
            return problema(req, res, 409, 'Já existe outro curso com esse título.');
        }

        return problema(req, res, 500, 'Não foi possível atualizar o curso.');
    }
});

// DELETE /cursos/:id - Excluir curso
app.delete('/cursos/:id', async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
        return problema(req, res, 400, 'ID inválido.');
    }

    try {
        // Verificar se o curso existe
        const [cursosEncontrados] = await pool.execute(
            'SELECT id FROM cursos WHERE id = ?',
            [id]
        );

        if (cursosEncontrados.length === 0) {
            return problema(req, res, 404, 'Curso não encontrado.');
        }

        // Verificar se existem matrículas associadas
        const [matriculasEncontradas] = await pool.execute(
            'SELECT id FROM matriculas WHERE curso_id = ? LIMIT 1',
            [id]
        );

        if (matriculasEncontradas.length > 0) {
            return problema(
                req,
                res,
                409,
                'Não é possível excluir um curso que possui matrículas associadas.'
            );
        }

        // Excluir curso
        await pool.execute(
            'DELETE FROM cursos WHERE id = ?',
            [id]
        );

        return res.status(204).send();

    } catch (erro) {
        console.error('Erro ao excluir curso:', erro);

        if (erro.code === 'ER_ROW_IS_REFERENCED_2') {
            return problema(
                req,
                res,
                409,
                'Não é possível excluir um curso que possui matrículas associadas.'
            );
        }

        return problema(req, res, 500, 'Não foi possível excluir o curso.');
    }
});

// GET /matriculas - Listar matrículas
app.get('/matriculas', async (req, res) => {
    try {
        const { cursoId, status, email } = req.query;

        let sql = `
            SELECT
                id,
                curso_id AS cursoId,
                aluno,
                email,
                data_matricula AS dataMatricula,
                status,
                pagamento_id AS pagamentoId
            FROM matriculas
        `;

        const condicoes = [];
        const parametros = [];

        if (cursoId) {
            condicoes.push('curso_id = ?');
            parametros.push(Number(cursoId));
        }

        if (status) {
            condicoes.push('status = ?');
            parametros.push(status);
        }

        if (email) {
            condicoes.push('LOWER(email) LIKE ?');
            parametros.push(`%${email.toLowerCase()}%`);
        }

        if (condicoes.length > 0) {
            sql += ` WHERE ${condicoes.join(' AND ')}`;
        }

        const [matriculas] = await pool.execute(sql, parametros);

        return res.status(200).json(matriculas);

    } catch (erro) {
        console.error('Erro ao listar matrículas:', erro);

        return res.status(500).type('application/problem+json').json({
            type: 'about:blank',
            title: 'Erro interno do servidor',
            status: 500,
            detail: 'Não foi possível listar as matrículas.',
            instance: req.originalUrl
        });
    }
});

// POST /matriculas - Registrar nova matrícula
app.post('/matriculas', async (req, res) => {
    const { cursoId, aluno, email } = req.body;

    // Validar ID do curso
    if (!Number.isInteger(cursoId) || cursoId < 1) {
        return problema(req, res, 422, 'Informe um ID de curso válido.');
    }

    // Validar nome do aluno
    if (typeof aluno !== 'string' || !aluno.trim()) {
        return problema(req, res, 422, 'O nome do aluno é obrigatório.');
    }

    // Validar e-mail
    if (
        typeof email !== 'string' ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
        return problema(req, res, 422, 'Informe um e-mail válido.');
    }

    try {
        // Buscar curso no banco de dados
        const [cursosEncontrados] = await pool.execute(
            `SELECT id, titulo, status FROM cursos WHERE id = ?`,
            [cursoId]
        );

        if (cursosEncontrados.length === 0) {
            return problema(req, res, 404, 'Curso não encontrado.');
        }

        const curso = cursosEncontrados[0];

        // Somente cursos publicados aceitam matrículas
        if (curso.status !== 'publicado') {
            return problema(req, res, 422, 'Não é possível realizar matrícula em um curso que não está publicado.');
        }

        const emailNormalizado = email.trim().toLowerCase();

        // Verificar matrícula ativa duplicada
        const [matriculasExistentes] = await pool.execute(
            `SELECT id FROM matriculas
             WHERE curso_id = ?
             AND email = ?
             AND status = 'ativa'`,
            [cursoId, emailNormalizado]
        );

        if (matriculasExistentes.length > 0) {
            return problema(req, res, 409, 'Este aluno já possui uma matrícula ativa neste curso.');
        }

        // Solicitar autorização de pagamento
        const pagamento = await autorizarPagamentoMock(
            aluno.trim(),
            curso
        );

        if (!pagamento.aprovado) {
            return problema(req, res, 422, 'O pagamento não foi aprovado. A matrícula não foi criada.');
        }

        // Salvar matrícula no banco somente após aprovação
        const [resultado] = await pool.execute(
            `INSERT INTO matriculas
                (curso_id, aluno, email, data_matricula, status, pagamento_id)
             VALUES (?, ?, ?, CURRENT_DATE, 'ativa', ?)`,
            [
                cursoId,
                aluno.trim(),
                emailNormalizado,
                pagamento.transacaoId
            ]
        );

        const novaMatricula = {
            id: resultado.insertId,
            cursoId,
            aluno: aluno.trim(),
            email: emailNormalizado,
            dataMatricula: new Date().toISOString().split('T')[0],
            status: 'ativa',
            pagamentoId: pagamento.transacaoId
        };

        return res
            .status(201)
            .location(`/matriculas/${novaMatricula.id}`)
            .json(novaMatricula);

    } catch (erro) {
        console.error('Erro ao registrar matrícula:', erro);

        return res.status(500).type('application/problem+json').json({
            type: 'about:blank',
            title: 'Erro interno do servidor',
            status: 500,
            detail: 'Não foi possível registrar a matrícula.',
            instance: req.originalUrl
        });
    }
});

// GET /matriculas/:id - Consultar matrícula específica
app.get('/matriculas/:id', async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
        return problema(req, res, 400, 'O ID da matrícula deve ser um número inteiro positivo.');
    }

    try {
        const [resultado] = await pool.execute(`
            SELECT
                id,
                curso_id AS cursoId,
                aluno,
                email,
                data_matricula AS dataMatricula,
                status,
                pagamento_id AS pagamentoId
            FROM matriculas
            WHERE id = ?
        `, [id]);

        if (resultado.length === 0) {
            return problema(req, res, 404, 'Matrícula não encontrada.');
        }

        return res.status(200).json(resultado[0]);

    } catch (erro) {
        console.error('Erro ao consultar matrícula:', erro);

        return res.status(500).type('application/problem+json').json({
            type: 'about:blank',
            title: 'Erro interno do servidor',
            status: 500,
            detail: 'Não foi possível consultar a matrícula.',
            instance: req.originalUrl
        });
    }
});

// Iniciar servidor
app.listen(PORT, '127.0.0.1', () => {
    console.log(`API REST executando em http://127.0.0.1:${PORT}`);
});
