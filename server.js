const express = require('express');
const { engine } = require('express-handlebars');
const path = require('path');
const { connectDB } = require('./src/config/database');
const rotas = require('./src/routes/rotas'); 
const app = express();
const PORT = 3000;

// 1. Configuração do Handlebars
app.engine('handlebars', engine({
    defaultLayout: 'main',
    layoutsDir: path.join(__dirname, 'src', 'views', 'layouts')
}));
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'src', 'views'));

// 2. Configuração de arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// 3. Configuração para receber dados (formulários e JSON)
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 4. Conectando as rotas ao Express
// Isso diz ao app para usar o arquivo rotas.js para gerenciar os caminhos
app.use('/', rotas);

// 5. Inicia primeiro o Banco de Dados, e depois o Servidor
connectDB()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Servidor rodando em http://localhost:${PORT}`);
        });
    })
    .catch((erro) => {
        console.error("Falha ao iniciar a aplicação:", erro);
    });