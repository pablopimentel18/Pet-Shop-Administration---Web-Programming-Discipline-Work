const express = require('express');
const router = express.Router();
const { getDB } = require('../config/database');
const { ObjectId } = require('mongodb');

router.get('/', async (req, res) => {
    try {
        const db = getDB();
        
        // Busca apenas os slots onde a capacidadeDisponivel for maior que zero
        const horariosDisponiveis = await db.collection('configuracao') // (Use o nome da coleção de configurações que você decidiu)
            .find({ capacidadeDisponivel: { $gt: 0 } })
            .toArray();

        res.render('cliente', { horarios: horariosDisponiveis });
    } catch (error) {
        console.error("Erro ao buscar horários:", error);
        res.status(500).send("Erro interno do servidor");
    }
});

// 2. Rota de Administração: Visualizar a agenda
router.get('/listaPetAgenda', async (req, res) => {
    try {
        const db = getDB();
        
        const listaAgendamentos = await db.collection('agendamentos').aggregate([
            {
                $lookup: {
                    from: 'clientes',            // Coleção que queremos juntar
                    localField: 'cliente_id',    // Campo na coleção agendamentos
                    foreignField: '_id',         // Campo correspondente na coleção clientes
                    as: 'dados_do_cliente'       // Nome do novo campo temporário
                }
            },
            {
                $unwind: '$dados_do_cliente'     // Descompacta o array gerado pelo lookup
            }
        ]).toArray();

        const agendamentosFormatados = listaAgendamentos.map(agendamento => ({
            dia: agendamento.dia,
            horario: agendamento.horario,
            cliente_nome: agendamento.dados_do_cliente.nome,
            cliente_cpf: agendamento.dados_do_cliente.cpf
        }));

        // Passamos a flag mostrarLista como true e enviamos os dados
        res.render('admin', { 
            titulo: "Agenda de Atendimentos", 
            mostrarLista: true,
            agendamentos: agendamentosFormatados
        });
    } catch (error) {
        console.error("Erro ao procurar a agenda:", error);
        res.status(500).send("Erro interno do servidor.");
    }
});

router.get('/ajustaPetAgenda', async (req, res) => {
    // Passamos a flag mostrarFormulario como true
    res.render('admin', { 
        titulo: "Configurar Horários", 
        mostrarFormulario: true 
    });
})
// Rota POST para receber os dados do formulário e salvar no banco
router.post('/ajustaPetAgenda', async (req, res) => {
    try {
        const db = getDB();
        
        // Extrai os dados que vieram do formulário (atributos "name" no HTML)
        const { dia, horario, capacidade } = req.body;
        
        // O formulário envia tudo como texto, então transformamos a capacidade em número
        const capacidadeNum = parseInt(capacidade);

        // Acessa (ou cria) a coleção 'configuracao' e faz o upsert
        let agendamentos_existentes;
        let novo_qtd_disponivel;
        const existe = await db.collection('configuracao').findOne({ dia: dia, horario: horario });
        if (existe) {
            agendamentos_existentes = (existe.capacidadeTotal - existe.capacidadeDisponivel);
        } else{
            agendamentos_existentes = 0;
        }

        if(capacidadeNum < agendamentos_existentes){
            novo_qtd_disponivel = 0;
            let qtd_remover = agendamentos_existentes - capacidadeNum;

            const dados_remover = await db.collection('agendamentos')
                .find( { dia: dia, horario: horario } ) 
                .project({ _id: 1 }) 
                .sort({ data_registro: -1 })
                .limit(qtd_remover) 
                .toArray()
            let ids_remover = dados_remover.map(item => item._id);
            await db.collection('agendamentos').deleteMany(
                { _id: { $in: ids_remover } })
                .then(resultado => {
                    console.log(`Removidos ${resultado.deletedCount} agendamentos para ajustar a capacidade.`);
                })
                .catch(erro => {
                    console.error("Erro ao remover agendamentos:", erro);
                });
            



        } else{
            novo_qtd_disponivel = capacidadeNum - agendamentos_existentes;
        }


        await db.collection('configuracao').updateOne(
            { dia: dia, horario: horario }, // Critério de busca (o que identifica esse slot)
            { 
                $set: { 
                    capacidadeTotal: capacidadeNum,

                    capacidadeDisponivel: novo_qtd_disponivel // Na criação, a disponível é igual à total
                } 
            },
            { upsert: true } // Se não existir, insere. Se existir, atualiza.
        );

        // Recarrega a página para o administrador poder inserir mais horários
        res.redirect('/');
        
    } catch (error) {
        console.error("Erro ao salvar configuração de agenda:", error);
        res.status(500).send("Erro interno ao tentar salvar o horário.");
    }
});


