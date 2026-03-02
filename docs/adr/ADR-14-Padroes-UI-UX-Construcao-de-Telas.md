# ADR-14 — Padrões de UI/UX para Construção de Telas

**Status:** Aceito
**Data:** 2026-03-02
**Contexto:** Plataforma Spartacus — backoffice (React/Vite) e app mobile (React Native/Expo)
**Complementa:** ADR-01 (Identidade Visual), ADR-02 (Navegação e Wizards)

---

## 1. Problema

Sem um conjunto de regras explícitas de comportamento de telas, cada desenvolvedor toma decisões independentes que resultam em:

- Formulários com placeholders como labels (campo "parece preenchido")
- Campos obrigatórios sem indicação visual ou com mensagens genéricas
- Selects com uma única opção que exigem clique desnecessário
- Text areas sem contador, levando o usuário a descobrir o limite no erro
- Experiências inconsistentes entre telas diferentes do mesmo produto

Este documento define as **regras de ouro** a seguir em toda tela da plataforma.

---

## 2. Princípios-Base

Toda tela Spartacus deve ser construída sobre três pilares:

1. **Baixo atrito** — remover ações desnecessárias; o sistema faz o que é obvio por você.
2. **Erro impossível ou imediato** — ou o erro não pode acontecer (restrição de UI), ou é sinalizado no momento certo (não só no submit).
3. **Clareza progressiva** — mostrar o que é necessário agora, não tudo de uma vez.

---

## 3. Labels e Placeholders

### 3.1 Regra geral

| Elemento | Regra |
|---|---|
| **Label** | Sempre acima do campo, sempre visível, nunca desaparece |
| **Placeholder** | Somente como exemplo de formato — nunca substitui a label |
| **Floating label** | Proibido como padrão primário — usar somente em filtros inline densos |

**Por quê:** placeholders desaparecem ao digitar, forçando o usuário a apagar para relembrar o que estava preenchendo. O Nielsen Norman Group documentou 7 problemas distintos com o uso de placeholder como label. Labels fixas acima do campo têm performance consistentemente superior.

### 3.2 Especificação

```
[ Label do campo ]          ← sempre visível, fonte regular
[ Conteúdo ou placeholder ] ← input
  Ex.: nome@dominio.com     ← hint de formato (opcional, abaixo do campo)
```

### 3.3 Atributos obrigatórios em inputs de texto

```html
<!-- Texto -->
<input type="text" placeholder="Ex.: José da Silva" maxlength="100" autocomplete="name">

<!-- Email -->
<input type="email" placeholder="Ex.: jose@email.com" inputmode="email" autocomplete="email">

<!-- Telefone -->
<input type="tel" placeholder="Ex.: (65) 99999-9999" inputmode="tel" autocomplete="tel">

<!-- CPF -->
<input type="text" placeholder="000.000.000-00" inputmode="numeric" maxlength="14">

<!-- CEP -->
<input type="text" placeholder="00000-000" inputmode="numeric" maxlength="9" autocomplete="postal-code">
```

> **Proibido usar `type="number"`** para CPF, telefone, CEP ou valores monetários — browsers adicionam spinners, aceitam notação científica (1e5) e têm comportamento inconsistente. Use `type="text"` com `inputmode` correto.

---

## 4. Campos Obrigatórios

### 4.1 Marcação visual

**Regra:** se a maioria dos campos é obrigatória, marcar os **opcionais** com `(opcional)`.
Se há mistura equilibrada, marcar **ambos**: asterisco nos obrigatórios + `(opcional)` nos opcionais.
**Nunca** depender só da legenda no topo do formulário — usuários a ignoram durante o preenchimento.

```
Nome *                     ← asterisco vermelho antes ou após o texto da label
Email (opcional)           ← texto "(opcional)" junto à label
```

