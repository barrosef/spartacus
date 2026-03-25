# RFC-03 — Mural de Comunicados: Redefinição do Domínio Social

**Data:** 2026-02-24
**Status:** Aceito

---

## Contexto

O escopo inicial do projeto previa um domínio "Social" com características de rede social interna:

- Posts de alunos (fotos, textos)
- Timeline com feed de conteúdo
- Moderação de posts de usuários
- Privacidade entre pares (quem vê o quê)
- Feed algorítmico ou cronológico

Essa abordagem trouxe complexidade desnecessária para um projeto social comunitário: moderação de conteúdo, gestão de privacidade entre alunos, e potencial exposição de menores.

---

## Decisão

O domínio "Social" é **redefinido como Mural de Comunicados** — um canal de comunicação **unidirecional** do staff para alunos e responsáveis.

**Regra central: somente o staff posta.**

Staff = professores, secretária (assistente), instrutores.

Alunos e responsáveis são **consumidores de conteúdo**, não produtores.

---

## Justificativa

- **Elimina moderação de conteúdo:** sem posts de alunos, não há conteúdo gerado por usuário para moderar.
- **Elimina complexidade de privacidade:** sem conteúdo entre pares, não há risco de exposição de dados de menores por outros alunos.
- **Alinhado com a realidade operacional:** em projetos sociais de pequeno porte, comunicação é hierárquica — o staff informa, os alunos e responsáveis recebem.
- **Simplificação de permissões:** a única regra é "staff pode postar". Não há granularidade por turma, por aluno ou por grupo.

---

## Features Mantidas

| Feature | Status | Observação |
|---|---|---|
| Posts do staff (fotos, textos) | V2 | Apenas staff posta |
| Stories com expiração automática | V2 | UX válida para comunicados temporários |
| Curtidas em posts | V2 | Reação passiva, sem moderação |
| Compartilhamento externo | V2 | Links públicos para posts do mural |

> **Nota:** Mural & Comunicados é integralmente **V2**. No MVP, a comunicação ocorre por canais externos existentes (WhatsApp, etc.).

---

## Features Removidas

| Feature removida | Motivo |
|---|---|
| Posts de alunos | Eliminação de moderação e privacidade entre pares |
| Feed personalizado / algorítmico | Complexidade desnecessária para o porte do projeto |
| Moderação de conteúdo de aluno | Sem posts de aluno, não há o que moderar |
| Privacidade entre pares | Conteúdo é exclusivo de staff, sem exposição entre alunos |

---

## Consequências

**Positivas:**
- Simplificação radical de permissões (uma regra: staff posta).
- Eliminação de moderação e suas implicações legais e operacionais.
- Conteúdo de menores protegido por design (nenhum aluno posta).
- Implementação muito mais simples: CRUD de posts com role-check.

**Negativas / Mitigações:**
- Alunos e responsáveis não podem compartilhar conquistas ou fotos via plataforma: aceitável para o MVP. Redes sociais externas (Instagram, WhatsApp) cumprem essa função no curto prazo.
- Staff precisa ser treinado para usar o Mural como canal oficial: mitigado com UX simples e treinamento na implantação.

---

## Alternativas Consideradas

**Manter como rede social interna com posts de alunos:**
Rejeitada. Requer moderação de conteúdo, gestão de privacidade entre menores e infraestrutura de feed — complexidade desproporcional ao valor entregue para um projeto social comunitário.

**Eliminar completamente o domínio Social:**
Considerada, mas rejeitada. O Mural de Comunicados tem valor real como canal oficial entre staff e famílias — substituindo grupos de WhatsApp sem controle. Mantido como V2.
