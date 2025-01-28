const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./pqrs.db', (err) => {
    if (err) {
        console.error('Error al abrir la base de datos:', err.message);
    } else {
        console.log('Conexión con la base de datos SQLite establecida.');
    }
});

// Crear o actualizar la tabla para almacenar PQRS
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS pqrs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            details TEXT,
            attachments TEXT,
            is_anonymous INTEGER DEFAULT 0,
            identifier TEXT,
            phone_number TEXT NOT NULL,
            subject TEXT,
            location TEXT,
            tracking_number TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    db.run(`CREATE TABLE IF NOT EXISTS pqrs_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pqrs_id INTEGER,
        status TEXT,
        details TEXT,
        attachments TEXT,
        location TEXT,
        changed_by TEXT,
        change_type TEXT,
        changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (pqrs_id) REFERENCES pqrs (id)
    )`);
    db.serialize(() => {
        db.run(`
          CREATE TABLE IF NOT EXISTS conversation_states (
            phone_number TEXT PRIMARY KEY,
            state TEXT,
            data TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);
    });
});

module.exports = db;
