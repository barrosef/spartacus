# Prompt — Infográficos do App Spartacus (Nota de versão + Regras)

Prompt para IA de design (recomendado pedir como **artefato HTML/CSS** — renderiza
texto com precisão e qualidade de UI; geradores de imagem erram muito em texto-heavy).
Produz **dois infográficos** verticais, como série visualmente consistente.

Data: 2026-06-26 · Público: leigo em tecnologia, diverso (fundamental → superior) · Alto padrão UX/UI.

---

## Prompt (colar na ferramenta)

```text
Você é um(a) diretor(a) de arte sênior especializado(a) em design de informação (infográficos) com altíssimo padrão de UX/UI. Produza DOIS infográficos verticais, como uma série visualmente consistente, para a Plataforma Digital Spartacus — um app do Projeto Spartacus Artes Marciais (Jiu-Jitsu, Capoeira, Muay Thai, MMA) de Brasnorte-MT, um projeto social que atende crianças e jovens.

Entregue cada infográfico como um artefato HTML/CSS autossuficiente (sem dependências externas), em formato vertical 1080×1350 px (proporção 4:5, ideal para WhatsApp/Instagram), pronto para captura de tela em alta resolução. Use apenas fontes do sistema/Google Fonts embutidas via <link> ou @import.

## Público e tom
Público leigo em tecnologia, muito diverso (do ensino fundamental ao superior). Portanto: linguagem simples e acolhedora, UMA ideia por bloco, frases curtas, hierarquia visual forte, ícones que reforçam o significado, muito respiro (whitespace), tipografia grande e legível. Nada de jargão técnico. Tom: disciplina marcial + calor de comunidade.

## Identidade visual (obrigatória nos dois)
- Paleta: fundo escuro quente (carvão/quase-preto, ~#16130D a #1E1A12), cor primária DOURADO/BRONZE espartano (~#C6A34E) para destaques, títulos e ícones; texto principal off-white (~#F2EEE6); texto secundário cinza-quente (~#A99F8C). Use o dourado com parcimônia (acentos, números, ícones, linhas), não em grandes áreas.
- Motivo: estética espartana/marcial sutil e elegante (emblema com inicial “S”, leve referência a elmo/escudo/louro ou faixa de graduação) — refinado, NUNCA caricato.
- Selo/logo: coloque um emblema “Spartacus” no topo (se eu fornecer o logo, use-o; senão, crie um selo circular dourado sobre fundo escuro com a inicial “S” em estilo espartano e a palavra “SPARTACUS” + “ARTES MARCIAIS”).
- Tipografia: títulos em fonte forte, condensada ou caixa-alta com leve espaçamento entre letras (ex.: Oswald/Anton/Archivo); corpo em sans humanista legível (ex.: Inter/Archivo). Bom contraste.
- Ícones: estilo linha fina (line icons, tipo Feather), em dourado, consistentes entre os blocos.
- Componentes: cards com cantos arredondados, borda sutil 1px, número grande dourado por item, ícone, título curto e 1 frase de apoio. Rodapé discreto com a marca.

## INFOGRÁFICO 1 — NOTA DE VERSÃO (“O que mudou na atualização de hoje”)
Cabeçalho: selo Spartacus + título “NOVIDADES DO APP” e subtítulo “Atualização de hoje, no fim da tarde”.
Linha de abertura curta e calorosa (1 frase): “Ouvimos vocês: esta versão chegou pra deixar o app mais simples e prático de usar.”
Três cards numerados (1, 2, 3):

1) Ficha de saúde agora é opcional
   Ícone: prancheta/coração.
   Texto: “A ficha de saúde foi para o menu do seu perfil. Não bloqueia mais o acesso à timeline — virou opcional. Enquanto não preencher, aparecem lembretes amigáveis.”

2) Área da equipe dentro do app
   Ícone: escudo com check / painel.
   Texto: “Professores, instrutores e assistentes agora validam frequências, apoio, graduações e fichas de saúde direto no app, pelo menu lateral — sem precisar abrir o sistema (backoffice).”

3) Filtros da timeline corrigidos
   Ícone: funil com check.
   Texto: “Os filtros que davam erro foram corrigidos e testados. Agora dá pra filtrar a timeline sem travar.”

Rodapé: “Plataforma Digital Spartacus • Digitalizar o Spartacus sem burocratizar o Spartacus.”

## INFOGRÁFICO 2 — REGRAS E FUNÇÕES DO APP (“Como funciona, na prática”)
Cabeçalho: selo Spartacus + título “COMO FUNCIONA O APP” e subtítulo “Regras importantes, explicadas de forma simples”.
Três cards numerados (1, 2, 3):

1) Idade mínima: 15 anos
   Ícone: pessoa/calendário.
   Texto: “Por exigência das lojas (Google Play e App Store), o app é para maiores de 15 anos. Alunos menores de 15 podem ter conta e matrícula feitas pelos pais ou responsáveis.”

2) Acesso dos responsáveis (no mesmo celular)
   Ícone: duas pessoas / troca de perfil.
   Texto: “Pais e responsáveis acessam as contas dos filhos no próprio aparelho. Toque na foto do perfil, escolha o dependente e pronto: você vê e faz tudo como se fosse ele navegando.”

3) Tudo passa pela equipe Spartacus
   Ícone: selo de verificação/escudo.
   Texto: “Matrículas, graduações, frequências, doações e fichas de saúde só ficam ativas depois da validação de um professor, instrutor ou assistente. Antes disso, ficam ‘aguardando confirmação’.”

Rodapé igual ao do infográfico 1.

## Requisitos de qualidade
- Layout impecável: grid alinhado, espaçamento rítmico, títulos e números como âncoras visuais, leitura de cima para baixo natural.
- Contraste AA (texto legível sobre o fundo escuro). Tamanhos generosos: título principal ~52–64px, número do card grande (~40px), corpo ~24–28px.
- Os DOIS infográficos devem parecer claramente da mesma família (mesma grade, cores, tipos, selo).
- Sem texto cortado, sem sobreposição, sem “lorem ipsum”. Use exatamente as frases acima (pode ajustar levemente a pontuação para caber bem).
- Entregue os dois como artefatos separados (Infográfico 1 e Infográfico 2), cada um pronto para screenshot 1080×1350.
```

---

## Variações (ajustes opcionais)
- **Stories**: trocar 1080×1350 (4:5) por **1080×1920 (9:16)**.
- **Logo real**: anexar o arquivo e trocar a instrução do selo por “use o logo anexo no topo”.
- **Tom mais pessoal**: reintroduzir a abertura do churrasco / “dona onça” como frase de assinatura calorosa.
- **Versão clara**: fundo claro com dourado, para impressão/cartaz.

## Fonte (conteúdo original destilado)
Mensagem original do anúncio (WhatsApp) reescrita em blocos curtos e didáticos:
- Nota de versão: (1) ficha de saúde opcional no perfil + lembretes; (2) menu administrativo no app para professores/instrutores/assistentes validarem frequência, apoio, graduações e anamnese; (3) correção dos filtros da timeline.
- Regras: (1) idade mínima 15 anos (menores via pais/responsáveis); (2) acesso proxy dos responsáveis pelo mesmo dispositivo; (3) tudo é validado pela equipe antes de ficar ativo.
