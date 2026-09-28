# 🐾 Sistema de Agendamento - Pet Shop (Banho e Tosa)

Este é um sistema web desenvolvido para gerenciar agendamentos de banho e tosa de um Pet Shop. O projeto foi construído utilizando arquitetura MVC e foca em concorrência de dados, segurança e normalização de banco de dados.

Projeto acadêmico desenvolvido para o curso de Engenharia de Computação da Universidade Federal de Santa Catarina (UFSC).

## ✨ Funcionalidades

### 🐶 Visão do Cliente
* **Cadastro Simplificado**: Registro de novos clientes com validação de CPF único como chave primária.
* **Janela Dinâmica de Agendamentos**: O sistema projeta os horários disponíveis em uma janela deslizante contínua, filtrando automaticamente horários e dias passados baseando-se no relógio do servidor.
* **Prevenção de Concorrência**: Utiliza operações atômicas no banco de dados (`findOneAndUpdate` com `$inc`) para garantir que dois clientes não consigam reservar a última vaga simultaneamente.

### ⚙️ Visão do Administrador (Área Restrita)
* **Autenticação**: Acesso protegido por controle de sessão na memória (`express-session`) e senhas criptografadas (`bcryptjs`).
* **Relatório de Atendimentos**: Tabela gerada via agregação do MongoDB (`$lookup`), cruzando dados relacionais da coleção de agendamentos com a coleção de clientes.
* **Gestão de Grade em Massa**: Tabela interativa para edição rápida da capacidade de atendimentos simultâneos em todos os dias e horários da semana de uma única vez.

## 🛠️ Tecnologias Utilizadas

* **Back-end:** Node.js, Express.js
* **Banco de Dados:** MongoDB (via Docker), Driver Nativo (`mongodb`)
* **Front-end:** Handlebars (Template Engine), HTML5, CSS3, JavaScript
* **Segurança:** bcryptjs (Hash de senhas), express-session (Controle de rotas privadas)

## 🚀 Como executar o projeto localmente

### 1. Pré-requisitos
* [Node.js](https://nodejs.org/) instalado na máquina
* [Docker](https://www.docker.com/) rodando localmente

### 2. Configurando o Banco de Dados (MongoDB)
Abra o seu terminal e rode o comando abaixo para subir um container do MongoDB isolado na porta 27017:

```bash
docker run --name mongo_petshop -p 27017:27017 -e MONGO_INITDB_ROOT_USERNAME=admin -e MONGO_INITDB_ROOT_PASSWORD=123 -d mongo
```

### 3. Instalando as dependências
Clone este repositório, navegue até a pasta raiz do projeto e instale os pacotes do Node:

```bash
npm install
```

### 4. Configurando o Primeiro Administrador (Setup de Segurança)
Para garantir a segurança, o sistema não possui administradores fixos no código. 
1. Inicie o servidor:

```bash
node server.js
```

2. Abra o navegador e acesse a rota temporária de setup: **`http://localhost:3000/setupAdmin`**
3. O sistema criará o usuário `admin` com a senha `pet123` (criptografada com salt). *(Nota para a avaliação: Em um ambiente de produção real, esta rota de setup é excluída após a primeira execução).*

### 5. Utilizando o Sistema
Com o banco e o servidor operando, acesse:
* **Área do Cliente (Agendamentos):** `http://localhost:3000/`
* **Área do Administrador (Gestão):** `http://localhost:3000/login` 
  * *Usuário:* admin
  * *Senha:* pet123

## 📂 Estrutura de Pastas

```text
/
├── public/                 # Arquivos estáticos servidos pelo Express (CSS, imagens, scripts de front-end)
├── src/
│   ├── config/
│   │   └── database.js     # Configuração da string de conexão com o MongoDB
│   ├── routes/
│   │   └── rotas.js        # Regras de negócio, middlewares de autenticação e controllers
│   └── views/
│       ├── layouts/
│       │   └── main.handlebars    # Template base estrutural (Header, Body, Footer)
│       ├── admin.handlebars       # Painel consolidado de gestão da grade e tabela de relatórios
│       ├── cliente.handlebars     # Calendário dinâmico de agendamentos em Flexbox
│       ├── cadastroCliente.handlebars # Formulário de registro de novos CPFs
│       └── login.handlebars       # Tela de autenticação de funcionários
├── server.js               # Entry point do servidor, carregamento de engine e ativação de sessões
└── package.json            # Mapeamento de scripts e dependências npm
```

## 👥 Equipe Desenvolvedora
* Pablo da Rosa Pimentel
* Kaio Francisco Martinhago