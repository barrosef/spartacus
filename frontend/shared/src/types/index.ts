import type { PresenceStatus, UserRole } from '../constants'

export interface User {
  id: string
  email: string
  displayName: string
  photoUrl?: string
  roles: UserRole[]
  status: 'PENDING' | 'ACTIVE' | 'INACTIVE'
  createdAt: Date
}

export interface Modalidade {
  id: string
  nome: string // e.g. "Jiu Jitsu", "Capoeira", "Muay Thai", "MMA"
  ativo: boolean
}

export interface Turma {
  id: string
  nome: string
  modalidadeId: string
  professorId: string
  agenda: AgendaItem[]
  ativo: boolean
}

export interface AgendaItem {
  diaSemana: number // 0 = Sunday ... 6 = Saturday
  horaInicio: string // "HH:MM"
  horaFim: string
}

export interface Aula {
  id: string
  turmaId: string
  data: Date
  horaInicio: string
  horaFim: string
  qrToken: string
  qrValidoAte: Date
  encerrada: boolean
}

export interface Presenca {
  id: string
  userId: string
  aulaId: string
  turmaId: string
  timestamp: Date
  status: PresenceStatus
}

export interface Evento {
  id: string
  nome: string
  descricao: string
  data: Date
  localizacao?: string
}

export interface Doacao {
  id: string
  userId: string
  mes: number // 1–12
  ano: number
  registradoPor: string
  timestamp: Date
}

export interface Post {
  id: string
  autorId: string
  imageUrl: string
  legenda?: string
  likes: number
  timestamp: Date
}

export interface Story {
  id: string
  autorId: string
  mediaUrl: string
  expiresAt: Date
  timestamp: Date
}