// Rota GET: Exibe o formulário de cadastro de cliente
router.get('/cadastroCliente', (req, res) => {
    res.render('cadastroCliente');
});

// Rota POST: Salva o cliente e redireciona para o agendamento
router.post('/cadastroCliente', async (req, res) => {
    try {
        const db = getDB();
        const { nome, cpf, email } = req.body;

        // Verifica se o CPF já existe no banco (Primary Key)
        const clienteExiste = await db.collection('clientes').findOne({ cpf: cpf });
        
        if (clienteExiste) {
            return res.send(`
                <div style="text-align: center; margin-top: 50px;">
                    <h2 style="color: red;">CPF já cadastrado!</h2>
                    <p>Este CPF já possui cadastro no nosso sistema.</p>
                    <a href="/">Ir para tela de agendamento</a>
                </div>
            `);
        }

        // Insere o novo cliente
        await db.collection('clientes').insertOne({
            nome: nome,
            cpf: cpf,
            email: email,
            data_cadastro: new Date()
        });

        // Após cadastrar, leva o usuário direto para a tela de escolher o horário
        res.redirect('/');

    } catch (error) {
        console.error("Erro ao cadastrar cliente:", error);
        res.status(500).send("Erro interno ao cadastrar cliente.");
    }
});

router.post('/agendar', async (req, res) => {
    try {
        const db = getDB();
        const { horario_id, cpf } = req.body;

        const cliente = await db.collection('clientes').findOne({ cpf: cpf });
        
        if (!cliente) {
            return res.send(`
                <div style="text-align: center; margin-top: 50px;">
                    <h2 style="color: red;">Cliente não encontrado!</h2>
                    <p>O CPF informado não está cadastrado em nosso sistema.</p>
                    <a href="/cadastroCliente">Clique aqui para se cadastrar</a>
                </div>
            `);
        }   
        // REQUISITOS 1 e 4: Verifica a disponibilidade E atualiza a capacidade de forma atômica
        // O $inc diminui a capacidadeDisponivel em 1 APENAS se ela for maior que 0 ($gt: 0)

        const horarioAtualizado = await db.collection('configuracao').findOneAndUpdate(
            { _id: new ObjectId(horario_id), capacidadeDisponivel: { $gt: 0 } },             {$inc: { capacidadeDisponivel: -1 } },
            { returnDocument: 'after' } // Retorna os dados do horário APÓS ter diminuído a vaga
        );

        // Se o findOneAndUpdate retornar vazio, significa que alguém pegou a última vaga no milissegundo anterior
        if (!horarioAtualizado) {
            return res.send(`
                <div style="text-align: center; margin-top: 50px;">
                    <h2 style="color: red;">Desculpe!</h2>
                    <p>Este horário acabou de ser preenchido por outro cliente ou não existe mais.</p>
                    <a href="/">Voltar para o calendário</a>
                </div>
            `);
        }

        // REQUISITOS 2 e 3: Registra o agendamento e associa ao cliente

        await db.collection('agendamentos').insertOne({
            horario_id: new ObjectId(horario_id),
            cliente_id: cliente._id,
            dia: horarioAtualizado.dia,         // Salvamos aqui para facilitar a vida do Admin depois
            horario: horarioAtualizado.horario, // Salvamos aqui para facilitar a vida do Admin depois
            data_registro: new Date()           // Data em que o clique no botão foi feito
        });

        // REQUISITO 5: Informa ao cliente que o agendamento foi um sucesso
        res.send(`
            <div style="text-align: center; margin-top: 50px;">
                <h2 style="color: green;">Agendamento Confirmado!</h2>
                <p>Olá, ${cliente.nome}. Seu horário para ${horarioAtualizado.dia} às ${horarioAtualizado.horario} foi marcado com sucesso.</p>
                <a href="/">Voltar ao Início</a>
            </div>
        `);

    } catch (error) {
        console.error("Erro ao processar agendamento:", error);
        res.status(500).send("Erro interno do servidor ao processar sua solicitação.");
    }
});


module.exports = router;