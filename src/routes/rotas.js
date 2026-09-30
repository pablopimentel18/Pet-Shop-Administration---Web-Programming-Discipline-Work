const express = require('express');
const router = express.Router();
const { getDB } = require('../config/database');
const { ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');

router.get('/', async (req, res) => {
    try {
        const db = getDB();
        
        const configuracoesGerais = await db.collection('configuracao')
            .find({ capacidadeTotal: { $gt: 0 } })
            .sort({ horario: 1 }) 
            .toArray();

        const ordemDias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
        const hoje = new Date();
        const horaAtual = hoje.getHours();
        const minutoAtual = hoje.getMinutes();
        
        const horariosAgrupados = [];
        let diasValidos = 0; 
        let deslocamentoDias = 0; 

        while (diasValidos < 8) {
            const dataAlvo = new Date();
            dataAlvo.setDate(hoje.getDate() + deslocamentoDias); 
            const indiceDiaSemana = dataAlvo.getDay(); 
            const nomeDia = ordemDias[indiceDiaSemana];
            
            deslocamentoDias++;
            if (nomeDia === 'Domingo') continue; 

            const dataFormatada = dataAlvo.toLocaleDateString('pt-BR'); 

            const agendamentosDestaData = await db.collection('agendamentos')
                .find({ data_atendimento: dataFormatada })
                .toArray();

            const slotsDoDia = configuracoesGerais
                .filter(config => {
                    if (config.dia !== nomeDia) return false;
                    
                    if (deslocamentoDias === 1) {
                        const [horaSlot, minSlot] = config.horario.split(':').map(Number);
                        if (horaSlot < horaAtual || (horaSlot === horaAtual && minSlot <= minutoAtual)) {
                            return false; 
                        }
                    }
                    return true;
                })
                .map(config => {
                    const ocupadas = agendamentosDestaData.filter(a => a.horario === config.horario).length;
                    const vagasRestantes = config.capacidadeTotal - ocupadas;

                    return { 
                        ...config, 
                        dataExata: dataFormatada,
                        capacidadeDisponivel: vagasRestantes // Injeta o valor real no objeto
                    };
                })
                .filter(slot => slot.capacidadeDisponivel > 0); // Só exibe se sobrou vaga após o cálculo

            if (slotsDoDia.length > 0) {
                horariosAgrupados.push({
                    dia: nomeDia,
                    dataExata: dataFormatada, 
                    slots: slotsDoDia
                });
            }
            diasValidos++; 
        }

        res.render('cliente', { horariosAgrupados: horariosAgrupados });
        
    } catch (error) {
        console.error("Erro:", error);
        res.status(500).send("Erro interno");
    }
});


//Visualizar a agenda
router.get('/listaPetAgenda', verificarLogin, async (req, res) => {
    try {
        const db = getDB();
        
        const listaAgendamentos = await db.collection('agendamentos').aggregate([
            {
                //como se fosse um join do SQL
                $lookup: {
                    from: 'clientes',            
                    localField: 'cliente_id',    
                    foreignField: '_id',         
                    as: 'dados_do_cliente'       
                }
            },
            {
                $unwind: '$dados_do_cliente' //descompacta o array gerado pelo lookup
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
            .sort({ horario: 1 }) 
            .toArray();


        const ordemDias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
        const hoje = new Date();
        const gradeAgrupada = [];
        
        let diasProcessados = 0;
        let deslocamento = 0;

        while (diasProcessados < 8) {
            const dataAlvo = new Date();
            dataAlvo.setDate(hoje.getDate() + deslocamento);
            const nomeDia = ordemDias[dataAlvo.getDay()];
            deslocamento++;

            if (nomeDia === 'Domingo') continue;

            const dataFormatada = dataAlvo.toLocaleDateString('pt-BR');
            
            // Separa os moldes configurados para este dia da semana
            const moldesDoDia = gradeGeral.filter(g => g.dia === nomeDia);

            if (moldesDoDia.length > 0) {
                const horariosComVagas = moldesDoDia.map(molde => {
                    // Conta quantos agendamentos já existem para esta data exata e horário
                    const ocupados = agendamentosFormatados.filter(a => 
                        a.data_exata === dataFormatada && a.horario === molde.horario
                    ).length;

                    return {
                        horario: molde.horario,
                        capacidadeTotal: molde.capacidadeTotal,
                        capacidadeDisponivel: molde.capacidadeTotal - ocupados
                    };
                });

                gradeAgrupada.push({
                    dia: nomeDia,
                    dataExata: dataFormatada,
                    horarios: horariosComVagas
                });
            }
            diasProcessados++;
        }

        res.render('admin', { 
            titulo: "Agenda de Atendimentos", 
            mostrarLista: true,
            agendamentos: agendamentosFormatados,
            gradeAgrupada: gradeAgrupada, 
            adminLogado: true

        });
        
        } catch (error) {
        console.error("Erro ao carregar a grade de horários:", error);
        res.status(500).send("Erro interno ao carregar a página.");
        }
        });

router.get('/ajustaPetAgenda', verificarLogin, async (req, res) => {
    try {
        const db = getDB();
        
        const configs = await db.collection('configuracao').find().sort({ horario: 1 }).toArray();

        const horariosUnicos = [...new Set(configs.map(c => c.horario))].sort();
        
        const diasDaSemana = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

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
            adminLogado: true
        });

    } catch (error) {
        console.error("Erro ao carregar a grade de horários:", error);
        res.status(500).send("Erro interno ao carregar a página.");
    }
});


router.post('/ajustaPetAgenda', verificarLogin, async (req, res) => {
    try {
        const db = getDB();
        const { dia, horario, capacidade } = req.body;
        const capacidadeNum = parseInt(capacidade);

        const agendamentosAfetados = await db.collection('agendamentos')
            .find({ dia: dia, horario: horario })
            .toArray();

        //Agrupa os agendamentos pela data exata de atendimento
        const agendamentosPorData = {};
        agendamentosAfetados.forEach(ag => {
            if (!agendamentosPorData[ag.data_atendimento]) {
                agendamentosPorData[ag.data_atendimento] = [];
            }
            agendamentosPorData[ag.data_atendimento].push(ag);
        });

        //Verifica cada data. Se exceder a nova capacidade, separa os mais recentes para exclusão
        let idsParaRemover = [];
        for (const dataExata in agendamentosPorData) {
            let listaDestaData = agendamentosPorData[dataExata];

            if (listaDestaData.length > capacidadeNum) {
                // Ordena do mais recente para o mais antigo (data_registro)
                listaDestaData.sort((a, b) => b.data_registro - a.data_registro);

                let qtdRemover = listaDestaData.length - capacidadeNum;
                let remover = listaDestaData.slice(0, qtdRemover).map(item => item._id);
                idsParaRemover.push(...remover);
            }
        }

        //Executa a deleção em massa dos excedentes
        if (idsParaRemover.length > 0) {
            await db.collection('agendamentos').deleteMany({ _id: { $in: idsParaRemover } });
            console.log(`Removidos ${idsParaRemover.length} agendamentos para ajustar a capacidade.`);
        }

        //Salva o novo molde na configuração
        await db.collection('configuracao').updateOne(
            { dia: dia, horario: horario }, 
            { $set: { capacidadeTotal: capacidadeNum } },
            { upsert: true } 
        );

        res.redirect('/ajustaPetAgenda');
        
    } catch (error) {
        console.error("Erro ao salvar configuração de agenda:", error);
        res.status(500).send("Erro interno ao tentar salvar o horário.");
    }
});

router.post('/salvarGradeMassa', verificarLogin, async (req, res) => {
    try {
        const db = getDB();
        const { grade } = req.body; 

        for (const horario in grade) {
            const dias = grade[horario];
            
            for (const dia in dias) {
                const capacidadeNum = parseInt(dias[dia]);

                const agendamentosAfetados = await db.collection('agendamentos')
                    .find({ dia: dia, horario: horario })
                    .toArray();

                const agendamentosPorData = {};
                agendamentosAfetados.forEach(ag => {
                    if (!agendamentosPorData[ag.data_atendimento]) {
                        agendamentosPorData[ag.data_atendimento] = [];
                    }
                    agendamentosPorData[ag.data_atendimento].push(ag);
                });

                let idsParaRemover = [];
                for (const dataExata in agendamentosPorData) {
                    let listaDestaData = agendamentosPorData[dataExata];

                    if (listaDestaData.length > capacidadeNum) {
                        listaDestaData.sort((a, b) => b.data_registro - a.data_registro);
                        let qtdRemover = listaDestaData.length - capacidadeNum;
                        let remover = listaDestaData.slice(0, qtdRemover).map(item => item._id);
                        idsParaRemover.push(...remover);
                    }
                }

                if (idsParaRemover.length > 0) {
                    await db.collection('agendamentos').deleteMany({ _id: { $in: idsParaRemover } });
                }

                await db.collection('configuracao').updateOne(
                    { dia: dia, horario: horario },
                    { $set: { capacidadeTotal: capacidadeNum } },
                    { upsert: true }
                );
            }
        }

        res.redirect('/ajustaPetAgenda');

    } catch (error) {
        console.error("Erro ao salvar grade em massa:", error);
        res.status(500).send("Erro interno ao tentar salvar a grade.");
    }
});

router.get('/cadastroCliente', (req, res) => {
    res.render('cadastroCliente');
});

router.post('/cadastroCliente', async (req, res) => {
    try {
        const db = getDB();
        const { nome, cpf, email } = req.body;
        const cpfLimpo = cpf.replace(/\D/g, '');

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

        await db.collection('clientes').insertOne({
            nome: nome,
            cpf: cpfLimpo,
            email: email,
            data_cadastro: new Date()
        });

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

        const config = await db.collection('configuracao').findOne({ _id: new ObjectId(horario_id) });

        const ocupacaoAtual = await db.collection('agendamentos').countDocuments({
            data_atendimento: data_exata,
            horario: config.horario
        });

        if (ocupacaoAtual >= config.capacidadeTotal) {
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

        await db.collection('agendamentos').insertOne({
            horario_id: new ObjectId(horario_id),
            cliente_id: cliente._id,
            dia: config.dia,     
            data_atendimento: data_exata, 
            horario: config.horario, 
            data_registro: new Date()             
        });

        res.send(`
            <!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Sucesso - Pet Shop</title><link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"></head>
            <body style="display: flex; align-items: center; justify-content: center; height: 100vh; background-color: var(--cor-fundo);">
                <div class="painel-formulario" style="text-align: center; max-width: 600px; border-top: 5px solid #28a745;">
                    <i class="fa-solid fa-circle-check" style="font-size: 4rem; color: #28a745; margin-bottom: 20px;"></i>
                    <h2 style="color: var(--cor-secundaria); margin-bottom: 15px;">Agendamento Confirmado!</h2>
                    <p style="color: var(--cor-texto); margin-bottom: 25px; font-size: 1.1rem;">Olá, <strong>${cliente.nome}</strong>. O banho e tosa foi marcado com sucesso para <strong>${config.dia}, ${data_exata}, às ${config.horario}</strong>.</p>
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
        next(); 
    } else {
        res.redirect('/login'); 
    }
}


router.get('/login', (req, res) => {
    res.render('login');
});

router.post('/login', async (req, res) => {
    try {
        const db = getDB();
        const { usuario, senha } = req.body;

        
        const admin = await db.collection('administradores').findOne({ usuario: usuario });

        if (!admin) {
            return res.render('login', { erro: 'Usuário ou senha incorretos!' });
        }

        const senhaValida = await bcrypt.compare(senha, admin.senha);

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