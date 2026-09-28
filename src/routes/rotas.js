const express = require('express');
const router = express.Router();
const { getDB } = require('../config/database');
const { ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');

// 1. Rota do Cliente (Página inicial)
router.get('/', async (req, res) => {
    try {
        const db = getDB();
        
        const horariosDisponiveis = await db.collection('configuracao')
            .find({ capacidadeDisponivel: { $gt: 0 } })
            .sort({ horario: 1 }) 
            .toArray();

        // Mantemos o Domingo aqui apenas porque o getDay() do JavaScript sempre retorna 0 para ele
        const ordemDias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
        const hoje = new Date();
        
        const horaAtual = hoje.getHours();
        const minutoAtual = hoje.getMinutes();
        
        const horariosAgrupados = [];

        let diasValidos = 0; 
        let deslocamentoDias = 7; // Controla quantos dias no calendário real nós já avançamos

        // Ampliado para buscar 15 dias úteis de agenda
        while (diasValidos < 6) {
            const dataAlvo = new Date();
            dataAlvo.setDate(hoje.getDate() + deslocamentoDias); 
            
            const indiceDiaSemana = dataAlvo.getDay(); 
            const nomeDia = ordemDias[indiceDiaSemana];

            // Já preparamos o deslocamento para a avaliação da próxima repetição do while
            deslocamentoDias++;

            // Se for domingo, interrompe a lógica atual e vai para o próximo loop sem contar como "dia válido"
            if (nomeDia === 'Domingo') {
                continue; 
            }

            const dataFormatada = dataAlvo.toLocaleDateString('pt-BR'); 

            const slotsDoDia = horariosDisponiveis
                .filter(h => {
                    if (h.dia !== nomeDia) return false;
                    
                    // Se deslocamentoDias é 1, significa que estamos processando o "hoje"
                    if (deslocamentoDias === 1) {
                        const [horaSlot, minSlot] = h.horario.split(':').map(Number);
                        
                        if (horaSlot < horaAtual || (horaSlot === horaAtual && minSlot <= minutoAtual)) {
                            return false; 
                        }
                    }
                    return true;
                })
                .map(h => ({ ...h, dataExata: dataFormatada })); 

            if (slotsDoDia.length > 0) {
                horariosAgrupados.push({
                    dia: nomeDia,
                    dataExata: dataFormatada, 
                    slots: slotsDoDia
                });
            }
            
            // Só incrementa a contagem dos 15 dias se passou pelo "continue" do Domingo
            diasValidos++; 
        }

        res.render('cliente', { horariosAgrupados: horariosAgrupados });
        
    } catch (error) {
        console.error("Erro ao buscar horários:", error);
        res.status(500).send("Erro interno do servidor");
    }
});
//Visualizar a agenda
router.get('/listaPetAgenda', verificarLogin, async (req, res) => {
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
            data_exata: agendamento.data_atendimento, 
            dia: agendamento.dia,
            horario: agendamento.horario,
            cliente_nome: agendamento.dados_do_cliente.nome,
            cliente_cpf: agendamento.dados_do_cliente.cpf
        }));

        const gradeGeral = await db.collection('configuracao')
            .find()
            .sort({ horario: 1 }) // Ordena para exibir do mais cedo para o mais tarde
            .toArray();

        // NOVA LÓGICA: Agrupando a grade por dia e calculando Clientes Agendados
        const diasOrdem = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
        const gradeAgrupada = [];

        diasOrdem.forEach(dia => {
            const horariosDoDia = gradeGeral
                .filter(g => g.dia === dia)
                .map(g => ({
                    ...g,
                    // Calcula quantos clientes estão agendados neste slot
                    clientesAtendidos: g.capacidadeTotal - g.capacidadeDisponivel
                }));

            if (horariosDoDia.length > 0) {
                gradeAgrupada.push({
                    dia: dia,
                    horarios: horariosDoDia
                });
            }
        });

        res.render('admin', { 
            titulo: "Agenda de Atendimentos", 
            mostrarLista: true,
            agendamentos: agendamentosFormatados,
            gradeAgrupada: gradeAgrupada, // Usamos a variável agrupada agora
            adminLogado: true // Informa ao layout (main) que o menu de Sair deve aparecer
        });
    } catch (error) {
        console.error("Erro ao procurar a agenda:", error);
        res.status(500).send("Erro interno do servidor.");
    }
});