- Asterisco: cor `#C62828` (vermelho escuro, contraste 4.5:1 sobre branco)
- Legenda de rodapé: `* campos obrigatórios` — presente sempre que houver asterisco

### 4.2 Estado de erro

Ao sair do campo (`on-blur`) ou no submit, se obrigatório e vazio:

```
[ Campo Nome * ]
┌────────────────────────────────────┐
│                                    │  ← borda vermelha (#D32F2F)
└────────────────────────────────────┘
⚠ O nome é obrigatório.              ← ícone + mensagem abaixo do campo
```

**Especificações:**

| Elemento | Valor |
|---|---|
| Borda em erro | `2px solid #D32F2F` |
| Mensagem de erro | Texto `#C62828`, tamanho 12-14px, imediatamente abaixo do campo |
| Ícone de erro | `⚠` ou `✕` à esquerda da mensagem |
| `aria-invalid` | `"true"` no input |
| `aria-describedby` | ID do elemento da mensagem de erro |
| `role="alert"` | Na tag da mensagem de erro (para leitores de tela) |

**Nunca indicar erro somente por cor** — WCAG 1.4.1 exige sempre combinar cor + ícone + texto.

### 4.3 Mensagens de erro: regras de conteúdo

```
❌ Ruim:  "Campo inválido."
❌ Ruim:  "Erro."
✅ Bom:   "O nome é obrigatório."
✅ Bom:   "Digite um CPF válido (ex.: 000.000.000-00)."
✅ Bom:   "O e-mail deve conter @ e um domínio válido."
✅ Bom:   "O telefone deve ter 10 ou 11 dígitos."
```

### 4.4 Quando validar

| Momento | O que validar |
|---|---|
| `on-blur` (ao sair do campo) | Campo específico que perdeu o foco |
| `on-submit` | Todos os campos obrigatórios |
| `on-change` (ao digitar) | Somente campos com formato estrito (CPF, email) e após o usuário já ter digitado pelo menos X caracteres mínimos |

**Não validar `on-change` imediato** — exibir erro enquanto o usuário ainda está digitando é agressivo e gera frustração.

---

## 5. Text Areas com Contador de Caracteres

### 5.1 Regra

Todo `<textarea>` com limite de caracteres deve exibir contador.

### 5.2 Posição e formato

- **Posição:** abaixo e à direita do campo
- **Formato:** `X / MAX` (ex.: `143 / 500`)
- **Alternativa para limites curtos (SMS, bio):** `357 restantes`

### 5.3 Thresholds de cor

| Faixa | Cor do contador | Significado |
|---|---|---|
| 0% – 74% | Cinza secundário (`#757575`) | Normal, discreto |
| 75% – 89% | Âmbar/laranja (`#F59E0B`) | Atenção, chegando perto |
| 90% – 99% | Laranja-vermelho (`#EF4444`) | Urgência |
| 100%+ | Vermelho (`#C62828`) + valor negativo (`-5`) | Limite excedido |

### 5.4 Comportamento ao exceder o limite

- **Não bloquear a digitação** — usuário pode colar texto e depois editar
- **Excesso destacado em vermelho** no texto do campo (se a UI suportar)
- **Bloquear o submit** enquanto o contador for negativo
- Mensagem de erro: `"Máximo de 500 caracteres. Remova X caracteres."`

---

## 6. Campos Select

### 6.1 Quantas opções → qual componente

| Quantidade de opções | Componente recomendado |
|---|---|
| 0 opções | Campo desabilitado + tooltip explicando por que está vazio |
| 1 opção | Ver regra 6.2 abaixo |
| 2–5 opções | Radio buttons (escolha única) ou Checkboxes (múltipla) |
| 6–15 opções | `<select>` dropdown padrão |
| 16+ opções | Combobox com busca (searchable select) |

### 6.2 Select com única opção disponível

