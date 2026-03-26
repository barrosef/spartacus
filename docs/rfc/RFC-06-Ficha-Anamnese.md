# RFC-06 — Ficha de Anamnese

**Data:** 2026-03-24
**Status:** Accepted
**Referência:** `docs/legal/anamnese.pdf` (PUCRS — Parque Esportivo)

## Contexto

O projeto Spartacus precisa coletar informações de saúde dos alunos antes de iniciar a prática de artes marciais. A ficha é preenchida pelo aluno (maior de idade) ou responsável (para menores) no app, e validada pelo time Spartacus no backoffice.

## Decisão

Ficha estática (campos fixos) com 5 seções, adaptada da ficha PUCRS para o contexto de projeto social de artes marciais com crianças e adultos.

### Seção 1 — Identificação

**Não coletada na anamnese.** Dados já disponíveis no cadastro da conta (nome, gênero, data de nascimento, idade calculada).

### Seção 2 — Atividades da Vida Diária

**Apenas para maiores de 16 anos.** Oculta para menores.

| Campo | Tipo | Opções |
|---|---|---|
| `weekly_work_hours` | single-select | `less_than_20`, `20_to_40`, `41_to_60`, `more_than_60` |
| `work_activities` | multi-select | `sitting`, `lifting_weights`, `standing`, `walking`, `driving`, `other` |
| `work_activities_notes` | text | livre |

### Seção 3 — Histórico Médico

| Campo | Tipo | Opções |
|---|---|---|
| `last_medical_exam_date` | date | DD/MM/AAAA |
| `family_heart_disease` | multi-select | `father`, `mother`, `sibling`, `grandparent` |
| `surgeries` | multi-select | `spine`, `heart`, `joint`, `herniated_disc`, `kidney`, `lung`, `eyes`, `other` |
| `surgeries_other` | text | livre (se `other` selecionado) |
| `diagnosed_conditions` | multi-select | `alcoholism`, `kidney_disease`, `emphysema`, `anemia`, `arthritis`, `eye_problems`, `ulcer`, `asthma`, `diabetes`, `high_blood_pressure`, `stroke`, `obesity`, `muscle_problems`, `other` |
| `diagnosed_conditions_other` | text | livre (se `other` selecionado) |
| `current_medications` | text | livre |
| `symptoms` | object | 11 sintomas, cada um com frequência |
| `has_allergies` | boolean | |
| `allergies_details` | text | livre (se true) |
| `has_recent_injury` | boolean | |
| `injury_details` | text | livre (se true) |
| `has_exercise_restriction` | boolean | |
| `restriction_details` | text | livre (se true) |

**Sintomas** (`symptoms`): objeto com 11 chaves, cada uma com valor `always` | `sometimes` | `never`:

| Chave | Descrição (PT) |
|---|---|
| `coughing_blood` | Tosse com sangue |
| `abdominal_pain` | Dor abdominal |
| `leg_pain` | Dor nas pernas |
| `arm_pain` | Dor nos braços |
| `back_neck_pain` | Dor nas costas ou pescoço |
| `chest_pain` | Dor no peito |
| `joint_pain` | Dores articulares |
| `shortness_of_breath` | Falta de ar com esforço leve |
| `feeling_weak` | Sentir-se fraco |
| `dizziness` | Tontura |
| `heart_palpitation` | Palpitação ou batimento cardíaco acelerado |

### Seção 4 — Comportamento Relacionado à Saúde

Campo `smokes` e `cigarettes_per_day` **ocultos para menores de 14 anos**.

| Campo | Tipo | Opções |
|---|---|---|
| `smokes` | boolean | |
| `cigarettes_per_day` | text | livre (se true) |
| `practices_physical_activity` | boolean | |
| `physical_activity_description` | text | qual atividade (se true) |
| `physical_activity_frequency` | text | frequência (se true) |
| `physical_activity_duration` | text | duração (se true) |

### Seção 5 — Objetivos com a Atividade Física

