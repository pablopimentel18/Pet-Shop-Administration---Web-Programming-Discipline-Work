const express = require('express');
const router = express.Router();
const { getDB } = require('../config/database');

// 1. Rota do Cliente (Página inicial)
router.get('/', async (req, res) => {
    try {
        const db = getDB();
        
        // Busca no MongoDB apenas os horários com vaga
        const horariosDisponiveis = await db.collection('horarios')
            .find({ capacidadeDisponivel: { $gt: 0 } })
            .toArray();

        // Envia os horários encontrados para a página 'cliente.handlebars'
        res.render('cliente', { horarios: horariosDisponiveis });
        
    } catch (error) {
        console.error("Erro ao buscar horários:", error);
        res.status(500).send("Erro interno do servidor");
    }
});

// 2. Rota de Administração: Visualizar a agenda
router.get('/listaPetAgenda', async (req, res) => {
    // Por enquanto, apenas renderiza uma página de admin vazia
    res.render('admin', { titulo: "Agenda de Atendimentos" });
});

// 3. Rota de Administração: Configurar a agenda
router.get('/ajustaPetAgenda', async (req, res) => {
    // Por enquanto, apenas renderiza uma página de admin vazia
    res.render('admin', { titulo: "Configurar Horários" });
});

module.exports = router;