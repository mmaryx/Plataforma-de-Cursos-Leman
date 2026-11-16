INSERT INTO cursos
    (titulo, descricao, instrutor, categoria, carga_horaria, status)
VALUES
    (
        'Introdução ao JavaScript',
        'Fundamentos da linguagem JavaScript.',
        'Ana Souza',
        'Programação',
        20,
        'publicado'
    ),
    (
        'Desenvolvimento com React',
        'Construção de interfaces utilizando React.',
        'Carlos Mendes',
        'Programação',
        40,
        'publicado'
    ),
    (
        'Design de Interfaces',
        'Princípios de design e experiência do usuário.',
        'Mariana Lima',
        'Design',
        30,
        'rascunho'
    );

INSERT INTO matriculas
    (curso_id, aluno, email, data_matricula, status, pagamento_id)
VALUES
    (
        1,
        'Pedro Oliveira',
        'pedro@email.com',
        '2026-11-10',
        'ativa',
        'MOCK-1001'
    ),
    (
        2,
        'Julia Santos',
        'julia@email.com',
        '2026-11-11',
        'ativa',
        'MOCK-1002'
    );
    