Opções adaptadas para artes marciais e projeto social.

| Campo | Tipo | Opções |
|---|---|---|
| `goals` | multi-select | `discipline`, `self_defense`, `socialization`, `health`, `competition`, `physical_conditioning`, `therapeutic`, `leisure`, `other` |
| `goals_other` | text | livre (se `other` selecionado) |

**Labels em PT:**

| Code | Português |
|---|---|
| `discipline` | Disciplina |
| `self_defense` | Defesa pessoal |
| `socialization` | Socialização / Convívio social |
| `health` | Saúde |
| `competition` | Competição |
| `physical_conditioning` | Condicionamento físico |
| `therapeutic` | Terapêutico |
| `leisure` | Lazer |
| `other` | Outro |

### Seção 6 — Comentários Gerais

| Campo | Tipo |
|---|---|
| `general_comments` | text (livre) |

## Modelo Firestore

Collection: `medical_history`
Document ID: `{projectId}_{userId}`

```json
{
  "projectId": "spartacus-artes-marciais",
  "userId": "uid123",
  "status": "pending_approval",
  "dailyActivities": {
    "weeklyWorkHours": "20_to_40",
    "workActivities": ["sitting", "walking"],
    "workActivitiesNotes": ""
  },
  "medicalHistory": {
    "lastMedicalExamDate": "15/03/2026",
    "familyHeartDisease": ["father"],
    "surgeries": [],
    "surgeriesOther": "",
    "diagnosedConditions": ["asthma"],
    "diagnosedConditionsOther": "",
    "currentMedications": "Bombinha para asma",
    "symptoms": {
      "coughingBlood": "never",
      "abdominalPain": "never",
      "legPain": "sometimes",
      "armPain": "never",
      "backNeckPain": "sometimes",
      "chestPain": "never",
      "jointPain": "never",
      "shortnessOfBreath": "sometimes",
      "feelingWeak": "never",
      "dizziness": "never",
      "heartPalpitation": "never"
    },
    "hasAllergies": false,
    "allergiesDetails": "",
    "hasRecentInjury": false,
    "injuryDetails": "",
    "hasExerciseRestriction": false,
    "restrictionDetails": ""
  },
  "healthBehavior": {
    "smokes": false,
    "cigarettesPerDay": "",
    "practicesPhysicalActivity": true,
    "physicalActivityDescription": "Caminhada",
    "physicalActivityFrequency": "3x por semana",
    "physicalActivityDuration": "30 minutos"
  },
  "goals": ["discipline", "health", "socialization"],
  "goalsOther": "",
  "generalComments": "",
  "filledAt": "2026-03-24T10:00:00Z",
  "filledBy": "uid123",
  "reviewedAt": null,
  "reviewedBy": null
}
```

## Regras de visibilidade por idade

| Seção | < 14 anos | 14-15 anos | >= 16 anos |
|---|---|---|---|
| 2. Atividades da Vida Diária | Oculta | Oculta | Visível |
| 3. Histórico Médico | Visível | Visível | Visível |
| 4. Fumo (`smokes`) | Oculto | Visível | Visível |
| 4. Atividade física | Visível | Visível | Visível |
| 5. Objetivos | Visível | Visível | Visível |
| 6. Comentários | Visível | Visível | Visível |

## Quem preenche

- **Aluno >= 16 anos:** preenche no app
- **Responsável (para menor):** preenche no app em nome do dependente
- **Time Spartacus:** valida no backoffice (aprova ou solicita revisão)

## Consequências

- Nova collection `medical_history` no Firestore
- Novos endpoints no backend: `POST /medical-history`, `GET /medical-history/{userId}`, `PATCH /medical-history/{userId}/status`
- Novo formulário no app (wizard multi-step dentro da tela de anamnese)
- Nova tela no backoffice para visualizar e validar fichas
- Integrado à máquina de estados (RFC-05): `waiting_medical_history` → preenchimento → `pending_medical_history_approval` → validação → `approved`