| Situação | Comportamento |
|---|---|
| Campo **obrigatório** | Substituir o select por texto simples ("Modalidade: Jiu Jitsu") — sem controle interativo. Informar ao usuário que é a única opção disponível. |
| Campo **opcional** | Auto-selecionar a opção + manter o select visível com botão `✕` para limpar. Exibir tooltip/hint: "Selecionado automaticamente — única opção disponível." |

**Exemplo visual (opcional, auto-selecionado):**

```
Modalidade
┌──────────────────────────────────┬─────┐
│ Jiu Jitsu                        │  ✕  │
└──────────────────────────────────┴─────┘
  ℹ Selecionado automaticamente (única opção)
```

### 6.3 Select em wizard

Quando uma etapa de wizard possui apenas um select/radio e há somente uma opção:

1. A opção é **auto-selecionada** com indicação visual clara
2. O botão "Continuar" fica **habilitado** (a seleção já foi feita automaticamente)
3. Uma nota discreta informa: *"Apenas uma opção disponível no momento."*
4. Se o campo for opcional, o botão `✕` permite desmarcar antes de avançar

---

## 7. Input Masks para Campos Estruturados

### 7.1 Filosofia: aceitar flexível, exibir formatado

**Regra:** aceitar o dado sem máscara no envio ao backend. A máscara é uma **ajuda visual**, não uma barreira.

Máscaras aplicadas durante a digitação causam:
- Cursor automático que pula posições (desorientação)
- Problema com colar/autocomplete do celular
- Campos que parecem cheios quando estão vazios

### 7.2 Implementação recomendada

```
Estratégia: formatar visualmente on-blur, aceitar qualquer formato no submit
```

| Campo | Formato exibido | `maxlength` | `inputmode` | Validação |
|---|---|---|---|---|
| CPF | `000.000.000-00` | 14 | `numeric` | Algoritmo de dígito verificador |
| CNPJ | `00.000.000/0000-00` | 18 | `numeric` | Algoritmo de dígito verificador |
| Telefone | `(00) 00000-0000` | 15 | `tel` | 10 ou 11 dígitos |
| CEP | `00000-000` | 9 | `numeric` | 8 dígitos + busca automática de endereço |
| Data | `DD/MM/AAAA` | 10 | `numeric` | Validação de data real |

---

## 8. Estados do Botão de Submit

Todo botão de submit deve implementar a seguinte máquina de estados:

```
DEFAULT → HOVER → [clique] → LOADING → SUCCESS
                                     ↘ ERROR (foco vai ao primeiro campo com erro)
```

### 8.1 Especificações por estado

| Estado | Visual | Comportamento |
|---|---|---|
| **Default** | Cor primária (`#C6A34E`), texto da ação ("Salvar", "Continuar") | Clicável |
| **Hover** | Escurecer 10–15% | `cursor: pointer` |
| **Disabled** | Cinza (`#9CA3AF`), opacidade 0.6 | `cursor: not-allowed`. Usar com moderação — preferir mostrar erro explicando por que está inativo |
| **Loading** | Spinner + "Salvando..." | `aria-busy="true"` + `aria-disabled="true"` (não `disabled` nativo). Previne duplo submit |
| **Success** | Ícone check verde + "Salvo!" | Por 2–3 segundos, depois retorna ao Default |
| **Error** | Retorna ao Default | Foco programático move para o primeiro campo inválido |

> **Atenção:** usar `disabled` nativo bloqueia foco do teclado e é invisível para leitores de tela. Prefira `aria-disabled="true"` + `pointer-events: none`.

---

## 9. Empty States

Toda listagem ou grid vazio deve exibir:

```
[ Ícone contextual — não genérico ]

Nenhuma turma cadastrada ainda.

Crie a primeira turma para começar a registrar presenças.

[ + Nova Turma ]   ← CTA primário
```

**Regras:**
- Ícone relacionado ao contexto (não um simples "🔍" para tudo)
- Título descritivo no estado: *"Nenhum [item] cadastrado ainda."*
- Subtítulo com orientação de próximo passo
- CTA primário que leva diretamente à ação de criação
- Sem mensagens de erro (empty state ≠ erro)