router.get('/ajustaPetAgenda', verificarLogin, async (req, res) => {
    try {
        const db = getDB();
        
        // 1. Busca todas as configurações e ordena pelo horário
        const configs = await db.collection('configuracao').find().sort({ horario: 1 }).toArray();

        // 2. Cria um array apenas com os horários únicos (ex: ['08:00', '09:00', '14:00'])
        const horariosUnicos = [...new Set(configs.map(c => c.horario))].sort();
        
        const diasDaSemana = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

        // 3. Constrói a matriz (grade) para a tabela
        const grade = horariosUnicos.map(hora => {
            const capacidades = diasDaSemana.map(dia => {
                const configDiaHora = configs.find(c => c.dia === dia && c.horario === hora);
                return {
                    dia: dia,
                    valor: configDiaHora ? configDiaHora.capacidadeTotal : 0
                };
            });
            return { horario: hora, capacidades: capacidades };
        });

        res.render('admin', { 
            titulo: "Configurar Horários", 
            mostrarFormulario: true,
            diasDaSemana: diasDaSemana,
            grade: grade,
            adminLogado: true // Garante que a barra de navegação entenda que o Admin está online
        });

    } catch (error) {
        console.error("Erro ao carregar a grade de horários:", error);
        res.status(500).send("Erro interno ao carregar a página.");
    }
});

router.post('/salvarGradeMassa', verificarLogin, async (req, res) => {
    try {
        const db = getDB();
        const { grade } = req.body; 
        
        // O Express transforma os inputs em um objeto assim:
        // { '08:00': { 'Segunda': '2', 'Terça': '0', ... }, '09:00': ... }

        // Laço duplo: percorre as horas e, dentro delas, os dias
        for (const horario in grade) {
            const dias = grade[horario];
            
            for (const dia in dias) {
                const capacidadeNum = parseInt(dias[dia]);

                // AQUI REUTILIZAMOS A SUA LÓGICA DE ATUALIZAÇÃO E REMOÇÃO DE EXCEDENTES
                const existe = await db.collection('configuracao').findOne({ dia: dia, horario: horario });
                let agendamentos_existentes = 0;
                
                if (existe) {
                    agendamentos_existentes = (existe.capacidadeTotal - existe.capacidadeDisponivel);
                }

                let novo_qtd_disponivel;

                if (capacidadeNum < agendamentos_existentes) {
                    novo_qtd_disponivel = 0;
                    let qtd_remover = agendamentos_existentes - capacidadeNum;

                    const dados_remover = await db.collection('agendamentos')
                        .find({ dia: dia, horario: horario }) 
                        .project({ _id: 1 }) 
                        .sort({ data_registro: -1 })
                        .limit(qtd_remover) 
                        .toArray();
                        
                    let ids_remover = dados_remover.map(item => item._id);
                    
                    if (ids_remover.length > 0) {
                        await db.collection('agendamentos').deleteMany({ _id: { $in: ids_remover } });
                    }
                } else {
                    novo_qtd_disponivel = capacidadeNum - agendamentos_existentes;
                }

                // Salva a atualização no banco
                await db.collection('configuracao').updateOne(
                    { dia: dia, horario: horario },
                    { 
                        $set: { 
                            capacidadeTotal: capacidadeNum,
                            capacidadeDisponivel: novo_qtd_disponivel 
                        } 
                    },
                    { upsert: true }
                );
            }
        }

        // Após percorrer toda a tabela e salvar tudo, recarrega a página
        res.redirect('/ajustaPetAgenda');

    } catch (error) {
        console.error("Erro ao salvar grade em massa:", error);
        res.status(500).send("Erro interno ao tentar salvar a grade.");
    }
});

