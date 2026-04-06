# Prompt: Tela "Em Analise" — Backoffice Spartacus

Crie uma interface web moderna, dark theme, para a tela de gestao de contas "Em Analise" de um backoffice administrativo. O projeto e uma plataforma de artes marciais para criancas e adolescentes no Brasil.

---

## Identidade Visual

- **Tema:** Dark mode
- **Cor primaria:** Gold (#C6A34E) — acentos, botoes primarios, badges ativos
- **Fundo principal:** #0B0D12
- **Fundo cards:** #1A1D25
- **Texto primario:** #E5E5E5
- **Texto secundario:** #9099A8
- **Bordas:** #2A2D38
- **Sucesso:** #4CAF50
- **Warning:** #F59E0B
- **Erro:** #E74C4C
- **Fonte headings:** Nunito (700-800, rounded)
- **Fonte body:** Inter (400-600)
- **Border-radius:** 12-14px nos cards, 10px nos inputs, 99px nos badges

---

## Layout Geral

```
[TopBar fixa 60px]
[Sidebar 250px esquerda] [Conteudo principal centralizado max 940px]
```

### TopBar
- Esquerda: hamburger + logo (circular 40px) + "SPARTACUS" (Nunito 800, gold, uppercase, letter-spacing 2.5px) — clicavel, leva ao home
- Centro: seletor de projeto (caixa com borda sutil, nome do projeto em bold + cidade abaixo em tom muted + seta para baixo)
- Direita: avatar circular com iniciais do usuario

### Sidebar
- Fundo: #1E1F26
- Items com font Nunito 600, 0.95rem
- Active: texto gold, borda esquerda gold 3px, SEM background
- Hover: apenas muda cor do texto, SEM background
- Estrutura:
  ```
  Contas (expansivel)
    Em analise     <- ativo nesta tela
    Bloqueados
    Alunos
    Professores
    Instrutores
    Apoio
  Calendario (expansivel)
    Eventos
    Aulas
  Avaliacao
  Relatorios
  ---
  Configuracoes (footer)
  ```

---

## Conteudo da Tela "Em Analise"

### Header
```
Em analise          (Nunito 800, 1.85rem, uppercase)
Contas em processamento   (Inter 400, 0.95rem, muted)
```

### Tabs (3 abas)
```
[Pendente (12)] [Anamnese (3)] [Revisao (1)]
```
- Font: 0.95rem, weight 600
- Aba ativa: texto gold, borda inferior gold 2.5px
- Badge: pill arredondada com contagem
  - Pendente: fundo gold-muted, texto gold
  - Anamnese: fundo amber-muted, texto amber
  - Revisao: fundo amber-muted, texto amber

### Painel de Controles (sticky, fundo card, borda, radius 14px)
```
[Buscar por nome ou e-mail...                    ]

Perfil: [Aluno] [Responsavel] [+ Mais]    Ordenar: [Nome ↑] [Idade]
```
- Input de busca: fundo #0B0D12, borda sutil, radius 10px, focus com glow gold
- Chips de filtro: pills arredondadas, borda sutil, ativo = fundo gold-muted + texto gold
- "+ Mais" expande para: Professor, Instrutor, Apoio, Patrocinador
- Multi-selecao com Ctrl+click
- Na aba Anamnese o filtro de perfil e ocultado (so alunos preenchem)

---

## Cards de Conta

### Card Standalone (aluno ou outro perfil sem dependentes)
```
┌─ borda esquerda colorida por status ──────────────────────┐
│  [Avatar 46px gold]  Nome Completo          [Badge Status] │
│                      email@exemplo.com                     │
│                      [Aluno] [8 anos · Kids]               │
│                      Muay Thai Kids, Capoeira              │
│                                                            │
│  [Encaminhar para anamnese]  [...]                         │
└────────────────────────────────────────────────────────────┘
```

- Borda esquerda 3.5px colorida: gold (pendente), amber (anamnese/revisao)
- Avatar: circulo com iniciais, fundo gold-muted, letra clara
- Nome: 0.98rem, weight 700
- Email: 0.82rem, muted
- Role chips: 0.78rem, fundo rgba branco 6%, radius 6px
- Age chip: fundo verde sutil, texto verde
- Status badge: pill preenchida (sem borda), variantes por cor
- **1 botao principal visivel** (filled gold, texto escuro, weight 700)
- **Menu "..." para acoes secundarias** (popover acima do botao)
  - Items com hover sutil
  - Acoes destrutivas (Rejeitar) em vermelho
- Hover no card: translateY(-1px), shadow elevada, borda gold
- Animacao de entrada: fade-in + translateY(8px), staggered 40ms

### Card Familia (responsavel + dependentes DENTRO do card)
```
┌─ borda esquerda gold ─────────────────────────────────────┐
│  [Avatar 46px gold]  Maria Silva            [Pendente]     │
│                      maria@email.com                       │
│                      [Responsavel]                         │
│                                                            │
│  [Aprovar conta]  [...]                                    │
│────────────────────────────────────────────────────────────│
│  ● DEPENDENTES (2)                    <- fundo mais escuro │
│                                          (#0B0D12)         │
│   │ [av 32px cinza] Enzo Silva   8a · Kids    [Pendente]   │
│   │  [Enc. anamnese] [...]                                 │
│   │                                                        │
│   │ [av 32px cinza] Helena Silva 6a · Kids    [Pendente]   │
│   │  [Enc. anamnese] [...]                                 │
└────────────────────────────────────────────────────────────┘
```

- Area de dependentes: fundo #0B0D12 (rebaixado), border-top, radius inferior do card
- Label "DEPENDENTES (2)": uppercase 0.7rem, muted, com dot gold antes
- Cada dependente: row com indent esquerdo + borda esquerda gold sutil (2px, 25% opacidade)
- Avatar dependente: 32px, fundo cinza (nao gold), para diferenciar
- Nome dependente: 0.88rem, age inline ao lado
- Botoes dependente: menores (0.74rem)
- Hover na row: background sutil, borda esquerda fica gold solido

---

## Dados Mockados para o Prototipo

### Aba Pendente (12 registros)
```
1. Fernanda Oliveira — Responsavel — Pendente
   Dependentes: Enzo Oliveira (8a, Kids), Helena Oliveira (6a, Kids)

2. Lucas Pereira — Aluno, 14 anos, Infanto Juvenil — Pendente
   Turmas: Jiu-Jitsu Kids Vespertino

3. Ricardo Santos — Responsavel — Pendente
   Dependentes: Theo Santos (10a, Kids), Alice Santos (7a, Kids), Gael Santos (5a, Kids)

4. Gabriela Lima — Aluno, 16 anos, Infanto Juvenil — Pendente
   Turmas: Muay Thai Kids, Capoeira

5. Patricia Costa — Responsavel — Pendente
   Dependentes: Valentina Costa (9a, Kids)

6. Pedro Araujo — Aluno, 13 anos, Infanto Juvenil — Pendente
   Turmas: Capoeira

7. Marcos Almeida — Responsavel — Pendente
   Dependentes: Noah Almeida (11a, Infanto Juvenil), Sophia Almeida (8a, Kids)

8. Beatriz Rodrigues — Aluno, 15 anos, Infanto Juvenil — Pendente
   Turmas: Jiu-Jitsu Kids Matutino

9. Juliana Ferreira — Responsavel — Pendente
   Dependentes: Heitor Ferreira (7a, Kids)

10. Matheus Gomes — Aluno, 12 anos, Infanto Juvenil — Pendente
    Turmas: MMA, Capoeira
```

### Aba Anamnese (3 registros)
```
1. Enzo Oliveira — Aluno, 8 anos — Aguardando anamnese
2. Theo Santos — Aluno, 10 anos — Anamnese em revisao
3. Valentina Costa — Aluno, 9 anos — Aguardando anamnese
```

### Aba Revisao (1 registro)
```
1. Carlos Nascimento — Apoiador — Revisao solicitada
```

---

## Diretrizes de Design

1. **Reduzir bordas** — usar contraste de fundo em vez de caixas
2. **Escala de espacamento** — 8 / 12 / 16 / 24 / 32px
3. **Tipografia com hierarquia** — nome forte (700), email e meta suaves (400-500), muted
4. **1 acao principal por card** — filled gold. Secundarias no menu "..."
5. **Transicoes suaves** — cubic-bezier(0.4, 0, 0.2, 1), 0.25-0.3s
6. **Cards com presenca** — shadow sutil, hover com elevacao, borda esquerda colorida
7. **Zero poluicao visual** — sem chips excessivos, sem multiplos botoes simultaneos
8. **Responsivo** — sidebar colapsa em mobile (<768px), cards full-width
