CREATE TABLE IF NOT EXISTS cursos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    titulo VARCHAR(255) NOT NULL UNIQUE,
    descricao TEXT,
    instrutor VARCHAR(150),
    categoria VARCHAR(100),
    carga_horaria INT NOT NULL,
    status ENUM('rascunho', 'publicado') NOT NULL DEFAULT 'rascunho',
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS matriculas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    curso_id INT NOT NULL,
    aluno VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL,
    data_matricula DATE NOT NULL,
    status ENUM('ativa', 'cancelada') NOT NULL DEFAULT 'ativa',
    pagamento_id VARCHAR(100),

    CONSTRAINT fk_matriculas_cursos
        FOREIGN KEY (curso_id)
        REFERENCES cursos(id)
        ON DELETE RESTRICT,

    CONSTRAINT uk_matricula_ativa
        UNIQUE (curso_id, email, status)
);