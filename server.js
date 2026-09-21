const express = require('express');
const { engine } = require('express-handlebars');
const path = require('path');
const { connectDB } = require('./src/config/database');
const app = express();
const PORT = 3000;
const rotas = require('./src/routes/rotas');

// 1. Configuração do Handlebars
// Dizemos ao Express onde estão as pastas 'views' e 'layouts'
app.engine('handlebars', engine({
    defaultLayout: 'main',
    layoutsDir: path.join(__dirname, 'src', 'views', 'layouts')
}));
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'src', 'views'));

// 2. Configuração de arquivos estáticos (CSS, imagens, JS do cliente)
// Conecta a pasta 'public'
app.use(express.static(path.join(__dirname, 'public')));

// 3. Configuração para receber dados do cliente (via formulário ou JSON)
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 4. Rotas do sistema
app.use('/', rotas);

// 5. Inicia o Banco de Dados e depois o Servidor
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Servidor rodando em http://localhost:${PORT}`);
    });
});