// Rota POST para receber os dados do formulário e salvar no banco
router.post('/ajustaPetAgenda', verificarLogin, async (req, res) => {
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

        res.redirect('/ajustaPetAgenda');
        
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
        const cpfLimpo = cpf.replace(/\D/g, '');

        // Verifica se o CPF já existe no banco (Primary Key)
        const clienteExiste = await db.collection('clientes').findOne({ cpf: cpfLimpo });
        
        if (clienteExiste) {
            return res.send(`
                <!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Aviso - Pet Shop</title><link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"></head>
                <body style="display: flex; align-items: center; justify-content: center; height: 100vh; background-color: var(--cor-fundo);">
                    <div class="painel-formulario" style="text-align: center; max-width: 500px;">
                        <i class="fa-solid fa-triangle-exclamation" style="font-size: 4rem; color: #F77F00; margin-bottom: 20px;"></i>
                        <h2 style="color: var(--cor-secundaria); margin-bottom: 10px;">CPF já cadastrado!</h2>
                        <p style="color: var(--cor-texto); margin-bottom: 25px;">Este CPF já possui cadastro no nosso sistema.</p>
                        <a href="/" class="btn btn-primario" style="text-decoration: none; display: inline-block;">Ir para Agendamento</a>
                    </div>
                </body></html>
            `);
        }

        // Insere o novo cliente
        await db.collection('clientes').insertOne({
            nome: nome,
            cpf: cpfLimpo,
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
        const { horario_id, cpf, data_exata } = req.body;
        const cpfLimpo = cpf.replace(/\D/g, '');

        const cliente = await db.collection('clientes').findOne({ cpf: cpfLimpo });
        
        if (!cliente) {
            return res.send(`
                <!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Aviso - Pet Shop</title><link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"></head>
                <body style="display: flex; align-items: center; justify-content: center; height: 100vh; background-color: var(--cor-fundo);">
                    <div class="painel-formulario" style="text-align: center; max-width: 500px;">
                        <i class="fa-solid fa-circle-xmark" style="font-size: 4rem; color: #DC3545; margin-bottom: 20px;"></i>
                        <h2 style="color: var(--cor-secundaria); margin-bottom: 10px;">Cliente não encontrado!</h2>
                        <p style="color: var(--cor-texto); margin-bottom: 25px;">O CPF informado não está cadastrado em nosso sistema.</p>
                        <a href="/cadastroCliente" class="btn btn-primario" style="text-decoration: none; display: inline-block; background-color: var(--cor-primaria); border: none;">Fazer Cadastro</a>
                    </div>
                </body></html>
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
                <!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Aviso - Pet Shop</title><link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"></head>
                <body style="display: flex; align-items: center; justify-content: center; height: 100vh; background-color: var(--cor-fundo);">
                    <div class="painel-formulario" style="text-align: center; max-width: 500px;">
                        <i class="fa-regular fa-face-frown" style="font-size: 4rem; color: #DC3545; margin-bottom: 20px;"></i>
                        <h2 style="color: var(--cor-secundaria); margin-bottom: 10px;">Poxa! Vaga preenchida.</h2>
                        <p style="color: var(--cor-texto); margin-bottom: 25px;">Este horário acabou de ser reservado por outro cliente.</p>
                        <a href="/" class="btn btn-primario" style="text-decoration: none; display: inline-block; background-color: var(--cor-primaria); border: none;">Voltar para o calendário</a>
                    </div>
                </body></html>
            `);
        }

        // REQUISITOS 2 e 3: Registra o agendamento e associa ao cliente

        await db.collection('agendamentos').insertOne({
            horario_id: new ObjectId(horario_id),
            cliente_id: cliente._id,
            dia: horarioAtualizado.dia,     
            data_atendimento: data_exata, 
            horario: horarioAtualizado.horario, 
            data_registro: new Date()           
        });

        
        res.send(`
            <!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Sucesso - Pet Shop</title><link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"></head>
            <body style="display: flex; align-items: center; justify-content: center; height: 100vh; background-color: var(--cor-fundo);">
                <div class="painel-formulario" style="text-align: center; max-width: 600px; border-top: 5px solid #28a745;">
                    <i class="fa-solid fa-circle-check" style="font-size: 4rem; color: #28a745; margin-bottom: 20px;"></i>
                    <h2 style="color: var(--cor-secundaria); margin-bottom: 15px;">Agendamento Confirmado!</h2>
                    <p style="color: var(--cor-texto); margin-bottom: 25px; font-size: 1.1rem;">Olá, <strong>${cliente.nome}</strong>. O banho e tosa foi marcado com sucesso para <strong>${horarioAtualizado.dia}, ${data_exata}, às ${horarioAtualizado.horario}</strong>.</p>
                    <a href="/" class="btn btn-primario" style="text-decoration: none; display: inline-block;">Voltar ao Início</a>
                </div>
            </body></html>
        `);

    } catch (error) {
        console.error("Erro ao processar agendamento:", error);
        res.status(500).send("Erro interno do servidor ao processar sua solicitação.");
    }
});



function verificarLogin(req, res, next) {
    if (req.session.logado) {
        next(); // Tem o "crachá", pode prosseguir para a rota desejada
    } else {
        res.redirect('/login'); // Não tem o crachá, expulsa para o login
    }
}


router.get('/login', (req, res) => {
    res.render('login');
});

router.post('/login', async (req, res) => {
    try {
        const db = getDB();
        const { usuario, senha } = req.body;

        // 1. Busca o usuário no banco de dados
        const admin = await db.collection('administradores').findOne({ usuario: usuario });

        // Se o usuário não existir, barra o acesso
        if (!admin) {
            return res.render('login', { erro: 'Usuário ou senha incorretos!' });
        }

        // 2. Compara a senha digitada no formulário com o Hash salvo no banco
        const senhaValida = await bcrypt.compare(senha, admin.senha);

        // 3. Libera ou bloqueia a sessão
        if (senhaValida) {
            req.session.logado = true;
            res.redirect('/listaPetAgenda');
        } else {
            res.render('login', { erro: 'Usuário ou senha incorretos!' });
        }

    } catch (error) {
        console.error("Erro no login:", error);
        res.status(500).send("Erro interno ao tentar fazer login.");
    }
});

router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});
module.exports = router;