---

## 10. Mobile-First

### 10.1 Touch targets

- **Altura mínima:** 48px para todos os inputs, botões e itens de lista tocáveis
- **Espaçamento entre targets:** mínimo 8px
- **Formulários:** sempre coluna única em mobile (sem grid de 2 colunas)

### 10.2 Teclado virtual

Configurar `inputmode` e `type` corretos para cada campo (ver tabela da seção 3.3). Benefícios:

- Teclado numérico abre para CPF/CEP (não o QWERTY)
- Teclado com `@` abre para email
- Teclado com `/` e `.` abre para URLs

### 10.3 Autocomplete

Sempre definir `autocomplete` nos campos de onboarding/cadastro:

```html
autocomplete="name"           <!-- nome completo -->
autocomplete="email"          <!-- email -->
autocomplete="tel"            <!-- telefone -->
autocomplete="postal-code"    <!-- CEP -->
autocomplete="street-address" <!-- endereço -->
autocomplete="new-password"   <!-- senha nova (desativa sugestões existentes) -->
```

---

## 11. Acessibilidade — Checklist Mínimo

Todo formulário entregue deve passar por:

- [ ] Navegação completa por teclado (Tab → Shift+Tab → Enter/Space)
- [ ] Todos os inputs têm `<label>` com `for` apontando para o `id` do campo
- [ ] Campos obrigatórios têm `aria-required="true"`
- [ ] Campos com erro têm `aria-invalid="true"` + `aria-describedby` apontando para a mensagem
- [ ] Mensagens de erro têm `role="alert"` ou estão em `aria-live="polite"`
- [ ] Botão em loading tem `aria-busy="true"`
- [ ] Contraste de texto ≥ 4.5:1 (texto normal) e ≥ 3:1 (texto grande/componentes UI)
- [ ] Erro nunca indicado apenas por cor — sempre acompanhado de ícone + texto

---

## 12. Referências

- [NN/G — Placeholders in Form Fields Are Harmful](https://www.nngroup.com/articles/form-design-placeholders/)
- [NN/G — Required Fields](https://www.nngroup.com/articles/required-fields/)
- [NN/G — Drop-Down Menus: Design Guidelines](https://www.nngroup.com/articles/drop-down-menus/)
- [Baymard Institute — Remove Select When Only One Option Left](https://baymard.com/blog/remove-select-when-only-one-option)
- [Baymard Institute — Required and Optional Form Fields](https://baymard.com/blog/required-optional-form-fields)
- [Baymard Institute — Input Masking for Form Fields](https://baymard.com/blog/input-masking-form-field)
- [Smashing Magazine — Material Design Text Fields Are Badly Designed](https://www.smashingmagazine.com/2021/02/material-design-text-fields/)
- [Smashing Magazine — A Complete Guide to Live Validation UX](https://www.smashingmagazine.com/2022/09/inline-validation-web-forms-ux/)
- [Smashing Magazine — A Guide to Accessible Form Validation](https://www.smashingmagazine.com/2023/02/guide-accessible-form-validation/)
- [Material Design 3 — Text Fields](https://m3.material.io/components/text-fields/specs)
- [Apple HIG — Text Fields](https://developer.apple.com/design/human-interface-guidelines/text-fields)
- [Adam Silver — The Problem with Input Masks](https://adamsilver.io/blog/the-problem-with-input-masks-and-what-to-do-instead/)
- [CSS-Tricks — Better Form Inputs for Better Mobile User Experiences](https://css-tricks.com/better-form-inputs-for-better-mobile-user-experiences/)
- [W3C WAI — ARIA21: Using aria-invalid](https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA21)
- [WebAIM — Contrast and Color Accessibility](https://webaim.org/articles/contrast/)
