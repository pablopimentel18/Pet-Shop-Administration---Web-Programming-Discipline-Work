const { MongoClient } = require('mongodb');

// URL padrão do MongoDB rodando na sua máquina
const url = 'mongodb://mongoadmin:senha@127.0.0.1:27017/?authSource=admin';
const dbName = 'petshopDB'; // Nome do banco de dados que será criado

let db;

async function connectDB() {
    try {
        const client = new MongoClient(url);
        await client.connect();
        console.log('Conectado com sucesso ao MongoDB!');
        
        // Seleciona o banco de dados
        db = client.db(dbName);
        return db;
    } catch (error) {
        console.error('Erro ao conectar ao MongoDB:', error);
        process.exit(1); // Para o servidor se o banco falhar
    }
}

// Função para pegar a instância do banco nas rotas
function getDB() {
    if (!db) {
        throw new Error('Banco de dados não inicializado!');
    }
    return db;
}

module.exports = { connectDB, getDB };